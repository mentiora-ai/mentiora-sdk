/**
 * Tests for HttpClient.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError } from '../errors';
import { HttpClient } from '../http';
import type { TraceEvent } from '../types';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createHttpClient(overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  return new HttpClient({
    baseUrl: 'https://test.example.com',
    apiKey: 'test-api-key',
    timeout: 5000,
    retries: 2,
    debug: false,
    ...overrides,
  });
}

function createTraceEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    traceId: 'trace-123',
    spanId: 'span-456',
    name: 'test-span',
    type: 'llm',
    startTime: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function mockSuccessResponse(body: unknown = { id: 'trace-123' }) {
  return {
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('HttpClient', () => {
  const originalRandom = Math.random;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Math.random = originalRandom;
  });

  afterEach(() => {
    vi.useRealTimers();
    Math.random = originalRandom;
  });

  describe('successful requests', () => {
    it('sends POST to /api/v1/traces', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://test.example.com/api/v1/traces');
    });

    it('returns status and parsed body', async () => {
      const responseBody = { id: 'trace-123', status: 'received' };
      mockFetch.mockResolvedValue(mockSuccessResponse(responseBody));
      const client = createHttpClient();

      const result = await client.sendTrace(createTraceEvent());
      expect(result.status).toBe(200);
      expect(result.body).toEqual(responseBody);
    });

    it('sends Bearer auth header', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient({ apiKey: 'my-secret-key' });
      await client.sendTrace(createTraceEvent());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer my-secret-key');
    });

    it('sends User-Agent header with SDK version', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['User-Agent']).toMatch(/^mentiora-sdk-ts\//);
    });

    it('sends Content-Type application/json header', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('sends POST method', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent());

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
    });
  });

  describe('body serialization', () => {
    it('converts camelCase fields to snake_case', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(
        createTraceEvent({
          traceId: 'tid',
          spanId: 'sid',
          parentSpanId: 'psid',
          durationMs: 100,
        })
      );

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.trace_id).toBe('tid');
      expect(body.span_id).toBe('sid');
      expect(body.parent_span_id).toBe('psid');
      expect(body.duration_ms).toBe(100);
    });

    it('converts Date startTime to ISO string', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      const date = new Date('2025-06-15T12:00:00.000Z');
      await client.sendTrace(createTraceEvent({ startTime: date }));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.start_time).toBe('2025-06-15T12:00:00.000Z');
    });

    it('converts Date endTime to ISO string', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      const endDate = new Date('2025-06-15T12:01:00.000Z');
      await client.sendTrace(createTraceEvent({ endTime: endDate }));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.end_time).toBe('2025-06-15T12:01:00.000Z');
    });

    it('passes string startTime as-is', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent({ startTime: '2025-01-01T00:00:00Z' }));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.start_time).toBe('2025-01-01T00:00:00Z');
    });

    it('includes threadId when non-empty', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent({ threadId: 'thread-abc' }));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.thread_id).toBe('thread-abc');
    });

    it('excludes threadId when empty string', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent({ threadId: '' }));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty('thread_id');
    });

    it('excludes threadId when whitespace-only', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent({ threadId: '   ' }));

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty('thread_id');
    });

    it('sets null for optional missing fields', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent());

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.parent_span_id).toBeNull();
      expect(body.input).toBeNull();
      expect(body.output).toBeNull();
      expect(body.end_time).toBeNull();
      expect(body.duration_ms).toBeNull();
      expect(body.metadata).toBeNull();
      expect(body.error).toBeNull();
      expect(body.usage).toBeNull();
      expect(body.model).toBeNull();
      expect(body.provider).toBeNull();
    });

    it('should filter null values from usage', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(
        createTraceEvent({
          usage: {
            promptTokens: 10,
            completionTokens: null,
            totalTokens: undefined,
          } as Record<string, unknown>,
        })
      );

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.usage).toEqual({ promptTokens: 10 });
      expect(body.usage).not.toHaveProperty('completionTokens');
      expect(body.usage).not.toHaveProperty('totalTokens');
    });

    it('defaults tags to empty array', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.sendTrace(createTraceEvent());

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.tags).toEqual([]);
    });
  });

  describe('client errors (4xx)', () => {
    it('throws NetworkError on 400', async () => {
      mockFetch.mockResolvedValue({
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: 'bad' }),
      });
      const client = createHttpClient();
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(NetworkError);
    });

    it('does not retry on 401', async () => {
      mockFetch.mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({}),
      });
      const client = createHttpClient({ retries: 3 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('does not retry on 404', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({}),
      });
      const client = createHttpClient({ retries: 2 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('includes statusCode in NetworkError for 4xx', async () => {
      mockFetch.mockResolvedValue({
        status: 403,
        statusText: 'Forbidden',
        json: vi.fn().mockResolvedValue({}),
      });
      const client = createHttpClient();
      try {
        await client.sendTrace(createTraceEvent());
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as NetworkError).statusCode).toBe(403);
      }
    });
  });

  describe('rate limiting (429)', () => {
    it('retries on 429 with Retry-After header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '0' }),
          json: vi.fn().mockResolvedValue({}),
        })
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 2 });
      const result = await client.sendTrace(createTraceEvent());
      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 429 with backoff when no Retry-After header', async () => {
      Math.random = () => 0.5;
      mockFetch
        .mockResolvedValueOnce({
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers(),
          json: vi.fn().mockResolvedValue({}),
        })
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 1 });
      const result = await client.sendTrace(createTraceEvent());
      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws NetworkError after exhausting retries on 429', async () => {
      Math.random = () => 0.5;
      const rateLimitResponse = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'retry-after': '0' }),
        json: vi.fn().mockResolvedValue({}),
      };
      mockFetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(rateLimitResponse);

      const client = createHttpClient({ retries: 2 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(
        'Rate limited: too many requests'
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('server errors and retries (5xx)', () => {
    it('retries on 500 and succeeds', async () => {
      Math.random = () => 0.5;
      mockFetch
        .mockResolvedValueOnce({
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        })
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 2 });
      const result = await client.sendTrace(createTraceEvent());
      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting retries on 502', async () => {
      Math.random = () => 0.5;
      const failResponse = {
        status: 502,
        statusText: 'Bad Gateway',
        json: vi.fn().mockResolvedValue({}),
      };
      mockFetch
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(failResponse)
        .mockResolvedValueOnce(failResponse);

      const client = createHttpClient({ retries: 2 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('backoff jitter', () => {
    it('applies jitter so delay is in range [0, maxDelay]', async () => {
      Math.random = () => 0.75;
      mockFetch
        .mockResolvedValueOnce({
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        })
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 1 });
      await client.sendTrace(createTraceEvent());

      // attempt 0: maxDelay = min(10000, 1000*2^0) = 1000, delay = 0.75 * 1000 = 750
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses smaller delay with lower random values', async () => {
      Math.random = () => 0.1;
      mockFetch
        .mockResolvedValueOnce({
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        })
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 1 });
      await client.sendTrace(createTraceEvent());

      // attempt 0: maxDelay = 1000, delay = 0.1 * 1000 = 100ms (much faster than deterministic 1000ms)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('timeout handling', () => {
    it('throws NetworkError on timeout', async () => {
      mockFetch.mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      const client = createHttpClient({ timeout: 100, retries: 0 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(NetworkError);
    });

    it('timeout error message includes timeout value', async () => {
      mockFetch.mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });

      const client = createHttpClient({ timeout: 3000, retries: 0 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(/3000ms/);
    });
  });

  describe('network errors', () => {
    it('retries on network error and succeeds', async () => {
      Math.random = () => 0.5;
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 1 });
      const result = await client.sendTrace(createTraceEvent());
      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after all retries on persistent network error', async () => {
      Math.random = () => 0.5;
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = createHttpClient({ retries: 1 });
      await expect(client.sendTrace(createTraceEvent())).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('field normalization', () => {
    it('handles extra unknown fields gracefully', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      const event = {
        ...createTraceEvent(),
        customField: 'should-not-break',
      } as unknown as TraceEvent;
      await client.sendTrace(event);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      // Core fields should still be present
      expect(body.trace_id).toBe('trace-123');
      expect(body.span_id).toBe('span-456');
      expect(body.name).toBe('test-span');
    });
  });

  describe('response parsing', () => {
    it('handles non-JSON response gracefully', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockRejectedValue(new Error('not JSON')),
      });
      const client = createHttpClient();
      const result = await client.sendTrace(createTraceEvent());
      expect(result.status).toBe(200);
      expect(result.body).toEqual({});
    });
  });

  describe('post()', () => {
    it('sends POST to the given path', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      await client.post('/api/v1/agents', { name: 'test' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://test.example.com/api/v1/agents');
      expect(options.method).toBe('POST');
    });

    it('sends JSON body as-is (no trace normalization)', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient();
      const payload = { agentId: 'abc', config: { model: 'gpt-4' } };
      await client.post('/api/v1/agents', payload);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual(payload);
    });

    it('includes auth and content-type headers', async () => {
      mockFetch.mockResolvedValue(mockSuccessResponse());
      const client = createHttpClient({ apiKey: 'post-key' });
      await client.post('/api/v1/agents', {});

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer post-key');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['User-Agent']).toMatch(/^mentiora-sdk-ts\//);
    });

    it('retries on 5xx errors like sendTrace', async () => {
      Math.random = () => 0.5;
      mockFetch
        .mockResolvedValueOnce({
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn().mockResolvedValue({}),
        })
        .mockResolvedValueOnce(mockSuccessResponse());

      const client = createHttpClient({ retries: 1 });
      const result = await client.post('/api/v1/agents', {});
      expect(result.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws NetworkError on 4xx', async () => {
      mockFetch.mockResolvedValue({
        status: 422,
        statusText: 'Unprocessable Entity',
        json: vi.fn().mockResolvedValue({}),
      });
      const client = createHttpClient();
      await expect(client.post('/api/v1/agents', {})).rejects.toThrow(NetworkError);
    });
  });

  describe('postStream()', () => {
    it('sends POST to the given path with SSE accept header', async () => {
      const mockBody = new ReadableStream();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: mockBody,
      });
      const client = createHttpClient();
      await client.postStream('/api/v1/agents/stream', { prompt: 'hi' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://test.example.com/api/v1/agents/stream');
      expect(options.method).toBe('POST');
      expect(options.headers.Accept).toBe('text/event-stream');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers.Authorization).toBe('Bearer test-api-key');
    });

    it('returns the ReadableStream from the response', async () => {
      const mockBody = new ReadableStream();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: mockBody,
      });
      const client = createHttpClient();
      const stream = await client.postStream('/api/v1/agents/stream', {});
      expect(stream).toBe(mockBody);
    });

    it('throws NetworkError on non-2xx response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: new ReadableStream(),
      });
      const client = createHttpClient();
      await expect(client.postStream('/api/v1/agents/stream', {})).rejects.toThrow(NetworkError);
    });

    it('throws NetworkError when response has no body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: null,
      });
      const client = createHttpClient();
      await expect(client.postStream('/api/v1/agents/stream', {})).rejects.toThrow(
        'Stream response has no body'
      );
    });

    it('throws NetworkError on timeout', async () => {
      mockFetch.mockImplementation(() => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });
      const client = createHttpClient({ timeout: 100 });
      await expect(client.postStream('/api/v1/agents/stream', {})).rejects.toThrow(/timeout/i);
    });

    it('does not retry on failure (single attempt)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        body: new ReadableStream(),
      });
      const client = createHttpClient({ retries: 3 });
      await expect(client.postStream('/api/v1/agents/stream', {})).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it('includes status code in NetworkError for non-2xx', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        body: new ReadableStream(),
      });
      const client = createHttpClient();
      try {
        await client.postStream('/api/v1/agents/stream', {});
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as NetworkError).statusCode).toBe(403);
      }
    });
  });
});
