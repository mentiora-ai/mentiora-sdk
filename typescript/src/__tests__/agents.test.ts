/**
 * Tests for AgentsClient — validation, run() response parsing, and streaming.
 */

import { describe, expect, it, vi } from 'vitest';
import { AgentsClient } from '../agents/client';
import type { AgentStreamEvent } from '../agents/types';
import { ValidationError } from '../errors';
import type { HttpClient } from '../http';

/**
 * Create a mock HttpClient that satisfies the AgentsClient constructor.
 * post() returns a minimal valid agent response so validation-passing calls
 * don't blow up on response parsing.
 */
function createMockHttpClient(overrides?: Partial<HttpClient>): HttpClient {
  return {
    isDebugEnabled: false,
    post: vi.fn().mockResolvedValue({
      status: 200,
      body: {
        thread_id: 'tid',
        agent_id: 'aid',
        agent_revision: 1,
        output: 'hello',
        status: 'completed',
        tool_calls: [],
      },
    }),
    postStream: vi.fn().mockResolvedValue(new ReadableStream()),
    sendTrace: vi.fn(),
    ...overrides,
  } as unknown as HttpClient;
}

/**
 * Build a ReadableStream that emits SSE-formatted bytes from an array of
 * `{ event, data }` objects. Each entry becomes `event: <event>\ndata: <data>\n\n`.
 */
function buildSSEStream(
  events: Array<{ event: string; data: string }>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Collect all events from the stream() async generator. */
async function collectStreamEvents(
  gen: AsyncGenerator<AgentStreamEvent>
): Promise<AgentStreamEvent[]> {
  const results: AgentStreamEvent[] = [];
  for await (const event of gen) {
    results.push(event);
  }
  return results;
}

describe('AgentsClient validation', () => {
  it('rejects tags with invalid format', async () => {
    const client = new AgentsClient(createMockHttpClient());

    for (const badTag of ['Production', '-invalid', 'has spaces', 'UPPER']) {
      await expect(client.run({ message: 'hi', tag: badTag })).rejects.toThrow(ValidationError);

      await expect(client.run({ message: 'hi', tag: badTag })).rejects.toThrow(
        'Invalid tag format'
      );
    }
  });

  it('accepts valid tag formats', async () => {
    const mockHttp = createMockHttpClient();
    const client = new AgentsClient(mockHttp);

    for (const goodTag of ['production', 'staging-v2', 'test_env', '0-beta']) {
      // Should not throw ValidationError. May throw NetworkError from mock
      // but that's fine — we only care that validation passes.
      await expect(client.run({ message: 'hi', tag: goodTag })).resolves.toBeDefined();
    }
  });

  it('rejects out-of-range temperature', async () => {
    const client = new AgentsClient(createMockHttpClient());

    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { temperature: -1 } })
    ).rejects.toThrow(ValidationError);
    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { temperature: -1 } })
    ).rejects.toThrow('temperature must be between 0 and 2');

    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { temperature: 3 } })
    ).rejects.toThrow(ValidationError);
    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { temperature: 3 } })
    ).rejects.toThrow('temperature must be between 0 and 2');
  });

  it('accepts valid temperature values', async () => {
    const client = new AgentsClient(createMockHttpClient());

    for (const temp of [0, 0.5, 1, 1.5, 2]) {
      await expect(
        client.run({ message: 'hi', tag: 'prod', modelParams: { temperature: temp } })
      ).resolves.toBeDefined();
    }
  });

  it('rejects non-positive max_tokens', async () => {
    const client = new AgentsClient(createMockHttpClient());

    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { maxTokens: 0 } })
    ).rejects.toThrow(ValidationError);
    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { maxTokens: 0 } })
    ).rejects.toThrow('max_tokens must be a positive integer');

    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { maxTokens: -5 } })
    ).rejects.toThrow(ValidationError);
    await expect(
      client.run({ message: 'hi', tag: 'prod', modelParams: { maxTokens: -5 } })
    ).rejects.toThrow('max_tokens must be a positive integer');
  });

  it('accepts valid max_tokens values', async () => {
    const client = new AgentsClient(createMockHttpClient());

    for (const tokens of [1, 100, 4096]) {
      await expect(
        client.run({ message: 'hi', tag: 'prod', modelParams: { maxTokens: tokens } })
      ).resolves.toBeDefined();
    }
  });

  it('still validates message is required', async () => {
    const client = new AgentsClient(createMockHttpClient());

    await expect(client.run({ message: '', tag: 'prod' })).rejects.toThrow(ValidationError);
    await expect(client.run({ message: '', tag: 'prod' })).rejects.toThrow('message is required');
  });

  it('still validates tag or agentId is required', async () => {
    const client = new AgentsClient(createMockHttpClient());

    await expect(client.run({ message: 'hi' })).rejects.toThrow(ValidationError);
    await expect(client.run({ message: 'hi' })).rejects.toThrow(
      'Either tag or agentId must be provided'
    );
  });

  it('still validates tag and agentId are mutually exclusive', async () => {
    const client = new AgentsClient(createMockHttpClient());

    await expect(client.run({ message: 'hi', tag: 'prod', agentId: 'abc' })).rejects.toThrow(
      ValidationError
    );
    await expect(client.run({ message: 'hi', tag: 'prod', agentId: 'abc' })).rejects.toThrow(
      'Provide either tag or agentId, not both'
    );
  });
});

