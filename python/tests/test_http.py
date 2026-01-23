"""Tests for HttpClient."""

import pytest
import httpx
from unittest.mock import patch, MagicMock
from datetime import datetime

from mentiora.http import HttpClient, HttpResponse
from mentiora.types import TraceEvent
from mentiora.errors import NetworkError


def test_http_client_initialization():
    """Test HTTP client initialization."""
    client = HttpClient(
        base_url='https://test.mentiora.ai',
        api_key='test-key',
        timeout=30000,
        retries=3,
    )
    assert client.base_url == 'https://test.mentiora.ai'
    assert client.api_key == 'test-key'
    assert client.timeout == 30.0
    assert client.retries == 3
    client.close()


def test_normalize_trace_event():
    """Test trace event normalization."""
    client = HttpClient('https://test.mentiora.ai', 'test-key')
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    normalized = client._normalize_trace_event(event)
    assert normalized['trace_id'] == 'test-trace'
    assert normalized['span_id'] == 'test-span'
    assert normalized['name'] == 'test.operation'
    assert normalized['type'] == 'llm'
    client.close()


def test_should_retry():
    """Test retry logic."""
    client = HttpClient('https://test.mentiora.ai', 'test-key')
    assert client._should_retry(500) is True
    assert client._should_retry(503) is True
    assert client._should_retry(400) is False
    assert client._should_retry(404) is False
    assert client._should_retry(200) is False
    client.close()


def test_calculate_backoff():
    """Test backoff calculation."""
    client = HttpClient('https://test.mentiora.ai', 'test-key')
    assert client._calculate_backoff(0) == 1.0
    assert client._calculate_backoff(1) == 2.0
    assert client._calculate_backoff(2) == 4.0
    assert client._calculate_backoff(10) == 10.0  # Max cap
    client.close()


@patch('mentiora.http.httpx.Client')
def test_send_trace_success(mock_client_class):
    """Test successful trace sending."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {'success': True}
    mock_response.content = b'{"success": true}'

    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key')
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = client.send_trace(event)
    assert isinstance(result, HttpResponse)
    assert result.status == 200
    client.close()


@patch('mentiora.http.httpx.Client')
def test_send_trace_client_error(mock_client_class):
    """Test trace sending with client error (4xx)."""
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.reason_phrase = 'Bad Request'

    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key')
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    with pytest.raises(NetworkError, match='Client error'):
        client.send_trace(event)
    client.close()
