"""Tracing client for sending trace events to the Mentiora platform."""

from .. import http
from ..errors import NetworkError, ValidationError
from ..types import SendTraceResult, TraceEvent
from ..utils import uuid7


class TracingClient:
    """Tracing client for the Mentiora SDK."""

    def __init__(self, http_client: http.HttpClient) -> None:
        """Initialize tracing client.

        Args:
            http_client: Configured HTTP client used for API communication.
        """
        self.http_client = http_client

    def _ensure_thread_id(self, event: TraceEvent) -> TraceEvent:
        """Return event with thread_id set (UUID v7) if missing or empty."""
        thread_id = event.thread_id
        if isinstance(thread_id, str) and thread_id.strip():
            return event
        return event.model_copy(update={'thread_id': str(uuid7())})

    def _validate_trace_event(self, event: TraceEvent) -> None:
        """Validate trace event."""
        if not event.trace_id or not isinstance(event.trace_id, str):
            raise ValidationError('trace_id is required and must be a string')

        if not event.span_id or not isinstance(event.span_id, str):
            raise ValidationError('span_id is required and must be a string')

        if not event.name or not isinstance(event.name, str):
            raise ValidationError('name is required and must be a string')

        valid_types = ['llm', 'tool', 'chat', 'error', 'custom']
        if not event.type or event.type not in valid_types:
            raise ValidationError(f'type must be one of: {", ".join(valid_types)}')

        if not event.start_time:
            raise ValidationError('start_time is required')

    def send_trace(self, event: TraceEvent) -> SendTraceResult:
        """Send a trace event to the Mentiora platform.

        Args:
            event: The trace event to send. A ``thread_id`` is auto-generated if not provided.

        Returns:
            Result indicating success or failure, including the trace and span IDs.
        """
        event = self._ensure_thread_id(event)
        self._validate_trace_event(event)

        try:
            self.http_client.send_trace(event)
            return SendTraceResult(
                success=True,
                trace_id=event.trace_id,
                span_id=event.span_id,
            )
        except NetworkError as e:
            return SendTraceResult(
                success=False,
                trace_id=event.trace_id,
                span_id=event.span_id,
                error=e.message,
            )

    async def send_trace_async(self, event: TraceEvent) -> SendTraceResult:
        """Send a trace event to the Mentiora platform (async).

        Args:
            event: The trace event to send. A ``thread_id`` is auto-generated if not provided.

        Returns:
            Result indicating success or failure, including the trace and span IDs.
        """
        event = self._ensure_thread_id(event)
        self._validate_trace_event(event)

        try:
            await self.http_client.send_trace_async(event)
            return SendTraceResult(
                success=True,
                trace_id=event.trace_id,
                span_id=event.span_id,
            )
        except NetworkError as e:
            return SendTraceResult(
                success=False,
                trace_id=event.trace_id,
                span_id=event.span_id,
                error=e.message,
            )

    def flush(self) -> None:
        """Flush pending traces (no-op for now, reserved for future batching)."""
        # No-op for MVP - reserved for future batching/buffering
        pass

    async def flush_async(self) -> None:
        """Flush pending traces (async, no-op for now)."""
        # No-op for MVP - reserved for future batching/buffering
        pass
