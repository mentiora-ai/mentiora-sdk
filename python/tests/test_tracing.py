"""Tests for TracingClient."""

import pytest
from unittest.mock import MagicMock, AsyncMock
from datetime import datetime

from mentiora.tracing import TracingClient
from mentiora.types import TraceEvent
from mentiora.errors import ValidationError, NetworkError
from mentiora.http import HttpClient


def test_send_trace_success():
    """Test successful trace sending."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace = MagicMock()

    client = TracingClient(http_client, 'https://test.mentiora.ai')
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
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

    client = TracingClient(http_client, 'https://test.mentiora.ai')
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
    client = TracingClient(http_client, 'https://test.mentiora.ai')

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


def test_flush():
    """Test flush method."""
    http_client = MagicMock(spec=HttpClient)
    client = TracingClient(http_client, 'https://test.mentiora.ai')
    # Flush should be a no-op
    client.flush()


@pytest.mark.asyncio
async def test_send_trace_async_success():
    """Test successful async trace sending."""
    http_client = MagicMock(spec=HttpClient)
    http_client.send_trace_async = AsyncMock()

    client = TracingClient(http_client, 'https://test.mentiora.ai')
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = await client.send_trace_async(event)
    assert result.success is True
    assert result.trace_id == 'test-trace'
    http_client.send_trace_async.assert_called_once_with(event)
