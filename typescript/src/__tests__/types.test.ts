/**
 * Tests for SDK type definitions (runtime shape validation).
 *
 * Since TypeScript interfaces are erased at runtime, these tests verify that
 * objects conforming to the type definitions work correctly through the SDK.
 */

import { describe, expect, it } from 'vitest';
import type {
  MentioraConfig,
  SendTraceResult,
  TraceError,
  TraceEvent,
  TraceType,
  UsageInfo,
} from '../types';

describe('TraceType', () => {
  it('accepts all valid trace types', () => {
    const validTypes: TraceType[] = ['llm', 'tool', 'chat', 'error', 'custom'];
    expect(validTypes).toHaveLength(5);
    for (const t of validTypes) {
      expect(typeof t).toBe('string');
    }
  });
});

describe('TraceError', () => {
  it('can be created with required fields only', () => {
    const err: TraceError = { message: 'something failed' };
    expect(err.message).toBe('something failed');
    expect(err.type).toBeUndefined();
    expect(err.stack).toBeUndefined();
  });

  it('can be created with all fields', () => {
    const err: TraceError = {
      message: 'TypeError occurred',
      type: 'TypeError',
      stack: 'Error: TypeError occurred\n    at foo.ts:1:1',
    };
    expect(err.message).toBe('TypeError occurred');
    expect(err.type).toBe('TypeError');
    expect(err.stack).toContain('foo.ts');
  });
});

describe('UsageInfo', () => {
  it('accepts all optional token fields', () => {
    const usage: UsageInfo = {};
    expect(usage.prompt_tokens).toBeUndefined();
    expect(usage.completion_tokens).toBeUndefined();
    expect(usage.total_tokens).toBeUndefined();
  });

  it('accepts full token usage', () => {
    const usage: UsageInfo = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };
    expect(usage.prompt_tokens).toBe(100);
    expect(usage.completion_tokens).toBe(50);
    expect(usage.total_tokens).toBe(150);
  });
});

describe('TraceEvent', () => {
  const minimalEvent: TraceEvent = {
    traceId: 'trace-1',
    spanId: 'span-1',
    name: 'test-span',
    type: 'llm',
    startTime: new Date(),
  };

  it('requires traceId, spanId, name, type, startTime', () => {
    expect(minimalEvent.traceId).toBe('trace-1');
    expect(minimalEvent.spanId).toBe('span-1');
    expect(minimalEvent.name).toBe('test-span');
    expect(minimalEvent.type).toBe('llm');
    expect(minimalEvent.startTime).toBeInstanceOf(Date);
  });

  it('optional fields default to undefined', () => {
    expect(minimalEvent.parentSpanId).toBeUndefined();
    expect(minimalEvent.threadId).toBeUndefined();
    expect(minimalEvent.input).toBeUndefined();
    expect(minimalEvent.output).toBeUndefined();
    expect(minimalEvent.endTime).toBeUndefined();
    expect(minimalEvent.durationMs).toBeUndefined();
    expect(minimalEvent.metadata).toBeUndefined();
    expect(minimalEvent.tags).toBeUndefined();
    expect(minimalEvent.error).toBeUndefined();
    expect(minimalEvent.usage).toBeUndefined();
    expect(minimalEvent.model).toBeUndefined();
    expect(minimalEvent.provider).toBeUndefined();
  });

  it('accepts startTime as ISO string', () => {
    const event: TraceEvent = {
      ...minimalEvent,
      startTime: '2025-01-01T00:00:00.000Z',
    };
    expect(typeof event.startTime).toBe('string');
  });

  it('accepts all optional fields', () => {
    const fullEvent: TraceEvent = {
      traceId: 'trace-1',
      spanId: 'span-1',
      parentSpanId: 'parent-1',
      threadId: 'thread-1',
      name: 'full-span',
      type: 'tool',
      input: { prompt: 'hello' },
      output: { result: 'world' },
      startTime: new Date(),
      endTime: new Date(),
      durationMs: 100,
      metadata: { key: 'value' },
      tags: ['tag1', 'tag2'],
      error: { message: 'err' },
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: 'gpt-4',
      provider: 'openai',
    };
    expect(fullEvent.parentSpanId).toBe('parent-1');
    expect(fullEvent.threadId).toBe('thread-1');
    expect(fullEvent.model).toBe('gpt-4');
    expect(fullEvent.provider).toBe('openai');
    expect(fullEvent.durationMs).toBe(100);
    expect(fullEvent.tags).toEqual(['tag1', 'tag2']);
  });
});

describe('MentioraConfig', () => {
  it('requires apiKey', () => {
    const config: MentioraConfig = {
      apiKey: 'test-key',
    };
    expect(config.apiKey).toBe('test-key');
  });

  it('optional fields default to undefined', () => {
    const config: MentioraConfig = {
      apiKey: 'key',
    };
    expect(config.baseUrl).toBeUndefined();
    expect(config.timeout).toBeUndefined();
    expect(config.retries).toBeUndefined();
    expect(config.debug).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const config: MentioraConfig = {
      apiKey: 'key',
      baseUrl: 'https://custom.example.com',
      timeout: 5000,
      retries: 2,
      debug: true,
    };
    expect(config.baseUrl).toBe('https://custom.example.com');
    expect(config.timeout).toBe(5000);
    expect(config.retries).toBe(2);
    expect(config.debug).toBe(true);
  });
});

describe('SendTraceResult', () => {
  it('represents a successful result', () => {
    const result: SendTraceResult = {
      success: true,
      traceId: 'trace-1',
      spanId: 'span-1',
    };
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('represents a failed result with error message', () => {
    const result: SendTraceResult = {
      success: false,
      traceId: 'trace-1',
      spanId: 'span-1',
      error: 'Network timeout',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });
});
