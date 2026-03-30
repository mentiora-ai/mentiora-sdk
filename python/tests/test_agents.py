"""Tests for AgentsClient."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from mentiora.agents.client import AgentsClient
from mentiora.agents.types import (
    AgentErrorEvent,
    AgentResolvedEvent,
    AgentRunParams,
    AgentRunResult,
    AgentStreamEvent,
    ChatCompletedEvent,
    CustomEvent,
    ModelParams,
    OutputTextDeltaEvent,
    SuggestionsEvent,
    ToolCallDeltaEvent,
    ToolCallResultEvent,
    UsageInfo,
)
from mentiora.errors import NetworkError, ValidationError
from mentiora.http import HttpResponse
from mentiora.sse import SSEEvent

# ===========================================================================
# Sync run() tests
# ===========================================================================


def test_agents_run_with_tag(agents_client, mock_agents_http_client):
    """Test run() sends correct body with tag-based resolution."""
    result = agents_client.run(AgentRunParams(tag='production', message='Hello'))

    assert isinstance(result, AgentRunResult)
    assert result.output == 'Hello!'
    assert result.status == 'completed'

    call_args = mock_agents_http_client.post.call_args
    assert call_args[0][0] == '/api/v1/agents/run'
    body = call_args[0][1]
    assert body['tag'] == 'production'
    assert body['message'] == 'Hello'
    assert body['stream'] is False
    assert 'agent_id' not in body


def test_agents_run_with_agent_id_and_revision(agents_client, mock_agents_http_client):
    """Test run() with explicit agent_id and revision."""
    agents_client.run(AgentRunParams(agent_id='agent-42', revision=3, message='Hi'))

    body = mock_agents_http_client.post.call_args[0][1]
    assert body['agent_id'] == 'agent-42'
    assert body['revision'] == 3
    assert 'tag' not in body


def test_agents_run_forwards_optional_params(agents_client, mock_agents_http_client):
    """Test run() forwards all optional params to API body."""
    agents_client.run(
        AgentRunParams(
            tag='staging',
            message='Tell me a joke',
            thread_id='thread-abc',
            model_id='gpt-4o',
            model_params=ModelParams(temperature=0.7, max_tokens=512),
            end_user_id='user-xyz',
            metadata={'key': 'value'},
        )
    )

    body = mock_agents_http_client.post.call_args[0][1]
    assert body['thread_id'] == 'thread-abc'
    assert body['model_id'] == 'gpt-4o'
    assert body['model_params'] == {'temperature': 0.7, 'max_tokens': 512}
    assert body['end_user_id'] == 'user-xyz'
    assert body['metadata'] == {'key': 'value'}


def test_agents_run_parses_response_with_tool_calls(mock_agents_http_client):
    """Test run() correctly parses a response with tool calls."""
    mock_agents_http_client.post.return_value = HttpResponse(
        200,
        {
            'thread_id': 'thread-1',
            'agent_id': 'agent-1',
            'agent_revision': 2,
            'agent_tag': 'production',
            'output': 'I found the answer.',
            'tool_calls': [
                {
                    'tool_call_id': 'tc-1',
                    'name': 'search_docs',
                    'arguments': {'query': 'refund'},
                    'result': {'docs': ['doc1']},
                }
            ],
            'status': 'completed',
            'usage': {'prompt_tokens': 100, 'completion_tokens': 50},
        },
    )

    client = AgentsClient(mock_agents_http_client)
    result = client.run(AgentRunParams(tag='production', message='What is the refund policy?'))

    assert result.agent_tag == 'production'
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].tool_call_id == 'tc-1'
    assert result.tool_calls[0].name == 'search_docs'
    assert result.tool_calls[0].result == {'docs': ['doc1']}
    assert result.usage == UsageInfo(prompt_tokens=100, completion_tokens=50)


def test_agents_run_empty_message_raises_validation_error(agents_client):
    """Test run() raises ValidationError for empty message."""
    with pytest.raises(ValidationError, match='message is required'):
        agents_client.run(AgentRunParams(tag='prod', message=''))


def test_agents_run_whitespace_message_raises_validation_error(agents_client):
    """Test run() raises ValidationError for whitespace-only message."""
    with pytest.raises(ValidationError, match='message is required'):
        agents_client.run(AgentRunParams(tag='prod', message='   '))


def test_agents_run_no_tag_or_agent_id_raises_validation_error(agents_client):
    """Test run() raises ValidationError when neither tag nor agent_id is provided."""
    with pytest.raises(ValidationError, match='Either tag or agent_id must be provided'):
        agents_client.run(AgentRunParams(message='Hello'))


def test_agents_run_both_tag_and_agent_id_raises_validation_error(agents_client):
    """Test run() raises ValidationError when both tag and agent_id are provided."""
    with pytest.raises(ValidationError, match='Provide either tag or agent_id, not both'):
        agents_client.run(AgentRunParams(tag='prod', agent_id='agent-1', message='Hello'))


def test_agents_run_network_error_propagates(mock_agents_http_client):
    """Test run() propagates NetworkError from HTTP client."""
    mock_agents_http_client.post.side_effect = NetworkError('Server error: 500', 500)
    client = AgentsClient(mock_agents_http_client)

    with pytest.raises(NetworkError, match='Server error: 500'):
        client.run(AgentRunParams(tag='prod', message='Hello'))


# ===========================================================================
# Async run_async() tests
# ===========================================================================


async def test_agents_run_async_with_tag(agents_client, mock_agents_http_client):
    """Test run_async() sends correct body and returns result."""
    result = await agents_client.run_async(AgentRunParams(tag='production', message='Hello'))

    assert isinstance(result, AgentRunResult)
    assert result.output == 'Hello!'

    call_args = mock_agents_http_client.post_async.call_args
    body = call_args[0][1]
    assert body['tag'] == 'production'
    assert body['stream'] is False


async def test_agents_run_async_network_error_propagates(mock_agents_http_client):
    """Test run_async() propagates NetworkError."""
    mock_agents_http_client.post_async = AsyncMock(side_effect=NetworkError('Connection failed'))
    client = AgentsClient(mock_agents_http_client)

    with pytest.raises(NetworkError, match='Connection failed'):
        await client.run_async(AgentRunParams(tag='prod', message='Hello'))


# ===========================================================================
# Sync stream() tests
# ===========================================================================


def _make_sse(event: str, data: dict) -> SSEEvent:
    """Helper to create an SSEEvent with JSON data."""
    return SSEEvent(event=event, data=json.dumps(data))


def test_agents_stream_yields_agent_resolved_first(mock_agents_http_client):
    """Test stream() yields agent_resolved as first event."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'agent.resolved',
                    {
                        'agent_id': 'agent-1',
                        'agent_revision': 2,
                        'agent_tag': 'production',
                        'thread_id': 'thread-1',
                    },
                ),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    assert len(events) == 1
    assert isinstance(events[0], AgentResolvedEvent)
    assert events[0].agent_id == 'agent-1'
    assert events[0].agent_revision == 2
    assert events[0].thread_id == 'thread-1'


