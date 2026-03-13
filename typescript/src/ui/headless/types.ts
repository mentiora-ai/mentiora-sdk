/**
 * Headless UI types — framework-agnostic, no React dependency.
 */

import type { MentioraClient } from '../../client';
import type { MentioraError } from '../../errors';

// ── Messages ──

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

// ── Tool Calls ──

export interface ToolCallData {
  toolCallId: string;
  toolName: string;
  status: 'started' | 'result' | 'error';
  argumentsAccumulated: string;
  result?: unknown;
  errorMessage?: string;
}

// ── Suggestions ──

export interface SuggestionItem {
  label: string;
  message: string;
}

// ── Active Tool Call ──

export interface ActiveToolCallInfo {
  toolName: string;
  status: 'in_progress' | 'completed';
}

// ── Chat State ──

export type ChatStatus = 'idle' | 'streaming' | 'error';

export interface ChatState {
  status: ChatStatus;
  messages: ChatMessageData[];
  toolCalls: Record<string, ToolCallData>;
  toolCallOrder: string[];
  activeToolCall: ActiveToolCallInfo | null;
  /** Number of currently in-flight tool calls (for parallel tool tracking) */
  activeToolCallCount: number;
  suggestions: SuggestionItem[];
  error: { code: string; message: string } | null;
  threadId: string;
  lastUserMessage: string | null;
}

// ── Config ──

export interface ChatConfig {
  client: MentioraClient;
  agentTag?: string;
  agentId?: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
  endUserId?: string;
  onMessage?: (message: ChatMessageData) => void;
  onError?: (error: MentioraError) => void;
  onThreadChange?: (threadId: string) => void;
}

// ── Persistence ──

export interface PersistedChatData {
  threadId: string;
  messages: ChatMessageData[];
  toolCalls: Record<string, ToolCallData>;
  toolCallOrder: string[];
  timestamp: number;
  schemaVersion: number;
}

// ── Chat Instance (headless adapter) ──

export interface ChatInstance {
  getState(): ChatState;
  subscribe(listener: () => void): () => void;
  sendMessage(text: string): void;
  stop(): void;
  retry(): void;
  reset(): void;
  destroy(): void;
}
