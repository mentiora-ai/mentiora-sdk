/**
 * usePersistence — Wires localStorage persistence to the ChatStore.
 *
 * Restores on mount, debounced save on state changes.
 */

import { useEffect, useRef } from 'react';

import type { ChatStore } from '../headless/chat-store';
import type { ChatState } from '../headless/types';
import {
  clearPersistedChat,
  createDebouncedSaver,
  loadPersistedChat,
  persistenceKey,
} from '../headless/persistence';

interface UsePersistenceOptions {
  enabled: boolean;
  storageKey: string;
  agentTag: string;
  store: ChatStore;
  state: ChatState;
}

export function usePersistence(options: UsePersistenceOptions): void {
  const { enabled, storageKey, agentTag, store, state } = options;
  const key = persistenceKey(storageKey, agentTag);
  const restoredRef = useRef(false);
  const saverRef = useRef<ReturnType<typeof createDebouncedSaver> | null>(null);

  // Restore on mount
  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;

    const persisted = loadPersistedChat(key);
    if (persisted && persisted.messages.length > 0) {
      store.restoreState({
        threadId: persisted.threadId,
        messages: persisted.messages,
        toolCalls: persisted.toolCalls ?? {},
        toolCallOrder: persisted.toolCallOrder ?? [],
      });
    }
  }, [enabled, key, store]);

  // Create debounced saver
  useEffect(() => {
    if (!enabled) return;
    saverRef.current = createDebouncedSaver(key);
    return () => {
      saverRef.current?.flush();
      saverRef.current?.cancel();
      saverRef.current = null;
    };
  }, [enabled, key]);

  // Save on state changes (debounced)
  useEffect(() => {
    if (!enabled || !saverRef.current) return;
    if (state.messages.length === 0) return;

    // Don't save while streaming (save after completion)
    if (state.status === 'streaming') return;

    saverRef.current.save({
      threadId: state.threadId,
      messages: state.messages,
      toolCalls: state.toolCalls,
      toolCallOrder: state.toolCallOrder,
    });
  }, [enabled, state.status, state.messages, state.threadId, state.toolCalls, state.toolCallOrder]);
}

/** Hook to get a clear function for persistence */
export function useClearPersistence(
  storageKey: string,
  agentTag: string,
): () => void {
  const key = persistenceKey(storageKey, agentTag);
  return () => clearPersistedChat(key);
}