def test_agents_stream_yields_output_text_deltas(mock_agents_http_client):
    """Test stream() yields output_text_delta events."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse('chat.output_text.delta', {'delta': 'Hello'}),
                _make_sse('chat.output_text.delta', {'delta': ' world'}),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    assert len(events) == 2
    assert all(isinstance(e, OutputTextDeltaEvent) for e in events)
    assert events[0].delta == 'Hello'
    assert events[1].delta == ' world'


def test_agents_stream_yields_tool_call_events(mock_agents_http_client):
    """Test stream() yields tool_call_delta and tool_call_result events."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.tool_call.delta',
                    {
                        'tool_call_id': 'tc-1',
                        'name': 'search',
                        'arguments_delta': '{"query":',
                    },
                ),
                _make_sse(
                    'chat.tool_call.result',
                    {
                        'tool_call_id': 'tc-1',
                        'name': 'search',
                        'arguments': {'query': 'refund'},
                        'result': {'docs': ['doc1']},
                    },
                ),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Search')))

    assert len(events) == 2
    assert isinstance(events[0], ToolCallDeltaEvent)
    assert events[0].tool_call_id == 'tc-1'
    assert events[0].arguments_delta == '{"query":'
    assert isinstance(events[1], ToolCallResultEvent)
    assert events[1].result == {'docs': ['doc1']}


