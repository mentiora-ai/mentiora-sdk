/**
 * LangChain tracing plugin for Mentiora SDK.
 * Callback handler for automatically tracing LangChain executions.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { TraceEvent, TraceType, UsageInfo } from '../types';
import type { MentioraTracingLangChainOptions } from './types';

/**
 * Generate a UUID v7 (timestamp-based) for trace/span IDs.
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * Opik requires UUID v7 format for all IDs.
 */
function generateUuidV7(): string {
  const timestamp = Date.now();
  const timestampHex = timestamp.toString(16).padStart(12, '0');
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  
  // Build UUID v7: timestamp (48 bits) + version (4 bits) + random (12 bits) + variant (2 bits) + random (62 bits)
  const timeLow = timestampHex.slice(0, 8);
  const timeMid = timestampHex.slice(8, 12);
  const versionAndRandom = `7${randomBytes[0].toString(16).padStart(2, '0').slice(1)}${randomBytes[1].toString(16).padStart(2, '0')}`;
  const variantAndRandom = `${((randomBytes[2] & 0x3f) | 0x80).toString(16).padStart(2, '0')}${randomBytes[3].toString(16).padStart(2, '0')}`;
  const randomEnd = Array.from(randomBytes.slice(4))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `${timeLow}-${timeMid}-${versionAndRandom}-${variantAndRandom}-${randomEnd}`;
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
 * Send trace event (non-blocking, errors are logged but don't throw).
 */
async function sendTraceSafely(
  mentioraClient: MentioraTracingLangChainOptions['mentioraClient'],
  event: TraceEvent,
): Promise<void> {
  try {
    await mentioraClient.tracing.sendTrace(event);
  } catch (error) {
    // Log error but don't break user's application
    console.error('[MentioraTracingLangChain] Failed to send trace:', error);
  }
}

/**
 * Mentiora tracing callback handler for LangChain.
 *
 * Automatically traces LLM calls, chain executions, tool calls, and other LangChain operations.
 *
 * @example
 * ```typescript
 * import { MentioraTracingLangChain } from '@mentiora/sdk/plugins/langchain';
 * import { MentioraClient } from '@mentiora/sdk';
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
  private readonly tags?: string[];
  private readonly metadata?: Record<string, unknown>;
  private readonly projectId?: string;

  // Track active runs for parent-child relationships
  private readonly activeRuns = new Map<
    string,
    {
      startTime: Date;
      traceId: string;
      spanId: string;
      parentSpanId?: string;
      runType: string;
      name: string;
      input?: unknown;
    }
  >();

  constructor(options: MentioraTracingLangChainOptions) {
    super();
    this.mentioraClient = options.mentioraClient;
    this.tags = options.tags;
    this.metadata = options.metadata;
    this.projectId = options.projectId;

    if (!options.mentioraClient) {
      throw new Error('mentioraClient is required');
    }
  }

  /**
   * Handle LLM start.
   */
  async onLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
  ): Promise<void> {
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = generateUuidV7();

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      parentSpanId,
      runType: 'llm',
      name: this.getLLMName(llm),
      input: prompts,
    });
  }

  /**
   * Handle LLM end.
   */
  async onLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    // Extract output (generations)
    const outputData = output.generations?.map((gen: Array<{ text: string; generationInfo?: Record<string, unknown> }>) =>
      gen.map((g: { text: string; generationInfo?: Record<string, unknown> }) => ({
        text: g.text,
        generationInfo: g.generationInfo,
      })),
    );

    // Extract token usage in API format (snake_case)
    const rawTokenUsage = output.llmOutput?.tokenUsage as
      | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
      | undefined;
    const usage: UsageInfo | undefined = rawTokenUsage ? {
      prompt_tokens: rawTokenUsage.promptTokens,
      completion_tokens: rawTokenUsage.completionTokens,
      total_tokens: rawTokenUsage.totalTokens,
    } : undefined;

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      parentSpanId: run.parentSpanId,
      name: `langchain.llm.${run.name}`,
      type: 'llm',
      input: run.input,
      output: outputData,
      startTime: run.startTime,
      endTime,
      durationMs,
      metadata: {
        runType: 'llm',
        ...this.metadata,
      },
      tags: this.tags,
      usage,
      model: run.name,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent);
    this.activeRuns.delete(runId);
  }

  /**
   * Handle LLM error.
   */
  async onLLMError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      parentSpanId: run.parentSpanId,
      name: `langchain.llm.${run.name}`,
      type: 'error',
      startTime: run.startTime,
      endTime,
      durationMs,
      error: {
        message: err.message,
        type: err.constructor.name,
        stack: err.stack,
      },
      metadata: {
        runType: 'llm',
        ...this.metadata,
      },
      tags: this.tags,
      model: run.name,
      provider: 'langchain',
    };

    await sendTraceSafely(this.mentioraClient, traceEvent);
    this.activeRuns.delete(runId);
  }

  /**
   * Handle chain start.
   */
  async onChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
  ): Promise<void> {
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = generateUuidV7();

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      parentSpanId,
      runType: 'chain',
      name: this.getChainName(chain),
      input: inputs,
    });
  }

  /**
   * Handle chain end.
   */
  async onChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      parentSpanId: run.parentSpanId,
      name: `langchain.chain.${run.name}`,
      type: mapRunTypeToTraceType(run.runType),
      input: run.input || {},
      output: outputs,
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

    await sendTraceSafely(this.mentioraClient, traceEvent);
    this.activeRuns.delete(runId);
  }

  /**
   * Handle chain error.
   */
  async onChainError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      parentSpanId: run.parentSpanId,
      name: `langchain.chain.${run.name}`,
      type: 'error',
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

    await sendTraceSafely(this.mentioraClient, traceEvent);
    this.activeRuns.delete(runId);
  }

  /**
   * Handle tool start.
   */
  async onToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
  ): Promise<void> {
    const traceId = this.getOrCreateTraceId(runId, parentRunId);
    const parentSpanId = parentRunId ? this.getSpanId(parentRunId) : undefined;
    const spanId = generateUuidV7();

    this.activeRuns.set(runId, {
      startTime: new Date(),
      traceId,
      spanId,
      parentSpanId,
      runType: 'tool',
      name: this.getToolName(tool),
      input,
    });
  }

  /**
   * Handle tool end.
   */
  async onToolEnd(output: string, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      parentSpanId: run.parentSpanId,
      name: `langchain.tool.${run.name}`,
      type: 'tool',
      input: run.input || {},
      output,
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

    await sendTraceSafely(this.mentioraClient, traceEvent);
    this.activeRuns.delete(runId);
  }

  /**
   * Handle tool error.
   */
  async onToolError(err: Error, runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - run.startTime.getTime();

    const traceEvent: TraceEvent = {
      traceId: run.traceId,
      spanId: run.spanId,
      parentSpanId: run.parentSpanId,
      name: `langchain.tool.${run.name}`,
      type: 'error',
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

    await sendTraceSafely(this.mentioraClient, traceEvent);
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
    return generateUuidV7();
  }

  /**
   * Get span ID for a run (from activeRuns if exists, otherwise generate).
   */
  private getSpanId(runId: string): string | undefined {
    const run = this.activeRuns.get(runId);
    return run?.spanId;
  }

  /**
   * Extract LLM name from serialized LLM object.
   */
  private getLLMName(llm: Serialized): string {
    if (llm?.id && Array.isArray(llm.id)) {
      return llm.id[llm.id.length - 1] || 'unknown';
    }
    return llm?.name || 'unknown';
  }

  /**
   * Extract chain name from serialized chain object.
   */
  private getChainName(chain: Serialized): string {
    if (chain?.id && Array.isArray(chain.id)) {
      return chain.id[chain.id.length - 1] || 'unknown';
    }
    return chain?.name || 'unknown';
  }

  /**
   * Extract tool name from serialized tool object.
   */
  private getToolName(tool: Serialized): string {
    if (tool?.id && Array.isArray(tool.id)) {
      return tool.id[tool.id.length - 1] || 'unknown';
    }
    return tool?.name || 'unknown';
  }
}
