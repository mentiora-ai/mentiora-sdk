"""Server-Sent Events (SSE) parser utilities."""

from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field


@dataclass
class SSEEvent:
    """A parsed Server-Sent Event."""

    event: str = ''
    data: str = ''
    id: str | None = None


@dataclass
class _SSEBuffer:
    """Accumulator for SSE fields across lines."""

    event: str = ''
    data_lines: list[str] = field(default_factory=list)
    id: str | None = None

    def has_data(self) -> bool:
        return bool(self.data_lines) or bool(self.event)

    def to_event(self) -> SSEEvent:
        return SSEEvent(
            event=self.event or 'message',
            data='\n'.join(self.data_lines),
            id=self.id,
        )

    def reset(self) -> None:
        self.event = ''
        self.data_lines = []
        self.id = None


def _process_line(line: str, buf: _SSEBuffer) -> SSEEvent | None:
    """Process a single SSE line. Returns an event on blank line (dispatch), else None."""
    # Blank line = dispatch event
    if not line:
        if buf.has_data():
            event = buf.to_event()
            buf.reset()
            return event
        return None

    # Comment lines start with ':'
    if line.startswith(':'):
        return None

    # Parse "field: value" or "field:value" or "field"
    if ':' in line:
        field_name, _, value = line.partition(':')
        # Strip single leading space from value per SSE spec
        if value.startswith(' '):
            value = value[1:]
    else:
        field_name = line
        value = ''

    if field_name == 'event':
        buf.event = value
    elif field_name == 'data':
        buf.data_lines.append(value)
    elif field_name == 'id':
        buf.id = value

    return None


def parse_sse_lines(lines: Iterator[str]) -> Iterator[SSEEvent]:
    """Parse SSE events from a synchronous line iterator.

    Args:
        lines: Iterator of text lines (without trailing newlines).

    Yields:
        Parsed SSEEvent objects.
    """
    buf = _SSEBuffer()
    for line in lines:
        event = _process_line(line, buf)
        if event is not None:
            yield event
    # Flush any remaining buffered event at end of stream
    if buf.has_data():
        yield buf.to_event()


async def parse_sse_lines_async(lines: AsyncIterator[str]) -> AsyncIterator[SSEEvent]:
    """Parse SSE events from an asynchronous line iterator.

    Args:
        lines: Async iterator of text lines (without trailing newlines).

    Yields:
        Parsed SSEEvent objects.
    """
    buf = _SSEBuffer()
    async for line in lines:
        event = _process_line(line, buf)
        if event is not None:
            yield event
    # Flush any remaining buffered event at end of stream
    if buf.has_data():
        yield buf.to_event()
