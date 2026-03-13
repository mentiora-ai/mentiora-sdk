/**
 * useChat — React hook wrapping the headless ChatStore.
 *
 * Uses useSyncExternalStore for tear-free reads.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { MentioraError } from '../../errors';
import type { MentioraClient } from '../../client';
import { ChatStore } from '../headless/chat-store';
import type {
  ChatMessageData,
  ChatState,
  ChatStatus,
  SuggestionItem,
  ToolCallData,
  ActiveToolCallInfo,
} from '../headless/types';
import { usePersistence } from './use-persistence';

export interface UseChatConfig {
  client: MentioraClient;
  agentTag?: string;
  agentId?: string;
  threadId?: string;
  metadata?: Record<string, unknown>;
  endUserId?: string;
  /** Initial suggestion cards (empty state only) */
  suggestions?: SuggestionItem[];
  /** Enable localStorage persistence (default: true) */
  persistHistory?: boolean;
  /** localStorage key prefix */
  storageKey?: string;
  onMessage?: (message: ChatMessageData) => void;
  onError?: (error: MentioraError) => void;
  onThreadChange?: (threadId: string) => void;
}

export interface UseChatReturn {
  messages: ChatMessageData[];
  toolCalls: ToolCallData[];
  activeToolCall: ActiveToolCallInfo | null;
  /** Number of in-flight tool calls (>1 means parallel) */
  activeToolCallCount: number;
  suggestions: SuggestionItem[];
  status: ChatStatus;
  error: { code: string; message: string } | null;
  threadId: string;

  sendMessage: (text: string) => void;
  stop: () => void;
  retry: () => void;
  reset: () => void;
  clearHistory: () => void;
}

export function useChat(config: UseChatConfig): UseChatReturn {
  const {
    client,
    agentTag,
    agentId,
    threadId: initialThreadId,
    metadata,
    endUserId,
    suggestions: initialSuggestions,
    persistHistory = true,
    storageKey = 'default',
    onMessage,
    onError,
    onThreadChange,
  } = config;

  // Stable refs for callbacks to avoid recreating the store
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onThreadChangeRef = useRef(onThreadChange);
  onThreadChangeRef.current = onThreadChange;

  // Create store once
  const store = useMemo(
    () =>
      new ChatStore({
        client,
        agentTag,
        agentId,
        threadId: initialThreadId,
        metadata,
        endUserId,
        onMessage: (msg) => onMessageRef.current?.(msg),
        onError: (err) => onErrorRef.current?.(err),
        onThreadChange: (tid) => onThreadChangeRef.current?.(tid),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store created once
    [client, agentTag, agentId],
  );

  // Destroy store on unmount
  useEffect(() => {
    return () => {
      store.destroy();
    };
  }, [store]);

  // Subscribe to store state via useSyncExternalStore
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // Set initial suggestions on mount
  useEffect(() => {
    if (initialSuggestions && initialSuggestions.length > 0 && state.messages.length === 0) {
      store.restoreState({ suggestions: initialSuggestions });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Persistence
  usePersistence({
    enabled: persistHistory,
    storageKey,
    agentTag: agentTag ?? agentId ?? 'default',
    store,
    state,
  });

  // Derive toolCalls array from the ordered map
  const toolCalls = useMemo(
    () => state.toolCallOrder.map((id) => state.toolCalls[id]).filter(Boolean),
    [state.toolCalls, state.toolCallOrder],
  );

  return {
    messages: state.messages,
    toolCalls,
    activeToolCall: state.activeToolCall,
    activeToolCallCount: state.activeToolCallCount,
    suggestions: state.suggestions,
    status: state.status,
    error: state.error,
    threadId: state.threadId,

    sendMessage: store.sendMessage,
    stop: store.stop,
    retry: store.retry,
    reset: store.reset,
    clearHistory: store.clearHistory,
  };
}
