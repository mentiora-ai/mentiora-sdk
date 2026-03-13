/**
 * Persistence — localStorage adapter for chat history.
 *
 * Display-only: messages restored from localStorage are shown in the UI
 * but never sent to the LLM. Server-side history injection handles context.
 *
 * Key format: `mntr-chat-{storageKey}-{agentTag}`
 * Schema versioning with migration support.
 * FIFO eviction at 200 messages.
 * Debounced save (500ms).
 */

import type { ChatMessageData, PersistedChatData, ToolCallData } from './types';

const CURRENT_SCHEMA_VERSION = 1;
const MAX_MESSAGES = 200;
const SAVE_DEBOUNCE_MS = 500;

type MigrationFn = (data: unknown) => PersistedChatData;
const migrations: Record<number, MigrationFn> = {};

/** Safely access localStorage — returns null in Node.js or when unavailable. */
function getStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

// ── Key Generation ──

export function persistenceKey(storageKey: string, agentTag: string): string {
  return `mntr-chat-${storageKey}-${agentTag}`;
}

// ── Load ──

export function loadPersistedChat(key: string): PersistedChatData | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedChatData;

    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.schemaVersion !== 'number') return null;

    // Version mismatch handling
    if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
      // Downgrade not supported — discard
      storage.removeItem(key);
      return null;
    }

    if (parsed.schemaVersion < CURRENT_SCHEMA_VERSION) {
      const migrationFn = migrations[parsed.schemaVersion];
      if (migrationFn) {
        return migrationFn(parsed);
      }
      // No migration — discard old data
      storage.removeItem(key);
      return null;
    }

    // Validate required fields
    if (typeof parsed.threadId !== 'string') return null;
    if (!Array.isArray(parsed.messages)) return null;

    return parsed;
  } catch {
    return null;
  }
}

// ── Save ──

export function savePersistedChat(
  key: string,
  data: {
    threadId: string;
    messages: ChatMessageData[];
    toolCalls: Record<string, ToolCallData>;
    toolCallOrder: string[];
  },
): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    // FIFO eviction: keep only the last MAX_MESSAGES
    const messages =
      data.messages.length > MAX_MESSAGES
        ? data.messages.slice(-MAX_MESSAGES)
        : data.messages;

    const persisted: PersistedChatData = {
      threadId: data.threadId,
      messages,
      toolCalls: data.toolCalls,
      toolCallOrder: data.toolCallOrder,
      timestamp: Date.now(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };

    storage.setItem(key, JSON.stringify(persisted));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ── Clear ──

export function clearPersistedChat(key: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Silently ignore
  }
}

// ── Debounced Saver ──

export function createDebouncedSaver(key: string): {
  save: (data: Parameters<typeof savePersistedChat>[1]) => void;
  flush: () => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingData: Parameters<typeof savePersistedChat>[1] | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingData) {
      savePersistedChat(key, pendingData);
      pendingData = null;
    }
  };

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingData = null;
  };

  const save = (data: Parameters<typeof savePersistedChat>[1]) => {
    pendingData = data;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  return { save, flush, cancel };
}