def test_agents_stream_yields_chat_completed(mock_agents_http_client):
    """Test stream() yields chat_completed event."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.completed',
                    {
                        'chat': {
                            'thread_id': 'thread-1',
                            'status': 'completed',
                            'output': 'Done!',
                        }
                    },
                ),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    assert len(events) == 1
    assert isinstance(events[0], ChatCompletedEvent)
    assert events[0].thread_id == 'thread-1'
    assert events[0].status == 'completed'
    assert events[0].output == 'Done!'


def test_agents_stream_stops_on_error_event(mock_agents_http_client):
    """Test stream() stops iteration when error event is received."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse('chat.output_text.delta', {'delta': 'Partial'}),
                _make_sse('error', {'code': 'AGENT_ERROR', 'message': 'Something went wrong'}),
                _make_sse('chat.output_text.delta', {'delta': 'Should not see this'}),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    assert len(events) == 2
    assert isinstance(events[0], OutputTextDeltaEvent)
    assert isinstance(events[1], AgentErrorEvent)
    assert events[1].code == 'AGENT_ERROR'
    assert events[1].message == 'Something went wrong'


def test_agents_stream_yields_suggestions(mock_agents_http_client):
    """Test stream() yields validated suggestions events."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.suggestions',
                    {
                        'suggestions': [
                            {'label': 'Next step', 'message': 'What should I do next?'},
                            {'label': 'x' * 41, 'message': 'too long'},
                            {'label': 'Valid', 'message': 'Tell me more'},
                        ]
                    },
                ),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    assert len(events) == 1
    assert isinstance(events[0], SuggestionsEvent)
    assert len(events[0].suggestions) == 2
    assert events[0].suggestions[0].label == 'Next step'
    assert events[0].suggestions[1].message == 'Tell me more'


def test_agents_stream_passes_through_unknown_events(mock_agents_http_client):
    """Test stream() passes through unknown event types as CustomEvent."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse('chat.output_text.delta', {'delta': 'Hello'}),
                _make_sse('unknown.future.event', {'foo': 'bar'}),
                _make_sse('chat.output_text.delta', {'delta': ' world'}),
            ]
        )
    )

    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    assert len(events) == 3
    assert isinstance(events[0], OutputTextDeltaEvent)
    assert isinstance(events[1], CustomEvent)
    assert events[1].event == 'unknown.future.event'
    assert events[1].data == {'foo': 'bar'}
    assert isinstance(events[2], OutputTextDeltaEvent)
    assert events[2].delta == ' world'


def test_agents_stream_validation_errors(agents_client):
    """Test stream() raises ValidationError for invalid params."""
    with pytest.raises(ValidationError, match='message is required'):
        list(agents_client.stream(AgentRunParams(tag='prod', message='')))

    with pytest.raises(ValidationError, match='Either tag or agent_id'):
        list(agents_client.stream(AgentRunParams(message='Hello')))

    with pytest.raises(ValidationError, match='Provide either tag or agent_id'):
        list(agents_client.stream(AgentRunParams(tag='p', agent_id='a', message='Hello')))


def test_agents_stream_sends_stream_true(mock_agents_http_client):
    """Test stream() sends stream: true in the API body."""
    mock_agents_http_client.post_stream = MagicMock(return_value=iter([]))

    client = AgentsClient(mock_agents_http_client)
    list(client.stream(AgentRunParams(tag='prod', message='Hi')))

    call_args = mock_agents_http_client.post_stream.call_args
    body = call_args[0][1]
    assert body['stream'] is True


def test_agents_stream_malformed_json_raises_network_error(mock_agents_http_client):
    """Malformed JSON in SSE data raises NetworkError, not JSONDecodeError."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter([SSEEvent(event='chat.output_text.delta', data='not{json')])
    )
    client = AgentsClient(mock_agents_http_client)
    with pytest.raises(NetworkError, match='Failed to parse SSE event data'):
        list(client.stream(AgentRunParams(tag='prod', message='Hi')))


def test_agents_stream_missing_fields_fallback(mock_agents_http_client):
    """Error event without code field uses 'UNKNOWN' default."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter([_make_sse('error', {'message': 'Something failed'})])
    )
    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))
    assert len(events) == 1
    assert isinstance(events[0], AgentErrorEvent)
    assert events[0].code == 'UNKNOWN'
    assert events[0].message == 'Something failed'


