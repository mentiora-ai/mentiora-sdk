"""Tests for OpenAI plugin."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from mentiora import MentioraClient
from mentiora.errors import ConfigurationError
from mentiora.plugins.openai import _is_async_client, track_openai
from mentiora.plugins.types import TrackOpenAIOptions
from mentiora.types import MentioraConfig


@pytest.fixture
def mentiora_client():
    config = MentioraConfig(api_key='test-key')
    client = MentioraClient(config)
    client.tracing.send_trace = MagicMock()
    client.tracing.send_trace_async = AsyncMock()
    yield client
    client.close()


class FakeResponse:
    """A non-iterable response object with model_dump (simulates OpenAI Pydantic response)."""

    def __init__(self, data: dict):
        self._data = data

    def model_dump(self) -> dict:
        return self._data


@pytest.fixture
def mock_sync_openai():
    """Create a mock sync OpenAI client."""
    mock = MagicMock()
    mock.chat = MagicMock()
    mock.chat.completions = MagicMock()
    mock.chat.completions.create = MagicMock(
        return_value=FakeResponse(
            {
                'id': 'chatcmpl-123',
                'choices': [
                    {
                        'index': 0,
                        'message': {'role': 'assistant', 'content': 'Hello!', 'tool_calls': None},
                        'finish_reason': 'stop',
                    }
                ],
                'model': 'gpt-4',
                'usage': {'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 15},
                'system_fingerprint': 'fp_123',
                'service_tier': 'default',
                'created': 1234567890,
            }
        )
    )
    return mock


@pytest.fixture
def mock_async_openai():
    """Create a mock async OpenAI client (simulating AsyncOpenAI)."""

    # Create a class that inherits from a mock "AsyncOpenAI" base
    class MockAsyncOpenAI:
        pass

    MockAsyncOpenAI.__name__ = 'AsyncOpenAI'

    class MockClient(MockAsyncOpenAI):
        pass

    mock = MockClient()
    mock.chat = MagicMock()
    mock.chat.completions = MagicMock()
    mock.chat.completions.create = AsyncMock(
        return_value=FakeResponse(
            {
                'id': 'chatcmpl-456',
                'choices': [
                    {
                        'index': 0,
                        'message': {'role': 'assistant', 'content': 'Hi!', 'tool_calls': None},
                        'finish_reason': 'stop',
                    }
                ],
                'model': 'gpt-4',
                'usage': {'prompt_tokens': 8, 'completion_tokens': 3, 'total_tokens': 11},
                'system_fingerprint': 'fp_456',
                'service_tier': 'default',
                'created': 1234567891,
            }
        )
    )
    return mock


def test_track_openai_requires_client():
    """Test that track_openai requires mentiora_client."""
    mock_openai = MagicMock()
    # Pydantic validates MentioraClient type before plugin code runs,
    # so None raises pydantic ValidationError, not ConfigurationError.
    with pytest.raises((ConfigurationError, Exception)):
        track_openai(mock_openai, TrackOpenAIOptions(mentiora_client=None))  # type: ignore


def test_track_openai_returns_same_object(mentiora_client, mock_sync_openai):
    """Test that track_openai returns the same client object (monkey-patch, not proxy)."""
    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    result = track_openai(mock_sync_openai, options)
    assert result is mock_sync_openai


def test_track_openai_only_wraps_create(mentiora_client, mock_sync_openai):
    """Test that only chat.completions.create is wrapped, not other methods."""
    mock_sync_openai.embeddings = MagicMock()
    mock_sync_openai.embeddings.create = MagicMock()
    original_embeddings_create = mock_sync_openai.embeddings.create

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_sync_openai, options)

    # embeddings.create should NOT be wrapped
    assert mock_sync_openai.embeddings.create is original_embeddings_create


def test_track_openai_double_patch_guard(mentiora_client):
    """Test that calling track_openai twice does not double-wrap (trace sent once)."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(
        return_value=FakeResponse(
            {
                'id': 'chatcmpl-double',
                'choices': [
                    {
                        'index': 0,
                        'message': {'role': 'assistant', 'content': 'Hi!', 'tool_calls': None},
                        'finish_reason': 'stop',
                    }
                ],
                'model': 'gpt-4',
                'usage': {'prompt_tokens': 5, 'completion_tokens': 2, 'total_tokens': 7},
            }
        )
    )

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)
    track_openai(mock_openai, options)  # Second call should be a no-op

    mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hi'}],
    )

    assert mentiora_client.tracing.send_trace.call_count == 1


