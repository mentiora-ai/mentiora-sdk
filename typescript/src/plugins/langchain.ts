/**
 * LangChain tracing plugin for Mentiora SDK.
 * Callback handler for automatically tracing LangChain executions.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import { v7 as uuidv7 } from 'uuid';
import { ConfigurationError } from '../errors';
import type { TraceEvent, TraceType, UsageInfo } from '../types';
import type { MentioraTracingLangChainOptions } from './types';
export type { MentioraTracingLangChainOptions } from './types';
import { sendTraceSafely } from './utils';

/**
 * Map LangChain message roles to standard roles.
 */
function mapLangChainRoleToStandard(role: string): string {
  switch (role) {
    case 'human':
      return 'user';
    case 'ai':
      return 'assistant';
    default:
      return role;
  }
}

/**
 * Safely convert an unknown value to number, returning undefined if not a number.
 */
function toNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Extract name from a serialized LangChain object (LLM, chain, tool, or retriever).
 */
function getNameFromSerialized(serialized: Serialized | undefined): string {
  if (!serialized) return 'unknown';
  if (serialized.id && Array.isArray(serialized.id)) {
    return serialized.id[serialized.id.length - 1] || 'unknown';
  }
  return serialized.name || 'unknown';
}

/**
 * Convert LangChain run type to our TraceType.
 */
function mapRunTypeToTraceType(runType: string): TraceType {
  switch (runType.toLowerCase()) {
    case 'llm':
      return 'llm';
    case 'tool':
      return 'tool';
    case 'chain':
    case 'agent':
    case 'retriever':
      return 'custom';
    default:
      return 'custom';
  }
}

/**
 * Extract token usage from llm_output or generation_info.
 * Handles multiple formats: camelCase, snake_case, nested, direct.
 */