def test_agents_stream_chat_completed_empty_content_list(mock_agents_http_client):
    """chat.completed with empty content list returns output=''."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.completed',
                    {
                        'chat': {
                            'thread_id': 'thread-1',
                            'status': 'completed',
                            'output': [
                                {'type': 'message', 'content': []},
                            ],
                        }
                    },
                ),
            ]
        )
    )
    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))
    assert len(events) == 1
    assert isinstance(events[0], ChatCompletedEvent)
    assert events[0].output == ''


def test_agents_stream_chat_completed_array_output(mock_agents_http_client):
    """chat.completed with array-format output extracts assistant text."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.completed',
                    {
                        'chat': {
                            'thread_id': 'thread-1',
                            'status': 'completed',
                            'output': [
                                {'type': 'message', 'content': [{'text': 'Hello from array'}]},
                            ],
                        }
                    },
                ),
            ]
        )
    )
    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))
    assert len(events) == 1
    assert isinstance(events[0], ChatCompletedEvent)
    assert events[0].output == 'Hello from array'


def test_agents_stream_skips_done_sentinel(mock_agents_http_client):
    """[DONE] sentinel is skipped and does not produce an event."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse('chat.output_text.delta', {'delta': 'Hello'}),
                SSEEvent(event='message', data='[DONE]'),
            ]
        )
    )
    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))
    assert len(events) == 1
    assert isinstance(events[0], OutputTextDeltaEvent)


# ===========================================================================
# Async stream_async() tests
# ===========================================================================


async def test_agents_stream_async_yields_events(mock_agents_http_client):
    """Test stream_async() yields typed events."""

    async def _mock_post_stream_async(*args, **kwargs):
        for sse in [
            _make_sse(
                'agent.resolved',
                {
                    'agent_id': 'agent-1',
                    'agent_revision': 1,
                    'thread_id': 'thread-1',
                },
            ),
            _make_sse('chat.output_text.delta', {'delta': 'Hello'}),
            _make_sse(
                'chat.completed',
                {
                    'thread_id': 'thread-1',
                    'status': 'completed',
                    'output': 'Hello',
                },
            ),
        ]:
            yield sse

    mock_agents_http_client.post_stream_async = _mock_post_stream_async

    client = AgentsClient(mock_agents_http_client)
    events = [e async for e in client.stream_async(AgentRunParams(tag='prod', message='Hi'))]

    assert len(events) == 3
    assert isinstance(events[0], AgentResolvedEvent)
    assert isinstance(events[1], OutputTextDeltaEvent)
    assert isinstance(events[2], ChatCompletedEvent)


async def test_agents_stream_async_stops_on_error(mock_agents_http_client):
    """Test stream_async() stops on error event."""

    async def _mock_post_stream_async(*args, **kwargs):
        for sse in [
            _make_sse('chat.output_text.delta', {'delta': 'Partial'}),
            _make_sse('error', {'code': 'TIMEOUT', 'message': 'Agent timed out'}),
            _make_sse('chat.output_text.delta', {'delta': 'Nope'}),
        ]:
            yield sse

    mock_agents_http_client.post_stream_async = _mock_post_stream_async

    client = AgentsClient(mock_agents_http_client)
    events = [e async for e in client.stream_async(AgentRunParams(tag='prod', message='Hi'))]

    assert len(events) == 2
    assert isinstance(events[1], AgentErrorEvent)
    assert events[1].code == 'TIMEOUT'


async def test_agents_stream_async_yields_suggestions_and_custom_events(mock_agents_http_client):
    """Test stream_async() yields suggestions and custom passthrough events."""

    async def _mock_post_stream_async(*args, **kwargs):
        for sse in [
            _make_sse(
                'chat.suggestions',
                {
                    'suggestions': [
                        {'label': 'Retry', 'message': 'Try again'},
                        {'label': 'Explain', 'message': 'Explain more'},
                    ]
                },
            ),
            _make_sse('cx.workflow.ui', {'elements': [{'type': 'button', 'label': 'Continue'}]}),
        ]:
            yield sse

    mock_agents_http_client.post_stream_async = _mock_post_stream_async

    client = AgentsClient(mock_agents_http_client)
    events = [e async for e in client.stream_async(AgentRunParams(tag='prod', message='Hi'))]

    assert len(events) == 2
    assert isinstance(events[0], SuggestionsEvent)
    assert events[0].suggestions[0].label == 'Retry'
    assert isinstance(events[1], CustomEvent)
    assert events[1].event == 'cx.workflow.ui'
    assert events[1].data == {'elements': [{'type': 'button', 'label': 'Continue'}]}


# ===========================================================================
# Parameterized run vs run_async parity tests
# ===========================================================================


@pytest.mark.parametrize('method', ['run', 'run_async'])
async def test_run_parity_basic_tag_resolution(method, mock_agents_http_client):
    """Both run() and run_async() return the same result for tag-based resolution."""
    client = AgentsClient(mock_agents_http_client)
    params = AgentRunParams(tag='production', message='Hello')

    if method == 'run':
        result = client.run(params)
    else:
        result = await client.run_async(params)

    assert isinstance(result, AgentRunResult)
    assert result.output == 'Hello!'
    assert result.status == 'completed'
    assert result.agent_id == 'agent-1'


@pytest.mark.parametrize('method', ['run', 'run_async'])
async def test_run_parity_forwards_all_optional_params(method, mock_agents_http_client):
    """Both run() and run_async() forward optional params identically."""
    client = AgentsClient(mock_agents_http_client)
    params = AgentRunParams(
        tag='staging',
        message='Tell me a joke',
        thread_id='thread-abc',
        model_id='gpt-4o',
        model_params=ModelParams(temperature=0.7, max_tokens=512),
        end_user_id='user-xyz',
        metadata={'key': 'value'},
    )

    if method == 'run':
        client.run(params)
        body = mock_agents_http_client.post.call_args[0][1]
    else:
        await client.run_async(params)
        body = mock_agents_http_client.post_async.call_args[0][1]

    assert body['thread_id'] == 'thread-abc'
    assert body['model_id'] == 'gpt-4o'
    assert body['model_params'] == {'temperature': 0.7, 'max_tokens': 512}
    assert body['end_user_id'] == 'user-xyz'
    assert body['metadata'] == {'key': 'value'}
    assert body['stream'] is False


@pytest.mark.parametrize('method', ['run', 'run_async'])
async def test_run_parity_validation_errors(method, mock_agents_http_client):
    """Both run() and run_async() raise the same validation errors."""
    client = AgentsClient(mock_agents_http_client)

    with pytest.raises(ValidationError, match='message is required'):
        if method == 'run':
            client.run(AgentRunParams(tag='prod', message=''))
        else:
            await client.run_async(AgentRunParams(tag='prod', message=''))

    with pytest.raises(ValidationError, match='Either tag or agent_id'):
        if method == 'run':
            client.run(AgentRunParams(message='Hello'))
        else:
            await client.run_async(AgentRunParams(message='Hello'))

    with pytest.raises(ValidationError, match='Provide either tag or agent_id'):
        if method == 'run':
            client.run(AgentRunParams(tag='p', agent_id='a', message='Hello'))
        else:
            await client.run_async(AgentRunParams(tag='p', agent_id='a', message='Hello'))


@pytest.mark.parametrize('method', ['run', 'run_async'])
async def test_run_parity_network_error(method, mock_agents_http_client):
    """Both run() and run_async() propagate NetworkError identically."""
    mock_agents_http_client.post.side_effect = NetworkError('Server error: 500', 500)
    mock_agents_http_client.post_async = AsyncMock(
        side_effect=NetworkError('Server error: 500', 500)
    )
    client = AgentsClient(mock_agents_http_client)

    with pytest.raises(NetworkError, match='Server error: 500'):
        if method == 'run':
            client.run(AgentRunParams(tag='prod', message='Hello'))
        else:
            await client.run_async(AgentRunParams(tag='prod', message='Hello'))


# ===========================================================================
# Parameterized stream vs stream_async parity tests
# ===========================================================================


def _stream_events_sync(client: AgentsClient, params: AgentRunParams) -> list[AgentStreamEvent]:
    """Collect all events from sync stream()."""
    return list(client.stream(params))


async def _stream_events_async(
    client: AgentsClient, params: AgentRunParams
) -> list[AgentStreamEvent]:
    """Collect all events from async stream_async()."""
    return [e async for e in client.stream_async(params)]


def _setup_sync_stream(mock_http, sse_events: list[SSEEvent]) -> None:
    """Configure mock HTTP client for sync stream."""
    mock_http.post_stream = MagicMock(return_value=iter(sse_events))


def _setup_async_stream(mock_http, sse_events: list[SSEEvent]) -> None:
    """Configure mock HTTP client for async stream."""

    async def _mock_post_stream_async(*args, **kwargs):
        for sse in sse_events:
            yield sse

    mock_http.post_stream_async = _mock_post_stream_async


@pytest.mark.parametrize('variant', ['sync', 'async'])
async def test_stream_parity_full_event_sequence(variant, mock_agents_http_client):
    """Both stream() and stream_async() yield the same event types in order."""
    sse_events = [
        _make_sse(
            'agent.resolved',
            {'agent_id': 'agent-1', 'agent_revision': 2, 'thread_id': 'thread-1'},
        ),
        _make_sse('chat.output_text.delta', {'delta': 'Hello'}),
        _make_sse('chat.output_text.delta', {'delta': ' world'}),
        _make_sse(
            'chat.completed',
            {'thread_id': 'thread-1', 'status': 'completed', 'output': 'Hello world'},
        ),
    ]

    if variant == 'sync':
        _setup_sync_stream(mock_agents_http_client, sse_events)
        client = AgentsClient(mock_agents_http_client)
        events = _stream_events_sync(client, AgentRunParams(tag='prod', message='Hi'))
    else:
        _setup_async_stream(mock_agents_http_client, sse_events)
        client = AgentsClient(mock_agents_http_client)
        events = await _stream_events_async(client, AgentRunParams(tag='prod', message='Hi'))

    assert len(events) == 4
    assert isinstance(events[0], AgentResolvedEvent)
    assert isinstance(events[1], OutputTextDeltaEvent)
    assert events[1].delta == 'Hello'
    assert isinstance(events[2], OutputTextDeltaEvent)
    assert events[2].delta == ' world'
    assert isinstance(events[3], ChatCompletedEvent)
    assert events[3].output == 'Hello world'


@pytest.mark.parametrize('variant', ['sync', 'async'])
async def test_stream_parity_stops_on_error(variant, mock_agents_http_client):
    """Both stream variants stop on error event."""
    sse_events = [
        _make_sse('chat.output_text.delta', {'delta': 'Partial'}),
        _make_sse('error', {'code': 'AGENT_ERROR', 'message': 'Failed'}),
        _make_sse('chat.output_text.delta', {'delta': 'Never'}),
    ]

    if variant == 'sync':
        _setup_sync_stream(mock_agents_http_client, sse_events)
        client = AgentsClient(mock_agents_http_client)
        events = _stream_events_sync(client, AgentRunParams(tag='prod', message='Hi'))
    else:
        _setup_async_stream(mock_agents_http_client, sse_events)
        client = AgentsClient(mock_agents_http_client)
        events = await _stream_events_async(client, AgentRunParams(tag='prod', message='Hi'))

    assert len(events) == 2
    assert isinstance(events[1], AgentErrorEvent)
    assert events[1].code == 'AGENT_ERROR'


@pytest.mark.parametrize('variant', ['sync', 'async'])
async def test_stream_parity_tool_call_events(variant, mock_agents_http_client):
    """Both stream variants yield tool_call_delta and tool_call_result correctly."""
    sse_events = [
        _make_sse(
            'chat.tool_call.delta',
            {'tool_call_id': 'tc-1', 'name': 'search', 'arguments_delta': '{"q":'},
        ),
        _make_sse(
            'chat.tool_call.result',
            {
                'tool_call_id': 'tc-1',
                'name': 'search',
                'arguments': {'q': 'test'},
                'result': {'hits': 5},
            },
        ),
    ]

    if variant == 'sync':
        _setup_sync_stream(mock_agents_http_client, sse_events)
        client = AgentsClient(mock_agents_http_client)
        events = _stream_events_sync(client, AgentRunParams(tag='prod', message='Search'))
    else:
        _setup_async_stream(mock_agents_http_client, sse_events)
        client = AgentsClient(mock_agents_http_client)
        events = await _stream_events_async(client, AgentRunParams(tag='prod', message='Search'))

    assert len(events) == 2
    assert isinstance(events[0], ToolCallDeltaEvent)
    assert events[0].tool_call_id == 'tc-1'
    assert events[0].arguments_delta == '{"q":'
    assert isinstance(events[1], ToolCallResultEvent)
    assert events[1].result == {'hits': 5}


# ===========================================================================
# chat.completed array output extraction edge cases
# ===========================================================================


def test_agents_stream_chat_completed_empty_array_output(mock_agents_http_client):
    """chat.completed with empty array output returns output=''."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.completed',
                    {
                        'chat': {
                            'thread_id': 'thread-1',
                            'status': 'completed',
                            'output': [],
                        }
                    },
                ),
            ]
        )
    )
    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))
    assert len(events) == 1
    assert isinstance(events[0], ChatCompletedEvent)
    assert events[0].output == ''


