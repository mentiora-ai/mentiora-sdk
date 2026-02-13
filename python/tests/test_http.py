"""Tests for HttpClient."""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from mentiora.errors import NetworkError
from mentiora.http import HttpClient, HttpResponse
from mentiora.types import TraceEvent


def test_http_client_initialization():
    """Test HTTP client initialization."""
    client = HttpClient(
        base_url='https://test.mentiora.ai',
        api_key='test-key',
        timeout=30000,
        retries=3,
    )
    assert client.base_url == 'https://test.mentiora.ai'
    assert client._api_key == 'test-key'
    assert client.timeout == 30.0
    assert client.retries == 3
    # api_key should not be publicly accessible
    assert not hasattr(client, 'api_key')
    client.close()


def test_http_client_repr_masks_api_key():
    """Test that repr does not expose the API key."""
    client = HttpClient(
        base_url='https://test.mentiora.ai',
        api_key='super-secret-key-123',
    )
    r = repr(client)
    assert 'super-secret-key-123' not in r
    assert '****' in r
    assert 'https://test.mentiora.ai' in r
    client.close()


def test_http_client_user_agent_header():
    """Test that HTTP clients include User-Agent header with correct prefix."""
    client = HttpClient('https://test.mentiora.ai', 'test-key')
    sync_client = client._get_client()
    ua = sync_client.headers.get('user-agent')
    assert ua is not None
    assert ua.startswith('mentiora-sdk-python/')
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
    assert client._should_retry(429) is True
    assert client._should_retry(500) is True
    assert client._should_retry(503) is True
    assert client._should_retry(400) is False
    assert client._should_retry(404) is False
    assert client._should_retry(200) is False
    client.close()


@patch('mentiora.http.random.random', return_value=0.5)
def test_calculate_backoff_with_jitter(mock_random):
    """Test backoff calculation with full jitter."""
    client = HttpClient('https://test.mentiora.ai', 'test-key')
    # max_delay = min(10.0, 1.0 * 2^attempt), delay = random() * max_delay
    assert client._calculate_backoff(0) == 0.5 * 1.0  # 0.5
    assert client._calculate_backoff(1) == 0.5 * 2.0  # 1.0
    assert client._calculate_backoff(2) == 0.5 * 4.0  # 2.0
    assert client._calculate_backoff(10) == 0.5 * 10.0  # 5.0 (capped at 10.0)
    client.close()


def test_calculate_backoff_in_range():
    """Test backoff delay is in range [0, min(cap, base * 2^attempt)]."""
    client = HttpClient('https://test.mentiora.ai', 'test-key')
    for attempt in range(6):
        max_delay = min(10.0, 1.0 * (2**attempt))
        for _ in range(20):
            delay = client._calculate_backoff(attempt)
            assert 0.0 <= delay <= max_delay, (
                f'attempt={attempt}: delay {delay} not in [0, {max_delay}]'
            )
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


@patch('mentiora.http.httpx.Client')
def test_send_trace_malformed_json(mock_client_class):
    """Test handling of malformed JSON in 200 response."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b'{"success": true}'
    mock_response.json.side_effect = ValueError('Invalid JSON')

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

    # JSON parsing error is not a transport error — immediate NetworkError, no retry
    with pytest.raises(NetworkError, match='Invalid JSON'):
        client.send_trace(event)
    client.close()


@patch('mentiora.http.httpx.Client')
def test_send_trace_empty_response(mock_client_class):
    """Test handling of empty response body."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b''

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
    assert result.status == 200
    assert result.body == {}
    client.close()


@patch('mentiora.http.httpx.Client')
@patch('time.sleep')
def test_send_trace_timeout_on_second_retry(mock_sleep, mock_client_class):
    """Test timeout occurring on second retry attempt."""
    mock_client = MagicMock()
    # First attempt: network error (retryable)
    # Second attempt: timeout
    mock_client.post.side_effect = [
        httpx.NetworkError('Connection failed'),
        httpx.TimeoutException('Request timeout'),
    ]
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', retries=3)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    with pytest.raises(NetworkError, match='Request timeout'):
        client.send_trace(event)

    # Verify sleep was called once (after first failure)
    assert mock_sleep.call_count == 1
    client.close()