def test_track_openai_sync_non_streaming(mentiora_client, mock_sync_openai):
    """Test sync non-streaming happy path."""
    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_sync_openai, options)

    mock_sync_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hello'}],
    )

    # Should have called send_trace (sync)
    assert mentiora_client.tracing.send_trace.called
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.type == 'llm'
    assert trace_event.name == 'openai.chat.completions.create'
    assert trace_event.provider == 'openai'
    assert trace_event.model == 'gpt-4'
    assert trace_event.usage is not None
    assert trace_event.usage.prompt_tokens == 10
    assert trace_event.usage.completion_tokens == 5

    # Check input has prompt
    assert trace_event.input['prompt'] == 'Hello'
    assert trace_event.input['model'] == 'gpt-4'

    # Check output has content and new fields
    assert trace_event.output['content'] == 'Hello!'
    assert trace_event.output['id'] == 'chatcmpl-123'
    assert trace_event.output['service_tier'] == 'default'
    assert trace_event.output['created'] == 1234567890
    assert trace_event.output['usage'] == {
        'prompt_tokens': 10,
        'completion_tokens': 5,
        'total_tokens': 15,
    }

    # Metadata should include openai_id
    assert trace_event.metadata['openai_id'] == 'chatcmpl-123'


@pytest.mark.asyncio
async def test_track_openai_async_non_streaming(mentiora_client, mock_async_openai):
    """Test async non-streaming happy path."""
    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_async_openai, options)

    await mock_async_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hello'}],
    )

    # Should have called send_trace_async
    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.type == 'llm'
    assert trace_event.name == 'openai.chat.completions.create'
    assert trace_event.output['content'] == 'Hi!'
    assert trace_event.output['id'] == 'chatcmpl-456'
    assert trace_event.metadata['openai_id'] == 'chatcmpl-456'


def test_track_openai_sync_streaming(mentiora_client):
    """Test sync streaming captures complete content."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()

    # Create chunks as an iterable (not dict/str/bytes/list)
    class StreamChunks:
        def __init__(self):
            self.chunks = [
                {
                    'id': 'chatcmpl-stream-1',
                    'choices': [
                        {
                            'index': 0,
                            'delta': {'role': 'assistant', 'content': ''},
                            'finish_reason': None,
                        }
                    ],
                    'model': 'gpt-4',
                    'system_fingerprint': 'fp_stream',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-stream-1',
                    'choices': [{'index': 0, 'delta': {'content': 'Hello'}, 'finish_reason': None}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-stream-1',
                    'choices': [
                        {'index': 0, 'delta': {'content': ' world'}, 'finish_reason': None}
                    ],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-stream-1',
                    'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
            ]

        def __iter__(self):
            return iter(self.chunks)

    mock_openai.chat.completions.create = MagicMock(return_value=StreamChunks())

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    result = mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hi'}],
        stream=True,
    )

    # Consume stream
    chunks = list(result)
    assert len(chunks) == 4

    # Trace should have been sent with accumulated content
    assert mentiora_client.tracing.send_trace.called
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.output['content'] == 'Hello world'
    assert trace_event.output['choices'][0]['finish_reason'] == 'stop'
    assert trace_event.output['model'] == 'gpt-4'
    assert trace_event.output['id'] == 'chatcmpl-stream-1'
    assert trace_event.output['system_fingerprint'] == 'fp_stream'
    assert trace_event.output['created'] == 1234567890
    assert trace_event.metadata['openai_id'] == 'chatcmpl-stream-1'
    assert trace_event.metadata['created'] == 1234567890


@pytest.mark.asyncio
async def test_track_openai_async_streaming(mentiora_client):
    """Test async streaming captures complete content."""

    class FakeAsyncOpenAI:
        pass

    FakeAsyncOpenAI.__name__ = 'AsyncOpenAI'

    class MockClient(FakeAsyncOpenAI):
        pass

    client = MockClient()
    client.chat = MagicMock()
    client.chat.completions = MagicMock()

    async def fake_chunks():
        chunks = [
            {
                'id': 'chatcmpl-async-stream',
                'choices': [
                    {
                        'index': 0,
                        'delta': {'role': 'assistant', 'content': ''},
                        'finish_reason': None,
                    }
                ],
                'model': 'gpt-4',
                'system_fingerprint': 'fp_async',
                'created': 1234567890,
            },
            {
                'id': 'chatcmpl-async-stream',
                'choices': [{'index': 0, 'delta': {'content': 'Hi'}, 'finish_reason': None}],
                'model': 'gpt-4',
                'created': 1234567890,
            },
            {
                'id': 'chatcmpl-async-stream',
                'choices': [{'index': 0, 'delta': {'content': ' there'}, 'finish_reason': None}],
                'model': 'gpt-4',
                'created': 1234567890,
            },
            {
                'id': 'chatcmpl-async-stream',
                'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}],
                'model': 'gpt-4',
                'created': 1234567890,
            },
        ]
        for c in chunks:
            yield c

    client.chat.completions.create = AsyncMock(return_value=fake_chunks())

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(client, options)

    result = await client.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hey'}],
        stream=True,
    )

    # Consume async stream
    chunks = []
    async for chunk in result:
        chunks.append(chunk)

    assert len(chunks) == 4

    # Trace should have been sent with accumulated content
    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.output['content'] == 'Hi there'
    assert trace_event.output['id'] == 'chatcmpl-async-stream'
    assert trace_event.output['system_fingerprint'] == 'fp_async'
    assert trace_event.output['created'] == 1234567890
    assert trace_event.metadata['openai_id'] == 'chatcmpl-async-stream'


def test_track_openai_error_stack_trace(mentiora_client):
    """Test that error stack traces are properly formatted (not <traceback object>)."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(side_effect=ValueError('API key invalid'))

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    with pytest.raises(ValueError, match='API key invalid'):
        mock_openai.chat.completions.create(
            model='gpt-4',
            messages=[{'role': 'user', 'content': 'Hi'}],
        )

    assert mentiora_client.tracing.send_trace.called
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.type == 'error'
    assert trace_event.error is not None
    assert trace_event.error.message == 'API key invalid'
    assert trace_event.error.type == 'ValueError'
    # Stack trace should be a real traceback, not '<traceback object at 0x...>'
    if trace_event.error.stack is not None:
        assert '<traceback object' not in trace_event.error.stack
        assert 'ValueError' in trace_event.error.stack


