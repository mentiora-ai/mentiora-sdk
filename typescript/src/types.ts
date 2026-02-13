/**
 * SDK type definitions.
 * Includes tracing-specific types and shared configuration types.
 * Future: Additional feature-specific types will be added here.
 */

export type TraceType = 'llm' | 'tool' | 'chat' | 'error' | 'custom';

export interface TraceError {
  /** Human-readable error message. */
  message: string;
  /** Error type or class name (e.g., `"TypeError"`). */
  type?: string;
  /** Stack trace string, if available. */
  stack?: string;
}

export interface UsageInfo {
  /** Number of input/prompt tokens */
  prompt_tokens?: number;
  /** Number of output/completion tokens */
  completion_tokens?: number;
  /** Total tokens (prompt + completion) */
  total_tokens?: number;
}

export interface TraceEvent {
  /** Unique trace ID (user request / conversation) */
  traceId: string;
  /** Unique span ID (one step) */
  spanId: string;
  /** Parent span for nesting */
  parentSpanId?: string;
  /**
   * Thread/conversation ID for grouping traces (UUID v7 string).
   * If omitted, the SDK will generate one before sending.
   */
  threadId?: string;
  /** Span name, e.g., 'langchain.llm_call', 'tool.execute' */
  name: string;
  /** Trace type */
  type: TraceType;
  /** Prompt, tool input, etc. */
  input?: unknown;
  /** Response, tool result */
  output?: unknown;
  /** Start time (ISO 8601 string or Date) */
  startTime: Date | string;
  /** End time (ISO 8601 string or Date) */
  endTime?: Date | string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Tags for filtering/grouping */
  tags?: string[];
  /** Error details (if type === 'error') */
  error?: TraceError;
  /** Token usage (LLM-specific) */
  usage?: UsageInfo;
  /** Model name (e.g., 'gpt-4', 'claude-3') */
  model?: string;
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider?: string;
}

/**
 * Main SDK configuration.
 * Future: Additional feature-specific configs will be added here.
 */
export interface MentioraConfig {
  /** Project API key (from Mentiora platform) */
  apiKey: string;
  /** Base URL (defaults to https://platform.mentiora.ai if not provided) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max retry attempts (default: 3) */
  retries?: number;
  /** Enable verbose SDK logging (HTTP requests, retries, responses) */
  debug?: boolean;
}

export interface SendTraceResult {
  /** Whether the trace was sent successfully. */
  success: boolean;
  /** Trace ID of the sent event. */
  traceId: string;
  /** Span ID of the sent event. */
  spanId: string;
  /** Error message, if the send failed. */
  error?: string;
}
