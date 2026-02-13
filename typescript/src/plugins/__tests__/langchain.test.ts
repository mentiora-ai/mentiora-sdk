/**
 * Tests for LangChain tracing plugin.
 */

import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationError } from '../../errors';
import type { TraceEvent } from '../../types';
import { MentioraTracingLangChain } from '../langchain';
import type { MentioraTracingLangChainOptions } from '../types';

// Mock uuid
vi.mock('uuid', () => ({
  v7: vi.fn(() => 'mock-uuid-v7'),
}));

/**
 * Create a mock MentioraClient.
 */
function createMockMentioraClient() {
  return {
    tracing: {
      sendTrace: vi.fn().mockResolvedValue({ success: true, traceId: 'tid', spanId: 'sid' }),
    },
  } as unknown as MentioraTracingLangChainOptions['mentioraClient'];
}

/**
 * Create a mock Serialized object (used for LLM/chain/tool/retriever identification).
 */
function createSerialized(name: string, kwargs?: Record<string, unknown>): Serialized {
  return {
    lc: 1,
    type: 'constructor',
    id: ['langchain', name],
    kwargs: kwargs ?? {},
  } as unknown as Serialized;
}

describe('MentioraTracingLangChain', () => {
  let mentioraClient: ReturnType<typeof createMockMentioraClient>;
  let callback: MentioraTracingLangChain;

  beforeEach(() => {
    mentioraClient = createMockMentioraClient();
    callback = new MentioraTracingLangChain({
      mentioraClient,
      tags: ['test'],
      metadata: { env: 'test' },
    });
    vi.clearAllMocks();
  });

  it('throws when mentioraClient is missing', () => {
    expect(
      () =>
        new MentioraTracingLangChain({
          mentioraClient: undefined,
        } as unknown as MentioraTracingLangChainOptions)
    ).toThrow(ConfigurationError);
  });

  it('initializes with correct name and properties', () => {
    expect(callback.name).toBe('MentioraTracingLangChain');
  });

  describe('handleLLMStart / handleLLMEnd', () => {
    it('tracks LLM start with prompt extraction', async () => {
      const runId = 'run-1';

      await callback.handleLLMStart(createSerialized('test-llm'), ['Hello, world!'], runId);

      // Verify run is tracked (indirectly by completing lifecycle)
      const mockResponse: LLMResult = {
        generations: [[{ text: 'Hi there!', generationInfo: {} }]],
        llmOutput: {},
      };

      await callback.handleLLMEnd(mockResponse, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('llm');
      expect(traceEvent.name).toContain('llm');
      expect(traceEvent.provider).toBe('langchain');

      // Input should have prompt
      const input = traceEvent.input as Record<string, unknown>;
      expect(input.prompt).toBe('Hello, world!');
      expect(input.prompts).toEqual(['Hello, world!']);

      // Output should have content
      const output = traceEvent.output as Record<string, unknown>;
      expect(output.content).toBe('Hi there!');
    });
  });

  describe('handleChatModelStart / handleLLMEnd', () => {
    it('tracks chat model lifecycle with token usage', async () => {
      const runId = 'run-chat-1';

      await callback.handleChatModelStart(
        createSerialized('ChatOpenAI', { model: 'gpt-4' }),
        [[{ type: 'human', content: 'What is AI?' }]],
        runId
      );

      const mockResponse: LLMResult = {
        generations: [
          [
            {
              text: 'AI is artificial intelligence.',
              message: {
                type: 'ai',
                content: 'AI is artificial intelligence.',
              },
              generationInfo: {},
            } as unknown as {
              text: string;
              generationInfo?: Record<string, unknown>;
            },
          ],
        ],
        llmOutput: {
          tokenUsage: {
            promptTokens: 5,
            completionTokens: 10,
            totalTokens: 15,
          },
        },
      };

      await callback.handleLLMEnd(mockResponse, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('llm');
      expect(traceEvent.name).toContain('chat_model');

      // Input should have prompt from user message
      const input = traceEvent.input as Record<string, unknown>;
      expect(input.prompt).toBe('What is AI?');

      // Output should have content extracted from message
      const output = traceEvent.output as Record<string, unknown>;
      expect(output.content).toBe('AI is artificial intelligence.');

      // Should have choices with message structure
      expect(output.choices).toBeDefined();

      // Token usage
      expect(traceEvent.usage).toBeDefined();
      expect(traceEvent.usage!.prompt_tokens).toBe(5);
      expect(traceEvent.usage!.completion_tokens).toBe(10);
      expect(traceEvent.usage!.total_tokens).toBe(15);
    });

    it('traces chat model errors through handleLLMError', async () => {
      const runId = 'run-chat-err-1';

      await callback.handleChatModelStart(
        createSerialized('ChatOpenAI', { model: 'gpt-4' }),
        [[{ type: 'human', content: 'Hello' }]],
        runId
      );

      const error = new Error('Chat model rate limited');
      await callback.handleLLMError(error, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('error');
      expect(traceEvent.name).toContain('chat_model');
      expect(traceEvent.error!.message).toBe('Chat model rate limited');
    });
  });

  describe('handleRetrieverStart / handleRetrieverEnd', () => {
    it('tracks retriever lifecycle with documents', async () => {
      const runId = 'run-ret-1';

      await callback.handleRetrieverStart(
        createSerialized('vector-retriever'),
        'What is Python?',
        runId
      );

      const documents = [
        {
          pageContent: 'Python is a programming language.',
          metadata: { source: 'wiki' },
        },
        {
          pageContent: 'Python was created by Guido.',
          metadata: { source: 'docs' },
        },
      ];

      await callback.handleRetrieverEnd(documents, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('custom');
      expect(traceEvent.name).toContain('retriever');

      // Input should have query and prompt
      const input = traceEvent.input as Record<string, unknown>;
      expect(input.query).toBe('What is Python?');
      expect(input.prompt).toBe('What is Python?');

      // Output should have documents
      const output = traceEvent.output as Record<string, unknown>;
      expect(output.document_count).toBe(2);
      expect(output.content).toBe('Python is a programming language.');
      expect(output.documents).toHaveLength(2);
    });
  });

  describe('handleRetrieverError', () => {
    it('traces retriever errors with proper stack trace', async () => {
      const runId = 'run-ret-err-1';

      await callback.handleRetrieverStart(
        createSerialized('vector-retriever'),
        'Test query',
        runId
      );

      const error = new Error('Vector DB connection failed');
      await callback.handleRetrieverError(error, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('error');
      expect(traceEvent.error).toBeDefined();
      expect(traceEvent.error!.message).toBe('Vector DB connection failed');
      expect(traceEvent.error!.type).toBe('Error');
      expect(traceEvent.error!.stack).toBeDefined();
      expect(traceEvent.error!.stack).toContain('Vector DB connection failed');
    });
  });

  describe('token usage extraction', () => {
    it('extracts token usage from generation_info fallback', async () => {
      const runId = 'run-gen-info-1';

      await callback.handleLLMStart(createSerialized('test-llm'), ['Hello'], runId);

      // llm_output has no tokens, but generation_info does
      const mockResponse: LLMResult = {
        generations: [
          [
            {
              text: 'Response text',
              generationInfo: {
                token_usage: {
                  prompt_tokens: 100,
                  completion_tokens: 50,
                  total_tokens: 150,
                },
              },
            },
          ],
        ],
        llmOutput: {}, // Empty - no tokens
      };

      await callback.handleLLMEnd(mockResponse, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.usage).toBeDefined();
      expect(traceEvent.usage!.prompt_tokens).toBe(100);
      expect(traceEvent.usage!.completion_tokens).toBe(50);
      expect(traceEvent.usage!.total_tokens).toBe(150);
    });
  });

  describe('parent-child relationships', () => {
    it('properly tracks trace_id inheritance and parent_span_id', async () => {
      const parentId = 'parent-run-1';
      const childId = 'child-run-1';

      // Start parent chain
      await callback.handleChainStart(
        createSerialized('parent-chain'),
        { input: 'test' },
        parentId
      );

      // Start child LLM with parent
      await callback.handleLLMStart(createSerialized('child-llm'), ['Hello'], childId, parentId);

      // End child
      const mockResponse: LLMResult = {
        generations: [[{ text: 'Hi' }]],
        llmOutput: {},
      };
      await callback.handleLLMEnd(mockResponse, childId);

      const childTrace = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      // Child should have a parentSpanId
      expect(childTrace.parentSpanId).toBeDefined();
      // Child's traceId should match (since parent shares trace_id)
      expect(childTrace.traceId).toBeDefined();
    });
  });

  describe('chain output content extraction', () => {
    it('extracts content from output key', async () => {
      const runId = 'run-chain-1';

      await callback.handleChainStart(createSerialized('test-chain'), { input: 'test' }, runId);

      await callback.handleChainEnd({ output: 'The answer is 42' }, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;
      const output = traceEvent.output as Record<string, unknown>;
      expect(output.content).toBe('The answer is 42');
    });

    it('extracts content from answer key', async () => {
      const runId = 'run-chain-2';

      await callback.handleChainStart(createSerialized('test-chain'), { input: 'test' }, runId);

      await callback.handleChainEnd({ answer: 'Yes, it works' }, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;
      const output = traceEvent.output as Record<string, unknown>;
      expect(output.content).toBe('Yes, it works');
    });
  });

  describe('LLM error handling', () => {
    it('traces LLM errors with stack trace', async () => {
      const runId = 'run-llm-err-1';

      await callback.handleLLMStart(createSerialized('test-llm'), ['Hello'], runId);

      const error = new Error('Test error with traceback');
      await callback.handleLLMError(error, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('error');
      expect(traceEvent.error).toBeDefined();
      expect(traceEvent.error!.message).toBe('Test error with traceback');
      expect(traceEvent.error!.stack).toBeDefined();
      expect(traceEvent.error!.stack).toContain('Error');
    });
  });

  describe('handleToolStart / handleToolEnd', () => {
    it('tracks tool lifecycle', async () => {
      const runId = 'run-tool-1';

      await callback.handleToolStart(createSerialized('calculator'), '2 + 2', runId);

      await callback.handleToolEnd('4', runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('tool');
      expect(traceEvent.name).toContain('tool');
      expect(traceEvent.name).toContain('calculator');
      expect(traceEvent.provider).toBe('langchain');

      const input = traceEvent.input as Record<string, unknown>;
      expect(input.input).toBe('2 + 2');

      const output = traceEvent.output as Record<string, unknown>;
      expect(output.output).toBe('4');
      expect(output.content).toBe('4');
    });
  });

  describe('handleToolError', () => {
    it('traces tool errors', async () => {
      const runId = 'run-tool-err-1';

      await callback.handleToolStart(createSerialized('calculator'), 'invalid input', runId);

      const error = new Error('Tool execution failed');
      await callback.handleToolError(error, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('error');
      expect(traceEvent.name).toContain('tool');
      expect(traceEvent.error).toBeDefined();
      expect(traceEvent.error!.message).toBe('Tool execution failed');
      expect(traceEvent.error!.type).toBe('Error');
    });
  });

  describe('handleChainError', () => {
    it('traces chain errors', async () => {
      const runId = 'run-chain-err-1';

      await callback.handleChainStart(createSerialized('test-chain'), { input: 'test' }, runId);

      const error = new Error('Chain execution failed');
      await callback.handleChainError(error, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.type).toBe('error');
      expect(traceEvent.name).toContain('chain');
      expect(traceEvent.error).toBeDefined();
      expect(traceEvent.error!.message).toBe('Chain execution failed');
      expect(traceEvent.error!.type).toBe('Error');
    });
  });

  describe('role remapping', () => {
    it('maps human to user and ai to assistant in chat model start', async () => {
      const runId = 'run-role-1';

      await callback.handleChatModelStart(
        createSerialized('ChatOpenAI'),
        [
          [
            { type: 'human', content: 'Hello' },
            { type: 'ai', content: 'Hi there' },
            { type: 'system', content: 'You are helpful' },
          ],
        ],
        runId
      );

      const mockResponse: LLMResult = {
        generations: [
          [
            {
              text: 'Response',
              message: { type: 'ai', content: 'Response' },
            } as unknown as {
              text: string;
              generationInfo?: Record<string, unknown>;
            },
          ],
        ],
        llmOutput: {},
      };

      await callback.handleLLMEnd(mockResponse, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      // Input messages should have remapped roles
      const input = traceEvent.input as Record<string, unknown>;
      const messages = input.messages as Array<{
        role: string;
        content: string;
      }>;
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('system');

      // Output choices should have remapped roles
      const output = traceEvent.output as Record<string, unknown>;
      const choices = output.choices as Array<Record<string, unknown>>;
      const msg = choices[0].message as { role: string; content: string };
      expect(msg.role).toBe('assistant');
    });
  });

  describe('token usage type validation', () => {
    it('filters out non-number token values', async () => {
      const runId = 'run-usage-type-1';

      await callback.handleLLMStart(createSerialized('test-llm'), ['Hello'], runId);

      const mockResponse: LLMResult = {
        generations: [[{ text: 'Response' }]],
        llmOutput: {
          tokenUsage: {
            promptTokens: 'not-a-number',
            completionTokens: 10,
            totalTokens: null,
          },
        },
      };

      await callback.handleLLMEnd(mockResponse, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.usage).toBeDefined();
      expect(traceEvent.usage!.prompt_tokens).toBeUndefined();
      expect(traceEvent.usage!.completion_tokens).toBe(10);
      expect(traceEvent.usage!.total_tokens).toBeUndefined();
    });
  });

  describe('TTL cleanup of stale runs', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('cleans up stale runs when a new handle*Start is called', async () => {
      vi.useFakeTimers();

      const staleRunId = 'stale-run-1';

      // Start a run that will never receive handleLLMEnd
      await callback.handleLLMStart(createSerialized('test-llm'), ['Hello'], staleRunId);

      // Advance time past the 5-minute TTL
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Start a new run — this should trigger cleanup of the stale run
      const newRunId = 'new-run-1';
      await callback.handleLLMStart(createSerialized('test-llm'), ['Hi again'], newRunId);

      // Now try to end the stale run — it should be gone (no trace sent)
      const mockResponse: LLMResult = {
        generations: [[{ text: 'Late response' }]],
        llmOutput: {},
      };
      await callback.handleLLMEnd(mockResponse, staleRunId);

      // No trace should have been sent for the stale run (it was cleaned up)
      expect(mentioraClient.tracing.sendTrace).not.toHaveBeenCalled();
    });

    it('does not clean up runs within the TTL', async () => {
      vi.useFakeTimers();

      const runId = 'recent-run-1';

      await callback.handleLLMStart(createSerialized('test-llm'), ['Hello'], runId);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Start another run — cleanup should not remove the recent run
      await callback.handleLLMStart(createSerialized('test-llm'), ['Hi'], 'another-run');

      // The original run should still be tracked
      const mockResponse: LLMResult = {
        generations: [[{ text: 'Response' }]],
        llmOutput: {},
      };
      await callback.handleLLMEnd(mockResponse, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
    });
  });

  describe('captureContent option', () => {
    it('includes input and output when captureContent is true (default)', async () => {
      const cb = new MentioraTracingLangChain({
        mentioraClient,
        captureContent: true,
      });

      const runId = 'run-cc-true';

      await cb.handleChatModelStart(
        createSerialized('ChatOpenAI', { model: 'gpt-4' }),
        [[{ type: 'human', content: 'What is AI?' }]],
        runId
      );

      const mockResponse: LLMResult = {
        generations: [
          [
            {
              text: 'AI is artificial intelligence.',
              message: { type: 'ai', content: 'AI is artificial intelligence.' },
            } as unknown as { text: string; generationInfo?: Record<string, unknown> },
          ],
        ],
        llmOutput: {
          tokenUsage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        },
      };

      await cb.handleLLMEnd(mockResponse, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent.input).toBeDefined();
      expect(traceEvent.output).toBeDefined();
      expect((traceEvent.input as Record<string, unknown>).prompt).toBe('What is AI?');
      expect((traceEvent.output as Record<string, unknown>).content).toBe(
        'AI is artificial intelligence.'
      );
      expect(traceEvent.usage).toBeDefined();
      expect(traceEvent.model).toBeDefined();
    });

    it('omits input and output when captureContent is false', async () => {
      const cb = new MentioraTracingLangChain({
        mentioraClient,
        captureContent: false,
      });

      const runId = 'run-cc-false';

      await cb.handleChatModelStart(
        createSerialized('ChatOpenAI', { model: 'gpt-4' }),
        [[{ type: 'human', content: 'Secret question' }]],
        runId
      );

      const mockResponse: LLMResult = {
        generations: [
          [
            {
              text: 'Secret answer.',
              message: { type: 'ai', content: 'Secret answer.' },
            } as unknown as { text: string; generationInfo?: Record<string, unknown> },
          ],
        ],
        llmOutput: {
          tokenUsage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        },
      };

      await cb.handleLLMEnd(mockResponse, runId);

      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      // Input and output should be absent
      expect(traceEvent).not.toHaveProperty('input');
      expect(traceEvent).not.toHaveProperty('output');

      // Other fields should still be present
      expect(traceEvent.type).toBe('llm');
      expect(traceEvent.model).toBeDefined();
      expect(traceEvent.usage).toBeDefined();
      expect(traceEvent.usage!.prompt_tokens).toBe(5);
      expect(traceEvent.startTime).toBeDefined();
      expect(traceEvent.endTime).toBeDefined();
      expect(traceEvent.provider).toBe('langchain');
    });

    it('omits input and output when captureContent is false (LLM)', async () => {
      const privacyCallback = new MentioraTracingLangChain({
        mentioraClient,
        captureContent: false,
      });

      const runId = 'run-cc-llm';
      await privacyCallback.handleChatModelStart(
        createSerialized('ChatOpenAI', { model: 'gpt-4' }),
        [[{ type: 'human', content: 'Secret question' }]],
        runId
      );

      const mockResponse: LLMResult = {
        generations: [
          [
            {
              text: 'Secret answer',
              message: { type: 'ai', content: 'Secret answer' },
            } as unknown as { text: string; generationInfo?: Record<string, unknown> },
          ],
        ],
        llmOutput: {
          tokenUsage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
        },
      };

      await privacyCallback.handleLLMEnd(mockResponse, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent).not.toHaveProperty('input');
      expect(traceEvent).not.toHaveProperty('output');
      expect(traceEvent.type).toBe('llm');
      expect(traceEvent.usage).toBeDefined();
      expect(traceEvent.usage!.prompt_tokens).toBe(5);
      expect(traceEvent.startTime).toBeDefined();
      expect(traceEvent.endTime).toBeDefined();
      expect(traceEvent.provider).toBe('langchain');
    });

    it('omits input and output when captureContent is false (chain)', async () => {
      const privacyCallback = new MentioraTracingLangChain({
        mentioraClient,
        captureContent: false,
      });

      const runId = 'run-cc-chain';
      await privacyCallback.handleChainStart(
        createSerialized('test-chain'),
        { input: 'Secret input data' },
        runId
      );

      await privacyCallback.handleChainEnd({ output: 'Secret output data' }, runId);

      expect(mentioraClient.tracing.sendTrace).toHaveBeenCalledOnce();
      const traceEvent = (mentioraClient.tracing.sendTrace as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TraceEvent;

      expect(traceEvent).not.toHaveProperty('input');
      expect(traceEvent).not.toHaveProperty('output');
      expect(traceEvent.name).toContain('chain');
      expect(traceEvent.startTime).toBeDefined();
      expect(traceEvent.endTime).toBeDefined();
      expect(traceEvent.provider).toBe('langchain');
    });
  });

  describe('orphaned end events', () => {
    it('silently ignores end events without matching start', async () => {
      // These should not throw and should not send traces
      const mockResponse: LLMResult = {
        generations: [[{ text: 'Hi' }]],
        llmOutput: {},
      };

      await callback.handleLLMEnd(mockResponse, 'unknown-run');
      await callback.handleChainEnd({ output: 'test' }, 'unknown-run');
      await callback.handleToolEnd('result', 'unknown-run');
      await callback.handleRetrieverEnd([], 'unknown-run');

      expect(mentioraClient.tracing.sendTrace).not.toHaveBeenCalled();
    });

    it('silently ignores error events without matching start', async () => {
      const error = new Error('orphaned error');

      await callback.handleLLMError(error, 'unknown-run');
      await callback.handleChainError(error, 'unknown-run');
      await callback.handleToolError(error, 'unknown-run');
      await callback.handleRetrieverError(error, 'unknown-run');

      expect(mentioraClient.tracing.sendTrace).not.toHaveBeenCalled();
    });
  });
});