def test_track_openai_tool_calls_in_output(mentiora_client):
    """Test that tool_calls are captured in the output."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(
        return_value={
            'choices': [
                {
                    'index': 0,
                    'message': {
                        'role': 'assistant',
                        'content': None,
                        'tool_calls': [
                            {
                                'id': 'call_123',
                                'type': 'function',
                                'function': {
                                    'name': 'get_weather',
                                    'arguments': '{"location": "Paris"}',
                                },
                            }
                        ],
                    },
                    'finish_reason': 'tool_calls',
                }
            ],
            'model': 'gpt-4',
            'usage': {'prompt_tokens': 20, 'completion_tokens': 10, 'total_tokens': 30},
        }
    )

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Weather in Paris?'}],
        tools=[{'type': 'function', 'function': {'name': 'get_weather'}}],
    )

    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]

    # Output should contain tool_calls
    assert trace_event.output['choices'][0]['message']['tool_calls'] is not None
    assert (
        trace_event.output['choices'][0]['message']['tool_calls'][0]['function']['name']
        == 'get_weather'
    )

    # Content should describe the tool call since content is None
    assert 'get_weather' in trace_event.output['content']


def test_track_openai_input_parameters(mentiora_client):
    """Test that additional input parameters (tools, response_format, etc) are captured."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(
        return_value={
            'choices': [
                {
                    'index': 0,
                    'message': {'role': 'assistant', 'content': 'OK'},
                    'finish_reason': 'stop',
                }
            ],
            'model': 'gpt-4',
        }
    )

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Test'}],
        temperature=0.5,
        tools=[{'type': 'function', 'function': {'name': 'test_fn'}}],
        response_format={'type': 'json_object'},
        top_p=0.9,
        seed=42,
    )

    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    input_data = trace_event.input

    assert input_data['temperature'] == 0.5
    assert input_data['tools'] == [{'type': 'function', 'function': {'name': 'test_fn'}}]
    assert input_data['response_format'] == {'type': 'json_object'}
    assert input_data['top_p'] == 0.9
    assert input_data['seed'] == 42

    # None values should be filtered out
    assert 'frequency_penalty' not in input_data
    assert 'presence_penalty' not in input_data
    assert 'stop' not in input_data
    assert 'n' not in input_data


def test_is_async_client():
    """Test async client detection."""
    # Sync client
    mock_sync = MagicMock()
    assert not _is_async_client(mock_sync)

    # Async client
    class AsyncOpenAI:
        pass

    class MyClient(AsyncOpenAI):
        pass

    mock_async = MyClient()
    assert _is_async_client(mock_async)