@patch('mentiora.http.httpx.Client')
@patch('time.sleep')
def test_send_trace_intermittent_timeout(mock_sleep, mock_client_class):
    """Test intermittent timeouts with eventual success."""
    mock_success_response = MagicMock()
    mock_success_response.status_code = 200
    mock_success_response.content = b'{"success": true}'
    mock_success_response.json.return_value = {'success': True}

    mock_client = MagicMock()
    # First two attempts fail, third succeeds
    mock_client.post.side_effect = [
        httpx.NetworkError('Connection failed'),
        httpx.NetworkError('Connection failed'),
        mock_success_response,
    ]
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', retries=3)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = client.send_trace(event)
    assert result.status == 200
    # Verify sleep was called twice (after first two failures)
    assert mock_sleep.call_count == 2
    client.close()


@patch('mentiora.http.httpx.Client')
@patch('time.sleep')
def test_send_trace_max_retries_exhausted(mock_sleep, mock_client_class):
    """Test max retry exhaustion with alternating failures."""
    mock_500_response = MagicMock()
    mock_500_response.status_code = 500
    mock_500_response.reason_phrase = 'Internal Server Error'

    mock_client = MagicMock()
    # All attempts fail with 500
    mock_client.post.return_value = mock_500_response
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', retries=2)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    with pytest.raises(NetworkError, match='Server error: 500'):
        client.send_trace(event)

    # Verify sleep was called twice (retries=2 means 3 total attempts, sleep between each)
    assert mock_sleep.call_count == 2
    client.close()


async def test_send_trace_async_concurrent():
    """Test sending 10 traces concurrently."""
    with patch('mentiora.http.httpx.AsyncClient') as mock_async_client_class:
        mock_success_response = MagicMock()
        mock_success_response.status_code = 200
        mock_success_response.content = b'{"success": true}'
        mock_success_response.json.return_value = {'success': True}

        mock_async_client = AsyncMock()
        mock_async_client.post = AsyncMock(return_value=mock_success_response)
        mock_async_client_class.return_value = mock_async_client

        client = HttpClient('https://test.mentiora.ai', 'test-key')

        events = [
            TraceEvent(
                trace_id=f'trace-{i}',
                span_id=f'span-{i}',
                name='test.operation',
                type='llm',
                start_time=datetime.now(),
            )
            for i in range(10)
        ]

        results = await asyncio.gather(*[client.send_trace_async(event) for event in events])

        assert len(results) == 10
        assert all(r.status == 200 for r in results)
        assert mock_async_client.post.call_count == 10

        await client.aclose()


async def test_send_trace_async_concurrent_with_failures():
    """Test concurrent traces with some failures."""
    with patch('mentiora.http.httpx.AsyncClient') as mock_async_client_class:
        mock_success_response = MagicMock()
        mock_success_response.status_code = 200
        mock_success_response.content = b'{"success": true}'
        mock_success_response.json.return_value = {'success': True}

        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            # Fail every 3rd call
            if call_count % 3 == 0:
                raise httpx.NetworkError('Network error')
            return mock_success_response

        mock_async_client = AsyncMock()
        mock_async_client.post = mock_post
        mock_async_client_class.return_value = mock_async_client

        client = HttpClient('https://test.mentiora.ai', 'test-key', retries=0)

        events = [
            TraceEvent(
                trace_id=f'trace-{i}',
                span_id=f'span-{i}',
                name='test.operation',
                type='llm',
                start_time=datetime.now(),
            )
            for i in range(9)
        ]

        results = await asyncio.gather(
            *[client.send_trace_async(event) for event in events],
            return_exceptions=True,
        )

        assert len(results) == 9
        # 6 should succeed, 3 should fail
        successes = [r for r in results if isinstance(r, HttpResponse)]
        failures = [r for r in results if isinstance(r, Exception)]
        assert len(successes) == 6
        assert len(failures) == 3

        await client.aclose()


