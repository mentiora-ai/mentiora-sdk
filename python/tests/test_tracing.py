"""Tests for TracingClient."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from mentiora.errors import NetworkError, ValidationError
from mentiora.http import HttpClient
from mentiora.tracing import TracingClient
from mentiora.types import TraceEvent


def test_send_trace_success():
    """Test successful trace sending."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace = MagicMock()

    client = TracingClient(http_client)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        thread_id='test-thread-id',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = client.send_trace(event)
    assert result.success is True
    assert result.trace_id == 'test-trace'
    assert result.span_id == 'test-span'
    http_client.send_trace.assert_called_once_with(event)


def test_send_trace_network_error():
    """Test trace sending with network error."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace = MagicMock(side_effect=NetworkError('Network error', 500))

    client = TracingClient(http_client)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = client.send_trace(event)
    assert result.success is False
    assert result.error == 'Network error'


def test_send_trace_validation_error():
    """Test trace sending with validation error."""
    http_client = MagicMock(spec=HttpClient)
    client = TracingClient(http_client)

    # Missing trace_id
    event = TraceEvent(
        trace_id='',  # type: ignore
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    with pytest.raises(ValidationError, match='trace_id is required'):
        client.send_trace(event)


def test_trace_event_accepts_various_input_output_types():
    """TraceEvent should accept dict, list, and string for input/output."""
    # dict input/output
    event_dict = TraceEvent(
        trace_id='trace-dict',
        span_id='span-dict',
        name='test.dict',
        type='llm',
        start_time=datetime.now(),
        input={'prompt': 'hello'},
        output={'response': 'world'},
    )
    api_dict = event_dict.model_dump_for_api()
    assert api_dict['input'] == {'prompt': 'hello'}
    assert api_dict['output'] == {'response': 'world'}

    # list input/output
    event_list = TraceEvent(
        trace_id='trace-list',
        span_id='span-list',
        name='test.list',
        type='llm',
        start_time=datetime.now(),
        input=['a', 'b'],
        output=[{'choice': 1}],
    )
    api_list = event_list.model_dump_for_api()
    assert api_list['input'] == ['a', 'b']
    assert api_list['output'] == [{'choice': 1}]

    # string input/output
    event_str = TraceEvent(
        trace_id='trace-str',
        span_id='span-str',
        name='test.str',
        type='llm',
        start_time=datetime.now(),
        input='hello',
        output='world',
    )
    api_str = event_str.model_dump_for_api()
    assert api_str['input'] == 'hello'
    assert api_str['output'] == 'world'


def test_flush():
    """Test flush method."""
    http_client = MagicMock(spec=HttpClient)
    client = TracingClient(http_client)
    # Flush should be a no-op
    client.flush()


def test_send_trace_auto_generates_thread_id():
    """Test that thread_id is auto-generated (UUID v7) when not provided."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace = MagicMock()

    client = TracingClient(http_client)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    assert event.thread_id is None
    result = client.send_trace(event)
    assert result.success is True

    # The event passed to http_client should have a thread_id set
    sent_event = http_client.send_trace.call_args[0][0]
    assert sent_event.thread_id is not None
    assert isinstance(sent_event.thread_id, str)
    assert len(sent_event.thread_id) == 36  # UUID format


@pytest.mark.asyncio
async def test_send_trace_async_network_error():
    """Test async trace sending with network error."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace_async = AsyncMock(side_effect=NetworkError('Async network error', 503))

    client = TracingClient(http_client)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = await client.send_trace_async(event)
    assert result.success is False
    assert result.error == 'Async network error'


@pytest.mark.asyncio
async def test_send_trace_async_success():
    """Test successful async trace sending."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace_async = AsyncMock()

    client = TracingClient(http_client)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        thread_id='test-thread-id',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = await client.send_trace_async(event)
    assert result.success is True
    assert result.trace_id == 'test-trace'
    http_client.send_trace_async.assert_called_once_with(event)


@pytest.mark.asyncio
async def test_flush_async():
    """flush_async should be callable and return None."""
    http_client = MagicMock(spec=HttpClient)
    client = TracingClient(http_client)
    result = await client.flush_async()
    assert result is None
