"""HTTP client with retry logic."""

import asyncio
import time
from typing import Any

import httpx

from .errors import NetworkError
from .types import TraceEvent


class HttpResponse:
    """HTTP response wrapper."""

    def __init__(self, status: int, body: dict[str, Any]) -> None:
        """Initialize response."""
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
    ) -> None:
        """Initialize HTTP client."""
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout / 1000.0  # Convert ms to seconds
        self.retries = retries
        self._client: httpx.Client | None = None
        self._async_client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.Client:
        """Get or create sync HTTP client."""
        if self._client is None:
            self._client = httpx.Client(
                timeout=self.timeout,
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                },
            )
        return self._client

    def _get_async_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                },
            )
        return self._async_client

    def close(self) -> None:
        """Close HTTP clients."""
        if self._client:
            self._client.close()
            self._client = None
        if self._async_client:
            # Async client needs to be closed in async context
            pass

    async def aclose(self) -> None:
        """Close async HTTP client."""
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None

    def _normalize_trace_event(self, event: TraceEvent) -> dict[str, Any]:
        """Normalize trace event for API (convert to snake_case)."""
        return event.model_dump_for_api()

    def _should_retry(self, status_code: int) -> bool:
        """Check if status code indicates a retryable error (5xx)."""
        return 500 <= status_code < 600

    def _calculate_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff delay in seconds."""
        return min(1.0 * (2 ** attempt), 10.0)

    def send_trace(self, event: TraceEvent) -> HttpResponse:
        """Send trace event to the API with retry logic (sync)."""
        url = f'{self.base_url}/api/v1/traces'
        body = self._normalize_trace_event(event)

        last_error: Exception | None = None
        max_attempts = self.retries + 1

        for attempt in range(max_attempts):
            try:
                client = self._get_client()
                response = client.post(url, json=body)

                # Don't retry on 4xx errors (client error)
                if 400 <= response.status_code < 500:
                    raise NetworkError(
                        f'Client error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                # Retry on 5xx errors
                if self._should_retry(response.status_code):
                    if attempt < max_attempts - 1:
                        delay = self._calculate_backoff(attempt)
                        time.sleep(delay)
                        continue
                    raise NetworkError(
                        f'Server error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                response_body = response.json() if response.content else {}
                return HttpResponse(response.status_code, response_body)

            except httpx.TimeoutException as e:
                raise NetworkError(f'Request timeout after {self.timeout}s') from e
            except httpx.NetworkError as e:
                last_error = e
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    time.sleep(delay)
                    continue
            except NetworkError:
                raise
            except Exception as e:
                last_error = e
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    time.sleep(delay)
                    continue

        raise NetworkError(
            f'Failed after {max_attempts} attempts: {str(last_error) if last_error else "Unknown error"}',
        )

    async def send_trace_async(self, event: TraceEvent) -> HttpResponse:
        """Send trace event to the API with retry logic (async)."""
        url = f'{self.base_url}/api/v1/traces'
        body = self._normalize_trace_event(event)

        last_error: Exception | None = None
        max_attempts = self.retries + 1

        for attempt in range(max_attempts):
            try:
                client = self._get_async_client()
                response = await client.post(url, json=body)

                # Don't retry on 4xx errors (client error)
                if 400 <= response.status_code < 500:
                    raise NetworkError(
                        f'Client error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                # Retry on 5xx errors
                if self._should_retry(response.status_code):
                    if attempt < max_attempts - 1:
                        delay = self._calculate_backoff(attempt)
                        await asyncio.sleep(delay)
                        continue
                    raise NetworkError(
                        f'Server error: {response.status_code} {response.reason_phrase}',
                        response.status_code,
                    )

                response_body = response.json() if response.content else {}
                return HttpResponse(response.status_code, response_body)

            except httpx.TimeoutException as e:
                raise NetworkError(f'Request timeout after {self.timeout}s') from e
            except httpx.NetworkError as e:
                last_error = e
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    await asyncio.sleep(delay)
                    continue
            except NetworkError:
                raise
            except Exception as e:
                last_error = e
                if attempt < max_attempts - 1:
                    delay = self._calculate_backoff(attempt)
                    await asyncio.sleep(delay)
                    continue

        raise NetworkError(
            f'Failed after {max_attempts} attempts: {str(last_error) if last_error else "Unknown error"}',
        )
