"""HTTP client with retry logic."""

import asyncio
import importlib.metadata
import logging
import random
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from typing import Any

import httpx

from .errors import NetworkError
from .sse import SSEEvent, parse_sse_lines, parse_sse_lines_async
from .types import TraceEvent

logger = logging.getLogger('mentiora.sdk')

try:
    _SDK_VERSION = importlib.metadata.version('mentiora-ai-sdk')
except importlib.metadata.PackageNotFoundError:
    _SDK_VERSION = '0.0.0'


class HttpResponse:
    """HTTP response wrapper."""

    def __init__(self, status: int, body: dict[str, Any]) -> None:
        """Initialize response.

        Args:
            status: HTTP status code.
            body: Parsed JSON response body.
        """
        self.status = status
        self.body = body


class HttpClient:
    """HTTP client with retry logic and exponential backoff."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: int = 30000,
        retries: int = 3,
        debug: bool = False,
    ) -> None:
        """Initialize HTTP client.

        Args:
            base_url: Base URL of the Mentiora platform API.
            api_key: Project API key used for Bearer authentication.
            timeout: Request timeout in milliseconds (converted to seconds internally).
            retries: Maximum number of retry attempts for failed requests.
            debug: Enable verbose SDK logging.
        """
        self.base_url = base_url.rstrip('/')
        self._api_key = api_key
        self.timeout = timeout / 1000.0  # Convert ms to seconds
        self.retries = retries
        self.debug = debug
        self._client: httpx.Client | None = None
        self._async_client: httpx.AsyncClient | None = None

    def __repr__(self) -> str:
        """Return string representation with masked API key."""
        return f"HttpClient(base_url='{self.base_url}', api_key='****')"

    def _get_client(self) -> httpx.Client:
        """Get or create sync HTTP client."""
        if self._client is None:
            self._client = httpx.Client(
                timeout=self.timeout,
                verify=True,
                headers={
                    'Authorization': f'Bearer {self._api_key}',
                    'Content-Type': 'application/json',
                    'User-Agent': f'mentiora-sdk-python/{_SDK_VERSION}',
                },
            )
        return self._client

    def _get_async_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                timeout=self.timeout,
                verify=True,
                headers={
                    'Authorization': f'Bearer {self._api_key}',
                    'Content-Type': 'application/json',
                    'User-Agent': f'mentiora-sdk-python/{_SDK_VERSION}',
                },
            )
        return self._async_client

    def close(self) -> None:
        """Close HTTP clients."""
        if self._client:
            self._client.close()
            self._client = None

    async def aclose(self) -> None:
        """Close async HTTP client."""
        if self._client:
            self._client.close()
            self._client = None
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None

    def __enter__(self) -> 'HttpClient':
        """Context manager entry."""
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.close()

    async def __aenter__(self) -> 'HttpClient':
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.aclose()

    def _normalize_trace_event(self, event: TraceEvent) -> dict[str, Any]:
        """Normalize trace event for API (convert to snake_case)."""
        return event.model_dump_for_api()

    def _should_retry(self, status_code: int) -> bool:
        """Check if status code indicates a retryable error (429 or 5xx)."""
        return status_code == 429 or 500 <= status_code < 600

    def _calculate_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff delay with full jitter in seconds."""
        max_delay = min(10.0, float(2**attempt))
        return random.random() * max_delay

    def _extract_error_detail(self, response: httpx.Response) -> tuple[str | None, str | None, str]:
        """Try to extract structured error info from a JSON error response.

        Returns:
            Tuple of (server_code, server_message, detail_suffix).
            detail_suffix is a formatted string like ': [code] message' or ''.
        """
        try:
            body = response.json()
            if isinstance(body, dict) and 'error' in body:
                err = body['error']
                code = err.get('code') if isinstance(err, dict) else None
                msg = err.get('message') if isinstance(err, dict) else None
                if code and msg:
                    return code, msg, f': [{code}] {msg}'
                if msg:
                    return code, msg, f': {msg}'
        except Exception:
            pass
        return None, None, ''

    def _execute_with_retry(
        self,
        url: str,
        body: dict[str, Any],
        http_call_fn: Callable[[str, dict[str, Any]], httpx.Response],
        sleep_fn: Callable[[float], None],
        debug_context: dict[str, str] | None = None,
    ) -> HttpResponse:
        """Execute HTTP call with retry logic (sync)."""
        ctx = debug_context or {}
        last_error: Exception | None = None
        max_attempts = self.retries + 1

        for attempt in range(max_attempts):
            try:
                if attempt > 0 and self.debug:
                    logger.debug(
                        '[Mentiora SDK] Retry attempt %s/%s',
                        attempt + 1,
                        max_attempts,
                    )

                response = http_call_fn(url, body)

                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Response: status=%s context=%s',
                        response.status_code,
                        ctx,
                    )

                # Retry on 429 rate limiting
                if response.status_code == 429:
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Rate limited (429), retrying: attempt=%s context=%s',
                            attempt + 1,
                            ctx,
                        )
                    if attempt < max_attempts - 1:
                        retry_after = response.headers.get('retry-after')
                        delay = (
                            float(retry_after) if retry_after else self._calculate_backoff(attempt)
                        )
                        sleep_fn(delay)
                        continue
                    raise NetworkError(
                        'Rate limited: too many requests',
                        429,
                    )

                # Don't retry on 4xx errors (client error)
                if 400 <= response.status_code < 500:
                    server_code, server_message, detail = self._extract_error_detail(response)
                    raise NetworkError(
                        f'Client error: {response.status_code} {response.reason_phrase}{detail}',
                        response.status_code,
                        server_code=server_code,
                        server_message=server_message,
                    )

                # Retry on 5xx errors
                if self._should_retry(response.status_code):
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Server error (retryable): status=%s attempt=%s context=%s',
                            response.status_code,
                            attempt + 1,
                            ctx,
                        )
                    if attempt < max_attempts - 1:
                        delay = self._calculate_backoff(attempt)
                        sleep_fn(delay)
                        continue
                    server_code, server_message, detail = self._extract_error_detail(response)
                    raise NetworkError(
                        f'Server error: {response.status_code} {response.reason_phrase}{detail}',
                        response.status_code,
                        server_code=server_code,
                        server_message=server_message,
                    )

                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Request successful: context=%s',
                        ctx,
                    )

                response_body = response.json() if response.content else {}
                return HttpResponse(response.status_code, response_body)

            except httpx.TimeoutException as e:
                raise NetworkError(f'Request timeout after {int(self.timeout * 1000)}ms') from e
            except httpx.NetworkError as e:
                last_error = e
                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Network error: attempt=%s context=%s error=%s',
                        attempt + 1,
                        ctx,
                        e,
                    )
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    sleep_fn(delay)
                    continue
            except NetworkError:
                raise
            except httpx.TransportError as e:
                last_error = e
                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Transport error: attempt=%s context=%s error=%s',
                        attempt + 1,
                        ctx,
                        e,
                    )
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    sleep_fn(delay)
                    continue
            except Exception as e:
                raise NetworkError(str(e)) from e

        raise NetworkError(
            f'Failed after {max_attempts} attempts: {str(last_error) if last_error else "Unknown error"}',
        )

    async def _execute_with_retry_async(
        self,
        url: str,
        body: dict[str, Any],
        http_call_fn: Callable[[str, dict[str, Any]], Awaitable[httpx.Response]],
        sleep_fn: Callable[[float], Awaitable[None]],
        debug_context: dict[str, str] | None = None,
    ) -> HttpResponse:
        """Execute HTTP call with retry logic (async)."""
        ctx = debug_context or {}
        last_error: Exception | None = None
        max_attempts = self.retries + 1

        for attempt in range(max_attempts):
            try:
                if attempt > 0 and self.debug:
                    logger.debug(
                        '[Mentiora SDK] Retry attempt %s/%s',
                        attempt + 1,
                        max_attempts,
                    )

                response = await http_call_fn(url, body)

                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Response: status=%s context=%s',
                        response.status_code,
                        ctx,
                    )

                # Retry on 429 rate limiting
                if response.status_code == 429:
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Rate limited (429), retrying: attempt=%s context=%s',
                            attempt + 1,
                            ctx,
                        )
                    if attempt < max_attempts - 1:
                        retry_after = response.headers.get('retry-after')
                        delay = (
                            float(retry_after) if retry_after else self._calculate_backoff(attempt)
                        )
                        await sleep_fn(delay)
                        continue
                    raise NetworkError(
                        'Rate limited: too many requests',
                        429,
                    )

                # Don't retry on 4xx errors (client error)
                if 400 <= response.status_code < 500:
                    server_code, server_message, detail = self._extract_error_detail(response)
                    raise NetworkError(
                        f'Client error: {response.status_code} {response.reason_phrase}{detail}',
                        response.status_code,
                        server_code=server_code,
                        server_message=server_message,
                    )

                # Retry on 5xx errors
                if self._should_retry(response.status_code):
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Server error (retryable): status=%s attempt=%s context=%s',
                            response.status_code,
                            attempt + 1,
                            ctx,
                        )
                    if attempt < max_attempts - 1:
                        delay = self._calculate_backoff(attempt)
                        await sleep_fn(delay)
                        continue
                    server_code, server_message, detail = self._extract_error_detail(response)
                    raise NetworkError(
                        f'Server error: {response.status_code} {response.reason_phrase}{detail}',
                        response.status_code,
                        server_code=server_code,
                        server_message=server_message,
                    )

                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Request successful: context=%s',
                        ctx,
                    )

                response_body = response.json() if response.content else {}
                return HttpResponse(response.status_code, response_body)

            except httpx.TimeoutException as e:
                raise NetworkError(f'Request timeout after {int(self.timeout * 1000)}ms') from e
            except httpx.NetworkError as e:
                last_error = e
                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Network error: attempt=%s context=%s error=%s',
                        attempt + 1,
                        ctx,
                        e,
                    )
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    await sleep_fn(delay)
                    continue
            except NetworkError:
                raise
            except httpx.TransportError as e:
                last_error = e
                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Transport error: attempt=%s context=%s error=%s',
                        attempt + 1,
                        ctx,
                        e,
                    )
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    await sleep_fn(delay)
                    continue
            except Exception as e:
                raise NetworkError(str(e)) from e

        raise NetworkError(
            f'Failed after {max_attempts} attempts: {str(last_error) if last_error else "Unknown error"}',
        )

    def send_trace(self, event: TraceEvent) -> HttpResponse:
        """Send trace event to the API with retry logic (sync).

        Args:
            event: The trace event to send.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        url = f'{self.base_url}/api/v1/traces'
        body = self._normalize_trace_event(event)

        if self.debug:
            logger.debug(
                '[Mentiora SDK] Sending trace: url=%s trace_id=%s span_id=%s type=%s name=%s',
                url,
                event.trace_id,
                event.span_id,
                event.type,
                event.name,
            )

        def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return self._get_client().post(url, json=body)

        return self._execute_with_retry(
            url,
            body,
            http_call,
            time.sleep,
            {
                'trace_id': event.trace_id,
                'span_id': event.span_id,
            },
        )

    async def send_trace_async(self, event: TraceEvent) -> HttpResponse:
        """Send trace event to the API with retry logic (async).

        Args:
            event: The trace event to send.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        url = f'{self.base_url}/api/v1/traces'
        body = self._normalize_trace_event(event)

        if self.debug:
            logger.debug(
                '[Mentiora SDK] Sending trace: url=%s trace_id=%s span_id=%s type=%s name=%s',
                url,
                event.trace_id,
                event.span_id,
                event.type,
                event.name,
            )

        async def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return await self._get_async_client().post(url, json=body)

        return await self._execute_with_retry_async(
            url,
            body,
            http_call,
            asyncio.sleep,
            {
                'trace_id': event.trace_id,
                'span_id': event.span_id,
            },
        )

    def post(self, path: str, body: dict[str, Any]) -> HttpResponse:
        """Send a POST request with retry logic (sync).

        Args:
            path: API path (e.g. ``'/api/v1/agents/invoke'``).
            body: JSON-serializable request body.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] POST %s', path)

        def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return self._get_client().post(url, json=body)

        return self._execute_with_retry(
            f'{self.base_url}{path}',
            body,
            http_call,
            time.sleep,
            {'path': path},
        )

    async def post_async(self, path: str, body: dict[str, Any]) -> HttpResponse:
        """Send a POST request with retry logic (async).

        Args:
            path: API path (e.g. ``'/api/v1/agents/invoke'``).
            body: JSON-serializable request body.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] POST (async) %s', path)

        async def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return await self._get_async_client().post(url, json=body)

        return await self._execute_with_retry_async(
            f'{self.base_url}{path}',
            body,
            http_call,
            asyncio.sleep,
            {'path': path},
        )

    def get(self, path: str, params: dict[str, str] | None = None) -> HttpResponse:
        """Send a GET request with retry logic (sync).

        Args:
            path: API path (e.g. ``'/api/v1/files'``).
            params: Optional query parameters.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] GET %s', path)

        url = f'{self.base_url}{path}'
        if params:
            from urllib.parse import urlencode

            url = f'{url}?{urlencode({k: v for k, v in params.items() if v is not None})}'

        def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return self._get_client().get(url)

        return self._execute_with_retry(url, {}, http_call, time.sleep, {'path': path})

    async def get_async(self, path: str, params: dict[str, str] | None = None) -> HttpResponse:
        """Send a GET request with retry logic (async).

        Args:
            path: API path.
            params: Optional query parameters.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] GET (async) %s', path)

        url = f'{self.base_url}{path}'
        if params:
            from urllib.parse import urlencode

            url = f'{url}?{urlencode({k: v for k, v in params.items() if v is not None})}'

        async def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return await self._get_async_client().get(url)

        return await self._execute_with_retry_async(
            url, {}, http_call, asyncio.sleep, {'path': path}
        )

    def put(self, path: str, body: dict[str, Any]) -> HttpResponse:
        """Send a PUT request with retry logic (sync).

        Args:
            path: API path.
            body: JSON-serializable request body.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] PUT %s', path)

        def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return self._get_client().put(url, json=body)

        return self._execute_with_retry(
            f'{self.base_url}{path}', body, http_call, time.sleep, {'path': path}
        )

    async def put_async(self, path: str, body: dict[str, Any]) -> HttpResponse:
        """Send a PUT request with retry logic (async).

        Args:
            path: API path.
            body: JSON-serializable request body.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] PUT (async) %s', path)

        async def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return await self._get_async_client().put(url, json=body)

        return await self._execute_with_retry_async(
            f'{self.base_url}{path}', body, http_call, asyncio.sleep, {'path': path}
        )

    def delete(self, path: str, params: dict[str, str] | None = None) -> HttpResponse:
        """Send a DELETE request with retry logic (sync).

        Args:
            path: API path.
            params: Optional query parameters.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] DELETE %s', path)

        url = f'{self.base_url}{path}'
        if params:
            from urllib.parse import urlencode

            url = f'{url}?{urlencode({k: v for k, v in params.items() if v is not None})}'

        def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return self._get_client().delete(url)

        return self._execute_with_retry(url, {}, http_call, time.sleep, {'path': path})

    async def delete_async(self, path: str, params: dict[str, str] | None = None) -> HttpResponse:
        """Send a DELETE request with retry logic (async).

        Args:
            path: API path.
            params: Optional query parameters.

        Returns:
            HTTP response with status code and parsed body.

        Raises:
            NetworkError: On timeout, HTTP 4xx/5xx, or network failure after retries.
        """
        if self.debug:
            logger.debug('[Mentiora SDK] DELETE (async) %s', path)

        url = f'{self.base_url}{path}'
        if params:
            from urllib.parse import urlencode

            url = f'{url}?{urlencode({k: v for k, v in params.items() if v is not None})}'

        async def http_call(url: str, body: dict[str, Any]) -> httpx.Response:
            return await self._get_async_client().delete(url)

        return await self._execute_with_retry_async(
            url, {}, http_call, asyncio.sleep, {'path': path}
        )

    # ---- Streaming POST (SSE) ----

    _SSE_HEADERS: dict[str, str] = {'Accept': 'text/event-stream'}

    def post_stream(self, path: str, body: dict[str, Any]) -> Iterator[SSEEvent]:
        """Send a streaming POST request and yield parsed SSE events (sync).

        No retry logic — the stream is opened once. If the server returns an
        error status code (>= 400) a ``NetworkError`` is raised.

        Args:
            path: API path.
            body: JSON-serializable request body.

        Yields:
            Parsed ``SSEEvent`` objects.

        Raises:
            NetworkError: On timeout, HTTP errors, or network failure.
        """
        url = f'{self.base_url}{path}'
        if self.debug:
            logger.debug('[Mentiora SDK] POST stream %s', path)

        try:
            with self._get_client().stream(
                'POST',
                url,
                json=body,
                headers=self._SSE_HEADERS,
                timeout=self.timeout,
            ) as response:
                if response.status_code >= 400:
                    error_body = response.read()
                    server_code = None
                    server_message = None
                    detail = ''
                    try:
                        import json

                        body_parsed = json.loads(error_body)
                        if isinstance(body_parsed, dict) and 'error' in body_parsed:
                            err = body_parsed['error']
                            server_code = err.get('code') if isinstance(err, dict) else None
                            server_message = err.get('message') if isinstance(err, dict) else None
                            if server_code and server_message:
                                detail = f': [{server_code}] {server_message}'
                            elif server_message:
                                detail = f': {server_message}'
                    except Exception:
                        pass
                    raise NetworkError(
                        f'Stream error: {response.status_code} {response.reason_phrase}{detail}',
                        response.status_code,
                        server_code=server_code,
                        server_message=server_message,
                    )
                yield from parse_sse_lines(response.iter_lines())
        except httpx.TimeoutException as e:
            raise NetworkError(f'Request timeout after {int(self.timeout * 1000)}ms') from e
        except httpx.NetworkError as e:
            raise NetworkError(str(e)) from e
        except NetworkError:
            raise
        except httpx.TransportError as e:
            raise NetworkError(str(e)) from e

    async def post_stream_async(self, path: str, body: dict[str, Any]) -> AsyncIterator[SSEEvent]:
        """Send a streaming POST request and yield parsed SSE events (async).

        No retry logic — the stream is opened once. If the server returns an
        error status code (>= 400) a ``NetworkError`` is raised.

        Args:
            path: API path.
            body: JSON-serializable request body.

        Yields:
            Parsed ``SSEEvent`` objects.

        Raises:
            NetworkError: On timeout, HTTP errors, or network failure.
        """
        url = f'{self.base_url}{path}'
        if self.debug:
            logger.debug('[Mentiora SDK] POST stream (async) %s', path)

        try:
            async with self._get_async_client().stream(
                'POST',
                url,
                json=body,
                headers=self._SSE_HEADERS,
                timeout=self.timeout,
            ) as response:
                if response.status_code >= 400:
                    error_body = await response.aread()
                    server_code = None
                    server_message = None
                    detail = ''
                    try:
                        import json

                        body_parsed = json.loads(error_body)
                        if isinstance(body_parsed, dict) and 'error' in body_parsed:
                            err = body_parsed['error']
                            server_code = err.get('code') if isinstance(err, dict) else None
                            server_message = err.get('message') if isinstance(err, dict) else None
                            if server_code and server_message:
                                detail = f': [{server_code}] {server_message}'
                            elif server_message:
                                detail = f': {server_message}'
                    except Exception:
                        pass
                    raise NetworkError(
                        f'Stream error: {response.status_code} {response.reason_phrase}{detail}',
                        response.status_code,
                        server_code=server_code,
                        server_message=server_message,
                    )
                async for event in parse_sse_lines_async(response.aiter_lines()):
                    yield event
        except httpx.TimeoutException as e:
            raise NetworkError(f'Request timeout after {int(self.timeout * 1000)}ms') from e
        except httpx.NetworkError as e:
            raise NetworkError(str(e)) from e
        except NetworkError:
            raise
        except httpx.TransportError as e:
            raise NetworkError(str(e)) from e
