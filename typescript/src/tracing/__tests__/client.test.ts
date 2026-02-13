/**
 * Tests for TracingClient.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, ValidationError } from '../../errors';
import type { TraceEvent } from '../../types';
import { TracingClient } from '../client';

// Mock uuid to return predictable values
vi.mock('uuid', () => ({
  v7: vi.fn(() => '019373a0-0000-7000-8000-000000000000'),
}));

function createMockHttpClient() {
  return {
    sendTrace: vi.fn().mockResolvedValue({ status: 200, body: {} }),
  } as unknown as ConstructorParameters<typeof TracingClient>[0];
}

function createValidEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    traceId: 'trace-123',
    spanId: 'span-456',
    name: 'test-span',
    type: 'llm',
    startTime: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TracingClient', () => {
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let tracingClient: TracingClient;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    tracingClient = new TracingClient(httpClient);
    vi.clearAllMocks();
  });

  describe('sendTrace - success', () => {
    it('returns success result with traceId and spanId', async () => {
      const result = await tracingClient.sendTrace(createValidEvent());
      expect(result.success).toBe(true);
      expect(result.traceId).toBe('trace-123');
      expect(result.spanId).toBe('span-456');
      expect(result.error).toBeUndefined();
    });

    it('calls httpClient.sendTrace with the event', async () => {
      const event = createValidEvent();
      await tracingClient.sendTrace(event);
      expect(httpClient.sendTrace).toHaveBeenCalledOnce();
    });

    it('accepts all valid trace types', async () => {
      const types: TraceEvent['type'][] = ['llm', 'tool', 'chat', 'error', 'custom'];
      for (const type of types) {
        vi.clearAllMocks();
        const result = await tracingClient.sendTrace(createValidEvent({ type }));
        expect(result.success).toBe(true);
      }
    });
  });

  describe('sendTrace - threadId handling', () => {
    it('auto-generates threadId when not provided', async () => {
      const event = createValidEvent();
      await tracingClient.sendTrace(event);

      const sentEvent = (httpClient.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;
      expect(sentEvent.threadId).toBe('019373a0-0000-7000-8000-000000000000');
    });

    it('preserves threadId when provided', async () => {
      const event = createValidEvent({ threadId: 'user-thread-id' });
      await tracingClient.sendTrace(event);

      const sentEvent = (httpClient.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;
      expect(sentEvent.threadId).toBe('user-thread-id');
    });

    it('auto-generates threadId when threadId is empty string', async () => {
      const event = createValidEvent({ threadId: '' });
      await tracingClient.sendTrace(event);

      const sentEvent = (httpClient.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;
      expect(sentEvent.threadId).toBe('019373a0-0000-7000-8000-000000000000');
    });

    it('auto-generates threadId when threadId is whitespace', async () => {
      const event = createValidEvent({ threadId: '   ' });
      await tracingClient.sendTrace(event);

      const sentEvent = (httpClient.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;
      expect(sentEvent.threadId).toBe('019373a0-0000-7000-8000-000000000000');
    });
  });

  describe('sendTrace - validation errors', () => {
    it('throws ValidationError when traceId is missing', async () => {
      await expect(tracingClient.sendTrace(createValidEvent({ traceId: '' }))).rejects.toThrow(
        ValidationError
      );
    });

    it('throws ValidationError when spanId is missing', async () => {
      await expect(tracingClient.sendTrace(createValidEvent({ spanId: '' }))).rejects.toThrow(
        ValidationError
      );
    });

    it('throws ValidationError when name is missing', async () => {
      await expect(tracingClient.sendTrace(createValidEvent({ name: '' }))).rejects.toThrow(
        ValidationError
      );
    });

    it('throws ValidationError for invalid type', async () => {
      await expect(
        tracingClient.sendTrace(createValidEvent({ type: 'invalid' as TraceEvent['type'] }))
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when startTime is missing', async () => {
      await expect(
        tracingClient.sendTrace(createValidEvent({ startTime: undefined as unknown as Date }))
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('sendTrace - error handling', () => {
    it('returns error result on NetworkError', async () => {
      (httpClient.sendTrace as ReturnType<typeof vi.fn>).mockRejectedValue(
        new NetworkError('connection refused')
      );

      const result = await tracingClient.sendTrace(createValidEvent());
      expect(result.success).toBe(false);
      expect(result.error).toBe('connection refused');
      expect(result.traceId).toBe('trace-123');
      expect(result.spanId).toBe('span-456');
    });

    it('re-throws non-NetworkError errors', async () => {
      (httpClient.sendTrace as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('unexpected error')
      );

      await expect(tracingClient.sendTrace(createValidEvent())).rejects.toThrow('unexpected error');
    });
  });

  describe('flush', () => {
    it('resolves without error', async () => {
      await expect(tracingClient.flush()).resolves.toBeUndefined();
    });
  });
});