@patch('mentiora.http.httpx.Client')
def test_send_trace_type_error_no_retry(mock_client_class):
    """Test that a TypeError does NOT trigger retries (immediate fail)."""
    mock_client = MagicMock()
    mock_client.post.side_effect = TypeError('unhashable type')
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', retries=3)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    with pytest.raises(NetworkError, match='unhashable type'):
        client.send_trace(event)

    # Only one call — no retries for programming errors
    assert mock_client.post.call_count == 1
    client.close()


@patch('mentiora.http.httpx.Client')
@patch('time.sleep')
def test_send_trace_connect_error_retries(mock_sleep, mock_client_class):
    """Test that httpx.ConnectError triggers retries normally."""
    mock_success_response = MagicMock()
    mock_success_response.status_code = 200
    mock_success_response.content = b'{"success": true}'
    mock_success_response.json.return_value = {'success': True}

    mock_client = MagicMock()
    mock_client.post.side_effect = [
        httpx.ConnectError('Connection refused'),
        httpx.ConnectError('Connection refused'),
        mock_success_response,
    ]
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', retries=3)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = client.send_trace(event)
    assert result.status == 200
    # Two retries before success
    assert mock_client.post.call_count == 3
    assert mock_sleep.call_count == 2
    client.close()


@patch('mentiora.http.httpx.Client')
@patch('time.sleep')
def test_send_trace_retries_on_429(mock_sleep, mock_client_class):
    """429 should be retried with Retry-After header."""
    mock_429_response = MagicMock()
    mock_429_response.status_code = 429
    mock_429_response.headers = {'retry-after': '0'}

    mock_success_response = MagicMock()
    mock_success_response.status_code = 200
    mock_success_response.content = b'{"success": true}'
    mock_success_response.json.return_value = {'success': True}

    mock_client = MagicMock()
    mock_client.post.side_effect = [mock_429_response, mock_success_response]
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', retries=3)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    result = client.send_trace(event)
    assert result.status == 200
    assert mock_client.post.call_count == 2
    # Should use Retry-After value (0.0 seconds)
    mock_sleep.assert_called_once_with(0.0)
    client.close()


async def test_send_trace_async_retries_on_429():
    """429 async should be retried with Retry-After header."""
    with patch('mentiora.http.httpx.AsyncClient') as mock_async_client_class:
        mock_429_response = MagicMock()
        mock_429_response.status_code = 429
        mock_429_response.headers = {'retry-after': '0'}

        mock_success_response = MagicMock()
        mock_success_response.status_code = 200
        mock_success_response.content = b'{"success": true}'
        mock_success_response.json.return_value = {'success': True}

        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return mock_429_response
            return mock_success_response

        mock_async_client = AsyncMock()
        mock_async_client.post = mock_post
        mock_async_client_class.return_value = mock_async_client

        client = HttpClient('https://test.mentiora.ai', 'test-key', retries=3)
        event = TraceEvent(
            trace_id='test-trace',
            span_id='test-span',
            name='test.operation',
            type='llm',
            start_time=datetime.now(),
        )

        result = await client.send_trace_async(event)
        assert result.status == 200
        assert call_count == 2

        await client.aclose()


@patch('mentiora.http.httpx.Client')
def test_send_trace_timeout_message_format(mock_client_class):
    """Test that timeout error message uses milliseconds format."""
    mock_client = MagicMock()
    mock_client.post.side_effect = httpx.TimeoutException('timeout')
    mock_client_class.return_value = mock_client

    client = HttpClient('https://test.mentiora.ai', 'test-key', timeout=30000)
    event = TraceEvent(
        trace_id='test-trace',
        span_id='test-span',
        name='test.operation',
        type='llm',
        start_time=datetime.now(),
    )

    with pytest.raises(NetworkError, match='Request timeout after 30000ms'):
        client.send_trace(event)
    client.close()
