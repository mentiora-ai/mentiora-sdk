/**
 * @mentiora.ai/sdk/ui
 *
 * React chat widget and hooks for Mentiora agents.
 */

// Primary API
export { ChatWidget } from './components/chat-widget';
export type { ChatWidgetProps, ChatTheme } from './components/chat-widget';

// Headless hook
export { useChat } from './hooks/use-chat';
export type { UseChatConfig, UseChatReturn } from './hooks/use-chat';

// Types
export type {
  ChatMessageData,
  ChatState,
  ChatStatus,
  SuggestionItem,
  ToolCallData,
  ActiveToolCallInfo,
} from './headless/types';

// Provider (for advanced usage)
export { MentioraChatProvider, useChatContext } from './components/provider';
export type { ChatContextValue, ToolCallRenderData } from './components/provider';
