/**
 * Agent types — request, response, streaming events, and API wire format.
 */

// ── Request ──

export interface ModelParams {
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

export interface AgentRunParams {
  /** Tag name to resolve agent (e.g. "production"). Preferred over agentId. */
  tag?: string;
  /** Explicit agent ID. Use with revision for pinned versions. */
  agentId?: string;
  /** Explicit revision number. Used with agentId. */
  revision?: number;
  /** User message to send to the agent. Required. */
  message: string;
  /** Thread ID for multi-turn conversations. Auto-generated if omitted. */
  threadId?: string;
  /** Override the agent's default model. */
  modelId?: string;
  /** Override model parameters. */
  modelParams?: ModelParams;
  /** End-user identifier for tracking. */
  endUserId?: string;
  /** Arbitrary metadata for tracing. */
  metadata?: Record<string, unknown>;
}

// ── Sync Response ──

export interface AgentToolCall {
  toolCallId: string;
  name: string;
  arguments: unknown;
  result?: unknown;
}

export interface AgentRunResult {
  threadId: string;
  traceId?: string;
  agentId: string;
  agentRevision: number;
  agentTag?: string;
  output: string;
  toolCalls: AgentToolCall[];
  status: 'completed' | 'failed';
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

// ── Streaming Events ──

export type AgentStreamEvent =
  | AgentResolvedEvent
  | OutputTextDeltaEvent
  | ToolCallDeltaEvent
  | ToolCallResultEvent
  | SuggestionsEvent
  | ChatCompletedEvent
  | AgentErrorEvent
  | CustomEvent;

export interface AgentResolvedEvent {
  type: 'agent_resolved';
  agentId: string;
  agentRevision: number;
  agentTag?: string;
  threadId: string;
}

export interface OutputTextDeltaEvent {
  type: 'output_text_delta';
  delta: string;
}

export interface ToolCallDeltaEvent {
  type: 'tool_call_delta';
  toolCallId: string;
  name: string;
  argumentsDelta: string;
}

export interface ToolCallResultEvent {
  type: 'tool_call_result';
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: unknown;
}

export interface ChatCompletedEvent {
  type: 'chat_completed';
  threadId: string;
  status: 'completed' | 'failed';
  output: string;
}

export interface SuggestionsEvent {
  type: 'suggestions';
  suggestions: Array<{ label: string; message: string }>;
}

export interface AgentErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export interface CustomEvent {
  type: 'custom';
  /** The raw SSE event name (e.g. "cx.workflow.ui"). */
  event: string;
  /** The parsed JSON payload. */
  data: Record<string, unknown>;
}

// ── API Wire Format (snake_case — internal use only) ──

export interface AgentRunAPIRequest {
  tag?: string;
  agent_id?: string;
  revision?: number;
  message: string;
  thread_id?: string;
  stream: boolean;
  model_id?: string;
  model_params?: {
    temperature?: number;
    max_tokens?: number;
    seed?: number;
  };
  end_user_id?: string;
  metadata?: Record<string, unknown>;
}
