"""HTTP client with retry logic."""

import asyncio
import importlib.metadata
import logging
import random
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from .errors import NetworkError
from .types import TraceEvent

logger = logging.getLogger('mentiora.sdk')

try:
    _SDK_VERSION = importlib.metadata.version('mentiora-sdk')
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

    def _execute_with_retry(
        self,
        event: TraceEvent,
        url: str,
        body: dict[str, Any],
        http_call_fn: Callable[[str, dict[str, Any]], httpx.Response],
        sleep_fn: Callable[[float], None],
    ) -> HttpResponse:
        """Execute HTTP call with retry logic (sync)."""
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
                        '[Mentiora SDK] Response: status=%s trace_id=%s',
                        response.status_code,
                        event.trace_id,
                    )

                # Retry on 429 rate limiting
                if response.status_code == 429:
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Rate limited (429), retrying: attempt=%s trace_id=%s',
                            attempt + 1,
                            event.trace_id,
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
                    raise NetworkError(
                        f'Client error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                # Retry on 5xx errors
                if self._should_retry(response.status_code):
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Server error (retryable): status=%s attempt=%s trace_id=%s',
                            response.status_code,
                            attempt + 1,
                            event.trace_id,
                        )
                    if attempt < max_attempts - 1:
                        delay = self._calculate_backoff(attempt)
                        sleep_fn(delay)
                        continue
                    raise NetworkError(
                        f'Server error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Trace sent successfully: trace_id=%s span_id=%s',
                        event.trace_id,
                        event.span_id,
                    )

                response_body = response.json() if response.content else {}
                return HttpResponse(response.status_code, response_body)

            except httpx.TimeoutException as e:
                raise NetworkError(f'Request timeout after {int(self.timeout * 1000)}ms') from e
            except httpx.NetworkError as e:
                last_error = e
                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Network error: attempt=%s trace_id=%s error=%s',
                        attempt + 1,
                        event.trace_id,
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
                        '[Mentiora SDK] Transport error: attempt=%s trace_id=%s error=%s',
                        attempt + 1,
                        event.trace_id,
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
        event: TraceEvent,
        url: str,
        body: dict[str, Any],
        http_call_fn: Callable[[str, dict[str, Any]], Awaitable[httpx.Response]],
        sleep_fn: Callable[[float], Awaitable[None]],
    ) -> HttpResponse:
        """Execute HTTP call with retry logic (async)."""
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
                        '[Mentiora SDK] Response: status=%s trace_id=%s',
                        response.status_code,
                        event.trace_id,
                    )

                # Retry on 429 rate limiting
                if response.status_code == 429:
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Rate limited (429), retrying: attempt=%s trace_id=%s',
                            attempt + 1,
                            event.trace_id,
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
                    raise NetworkError(
                        f'Client error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                # Retry on 5xx errors
                if self._should_retry(response.status_code):
                    if self.debug:
                        logger.warning(
                            '[Mentiora SDK] Server error (retryable): status=%s attempt=%s trace_id=%s',
                            response.status_code,
                            attempt + 1,
                            event.trace_id,
                        )
                    if attempt < max_attempts - 1:
                        delay = self._calculate_backoff(attempt)
                        await sleep_fn(delay)
                        continue
                    raise NetworkError(
                        f'Server error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Trace sent successfully: trace_id=%s span_id=%s',
                        event.trace_id,
                        event.span_id,
                    )

                response_body = response.json() if response.content else {}
                return HttpResponse(response.status_code, response_body)

            except httpx.TimeoutException as e:
                raise NetworkError(f'Request timeout after {int(self.timeout * 1000)}ms') from e
            except httpx.NetworkError as e:
                last_error = e
                if self.debug:
                    logger.debug(
                        '[Mentiora SDK] Network error: attempt=%s trace_id=%s error=%s',
                        attempt + 1,
                        event.trace_id,
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
                        '[Mentiora SDK] Transport error: attempt=%s trace_id=%s error=%s',
                        attempt + 1,
                        event.trace_id,
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

        return self._execute_with_retry(event, url, body, http_call, time.sleep)

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

        return await self._execute_with_retry_async(event, url, body, http_call, asyncio.sleep)
