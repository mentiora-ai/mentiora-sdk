/**
 * @mentiora.ai/sdk/ui/headless
 *
 * Framework-agnostic chat state machine and utilities.
 */

export { ChatStore, createInitialState } from './chat-store';
export { createChat } from './create-chat';
export {
  clearPersistedChat,
  createDebouncedSaver,
  loadPersistedChat,
  persistenceKey,
  savePersistedChat,
} from './persistence';
export type {
  ActiveToolCallInfo,
  ChatConfig,
  ChatInstance,
  ChatMessageData,
  ChatState,
  ChatStatus,
  PersistedChatData,
  SuggestionItem,
  ToolCallData,
} from './types';