def test_agents_stream_chat_completed_missing_content_in_message(mock_agents_http_client):
    """chat.completed with message object but no content key returns output=''."""
    mock_agents_http_client.post_stream = MagicMock(
        return_value=iter(
            [
                _make_sse(
                    'chat.completed',
                    {
                        'chat': {
                            'thread_id': 'thread-1',
                            'status': 'completed',
                            'output': [
                                {'type': 'message'},  # no 'content' key
                            ],
                        }
                    },
                ),
            ]
        )
    )
    client = AgentsClient(mock_agents_http_client)
    events = list(client.stream(AgentRunParams(tag='prod', message='Hi')))
    assert len(events) == 1
    assert isinstance(events[0], ChatCompletedEvent)
    assert events[0].output == ''


# ===========================================================================
# Tag format validation tests
# ===========================================================================


def test_agents_run_invalid_tag_format(agents_client):
    """run() rejects tags with invalid format."""
    with pytest.raises(ValidationError, match='Invalid tag format'):
        agents_client.run(AgentRunParams(tag='Production', message='hi'))
    with pytest.raises(ValidationError, match='Invalid tag format'):
        agents_client.run(AgentRunParams(tag='-invalid', message='hi'))
    with pytest.raises(ValidationError, match='Invalid tag format'):
        agents_client.run(AgentRunParams(tag='has spaces', message='hi'))


