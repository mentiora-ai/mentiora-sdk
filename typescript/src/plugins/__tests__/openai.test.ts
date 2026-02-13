/**
 * Tests for OpenAI tracing plugin.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '../../errors';
import type { TraceEvent } from '../../types';
import { trackOpenAI } from '../openai';
import type { TrackOpenAIOptions } from '../types';

// Mock the uuid module to return predictable values
vi.mock('uuid', () => ({
  v7: vi.fn(() => 'mock-uuid-v7'),
}));

/**
 * Create a mock MentioraClient with spied tracing methods.
 */
function createMockMentioraClient() {
  return {
    tracing: {
      sendTrace: vi.fn().mockResolvedValue({ success: true, traceId: 'tid', spanId: 'sid' }),
    },
  } as unknown as TrackOpenAIOptions['mentioraClient'];
}

/**
 * Create a mock OpenAI client with chat.completions.create.
 */
function createMockOpenAIClient(createFn: (...args: unknown[]) => unknown) {
  return {
    chat: {
      completions: {
        create: createFn,
      },
    },
    embeddings: {
      create: vi.fn(),
    },
  } as unknown as Parameters<typeof trackOpenAI>[0];
}

describe('trackOpenAI', () => {
  let mentioraClient: ReturnType<typeof createMockMentioraClient>;

  beforeEach(() => {
    mentioraClient = createMockMentioraClient();
    vi.clearAllMocks();
  });

  it('throws when mentioraClient is missing', () => {
    const mockOpenAI = createMockOpenAIClient(vi.fn());
    expect(() =>
      trackOpenAI(mockOpenAI, {
        mentioraClient: undefined,
      } as unknown as TrackOpenAIOptions)
    ).toThrow(ConfigurationError);
  });

  it('returns the same client object (monkey-patch, not proxy)', () => {
    const mockOpenAI = createMockOpenAIClient(vi.fn());
    const result = trackOpenAI(mockOpenAI, { mentioraClient });
    expect(result).toBe(mockOpenAI);
  });

  it('does not double-patch when trackOpenAI is called twice', async () => {
    const mockResponse = {
      id: 'chatcmpl-dup',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hi' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });
    trackOpenAI(mockOpenAI, { mentioraClient });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    // sendTrace should be called exactly once (not twice from double-wrapping)
    expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
  });

  it('only wraps chat.completions.create, not other methods', () => {
    const originalEmbeddingsCreate = vi.fn();
    const mockOpenAI = createMockOpenAIClient(vi.fn()) as unknown as Record<string, unknown>;
    (mockOpenAI as { embeddings: { create: unknown } }).embeddings = {
      create: originalEmbeddingsCreate,
    };

    trackOpenAI(mockOpenAI as unknown as Parameters<typeof trackOpenAI>[0], {
      mentioraClient,
    });

    expect((mockOpenAI as { embeddings: { create: unknown } }).embeddings.create).toBe(
      originalEmbeddingsCreate
    );
  });

  it('traces sync non-streaming response', async () => {
    const mockResponse = {
      id: 'chatcmpl-123',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!', tool_calls: null },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      system_fingerprint: 'fp_123',
      service_tier: 'default',
      created: 1234567890,
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const response = await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response).toBe(mockResponse);

    // Verify trace was sent
    expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent.type).toBe('llm');
    expect(traceEvent.name).toBe('openai.chat.completions.create');
    expect(traceEvent.provider).toBe('openai');
    expect(traceEvent.model).toBe('gpt-4');

    // Input should have prompt
    const input = traceEvent.input as Record<string, unknown>;
    expect(input.prompt).toBe('Hello');
    expect(input.model).toBe('gpt-4');

    // Output should have content and new fields
    const output = traceEvent.output as Record<string, unknown>;
    expect(output.content).toBe('Hello!');
    expect(output.id).toBe('chatcmpl-123');
    expect(output.system_fingerprint).toBe('fp_123');
    expect(output.service_tier).toBe('default');
    expect(output.created).toBe(1234567890);
    expect(output.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });

    // Usage on trace event
    expect(traceEvent.usage).toBeDefined();
    expect(traceEvent.usage!.prompt_tokens).toBe(10);
    expect(traceEvent.usage!.completion_tokens).toBe(5);
    expect(traceEvent.usage!.total_tokens).toBe(15);

    // Metadata should include openai_id
    expect(traceEvent.metadata!.openai_id).toBe('chatcmpl-123');
  });

  it('traces streaming response with accumulated content', async () => {
    const chunks = [
      {
        id: 'chatcmpl-stream-1',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: '' },
            finish_reason: null,
          },
        ],
        model: 'gpt-4',
        system_fingerprint: 'fp_stream',
        created: 1234567890,
      },
      {
        id: 'chatcmpl-stream-1',
        choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        model: 'gpt-4',
        system_fingerprint: 'fp_stream',
        created: 1234567890,
      },
      {
        id: 'chatcmpl-stream-1',
        choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        model: 'gpt-4',
        system_fingerprint: 'fp_stream',
        created: 1234567890,
      },
      {
        id: 'chatcmpl-stream-1',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        model: 'gpt-4',
        created: 1234567890,
      },
    ];

    // Create an async iterable
    async function* asyncChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const originalCreate = vi.fn().mockResolvedValue(asyncChunks());
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const stream = await (
      mockOpenAI as unknown as {
        chat: {
          completions: {
            create: (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
          };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    });

    // Consume stream
    const collected: unknown[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected).toHaveLength(4);

    // Trace should have been sent with accumulated content
    expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    const output = traceEvent.output as Record<string, unknown>;
    expect(output.content).toBe('Hello world');
    expect(output.model).toBe('gpt-4');
    expect(output.id).toBe('chatcmpl-stream-1');
    expect(output.system_fingerprint).toBe('fp_stream');
    expect(output.created).toBe(1234567890);
    expect((output.choices as Array<Record<string, unknown>>)[0].finish_reason).toBe('stop');

    // Metadata should include openai_id and created
    expect(traceEvent.metadata!.openai_id).toBe('chatcmpl-stream-1');
    expect(traceEvent.metadata!.created).toBe(1234567890);
  });

  it('traces errors with proper stack traces', async () => {
    const originalCreate = vi.fn().mockRejectedValue(new Error('API key invalid'));
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    await expect(
      (
        mockOpenAI as unknown as {
          chat: {
            completions: { create: (...args: unknown[]) => Promise<unknown> };
          };
        }
      ).chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      })
    ).rejects.toThrow('API key invalid');

    expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent.type).toBe('error');
    expect(traceEvent.error).toBeDefined();
    expect(traceEvent.error!.message).toBe('API key invalid');
    expect(traceEvent.error!.type).toBe('Error');
    expect(traceEvent.error!.stack).toBeDefined();
    expect(traceEvent.error!.stack).toContain('API key invalid');
  });

  it('captures tool_calls in output', async () => {
    const mockResponse = {
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location": "Paris"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      model: 'gpt-4',
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
      tools: [{ type: 'function', function: { name: 'get_weather' } }],
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const output = traceEvent.output as Record<string, unknown>;

    // Output should have tool_calls in choices
    const choices = output.choices as Array<Record<string, unknown>>;
    const message = choices[0].message as Record<string, unknown>;
    expect(message.tool_calls).toBeDefined();
    expect((message.tool_calls as Array<Record<string, unknown>>)[0]).toHaveProperty('function');

    // Content should describe tool call since content is null
    expect(output.content).toContain('get_weather');
  });

  it('captures additional input parameters and filters undefined', async () => {
    const mockResponse = {
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test' }],
      temperature: 0.5,
      tools: [{ type: 'function', function: { name: 'test_fn' } }],
      response_format: { type: 'json_object' },
      top_p: 0.9,
      seed: 42,
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const input = traceEvent.input as Record<string, unknown>;

    expect(input.temperature).toBe(0.5);
    expect(input.tools).toEqual([{ type: 'function', function: { name: 'test_fn' } }]);
    expect(input.response_format).toEqual({ type: 'json_object' });
    expect(input.top_p).toBe(0.9);
    expect(input.seed).toBe(42);

    // Undefined values should be filtered out
    expect(input).not.toHaveProperty('frequency_penalty');
    expect(input).not.toHaveProperty('presence_penalty');
    expect(input).not.toHaveProperty('stop');
    expect(input).not.toHaveProperty('n');
  });

  it('includes metadata with created timestamp', async () => {
    const mockResponse = {
      id: 'chatcmpl-meta',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
      created: 1234567890,
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, {
      mentioraClient,
      metadata: { custom: 'value' },
      tags: ['test'],
    });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent.metadata).toBeDefined();
    expect(traceEvent.metadata!.method).toBe('chat.completions.create');
    expect(traceEvent.metadata!.created).toBe(1234567890);
    expect(traceEvent.metadata!.openai_id).toBe('chatcmpl-meta');
    expect(traceEvent.metadata!.custom).toBe('value');
    expect(traceEvent.tags).toEqual(['test']);
  });

  it('captures dynamic input params (max_completion_tokens, reasoning_effort, store)', async () => {
    const mockResponse = {
      id: 'chatcmpl-dyn',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      model: 'o1',
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'o1',
      messages: [{ role: 'user', content: 'Think' }],
      max_completion_tokens: 5000,
      reasoning_effort: 'high',
      store: true,
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const input = traceEvent.input as Record<string, unknown>;

    expect(input.max_completion_tokens).toBe(5000);
    expect(input.reasoning_effort).toBe('high');
    expect(input.store).toBe(true);
  });

  it('injects stream_options.include_usage for streaming requests', async () => {
    async function* asyncChunks() {
      yield {
        id: 'chatcmpl-so',
        choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
        model: 'gpt-4',
        created: 1234567890,
      };
      yield {
        id: 'chatcmpl-so',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        model: 'gpt-4',
        created: 1234567890,
      };
    }

    const originalCreate = vi.fn().mockResolvedValue(asyncChunks());
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const stream = await (
      mockOpenAI as unknown as {
        chat: {
          completions: {
            create: (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
          };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    });

    for await (const _chunk of stream) {
      // consume
    }

    // Verify the original create was called with injected stream_options
    const calledArgs = originalCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(calledArgs.stream_options).toEqual({ include_usage: true });

    // Input should reflect original request (no stream_options)
    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const input = traceEvent.input as Record<string, unknown>;
    expect(input).not.toHaveProperty('stream_options');
  });

  it('merges existing stream_options with include_usage', async () => {
    async function* asyncChunks() {
      yield {
        id: 'chatcmpl-merge',
        choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: null }],
        model: 'gpt-4',
        created: 1234567890,
      };
      yield {
        id: 'chatcmpl-merge',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        model: 'gpt-4',
        created: 1234567890,
      };
    }

    const originalCreate = vi.fn().mockResolvedValue(asyncChunks());
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const stream = await (
      mockOpenAI as unknown as {
        chat: {
          completions: {
            create: (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
          };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
      stream_options: { custom_flag: true },
    });

    for await (const _chunk of stream) {
      // consume
    }

    const calledArgs = originalCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(calledArgs.stream_options).toEqual({
      custom_flag: true,
      include_usage: true,
    });
  });

  it('extracts multimodal user prompt from content array', async () => {
    const mockResponse = {
      id: 'chatcmpl-mm',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'I see a cat.' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4o',
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/cat.jpg' },
            },
            { type: 'text', text: 'Describe it.' },
          ],
        },
      ],
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const input = traceEvent.input as Record<string, unknown>;

    expect(input.prompt).toBe('What is in this image?\nDescribe it.');
  });

  it('captures refusal in non-streaming response', async () => {
    const mockResponse = {
      id: 'chatcmpl-ref',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            refusal: 'I cannot help with that request.',
          },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Bad request' }],
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const output = traceEvent.output as Record<string, unknown>;

    expect(output.content).toBe('[REFUSED] I cannot help with that request.');
    const choices = output.choices as Array<Record<string, unknown>>;
    const message = choices[0].message as Record<string, unknown>;
    expect(message.refusal).toBe('I cannot help with that request.');
  });

  it('traces streaming error with type error when stream fails mid-iteration', async () => {
    async function* failingStream() {
      yield {
        id: 'chatcmpl-fail',
        choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        model: 'gpt-4',
        created: 1234567890,
      };
      yield {
        id: 'chatcmpl-fail',
        choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        model: 'gpt-4',
        created: 1234567890,
      };
      throw new Error('Stream connection lost');
    }

    const originalCreate = vi.fn().mockResolvedValue(failingStream());
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const stream = await (
      mockOpenAI as unknown as {
        chat: {
          completions: {
            create: (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
          };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: true,
    });

    // Consume stream — should throw
    const collected: unknown[] = [];
    await expect(async () => {
      for await (const chunk of stream) {
        collected.push(chunk);
      }
    }).rejects.toThrow('Stream connection lost');

    // Should have received 2 chunks before error
    expect(collected).toHaveLength(2);

    // Trace should have type 'error'
    expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent.type).toBe('error');
    expect(traceEvent.error).toBeDefined();
    expect(traceEvent.error!.message).toBe('Stream connection lost');
    expect(traceEvent.error!.type).toBe('Error');

    // Partial content should be included in output
    const output = traceEvent.output as Record<string, unknown> | undefined;
    expect(output).toBeDefined();
    expect(output!.content).toBe('Hello world');
  });

  it('includes input and output when captureContent is true (default)', async () => {
    const mockResponse = {
      id: 'chatcmpl-cc-true',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient, captureContent: true });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent.input).toBeDefined();
    expect(traceEvent.output).toBeDefined();
    expect((traceEvent.input as Record<string, unknown>).prompt).toBe('Hello');
    expect((traceEvent.output as Record<string, unknown>).content).toBe('Hello!');
    expect(traceEvent.model).toBe('gpt-4');
    expect(traceEvent.usage).toBeDefined();
  });

  it('omits input and output when captureContent is false', async () => {
    const mockResponse = {
      id: 'chatcmpl-cc-false',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Secret response' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      created: 1234567890,
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient, captureContent: false });

    await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Secret prompt' }],
    });

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    // Input and output should be absent
    expect(traceEvent).not.toHaveProperty('input');
    expect(traceEvent).not.toHaveProperty('output');

    // Other fields should still be present
    expect(traceEvent.type).toBe('llm');
    expect(traceEvent.model).toBe('gpt-4');
    expect(traceEvent.usage).toBeDefined();
    expect(traceEvent.usage!.prompt_tokens).toBe(10);
    expect(traceEvent.startTime).toBeDefined();
    expect(traceEvent.endTime).toBeDefined();
    expect(traceEvent.provider).toBe('openai');
  });

  it('omits input and output when captureContent is false (streaming)', async () => {
    const chunks = [
      {
        id: 'chatcmpl-cc-stream',
        choices: [{ index: 0, delta: { content: 'Secret' }, finish_reason: null }],
        model: 'gpt-4',
        created: 1234567890,
      },
      {
        id: 'chatcmpl-cc-stream',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        model: 'gpt-4',
        created: 1234567890,
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      },
    ];

    async function* asyncChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const originalCreate = vi.fn().mockResolvedValue(asyncChunks());
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient, captureContent: false });

    const stream = await (
      mockOpenAI as unknown as {
        chat: {
          completions: {
            create: (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
          };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Secret streaming prompt' }],
      stream: true,
    });

    for await (const _chunk of stream) {
      // consume
    }

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent).not.toHaveProperty('input');
    expect(traceEvent).not.toHaveProperty('output');
    expect(traceEvent.type).toBe('llm');
    expect(traceEvent.model).toBe('gpt-4');
    expect(traceEvent.provider).toBe('openai');
    expect(traceEvent.startTime).toBeDefined();
    expect(traceEvent.endTime).toBeDefined();
  });

  it('captures refusal in streaming response', async () => {
    const chunks = [
      {
        id: 'chatcmpl-ref-stream',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', refusal: 'I cannot ' },
            finish_reason: null,
          },
        ],
        model: 'gpt-4',
        created: 1234567890,
      },
      {
        id: 'chatcmpl-ref-stream',
        choices: [
          {
            index: 0,
            delta: { refusal: 'help with that.' },
            finish_reason: null,
          },
        ],
        model: 'gpt-4',
        created: 1234567890,
      },
      {
        id: 'chatcmpl-ref-stream',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        model: 'gpt-4',
        created: 1234567890,
      },
    ];

    async function* asyncChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const originalCreate = vi.fn().mockResolvedValue(asyncChunks());
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const stream = await (
      mockOpenAI as unknown as {
        chat: {
          completions: {
            create: (...args: unknown[]) => Promise<AsyncIterable<unknown>>;
          };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Bad' }],
      stream: true,
    });

    for await (const _chunk of stream) {
      // consume
    }

    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;
    const output = traceEvent.output as Record<string, unknown>;

    expect(output.content).toBe('[REFUSED] I cannot help with that.');
    const choices = output.choices as Array<Record<string, unknown>>;
    const message = choices[0].message as Record<string, unknown>;
    expect(message.refusal).toBe('I cannot help with that.');
  });

  it('detects streaming from request params, not response Symbol.asyncIterator', async () => {
    // A non-streaming response that happens to have Symbol.asyncIterator
    // should NOT be treated as a stream
    const mockResponse = {
      id: 'chatcmpl-no-stream',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Not a stream' },
          finish_reason: 'stop',
        },
      ],
      model: 'gpt-4',
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      // Add Symbol.asyncIterator to trick the old detection
      [Symbol.asyncIterator]: async function* () {
        yield 'fake chunk';
      },
    };

    const originalCreate = vi.fn().mockResolvedValue(mockResponse);
    const mockOpenAI = createMockOpenAIClient(originalCreate);

    trackOpenAI(mockOpenAI, { mentioraClient });

    const response = await (
      mockOpenAI as unknown as {
        chat: {
          completions: { create: (...args: unknown[]) => Promise<unknown> };
        };
      }
    ).chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      // stream is NOT set — this is a non-streaming request
    });

    // Should return the response directly (not wrap as stream)
    expect(response).toBe(mockResponse);

    // Trace should be type 'llm' (not wrapped as a stream)
    expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
    const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as TraceEvent;

    expect(traceEvent.type).toBe('llm');
    expect(traceEvent.name).toBe('openai.chat.completions.create');

    const output = traceEvent.output as Record<string, unknown>;
    expect(output.content).toBe('Not a stream');
    expect(output.id).toBe('chatcmpl-no-stream');
  });
});
