/**
 * MentioraChatProvider — Context provider for all chat components.
 *
 * Provides the useChat state, toolLabels, theme config, and render overrides
 * so internal components can access them without prop-drilling.
 */

import React, { createContext, useContext } from 'react';

import type { MentioraError } from '../../errors';
import type {
  ActiveToolCallInfo,
  ChatMessageData,
  ChatStatus,
  SuggestionItem,
  ToolCallData,
} from '../headless/types';

// ── Types ──

export interface ToolCallRenderData {
  toolCallId: string;
  toolName: string;
  status: 'started' | 'result' | 'error';
  result?: unknown;
  errorMessage?: string;
}

export interface ChatContextValue {
  // State
  messages: ChatMessageData[];
  toolCalls: ToolCallData[];
  activeToolCall: ActiveToolCallInfo | null;
  activeToolCallCount: number;
  suggestions: SuggestionItem[];
  status: ChatStatus;
  error: { code: string; message: string } | null;
  threadId: string;

  // Actions
  sendMessage: (text: string) => void;
  stop: () => void;
  retry: () => void;
  reset: () => void;

  // Configuration
  toolLabels?: Record<string, string>;
  disclosure?: React.ReactNode;

  // Render overrides
  renderMessage?: (
    message: ChatMessageData,
    defaultRender: () => React.ReactElement,
  ) => React.ReactElement;
  renderToolResult?: (
    toolCall: ToolCallRenderData,
    defaultRender: () => React.ReactElement,
  ) => React.ReactElement;
}

// ── Context ──

const ChatContext = createContext<ChatContextValue | null>(null);

export function MentioraChatProvider(
  props: Readonly<{ value: ChatContextValue; children: React.ReactNode }>,
): React.ReactElement {
  return <ChatContext.Provider value={props.value}>{props.children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChatContext must be used within a MentioraChatProvider');
  }
  return ctx;
}