// ── 2.2: run() response parsing ──

describe('AgentsClient run() response parsing', () => {
  it('parses a complete valid response', async () => {
    const mock = createMockHttpClient({
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: {
          thread_id: 't-123',
          trace_id: 'tr-456',
          agent_id: 'a-789',
          agent_revision: 3,
          agent_tag: 'production',
          output: 'Hello world',
          status: 'completed',
          tool_calls: [
            { tool_call_id: 'tc1', name: 'search', arguments: '{"q":"test"}', result: 'found' },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        },
      }),
    } as Partial<HttpClient>);

    const client = new AgentsClient(mock);
    const result = await client.run({ message: 'hi', tag: 'prod' });

    expect(result.threadId).toBe('t-123');
    expect(result.traceId).toBe('tr-456');
    expect(result.agentId).toBe('a-789');
    expect(result.agentRevision).toBe(3);
    expect(result.agentTag).toBe('production');
    expect(result.output).toBe('Hello world');
    expect(result.status).toBe('completed');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('search');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20 });
  });

  it('parses response with missing optional fields', async () => {
    const mock = createMockHttpClient({
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: {
          thread_id: 't-1',
          agent_id: 'a-1',
          agent_revision: 1,
          output: 'ok',
          status: 'completed',
          // no trace_id, agent_tag, tool_calls, usage
        },
      }),
    } as Partial<HttpClient>);

    const client = new AgentsClient(mock);
    const result = await client.run({ message: 'hi', tag: 'prod' });

    expect(result.traceId).toBeUndefined();
    expect(result.agentTag).toBeUndefined();
    expect(result.toolCalls).toEqual([]);
    expect(result.usage).toBeUndefined();
  });

  it('throws NetworkError when thread_id is missing', async () => {
    const mock = createMockHttpClient({
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: { agent_id: 'a', agent_revision: 1, output: 'x', status: 'completed' },
      }),
    } as Partial<HttpClient>);

    const client = new AgentsClient(mock);
    await expect(client.run({ message: 'hi', tag: 'prod' })).rejects.toThrow('missing thread_id');
  });

  it('throws NetworkError when output is missing', async () => {
    const mock = createMockHttpClient({
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: { thread_id: 't', agent_id: 'a', agent_revision: 1, status: 'completed' },
      }),
    } as Partial<HttpClient>);

    const client = new AgentsClient(mock);
    await expect(client.run({ message: 'hi', tag: 'prod' })).rejects.toThrow('missing output');
  });

  it('throws NetworkError on invalid status value', async () => {
    const mock = createMockHttpClient({
      post: vi.fn().mockResolvedValue({
        status: 200,
        body: { thread_id: 't', agent_id: 'a', agent_revision: 1, output: 'x', status: 'running' },
      }),
    } as Partial<HttpClient>);

    const client = new AgentsClient(mock);
    await expect(client.run({ message: 'hi', tag: 'prod' })).rejects.toThrow('invalid status');
  });
});

// ── 2.1: Streaming event parsing ──

