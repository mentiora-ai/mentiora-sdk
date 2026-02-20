"""Tests for streaming helpers."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from mentiora.agents.types import (
    AgentErrorEvent,
    ChatCompletedEvent,
    OutputTextDeltaEvent,
    ToolCallDeltaEvent,
)
from mentiora.streaming import SSE_HEADERS, format_sse_event, stream_events

# ── Helpers ──────────────────────────────────────────────────────────────────


async def _to_list(ait: AsyncIterator[str]) -> list[str]:
    return [item async for item in ait]


async def _events_from(items: list[object]) -> AsyncIterator[object]:
    for item in items:
        yield item


async def _failing_events() -> AsyncIterator[object]:
    yield OutputTextDeltaEvent(delta='hi')
    raise RuntimeError('boom')


# ── SSE_HEADERS ──────────────────────────────────────────────────────────────


def test_sse_headers_has_required_keys():
    assert 'Content-Type' in SSE_HEADERS
    assert 'Cache-Control' in SSE_HEADERS
    assert 'Connection' in SSE_HEADERS
    assert 'X-Accel-Buffering' in SSE_HEADERS


def test_sse_headers_content_type():
    assert SSE_HEADERS['Content-Type'] == 'text/event-stream'


def test_sse_headers_cache_control():
    assert 'no-cache' in SSE_HEADERS['Cache-Control']
    assert 'no-transform' in SSE_HEADERS['Cache-Control']


# ── format_sse_event ─────────────────────────────────────────────────────────


def test_format_sse_event_basic():
    result = format_sse_event({'type': 'delta', 'delta': 'hello'})
    assert result == 'data: {"type": "delta", "delta": "hello"}\n\n'


def test_format_sse_event_starts_with_data_prefix():
    result = format_sse_event({'a': 1})
    assert result.startswith('data: ')


def test_format_sse_event_ends_with_double_newline():
    result = format_sse_event({'a': 1})
    assert result.endswith('\n\n')


def test_format_sse_event_contains_valid_json():
    result = format_sse_event({'key': 'value', 'num': 42})
    json_str = result.removeprefix('data: ').rstrip('\n')
    parsed = json.loads(json_str)
    assert parsed == {'key': 'value', 'num': 42}


# ── stream_events — default transform ───────────────────────────────────────


async def test_stream_events_output_text_delta():
    events = _events_from([OutputTextDeltaEvent(delta='Hello')])
    results = await _to_list(stream_events(events))  # type: ignore[arg-type]
    assert len(results) == 1
    payload = json.loads(results[0].removeprefix('data: '))
    assert payload == {'type': 'delta', 'delta': 'Hello'}


async def test_stream_events_chat_completed():
    events = _events_from(
        [
            ChatCompletedEvent(thread_id='t1', status='completed', output='done'),
        ]
    )
    results = await _to_list(stream_events(events))  # type: ignore[arg-type]
    assert len(results) == 1
    payload = json.loads(results[0].removeprefix('data: '))
    assert payload == {
        'type': 'done',
        'threadId': 't1',
        'output': 'done',
        'status': 'completed',
    }


async def test_stream_events_error_event():
    events = _events_from([AgentErrorEvent(code='500', message='server error')])
    results = await _to_list(stream_events(events))  # type: ignore[arg-type]
    assert len(results) == 1
    payload = json.loads(results[0].removeprefix('data: '))
    assert payload == {'type': 'error', 'message': 'server error'}


async def test_stream_events_skips_unknown_types():
    events = _events_from(
        [
            ToolCallDeltaEvent(tool_call_id='tc1', name='fn', arguments_delta='{}'),
            OutputTextDeltaEvent(delta='hi'),
        ]
    )
    results = await _to_list(stream_events(events))  # type: ignore[arg-type]
    assert len(results) == 1
    payload = json.loads(results[0].removeprefix('data: '))
    assert payload['type'] == 'delta'


# ── stream_events — exception handling ───────────────────────────────────────


async def test_stream_events_catches_generator_exception():
    results = await _to_list(stream_events(_failing_events()))  # type: ignore[arg-type]
    assert len(results) == 2
    # First is the normal delta
    p0 = json.loads(results[0].removeprefix('data: '))
    assert p0['type'] == 'delta'
    # Second is the error from the exception
    p1 = json.loads(results[1].removeprefix('data: '))
    assert p1 == {'type': 'error', 'message': 'boom'}


# ── stream_events — custom transform ────────────────────────────────────────


async def test_stream_events_custom_transform():
    def custom(event: object) -> dict[str, object] | None:
        return {'custom': True, 'event_type': getattr(event, 'type', 'unknown')}

    events = _events_from([OutputTextDeltaEvent(delta='x')])
    results = await _to_list(stream_events(events, transform=custom))  # type: ignore[arg-type]
    assert len(results) == 1
    payload = json.loads(results[0].removeprefix('data: '))
    assert payload == {'custom': True, 'event_type': 'output_text_delta'}


async def test_stream_events_custom_transform_none_skips():
    def skip_all(event: object) -> dict[str, object] | None:
        return None

    events = _events_from(
        [
            OutputTextDeltaEvent(delta='a'),
            OutputTextDeltaEvent(delta='b'),
        ]
    )
    results = await _to_list(stream_events(events, transform=skip_all))  # type: ignore[arg-type]
    assert results == []
