"""Tests for SSE parser utilities."""

from mentiora.sse import SSEEvent, parse_sse_lines, parse_sse_lines_async


def test_parse_single_data_event():
    """Parse a single SSE event with data field."""
    lines = iter(['data: hello world', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0] == SSEEvent(event='message', data='hello world')


def test_parse_default_event_type_is_message():
    """SSE spec: events without event: field default to type 'message'."""
    lines = iter(['data: no event type', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].event == 'message'
    assert events[0].data == 'no event type'


def test_parse_event_with_type():
    """Parse an event with both event and data fields."""
    lines = iter(['event: message', 'data: {"text": "hi"}', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].event == 'message'
    assert events[0].data == '{"text": "hi"}'


def test_parse_event_with_id():
    """Parse an event with id field."""
    lines = iter(['id: 42', 'event: update', 'data: payload', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].id == '42'
    assert events[0].event == 'update'
    assert events[0].data == 'payload'


def test_parse_multiline_data():
    """Multiple data lines are joined with newlines."""
    lines = iter(['data: line1', 'data: line2', 'data: line3', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].data == 'line1\nline2\nline3'


def test_parse_multiple_events():
    """Parse multiple events separated by blank lines."""
    lines = iter(
        [
            'event: first',
            'data: one',
            '',
            'event: second',
            'data: two',
            '',
        ]
    )
    events = list(parse_sse_lines(lines))
    assert len(events) == 2
    assert events[0].event == 'first'
    assert events[0].data == 'one'
    assert events[1].event == 'second'
    assert events[1].data == 'two'


def test_parse_ignores_comments():
    """Lines starting with ':' are comments and should be ignored."""
    lines = iter([': this is a comment', 'data: actual data', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].data == 'actual data'


def test_parse_data_no_space_after_colon():
    """Data value without space after colon is preserved."""
    lines = iter(['data:no-space', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].data == 'no-space'


def test_parse_data_with_colon_in_value():
    """Colons within the value are preserved."""
    lines = iter(['data: key: value: extra', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].data == 'key: value: extra'


def test_parse_empty_data():
    """Data field with no value yields empty string."""
    lines = iter(['data:', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].data == ''


def test_parse_unknown_fields_ignored():
    """Unknown field names are silently ignored."""
    lines = iter(['retry: 5000', 'data: kept', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].data == 'kept'


def test_parse_flushes_at_end_of_stream():
    """Buffered event is flushed when the iterator ends without a trailing blank line."""
    lines = iter(['event: final', 'data: tail'])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].event == 'final'
    assert events[0].data == 'tail'


def test_parse_empty_stream():
    """Empty iterator yields no events."""
    events = list(parse_sse_lines(iter([])))
    assert events == []


def test_parse_only_blank_lines():
    """Only blank lines yield no events."""
    lines = iter(['', '', ''])
    events = list(parse_sse_lines(lines))
    assert events == []


def test_parse_only_comments():
    """Only comment lines yield no events."""
    lines = iter([': comment1', ': comment2'])
    events = list(parse_sse_lines(lines))
    assert events == []


def test_parse_event_only_frame_dispatches():
    """Python dispatches event-only SSE frames (no data: field).

    NOTE: TypeScript's parser only dispatches when dataLines.length > 0,
    so event-only frames are NOT dispatched in TypeScript. This divergence
    is acceptable — event-only frames are uncommon in practice.
    """
    lines = iter(['event: ping', ''])
    events = list(parse_sse_lines(lines))
    assert len(events) == 1
    assert events[0].event == 'ping'
    assert events[0].data == ''


# ---- Async tests ----


async def _async_iter(items: list[str]):
    """Helper to create an async iterator from a list."""
    for item in items:
        yield item


async def test_parse_sse_lines_async_single_event():
    """Async parser handles a single event."""
    lines = _async_iter(['event: ping', 'data: pong', ''])
    events = [e async for e in parse_sse_lines_async(lines)]
    assert len(events) == 1
    assert events[0].event == 'ping'
    assert events[0].data == 'pong'


async def test_parse_sse_lines_async_multiple_events():
    """Async parser handles multiple events."""
    lines = _async_iter(
        [
            'data: first',
            '',
            'data: second',
            '',
        ]
    )
    events = [e async for e in parse_sse_lines_async(lines)]
    assert len(events) == 2
    assert events[0].data == 'first'
    assert events[1].data == 'second'


async def test_parse_sse_lines_async_flush():
    """Async parser flushes buffered event at end of stream."""
    lines = _async_iter(['data: no-trailing-blank'])
    events = [e async for e in parse_sse_lines_async(lines)]
    assert len(events) == 1
    assert events[0].data == 'no-trailing-blank'


async def test_parse_sse_lines_async_multiline_data():
    """Async parser joins multiple data lines."""
    lines = _async_iter(['data: a', 'data: b', ''])
    events = [e async for e in parse_sse_lines_async(lines)]
    assert len(events) == 1
    assert events[0].data == 'a\nb'
