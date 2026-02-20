/**
 * Tests for streaming helpers (createStreamResponse, SSE_HEADERS).
 */

import { describe, expect, it } from 'vitest';
import type { AgentStreamEvent } from '../agents';
import { createStreamResponse, SSE_HEADERS } from '../streaming';

/** Collect all text chunks from a Response body into a single string. */
async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

/** Parse SSE text into an array of parsed JSON payloads. */
function parseSSE(text: string): unknown[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.replace('data: ', '')));
}

/** Helper to create an async iterable from an array of events. */
async function* fromArray(events: AgentStreamEvent[]): AsyncGenerator<AgentStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

describe('SSE_HEADERS', () => {
  it('contains the four required headers', () => {
    expect(SSE_HEADERS).toEqual({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  });
});

describe('createStreamResponse', () => {
  it('returns a Response with correct SSE headers', () => {
    const response = createStreamResponse(fromArray([]));

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('serializes events as data: {json}\\n\\n', async () => {
    const events: AgentStreamEvent[] = [{ type: 'output_text_delta', delta: 'Hello' }];

    const response = createStreamResponse(fromArray(events));
    const text = await readAll(response);

    expect(text).toBe('data: {"type":"delta","delta":"Hello"}\n\n');
  });

  it('maps output_text_delta to {type:"delta", delta}', async () => {
    const events: AgentStreamEvent[] = [
      { type: 'output_text_delta', delta: 'Hi' },
      { type: 'output_text_delta', delta: ' there' },
    ];

    const response = createStreamResponse(fromArray(events));
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toEqual([
      { type: 'delta', delta: 'Hi' },
      { type: 'delta', delta: ' there' },
    ]);
  });

  it('maps chat_completed to {type:"done", threadId, output, status}', async () => {
    const events: AgentStreamEvent[] = [
      {
        type: 'chat_completed',
        threadId: 'thread-1',
        output: 'Done!',
        status: 'completed',
      },
    ];

    const response = createStreamResponse(fromArray(events));
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toEqual([
      { type: 'done', threadId: 'thread-1', output: 'Done!', status: 'completed' },
    ]);
  });

  it('maps error to {type:"error", message}', async () => {
    const events: AgentStreamEvent[] = [
      { type: 'error', code: 'AGENT_ERROR', message: 'Something broke' },
    ];

    const response = createStreamResponse(fromArray(events));
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toEqual([{ type: 'error', message: 'Something broke' }]);
  });

  it('skips event types not handled by default transform', async () => {
    const events: AgentStreamEvent[] = [
      {
        type: 'agent_resolved',
        agentId: 'a',
        agentRevision: 1,
        threadId: 't',
      },
      { type: 'output_text_delta', delta: 'Hello' },
      {
        type: 'tool_call_delta',
        toolCallId: 'tc-1',
        name: 'search',
        argumentsDelta: '{}',
      },
    ];

    const response = createStreamResponse(fromArray(events));
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual({ type: 'delta', delta: 'Hello' });
  });

  it('emits error SSE event when async iterable throws', async () => {
    async function* failing(): AsyncGenerator<AgentStreamEvent> {
      yield { type: 'output_text_delta', delta: 'Hi' };
      throw new Error('stream exploded');
    }

    const response = createStreamResponse(failing());
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual({ type: 'delta', delta: 'Hi' });
    expect(payloads[1]).toEqual({ type: 'error', message: 'stream exploded' });
  });

  it('applies custom transform function', async () => {
    const events: AgentStreamEvent[] = [{ type: 'output_text_delta', delta: 'Hello' }];

    const response = createStreamResponse(fromArray(events), {
      transform: (event) => {
        if (event.type === 'output_text_delta') {
          return { kind: 'text', content: event.delta };
        }
        return null;
      },
    });
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toEqual([{ kind: 'text', content: 'Hello' }]);
  });

  it('merges custom headers with SSE defaults', () => {
    const response = createStreamResponse(fromArray([]), {
      headers: { 'X-Custom': 'value' },
    });

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('X-Custom')).toBe('value');
  });

  it('allows custom headers to override SSE defaults', () => {
    const response = createStreamResponse(fromArray([]), {
      headers: { 'Cache-Control': 'max-age=60' },
    });

    expect(response.headers.get('Cache-Control')).toBe('max-age=60');
  });

  it('skips event when transform returns null', async () => {
    const events: AgentStreamEvent[] = [
      { type: 'output_text_delta', delta: 'keep' },
      { type: 'output_text_delta', delta: 'skip' },
      { type: 'output_text_delta', delta: 'keep2' },
    ];

    const response = createStreamResponse(fromArray(events), {
      transform: (event) => {
        if (event.type === 'output_text_delta' && event.delta === 'skip') {
          return null;
        }
        if (event.type === 'output_text_delta') {
          return { type: 'delta', delta: event.delta };
        }
        return null;
      },
    });
    const payloads = parseSSE(await readAll(response));

    expect(payloads).toEqual([
      { type: 'delta', delta: 'keep' },
      { type: 'delta', delta: 'keep2' },
    ]);
  });
});
