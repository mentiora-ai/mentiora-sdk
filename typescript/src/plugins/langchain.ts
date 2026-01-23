/**
 * LangChain tracing plugin for Mentiora SDK.
 * Callback handler for automatically tracing LangChain executions.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import type { TraceEvent, TraceType } from '../types';
import type { MentioraTracingLangChainOptions } from './types';

/**
 * Generate a random hex string for trace ID (32 hex chars = 16 bytes).
 * OpenTelemetry spec requires trace_id to be 16 bytes (32 hex characters).
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random hex string for span ID (16 hex chars = 8 bytes).
 * OpenTelemetry spec requires span_id to be 8 bytes (16 hex characters).
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
    const spanId = generateSpanId();

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

    // Extract token usage
    const tokenUsage = output.llmOutput?.tokenUsage as
      | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
      | undefined;

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
        provider: 'langchain',
        runType: 'llm',
        model: run.name,
        ...(tokenUsage && {
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
        }),
        ...this.metadata,
      },
      tags: this.tags,
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
        provider: 'langchain',
        runType: 'llm',
        model: run.name,
        ...this.metadata,
      },
      tags: this.tags,
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
    const spanId = generateSpanId();

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
        provider: 'langchain',
        runType: run.runType,
        ...this.metadata,
      },
      tags: this.tags,
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
        provider: 'langchain',
        runType: run.runType,
        ...this.metadata,
      },
      tags: this.tags,
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
    const spanId = generateSpanId();

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
        provider: 'langchain',
        runType: 'tool',
        ...this.metadata,
      },
      tags: this.tags,
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
        provider: 'langchain',
        runType: 'tool',
        ...this.metadata,
      },
      tags: this.tags,
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
    return generateTraceId();
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
