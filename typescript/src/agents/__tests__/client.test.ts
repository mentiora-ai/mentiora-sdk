/**
 * Tests for AgentsClient.
 */

import { describe, expect, it, vi } from 'vitest';
import { NetworkError, ValidationError } from '../../errors';
import type { HttpClient, HttpResponse } from '../../http';
import { AgentsClient } from '../client';

/**
 * Create a mock HttpClient with post() and postStream() methods.
 */
function createMockHttpClient(
  overrides: {
    post?: (path: string, body: unknown) => Promise<HttpResponse>;
    postStream?: (path: string, body: unknown) => Promise<ReadableStream<Uint8Array>>;
  } = {}
): HttpClient {
  return {
    post: overrides.post ?? vi.fn(),
    postStream: overrides.postStream ?? vi.fn(),
  } as unknown as HttpClient;
}

/**
 * Create a ReadableStream that emits SSE-formatted text.
 */
function createMockSSEStream(
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

/** Standard API response for a successful agent run. */
const AGENT_RUN_API_RESPONSE = {
  thread_id: 'thread-1',
  trace_id: 'trace-1',
  agent_id: 'agent-1',
  agent_revision: 3,
  agent_tag: 'production',
  output: 'Hello! How can I help?',
  tool_calls: [],
  status: 'completed',
  usage: { prompt_tokens: 10, completion_tokens: 20 },
};

describe('AgentsClient', () => {
  describe('run()', () => {
    it('sends POST to /api/v1/agents/run with correct body (tag-based)', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 200,
        body: AGENT_RUN_API_RESPONSE,
      });
      const httpClient = createMockHttpClient({ post: postMock });
      const client = new AgentsClient(httpClient);

      await client.run({ tag: 'production', message: 'Hello' });

      expect(postMock).toHaveBeenCalledOnce();
      const [path, body] = postMock.mock.calls[0];
      expect(path).toBe('/api/v1/agents/run');
      expect(body).toEqual({
        tag: 'production',
        message: 'Hello',
        stream: false,
      });
    });

    it('sends POST with agentId + revision', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 200,
        body: AGENT_RUN_API_RESPONSE,
      });
      const httpClient = createMockHttpClient({ post: postMock });
      const client = new AgentsClient(httpClient);

      await client.run({ agentId: 'agent-abc', revision: 5, message: 'Hi' });

      const [, body] = postMock.mock.calls[0];
      expect(body).toEqual({
        agent_id: 'agent-abc',
        revision: 5,
        message: 'Hi',
        stream: false,
      });
    });

    it('maps snake_case response to camelCase AgentRunResult', async () => {
      const httpClient = createMockHttpClient({
        post: vi.fn().mockResolvedValue({ status: 200, body: AGENT_RUN_API_RESPONSE }),
      });
      const client = new AgentsClient(httpClient);

      const result = await client.run({ tag: 'production', message: 'Hello' });

      expect(result.threadId).toBe('thread-1');
      expect(result.traceId).toBe('trace-1');
      expect(result.agentId).toBe('agent-1');
      expect(result.agentRevision).toBe(3);
      expect(result.agentTag).toBe('production');
      expect(result.output).toBe('Hello! How can I help?');
      expect(result.toolCalls).toEqual([]);
      expect(result.status).toBe('completed');
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 20 });
    });

    it('throws NetworkError when response is missing required fields', async () => {
      const malformedResponse = { status: 'completed' }; // missing thread_id, agent_id, output
      const httpClient = createMockHttpClient({
        post: vi.fn().mockResolvedValue({ status: 200, body: malformedResponse }),
      });
      const client = new AgentsClient(httpClient);

      await expect(client.run({ tag: 'prod', message: 'Hello' })).rejects.toThrow(NetworkError);
      await expect(client.run({ tag: 'prod', message: 'Hello' })).rejects.toThrow(
        'Invalid agent response: missing thread_id'
      );
    });

    it('returns undefined usage when not present in response', async () => {
      const responseNoUsage = { ...AGENT_RUN_API_RESPONSE, usage: undefined };
      const httpClient = createMockHttpClient({
        post: vi.fn().mockResolvedValue({ status: 200, body: responseNoUsage }),
      });
      const client = new AgentsClient(httpClient);

      const result = await client.run({ tag: 'production', message: 'Hello' });

      expect(result.usage).toBeUndefined();
    });

    it('includes tool_calls in response', async () => {
      const responseWithTools = {
        ...AGENT_RUN_API_RESPONSE,
        tool_calls: [
          {
            tool_call_id: 'tc-1',
            name: 'search',
            arguments: { query: 'refund policy' },
            result: { text: 'Our refund policy...' },
          },
        ],
      };
      const httpClient = createMockHttpClient({
        post: vi.fn().mockResolvedValue({ status: 200, body: responseWithTools }),
      });
      const client = new AgentsClient(httpClient);

      const result = await client.run({ tag: 'prod', message: 'Refund?' });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].toolCallId).toBe('tc-1');
      expect(result.toolCalls[0].name).toBe('search');
      expect(result.toolCalls[0].arguments).toEqual({ query: 'refund policy' });
      expect(result.toolCalls[0].result).toEqual({ text: 'Our refund policy...' });
    });

    it('forwards optional params (modelId, modelParams, threadId, endUserId, metadata)', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 200,
        body: AGENT_RUN_API_RESPONSE,
      });
      const httpClient = createMockHttpClient({ post: postMock });
      const client = new AgentsClient(httpClient);

      await client.run({
        tag: 'production',
        message: 'Hello',
        threadId: 'thread-existing',
        modelId: 'gpt-4o',
        modelParams: { temperature: 0.7, maxTokens: 1000, seed: 42 },
        endUserId: 'user-123',
        metadata: { source: 'test' },
      });

      const [, body] = postMock.mock.calls[0];
      expect(body).toEqual({
        tag: 'production',
        message: 'Hello',
        stream: false,
        thread_id: 'thread-existing',
        model_id: 'gpt-4o',
        model_params: { temperature: 0.7, max_tokens: 1000, seed: 42 },
        end_user_id: 'user-123',
        metadata: { source: 'test' },
      });
    });

    it('throws ValidationError when message is empty', async () => {
      const client = new AgentsClient(createMockHttpClient());

      await expect(client.run({ tag: 'prod', message: '' })).rejects.toThrow(ValidationError);
      await expect(client.run({ tag: 'prod', message: '   ' })).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when neither tag nor agentId provided', async () => {
      const client = new AgentsClient(createMockHttpClient());

      await expect(client.run({ message: 'Hello' })).rejects.toThrow(ValidationError);
      await expect(client.run({ message: 'Hello' })).rejects.toThrow(
        'Either tag or agentId must be provided'
      );
    });

    it('throws ValidationError when both tag and agentId provided', async () => {
      const client = new AgentsClient(createMockHttpClient());

      await expect(
        client.run({ tag: 'prod', agentId: 'agent-1', message: 'Hello' })
      ).rejects.toThrow(ValidationError);
      await expect(
        client.run({ tag: 'prod', agentId: 'agent-1', message: 'Hello' })
      ).rejects.toThrow('Provide either tag or agentId, not both');
    });

    it('throws NetworkError on 401 (unauthorized)', async () => {
      const httpClient = createMockHttpClient({
        post: vi.fn().mockRejectedValue(new NetworkError('Client error: Unauthorized', 401)),
      });
      const client = new AgentsClient(httpClient);

      await expect(client.run({ tag: 'prod', message: 'Hello' })).rejects.toThrow(NetworkError);
    });

    it('throws NetworkError on 404 (agent not found)', async () => {
      const httpClient = createMockHttpClient({
        post: vi.fn().mockRejectedValue(new NetworkError('Client error: Not Found', 404)),
      });
      const client = new AgentsClient(httpClient);

      await expect(client.run({ tag: 'prod', message: 'Hello' })).rejects.toThrow(NetworkError);
    });

    it('throws NetworkError on 500 (server error)', async () => {
      const httpClient = createMockHttpClient({
        post: vi
          .fn()
          .mockRejectedValue(new NetworkError('Server error: Internal Server Error', 500)),
      });
      const client = new AgentsClient(httpClient);

      await expect(client.run({ tag: 'prod', message: 'Hello' })).rejects.toThrow(NetworkError);
    });
  });

  describe('stream()', () => {
    it('sends POST with stream: true', async () => {
      const postStreamMock = vi.fn().mockResolvedValue(
        createMockSSEStream([
          {
            event: 'chat.completed',
            data: JSON.stringify({ thread_id: 't', status: 'completed', output: 'done' }),
          },
        ])
      );
      const httpClient = createMockHttpClient({ postStream: postStreamMock });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hello' })) {
        events.push(event);
      }

      expect(postStreamMock).toHaveBeenCalledOnce();
      const [path, body] = postStreamMock.mock.calls[0];
      expect(path).toBe('/api/v1/agents/run');
      expect(body.stream).toBe(true);
    });

    it('yields agent_resolved event first', async () => {
      const stream = createMockSSEStream([
        {
          event: 'agent.resolved',
          data: JSON.stringify({
            agent_id: 'agent-1',
            agent_revision: 2,
            agent_tag: 'production',
            thread_id: 'thread-1',
          }),
        },
        {
          event: 'chat.completed',
          data: JSON.stringify({ thread_id: 'thread-1', status: 'completed', output: 'ok' }),
        },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hi' })) {
        events.push(event);
      }

      expect(events[0]).toEqual({
        type: 'agent_resolved',
        agentId: 'agent-1',
        agentRevision: 2,
        agentTag: 'production',
        threadId: 'thread-1',
      });
    });

    it('yields output_text_delta events', async () => {
      const stream = createMockSSEStream([
        { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'Hello' }) },
        { event: 'chat.output_text.delta', data: JSON.stringify({ delta: ' world' }) },
        {
          event: 'chat.completed',
          data: JSON.stringify({ thread_id: 't', status: 'completed', output: 'Hello world' }),
        },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hi' })) {
        events.push(event);
      }

      expect(events[0]).toEqual({ type: 'output_text_delta', delta: 'Hello' });
      expect(events[1]).toEqual({ type: 'output_text_delta', delta: ' world' });
    });

    it('yields tool_call_delta and tool_call_result events', async () => {
      const stream = createMockSSEStream([
        {
          event: 'chat.tool_call.delta',
          data: JSON.stringify({
            tool_call_id: 'tc-1',
            name: 'search',
            arguments_delta: '{"q":',
          }),
        },
        {
          event: 'chat.tool_call.delta',
          data: JSON.stringify({
            tool_call_id: 'tc-1',
            name: 'search',
            arguments_delta: '"test"}',
          }),
        },
        {
          event: 'chat.tool_call.result',
          data: JSON.stringify({
            tool_call_id: 'tc-1',
            name: 'search',
            arguments: { q: 'test' },
            result: { hits: 3 },
          }),
        },
        {
          event: 'chat.completed',
          data: JSON.stringify({ thread_id: 't', status: 'completed', output: 'Found 3 results' }),
        },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Search' })) {
        events.push(event);
      }

      expect(events[0]).toEqual({
        type: 'tool_call_delta',
        toolCallId: 'tc-1',
        name: 'search',
        argumentsDelta: '{"q":',
      });
      expect(events[2]).toEqual({
        type: 'tool_call_result',
        toolCallId: 'tc-1',
        name: 'search',
        arguments: { q: 'test' },
        result: { hits: 3 },
      });
    });

    it('yields chat_completed as final event', async () => {
      const stream = createMockSSEStream([
        { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'Hi' }) },
        {
          event: 'chat.completed',
          data: JSON.stringify({ thread_id: 'thread-1', status: 'completed', output: 'Hi' }),
        },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hello' })) {
        events.push(event);
      }

      const lastEvent = events[events.length - 1];
      expect(lastEvent).toEqual({
        type: 'chat_completed',
        threadId: 'thread-1',
        status: 'completed',
        output: 'Hi',
      });
    });

    it('stops iteration on error event', async () => {
      const stream = createMockSSEStream([
        { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'Hi' }) },
        {
          event: 'error',
          data: JSON.stringify({ code: 'AGENT_ERROR', message: 'Something went wrong' }),
        },
        { event: 'chat.output_text.delta', data: JSON.stringify({ delta: ' should not appear' }) },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hello' })) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({
        type: 'error',
        code: 'AGENT_ERROR',
        message: 'Something went wrong',
      });
    });

    it('skips unknown event types (forward compatibility)', async () => {
      const stream = createMockSSEStream([
        { event: 'future.new_event', data: JSON.stringify({ some: 'data' }) },
        { event: 'chat.output_text.delta', data: JSON.stringify({ delta: 'Hello' }) },
        {
          event: 'chat.completed',
          data: JSON.stringify({ thread_id: 't', status: 'completed', output: 'Hello' }),
        },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hello' })) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('output_text_delta');
      expect(events[1].type).toBe('chat_completed');
    });

    it('throws ValidationError for invalid params', async () => {
      const client = new AgentsClient(createMockHttpClient());

      // Empty message
      const gen1 = client.stream({ tag: 'prod', message: '' });
      await expect(gen1.next()).rejects.toThrow(ValidationError);

      // No tag or agentId
      const gen2 = client.stream({ message: 'Hello' });
      await expect(gen2.next()).rejects.toThrow(ValidationError);

      // Both tag and agentId
      const gen3 = client.stream({ tag: 'prod', agentId: 'a', message: 'Hello' });
      await expect(gen3.next()).rejects.toThrow(ValidationError);
    });

    it('throws NetworkError on malformed agent.resolved event', async () => {
      const httpClient = createMockHttpClient({
        postStream: vi
          .fn()
          .mockResolvedValue(
            createMockSSEStream([
              { event: 'agent.resolved', data: JSON.stringify({ wrong: 'shape' }) },
            ])
          ),
      });
      const client = new AgentsClient(httpClient);

      const gen = client.stream({ tag: 'prod', message: 'Hi' });
      await expect(gen.next()).rejects.toThrow(NetworkError);
    });

    it('handles malformed chat.completed event defensively', async () => {
      const stream = createMockSSEStream([
        { event: 'chat.completed', data: JSON.stringify({ output: 'hi' }) }, // missing thread_id, status
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hi' })) {
        events.push(event);
      }
      // chat.completed uses defensive String() fallback instead of throwing
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('chat_completed');
    });

    it('throws NetworkError on non-2xx response', async () => {
      const httpClient = createMockHttpClient({
        postStream: vi
          .fn()
          .mockRejectedValue(new NetworkError('Stream request failed: Internal Server Error', 500)),
      });
      const client = new AgentsClient(httpClient);

      const gen = client.stream({ tag: 'prod', message: 'Hello' });
      await expect(gen.next()).rejects.toThrow(NetworkError);
    });

    it('throws NetworkError on malformed SSE JSON', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: chat.output_text.delta\ndata: not-json\n\n'));
          controller.close();
        },
      });
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const gen = client.stream({ tag: 'prod', message: 'Hello' });
      await expect(gen.next()).rejects.toThrow(/Failed to parse SSE event data/);
    });

    it('handles array-format chat.completed output', async () => {
      const stream = createMockSSEStream([
        {
          event: 'chat.completed',
          data: JSON.stringify({
            chat: {
              thread_id: 'thread-1',
              status: 'completed',
              output: [{ type: 'message', content: [{ text: 'Hello from array' }] }],
            },
          }),
        },
      ]);
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hi' })) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('chat_completed');
      if (events[0].type === 'chat_completed') {
        expect(events[0].output).toBe('Hello from array');
      }
    });

    it('skips [DONE] sentinel in stream', async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'event: chat.output_text.delta\ndata: {"delta":"Hello"}\n\ndata: [DONE]\n\n'
            )
          );
          controller.close();
        },
      });
      const httpClient = createMockHttpClient({
        postStream: vi.fn().mockResolvedValue(stream),
      });
      const client = new AgentsClient(httpClient);

      const events = [];
      for await (const event of client.stream({ tag: 'prod', message: 'Hello' })) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('output_text_delta');
    });
  });
});