function extractTokenUsage(
  llmOutput: Record<string, unknown> | undefined,
  generations?: Array<Array<{ text: string; generationInfo?: Record<string, unknown> }>>
): UsageInfo | undefined {
  if (llmOutput) {
    // Try nested tokenUsage / token_usage (LangChain format)
    const nested = (llmOutput.tokenUsage ?? llmOutput.token_usage) as
      | Record<string, unknown>
      | undefined;
    if (nested && typeof nested === 'object') {
      const promptTokens =
        toNumberOrUndefined(nested.promptTokens) ?? toNumberOrUndefined(nested.prompt_tokens);
      const completionTokens =
        toNumberOrUndefined(nested.completionTokens) ??
        toNumberOrUndefined(nested.completion_tokens);
      const totalTokens =
        toNumberOrUndefined(nested.totalTokens) ?? toNumberOrUndefined(nested.total_tokens);

      if (
        promptTokens !== undefined ||
        completionTokens !== undefined ||
        totalTokens !== undefined
      ) {
        return {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
        };
      }
    }

    // Try direct keys in llm_output
    const directPrompt =
      toNumberOrUndefined(llmOutput.prompt_tokens) ?? toNumberOrUndefined(llmOutput.promptTokens);
    const directCompletion =
      toNumberOrUndefined(llmOutput.completion_tokens) ??
      toNumberOrUndefined(llmOutput.completionTokens);
    const directTotal =
      toNumberOrUndefined(llmOutput.total_tokens) ?? toNumberOrUndefined(llmOutput.totalTokens);

    if (directPrompt !== undefined || directCompletion !== undefined || directTotal !== undefined) {
      return {
        prompt_tokens: directPrompt,
        completion_tokens: directCompletion,
        total_tokens: directTotal,
      };
    }
  }

  // Fallback: try generation_info from first generation
  if (generations && generations.length > 0) {
    const firstGenList = generations[0];
    if (firstGenList && firstGenList.length > 0) {
      const genInfo = firstGenList[0].generationInfo;
      if (genInfo && typeof genInfo === 'object') {
        const usage = (genInfo.token_usage ?? genInfo.usage) as Record<string, unknown> | undefined;
        if (usage && typeof usage === 'object') {
          const pt =
            toNumberOrUndefined(usage.prompt_tokens) ?? toNumberOrUndefined(usage.promptTokens);
          const ct =
            toNumberOrUndefined(usage.completion_tokens) ??
            toNumberOrUndefined(usage.completionTokens);
          const tt =
            toNumberOrUndefined(usage.total_tokens) ?? toNumberOrUndefined(usage.totalTokens);

          if (pt !== undefined || ct !== undefined || tt !== undefined) {
            return {
              prompt_tokens: pt,
              completion_tokens: ct,
              total_tokens: tt,
            };
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract content from chain outputs by trying common keys.
 */
function extractChainContent(outputs: Record<string, unknown>): string | undefined {
  const keys = ['output', 'text', 'answer', 'response', 'result', 'content'];
  for (const key of keys) {
    const value = outputs[key];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.content === 'string') return obj.content;
    }
  }

  // Try first string value
  for (const value of Object.values(outputs)) {
    if (typeof value === 'string' && value.trim()) return value;
  }

  return undefined;
}

interface ActiveRunData {
  startTime: Date;
  traceId: string;
  spanId: string;
  threadId: string;
  parentSpanId?: string;
  runType: string;
  name: string;
  input?: unknown;
  serialized?: Serialized;
}

/**
 * Mentiora tracing callback handler for LangChain.
 *
 * Automatically traces LLM calls, chat model calls, chain executions,
 * tool calls, retriever queries, and other LangChain operations.
 *
 * @example
 * ```typescript
 * import { MentioraClient } from '@mentiora.ai/sdk';
 * import { MentioraTracingLangChain } from '@mentiora.ai/sdk/langchain';
 *
 * const mentioraClient = new MentioraClient({ ... });
 * const callback = new MentioraTracingLangChain({ mentioraClient });
 *
 * await chain.invoke({ input: '...' }, { callbacks: [callback] });
 * ```
 */
export class MentioraTracingLangChain extends BaseCallbackHandler {
  name = 'MentioraTracingLangChain';

  private readonly mentioraClient: MentioraTracingLangChainOptions['mentioraClient'];
  private readonly captureContent: boolean;
  private readonly tags?: string[];
  private readonly metadata?: Record<string, unknown>;
  private readonly threadId: string;

  private readonly activeRuns = new Map<string, ActiveRunData>();
  private readonly RUN_TTL_MS = 5 * 60 * 1000;

  constructor(options: MentioraTracingLangChainOptions) {
    super({ _awaitHandler: true });

    if (!options.mentioraClient) {
      throw new ConfigurationError('mentioraClient is required');
    }

    this.mentioraClient = options.mentioraClient;
    this.captureContent = options.captureContent !== false;
    this.tags = options.tags;
    this.metadata = options.metadata;
    this.threadId =
      typeof options.threadId === 'string' && options.threadId.trim() !== ''
        ? options.threadId
        : uuidv7();
  }

  /**
   * Remove runs that have exceeded the TTL (e.g., never received an end/error callback).
   */
  private cleanupStaleRuns(): void {
    const now = Date.now();
    for (const [runId, runData] of this.activeRuns.entries()) {
      if (now - runData.startTime.getTime() > this.RUN_TTL_MS) {
        this.activeRuns.delete(runId);
        if (this.mentioraClient.debug) {
          console.log(`[Mentiora] Cleaned up stale run ${runId}`);
        }
      }
    }
  }

  /**
   * Handle LLM start.
   */
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.cleanupStaleRuns();
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = uuidv7();

    const prompt = prompts.length > 0 ? prompts[prompts.length - 1] : undefined;

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      threadId: this.threadId,
      parentSpanId,
      runType: 'llm',
      name: getNameFromSerialized(llm),
      input: {
        prompt,
        prompts,
        messages: prompts.map((p) => ({ role: 'user', content: p })),
      },
      serialized: llm,
    });
  }

  /**
   * Handle LLM/chat model completion.
   */
  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const isChatModel = run.runType === 'chat_model';
    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    let content: string | undefined;
    let outputObj: Record<string, unknown>;

    if (isChatModel) {
      const choicesData: Array<Record<string, unknown>> = [];

      if (output.generations && output.generations.length > 0) {
        const firstGenList = output.generations[0];
        if (firstGenList && firstGenList.length > 0) {
          const firstGen = firstGenList[0] as unknown as Record<string, unknown>;
          const message = firstGen.message as Record<string, unknown> | undefined;
          if (message && typeof message === 'object') {
            content = typeof message.content === 'string' ? message.content : undefined;
            choicesData.push({
              message: {
                role: mapLangChainRoleToStandard((message.type ?? 'assistant') as string),
                content,
              },
              generation_info: firstGen.generationInfo ?? firstGen.generation_info,
            });
          } else if (typeof firstGen.text === 'string') {
            content = firstGen.text;
            choicesData.push({
              text: content,
              generation_info: firstGen.generationInfo ?? firstGen.generation_info,
            });
          }
        }
      }

      outputObj = { content };
      if (choicesData.length > 0) {
        outputObj.choices = choicesData;
      }
    } else {
      const generationsData = output.generations?.map(
        (
          gen: Array<{
            text: string;
            generationInfo?: Record<string, unknown>;
          }>
        ) =>
          gen.map((g: { text: string; generationInfo?: Record<string, unknown> }) => ({
            text: g.text,
            generationInfo: g.generationInfo,
          }))
      );

      if (output.generations && output.generations.length > 0 && output.generations[0].length > 0) {
        content = output.generations[0][0].text;
      }

      outputObj = { content, generations: generationsData };
    }

    const usage = extractTokenUsage(
      output.llmOutput as Record<string, unknown> | undefined,
      output.generations as Array<
        Array<{
          text: string;
          generationInfo?: Record<string, unknown>;
        }>
      >
    );

    // Get model name from serialized + llmOutput
    const modelName =
      this.getLLMNameFromOutput(
        run.serialized,
        output.llmOutput as Record<string, unknown> | undefined
      ) || run.name;

    const runTypeLabel = isChatModel ? 'chat_model' : 'llm';

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.${runTypeLabel}.${run.name}`,
      type: 'llm',
      ...(this.captureContent && { input: run.input }),
      ...(this.captureContent && { output: outputObj }),
      startTime: run.startTime,
      endTime,
      durationMs,
      metadata: {
        runType: runTypeLabel,
        ...this.metadata,
      },
      tags: this.tags,
      usage,
      model: modelName,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle LLM/chat model error.
   */
  async handleLLMError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const isChatModel = run.runType === 'chat_model';
    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();
    const runTypeLabel = isChatModel ? 'chat_model' : 'llm';

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.${runTypeLabel}.${run.name}`,
      type: 'error',
      ...(this.captureContent && { input: run.input }),
      startTime: run.startTime,
      endTime,
      durationMs,
      error: {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack,
      },
      metadata: {
        runType: runTypeLabel,
        ...this.metadata,
      },
      tags: this.tags,
      model: this.getLLMNameFromOutput(run.serialized, undefined) || run.name,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle chat model start.
   */
  async handleChatModelStart(
    llm: Serialized,
    messages: unknown[][],
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.cleanupStaleRuns();
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = uuidv7();

    // Extract messages structure
    const formattedMessages: Array<{ role: string; content: string }> = [];
    let lastUserContent: string | undefined;

    if (messages && messages.length > 0) {
      const firstMessageList = messages[0];
      if (Array.isArray(firstMessageList)) {
        for (const msg of firstMessageList) {
          if (msg && typeof msg === 'object') {
            const msgObj = msg as Record<string, unknown>;
            const type = (msgObj.type ?? msgObj.role ?? 'user') as string;
            const role = mapLangChainRoleToStandard(type);
            const content = String(msgObj.content ?? '');
            formattedMessages.push({ role, content });
            if (role === 'user' || type === 'human') {
              lastUserContent = content;
            }
          }
        }
      }
    }

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      threadId: this.threadId,
      parentSpanId,
      runType: 'chat_model',
      name: getNameFromSerialized(llm),
      input: {
        prompt: lastUserContent,
        messages: formattedMessages,
      },
      serialized: llm,
    });
  }

  /**
   * Handle chain start.
   */
  async handleChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.cleanupStaleRuns();
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = uuidv7();

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      threadId: this.threadId,
      parentSpanId,
      runType: 'chain',
      name: getNameFromSerialized(chain),
      input: inputs,
      serialized: chain,
    });
  }

  /**
   * Handle chain end.
   */
  async handleChainEnd(outputs: Record<string, unknown>, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const content = extractChainContent(outputs);
    const outputData: Record<string, unknown> = { ...outputs };
    if (!('content' in outputData)) {
      outputData.content = content;
    } else if (outputData.content == null && content) {
      outputData.content = content;
    }

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.chain.${run.name}`,
      type: mapRunTypeToTraceType(run.runType),
      ...(this.captureContent && { input: run.input ?? {} }),
      ...(this.captureContent && { output: outputData }),
      startTime: run.startTime,
      endTime,
      durationMs,
      metadata: {
        runType: run.runType,
        ...this.metadata,
      },
      tags: this.tags,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle chain error.
   */
  async handleChainError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.chain.${run.name}`,
      type: 'error',
      ...(this.captureContent && { input: run.input ?? {} }),
      startTime: run.startTime,
      endTime,
      durationMs,
      error: {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack,
      },
      metadata: {
        runType: run.runType,
        ...this.metadata,
      },
      tags: this.tags,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle tool start.
   */
  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.cleanupStaleRuns();
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = uuidv7();

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      threadId: this.threadId,
      parentSpanId,
      runType: 'tool',
      name: getNameFromSerialized(tool),
      input: { input },
      serialized: tool,
    });
  }

  /**
   * Handle tool end.
   */
  async handleToolEnd(output: string, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.tool.${run.name}`,
      type: 'tool',
      ...(this.captureContent && { input: run.input ?? {} }),
      ...(this.captureContent && { output: { output, content: output } }),
      startTime: run.startTime,
      endTime,
      durationMs,
      metadata: {
        runType: 'tool',
        ...this.metadata,
      },
      tags: this.tags,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle tool error.
   */
  async handleToolError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.tool.${run.name}`,
      type: 'error',
      ...(this.captureContent && { input: run.input ?? {} }),
      startTime: run.startTime,
      endTime,
      durationMs,
      error: {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack,
      },
      metadata: {
        runType: 'tool',
        ...this.metadata,
      },
      tags: this.tags,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle retriever start.
   */
  async handleRetrieverStart(
    retriever: Serialized,
    query: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    this.cleanupStaleRuns();
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = uuidv7();

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      threadId: this.threadId,
      parentSpanId,
      runType: 'retriever',
      name: getNameFromSerialized(retriever),
      input: { query, prompt: query },
      serialized: retriever,
    });
  }

  /**
   * Handle retriever end.
   */
  async handleRetrieverEnd(
    documents: Array<{
      pageContent: string;
      metadata?: Record<string, unknown>;
    }>,
    runId: string
  ): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const docsList = documents.map((doc) => ({
      page_content: doc.pageContent,
      metadata: doc.metadata,
    }));

    const firstContent = documents.length > 0 ? documents[0].pageContent : undefined;

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.retriever.${run.name}`,
      type: 'custom',
      ...(this.captureContent && { input: run.input ?? {} }),
      ...(this.captureContent && {
        output: {
          documents: docsList,
          content: firstContent,
          document_count: docsList.length,
        },
      }),
      startTime: run.startTime,
      endTime,
      durationMs,
      metadata: {
        runType: 'retriever',
        ...this.metadata,
      },
      tags: this.tags,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Handle retriever error.
   */
  async handleRetrieverError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      threadId: run.threadId,
      parentSpanId: run.parentSpanId,
      name: `langchain.retriever.${run.name}`,
      type: 'error',
      ...(this.captureContent && { input: run.input ?? {} }),
      startTime: run.startTime,
      endTime,
      durationMs,
      error: {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack,
      },
      metadata: {
        runType: 'retriever',
        ...this.metadata,
      },
      tags: this.tags,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent, 'LangChain');
    this.activeRuns.delete(runId);
  }

  /**
   * Get or create trace ID for a run.
   */
  private getOrCreateTraceId(runId: string, parentRunId?: string): string {
    if (parentRunId) {
      const parentRun = this.activeRuns.get(parentRunId);
      if (parentRun) {
        return parentRun.traceId;
      }
    }
    return uuidv7();
  }

  /**
   * Get span ID for a run (from activeRuns if exists, otherwise generate).
   */
  private getSpanId(runId: string): string | undefined {
    const run = this.activeRuns.get(runId);
    return run?.spanId;
  }

  /**
   * Extract LLM name from serialized + llm_output (prefer actual model from response).
   */
  private getLLMNameFromOutput(
    serialized: Serialized | undefined,
    llmOutput: Record<string, unknown> | undefined
  ): string {
    // Try llmOutput first (actual model used)
    if (llmOutput) {
      const model = (llmOutput.model_name ?? llmOutput.modelName) as string | undefined;
      if (typeof model === 'string') return model;
    }

    // Try serialized kwargs
    if (serialized && 'type' in serialized && serialized.type === 'constructor') {
      const kwargs = (serialized as { kwargs?: Record<string, unknown> }).kwargs;
      if (kwargs && typeof kwargs === 'object') {
        const model = (kwargs.model_name ?? kwargs.modelName ?? kwargs.model) as string | undefined;
        if (typeof model === 'string') return model;
      }
    }

    return getNameFromSerialized(serialized);
  }
}