def test_dynamic_input_capture(mentiora_client):
    """Test that newer OpenAI params (max_completion_tokens, reasoning_effort, store) are captured."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(
        return_value={
            'id': 'chatcmpl-dyn',
            'choices': [
                {
                    'index': 0,
                    'message': {'role': 'assistant', 'content': 'OK'},
                    'finish_reason': 'stop',
                }
            ],
            'model': 'o1',
        }
    )

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    mock_openai.chat.completions.create(
        model='o1',
        messages=[{'role': 'user', 'content': 'Think'}],
        max_completion_tokens=5000,
        reasoning_effort='high',
        store=True,
    )

    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    input_data = trace_event.input

    assert input_data['max_completion_tokens'] == 5000
    assert input_data['reasoning_effort'] == 'high'
    assert input_data['store'] is True


def test_stream_options_injection(mentiora_client):
    """Test that stream_options.include_usage is injected for streaming requests."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()

    class StreamChunks:
        def __init__(self):
            self.chunks = [
                {
                    'id': 'chatcmpl-so',
                    'choices': [{'index': 0, 'delta': {'content': 'Hi'}, 'finish_reason': None}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-so',
                    'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
            ]

        def __iter__(self):
            return iter(self.chunks)

    # Keep a reference to the original mock to check call_args
    original_create = MagicMock(return_value=StreamChunks())
    mock_openai.chat.completions.create = original_create

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    result = mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hi'}],
        stream=True,
    )

    # Consume stream
    list(result)

    # Verify the original create was called with injected stream_options
    call_kwargs = original_create.call_args[1]
    assert call_kwargs['stream_options'] == {'include_usage': True}

    # Input should reflect original request (no stream_options since it was not in original kwargs)
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert 'stream_options' not in trace_event.input


def test_stream_options_merge(mentiora_client):
    """Test that existing stream_options are merged with include_usage."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()

    class StreamChunks:
        def __init__(self):
            self.chunks = [
                {
                    'id': 'chatcmpl-merge',
                    'choices': [{'index': 0, 'delta': {'content': 'OK'}, 'finish_reason': None}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-merge',
                    'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
            ]

        def __iter__(self):
            return iter(self.chunks)

    original_create = MagicMock(return_value=StreamChunks())
    mock_openai.chat.completions.create = original_create

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    result = mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hi'}],
        stream=True,
        stream_options={'custom_flag': True},
    )

    list(result)

    call_kwargs = original_create.call_args[1]
    assert call_kwargs['stream_options'] == {'custom_flag': True, 'include_usage': True}


def test_multimodal_prompt_extraction(mentiora_client):
    """Test that multimodal content arrays extract text parts."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(
        return_value={
            'id': 'chatcmpl-mm',
            'choices': [
                {
                    'index': 0,
                    'message': {'role': 'assistant', 'content': 'I see a cat.'},
                    'finish_reason': 'stop',
                }
            ],
            'model': 'gpt-4o',
        }
    )

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    mock_openai.chat.completions.create(
        model='gpt-4o',
        messages=[
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': 'What is in this image?'},
                    {'type': 'image_url', 'image_url': {'url': 'https://example.com/cat.jpg'}},
                    {'type': 'text', 'text': 'Describe it.'},
                ],
            }
        ],
    )

    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.input['prompt'] == 'What is in this image?\nDescribe it.'


def test_refusal_non_streaming(mentiora_client):
    """Test that refusal is captured in non-streaming response."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = MagicMock(
        return_value={
            'id': 'chatcmpl-ref',
            'choices': [
                {
                    'index': 0,
                    'message': {
                        'role': 'assistant',
                        'content': None,
                        'refusal': 'I cannot help with that request.',
                    },
                    'finish_reason': 'stop',
                }
            ],
            'model': 'gpt-4',
        }
    )

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Bad request'}],
    )

    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.output['content'] == '[REFUSED] I cannot help with that request.'
    assert (
        trace_event.output['choices'][0]['message']['refusal'] == 'I cannot help with that request.'
    )


def test_refusal_streaming(mentiora_client):
    """Test that refusal is accumulated in streaming response."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()

    class StreamChunks:
        def __init__(self):
            self.chunks = [
                {
                    'id': 'chatcmpl-ref-stream',
                    'choices': [
                        {
                            'index': 0,
                            'delta': {'role': 'assistant', 'refusal': 'I cannot '},
                            'finish_reason': None,
                        }
                    ],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-ref-stream',
                    'choices': [
                        {
                            'index': 0,
                            'delta': {'refusal': 'help with that.'},
                            'finish_reason': None,
                        }
                    ],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-ref-stream',
                    'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
            ]

        def __iter__(self):
            return iter(self.chunks)

    mock_openai.chat.completions.create = MagicMock(return_value=StreamChunks())

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    result = mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Bad'}],
        stream=True,
    )

    list(result)

    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.output['content'] == '[REFUSED] I cannot help with that.'
    assert trace_event.output['choices'][0]['message']['refusal'] == 'I cannot help with that.'


