/**
 * Tests for SSE stream parser.
 */

import { describe, expect, it } from 'vitest';
import { parseSSEStream } from '../sse';
import type { SSEEvent } from '../sse';

/**
 * Create a ReadableStream from an array of string chunks.
 */
function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/**
 * Collect all events from an async generator.
 */
async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of parseSSEStream(stream)) {
    events.push(event);
  }
  return events;
}

describe('parseSSEStream', () => {
  it('parses a well-formed SSE event', async () => {
    const stream = createStream(['event: message\ndata: hello\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('parses multiple events', async () => {
    const stream = createStream(['event: start\ndata: first\n\nevent: end\ndata: second\n\n']);
    const events = await collectEvents(stream);

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'start', data: 'first' });
    expect(events[1]).toEqual({ event: 'end', data: 'second' });
  });

  it('handles multi-line data fields', async () => {
    const stream = createStream([
      'event: message\ndata: line one\ndata: line two\ndata: line three\n\n',
    ]);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'line one\nline two\nline three' }]);
  });

  it('handles partial chunks split across reads', async () => {
    const stream = createStream(['event: mes', 'sage\nda', 'ta: hel', 'lo world\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'hello world' }]);
  });

  it('returns empty array for an empty stream', async () => {
    const stream = createStream([]);
    const events = await collectEvents(stream);

    expect(events).toEqual([]);
  });

  it('defaults event name to "message" when event field is missing', async () => {
    const stream = createStream(['data: no event type\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'no event type' }]);
  });

  it('includes id field when present', async () => {
    const stream = createStream(['event: update\nid: 42\ndata: payload\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'update', data: 'payload', id: '42' }]);
  });

  it('ignores comment lines', async () => {
    const stream = createStream([': this is a comment\nevent: ping\ndata: pong\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'ping', data: 'pong' }]);
  });

  it('ignores events with no data', async () => {
    const stream = createStream(['event: empty\n\ndata: real\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'real' }]);
  });

  it('flushes remaining data when stream ends without trailing newline', async () => {
    const stream = createStream(['data: no trailing newline']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'no trailing newline' }]);
  });

  it('handles \\r\\n line endings', async () => {
    const stream = createStream(['event: crlf\r\ndata: windows\r\n\r\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'crlf', data: 'windows' }]);
  });

  it('preserves multiple leading spaces in data value', async () => {
    const stream = createStream(['data:  two spaces\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: ' two spaces' }]);
  });

  it('strips single leading space per SSE spec', async () => {
    const stream = createStream(['data: hello\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'hello' }]);
  });

  it('handles no space after colon', async () => {
    const stream = createStream(['data:no-space\n\n']);
    const events = await collectEvents(stream);

    expect(events).toEqual([{ event: 'message', data: 'no-space' }]);
  });

  it('does NOT dispatch event-only frames (no data field)', async () => {
    // NOTE: Python's parser dispatches event-only frames because it checks
    // `bool(self.event)`. TypeScript only dispatches when dataLines.length > 0.
    // This divergence is acceptable — event-only frames are uncommon in practice.
    const stream = createStream(['event: ping\n\n', 'data: real\n\n']);
    const events = await collectEvents(stream);

    // Only the second event (with data) is dispatched
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: 'message', data: 'real' });
  });

  it('handles data with JSON payload', async () => {
    const json = JSON.stringify({ message: 'hello', count: 42 });
    const stream = createStream([`event: data\ndata: ${json}\n\n`]);
    const events = await collectEvents(stream);

    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].data)).toEqual({ message: 'hello', count: 42 });
  });
});