describe('AgentsClient stream() event parsing', () => {
  it('parses agent_resolved event', async () => {
    const stream = buildSSEStream([
      {
        event: 'agent.resolved',
        data: JSON.stringify({
          agent_id: 'a-1',
          agent_revision: 2,
          agent_tag: 'prod',
          thread_id: 't-1',
        }),
      },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'agent_resolved',
      agentId: 'a-1',
      agentRevision: 2,
      agentTag: 'prod',
      threadId: 't-1',
    });
  });

  it('parses output_text_delta event', async () => {
    const stream = buildSSEStream([
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'Hello ' }) },
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'world' }) },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'output_text_delta', delta: 'Hello ' });
    expect(events[1]).toEqual({ type: 'output_text_delta', delta: 'world' });
  });

  it('parses tool_call_delta event', async () => {
    const stream = buildSSEStream([
      {
        event: 'chat.tool_call.delta',
        data: JSON.stringify({ tool_call_id: 'tc1', name: 'search', arguments_delta: '{"q":' }),
      },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'tool_call_delta',
      toolCallId: 'tc1',
      name: 'search',
      argumentsDelta: '{"q":',
    });
  });

  it('parses tool_call_result event', async () => {
    const stream = buildSSEStream([
      {
        event: 'chat.tool_call.result',
        data: JSON.stringify({
          tool_call_id: 'tc1',
          name: 'search',
          arguments: { q: 'test' },
          result: 'found it',
        }),
      },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'tool_call_result',
      toolCallId: 'tc1',
      name: 'search',
      arguments: { q: 'test' },
      result: 'found it',
    });
  });

  it('parses chat_completed event', async () => {
    const stream = buildSSEStream([
      {
        event: 'chat.completed',
        data: JSON.stringify({
          chat: { thread_id: 't-1', status: 'completed', output: 'Done!' },
        }),
      },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'chat_completed',
      threadId: 't-1',
      status: 'completed',
      output: 'Done!',
    });
  });

  it('parses error event and stops streaming', async () => {
    const stream = buildSSEStream([
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'partial' }) },
      {
        event: 'error',
        data: JSON.stringify({ code: 'RATE_LIMIT', message: 'Too many requests' }),
      },
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'should not appear' }) },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({
      type: 'error',
      code: 'RATE_LIMIT',
      message: 'Too many requests',
    });
  });

  it('skips [DONE] sentinel', async () => {
    const stream = buildSSEStream([
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'hi' }) },
      { event: 'message', data: '[DONE]' },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('output_text_delta');
  });

  it('throws ValidationError on malformed JSON in stream', async () => {
    const stream = buildSSEStream([{ event: 'chat.output_text.delta', data: '{not valid json' }]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    await expect(
      collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }))
    ).rejects.toThrow(ValidationError);
  });

  it('throws NetworkError on malformed agent.resolved (missing fields)', async () => {
    const stream = buildSSEStream([
      { event: 'agent.resolved', data: JSON.stringify({ agent_id: 'a-1' }) }, // missing thread_id
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    await expect(
      collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }))
    ).rejects.toThrow('Malformed agent.resolved');
  });

  it('passes through unknown event types as CustomEvent', async () => {
    const stream = buildSSEStream([
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'hi' }) },
      { event: 'some.future.event', data: JSON.stringify({ foo: 'bar' }) },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('output_text_delta');
    expect(events[1].type).toBe('custom');
    expect(events[1]).toEqual({ type: 'custom', event: 'some.future.event', data: { foo: 'bar' } });
  });

  it('parses a full streaming sequence with all event types', async () => {
    const stream = buildSSEStream([
      {
        event: 'agent.resolved',
        data: JSON.stringify({ agent_id: 'a-1', agent_revision: 1, thread_id: 't-1' }),
      },
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'Hello' }) },
      {
        event: 'chat.tool_call.delta',
        data: JSON.stringify({ tool_call_id: 'tc1', name: 'search', arguments_delta: '{}' }),
      },
      {
        event: 'chat.tool_call.result',
        data: JSON.stringify({ tool_call_id: 'tc1', name: 'search', arguments: {}, result: 'ok' }),
      },
      { event: 'chat.output_text.delta', data: JSON.stringify({ delta: ' world' }) },
      {
        event: 'chat.completed',
        data: JSON.stringify({
          chat: { thread_id: 't-1', status: 'completed', output: 'Hello world' },
        }),
      },
    ]);
    const client = new AgentsClient(
      createMockHttpClient({ postStream: vi.fn().mockResolvedValue(stream) } as Partial<HttpClient>)
    );

    const events = await collectStreamEvents(client.stream({ message: 'hi', tag: 'prod' }));

    expect(events).toHaveLength(6);
    expect(events.map((e) => e.type)).toEqual([
      'agent_resolved',
      'output_text_delta',
      'tool_call_delta',
      'tool_call_result',
      'output_text_delta',
      'chat_completed',
    ]);
  });
});