def test_sync_streaming_error_classified_as_error(mentiora_client):
    """Test that sync stream error mid-iteration produces trace with type='error'."""
    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()

    class FailingStream:
        def __init__(self):
            self.chunks = [
                {
                    'id': 'chatcmpl-fail',
                    'choices': [{'index': 0, 'delta': {'content': 'Hello'}, 'finish_reason': None}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-fail',
                    'choices': [
                        {'index': 0, 'delta': {'content': ' world'}, 'finish_reason': None}
                    ],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
            ]
            self._index = 0

        def __iter__(self):
            return self

        def __next__(self):
            if self._index < len(self.chunks):
                chunk = self.chunks[self._index]
                self._index += 1
                return chunk
            raise ConnectionError('Stream interrupted')

    mock_openai.chat.completions.create = MagicMock(return_value=FailingStream())

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    result = mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hi'}],
        stream=True,
    )

    with pytest.raises(ConnectionError, match='Stream interrupted'):
        list(result)

    assert mentiora_client.tracing.send_trace.called
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.type == 'error'
    assert trace_event.error is not None
    assert trace_event.error.message == 'Stream interrupted'
    assert trace_event.error.type == 'ConnectionError'


async def test_async_streaming_error_classified_as_error(mentiora_client):
    """Test that async stream error mid-iteration produces trace with type='error'."""

    class AsyncFailingStream:
        def __init__(self):
            self.chunks = [
                {
                    'id': 'chatcmpl-fail',
                    'choices': [{'index': 0, 'delta': {'content': 'Hello'}, 'finish_reason': None}],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
                {
                    'id': 'chatcmpl-fail',
                    'choices': [
                        {'index': 0, 'delta': {'content': ' world'}, 'finish_reason': None}
                    ],
                    'model': 'gpt-4',
                    'created': 1234567890,
                },
            ]
            self._index = 0

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self._index < len(self.chunks):
                chunk = self.chunks[self._index]
                self._index += 1
                return chunk
            raise ConnectionError('Stream interrupted')

    # Use class inheritance for async client detection (MRO not writable on 3.13)
    class MockAsyncOpenAI:
        pass

    MockAsyncOpenAI.__name__ = 'AsyncOpenAI'

    class MockClient(MockAsyncOpenAI):
        pass

    mock_openai = MockClient()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = AsyncMock(return_value=AsyncFailingStream())

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    track_openai(mock_openai, options)

    result = await mock_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hi'}],
        stream=True,
    )

    with pytest.raises(ConnectionError, match='Stream interrupted'):
        chunks = []
        async for chunk in result:
            chunks.append(chunk)

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.type == 'error'
    assert trace_event.error is not None
    assert trace_event.error.message == 'Stream interrupted'
    assert trace_event.error.type == 'ConnectionError'


def test_capture_content_true_includes_input_output(mentiora_client, mock_sync_openai):
    """Test that capture_content=True (default) includes input/output in trace."""
    options = TrackOpenAIOptions(mentiora_client=mentiora_client, capture_content=True)
    track_openai(mock_sync_openai, options)

    mock_sync_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Hello'}],
    )

    assert mentiora_client.tracing.send_trace.called
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.input is not None
    assert trace_event.output is not None
    assert trace_event.input['prompt'] == 'Hello'


def test_capture_content_false_omits_input_output(mentiora_client, mock_sync_openai):
    """Test that capture_content=False omits input/output from trace."""
    options = TrackOpenAIOptions(mentiora_client=mentiora_client, capture_content=False)
    track_openai(mock_sync_openai, options)

    mock_sync_openai.chat.completions.create(
        model='gpt-4',
        messages=[{'role': 'user', 'content': 'Secret data'}],
    )

    assert mentiora_client.tracing.send_trace.called
    trace_event = mentiora_client.tracing.send_trace.call_args[0][0]
    assert trace_event.input is None
    assert trace_event.output is None
    # But metadata and other fields should still be present
    assert trace_event.type == 'llm'
    assert trace_event.model == 'gpt-4'