def test_agents_run_valid_tag_formats(agents_client, mock_agents_http_client):
    """run() accepts valid tag formats."""
    for tag in ['production', 'staging-v2', 'test_env', '0-beta']:
        agents_client.run(AgentRunParams(tag=tag, message='hi'))


def test_agents_run_invalid_temperature(agents_client):
    """run() rejects out-of-range temperature."""
    with pytest.raises(ValidationError, match='temperature must be between 0 and 2'):
        agents_client.run(
            AgentRunParams(tag='prod', message='hi', model_params=ModelParams(temperature=-1))
        )
    with pytest.raises(ValidationError, match='temperature must be between 0 and 2'):
        agents_client.run(
            AgentRunParams(tag='prod', message='hi', model_params=ModelParams(temperature=3))
        )


def test_agents_run_invalid_max_tokens(agents_client):
    """run() rejects non-positive max_tokens."""
    with pytest.raises(ValidationError, match='max_tokens must be a positive integer'):
        agents_client.run(
            AgentRunParams(tag='prod', message='hi', model_params=ModelParams(max_tokens=0))
        )
    with pytest.raises(ValidationError, match='max_tokens must be a positive integer'):
        agents_client.run(
            AgentRunParams(tag='prod', message='hi', model_params=ModelParams(max_tokens=-5))
        )
