"""Streaming helpers for forwarding agent stream events as SSE."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable

from .agents.types import AgentStreamEvent

SSE_HEADERS: dict[str, str] = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
}


def format_sse_event(data: dict[str, object]) -> str:
    """Format a dictionary as a Server-Sent Event data line."""
    return f'data: {json.dumps(data)}\n\n'


def _default_transform(event: AgentStreamEvent) -> dict[str, object] | None:
    """Map SDK stream events to simplified SSE payloads."""
    if event.type == 'output_text_delta':
        return {'type': 'delta', 'delta': event.delta}
    if event.type == 'chat_completed':
        return {
            'type': 'done',
            'threadId': event.thread_id,
            'output': event.output,
            'status': event.status,
        }
    if event.type == 'error':
        return {'type': 'error', 'message': event.message}
    return None


async def stream_events(
    events: AsyncIterator[AgentStreamEvent],
    transform: Callable[[AgentStreamEvent], dict[str, object] | None] | None = None,
) -> AsyncIterator[str]:
    """Async generator that converts agent stream events into SSE strings.

    Args:
        events: An async iterator of ``AgentStreamEvent`` objects, typically from
            ``client.agents.stream_async()``.
        transform: Optional callable that maps each event to a dict (serialized as
            SSE) or ``None`` to skip the event.  When omitted, a built-in transform
            is used that handles ``output_text_delta``, ``chat_completed``, and
            ``error`` events.

    Yields:
        SSE-formatted strings (``data: {...}\\n\\n``).
    """
    fn = transform or _default_transform
    try:
        async for event in events:
            payload = fn(event)
            if payload is not None:
                yield format_sse_event(payload)
    except Exception as exc:  # noqa: BLE001
        yield format_sse_event({'type': 'error', 'message': str(exc)})
