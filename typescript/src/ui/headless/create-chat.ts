/**
 * createChat — Headless adapter for non-React usage (Vue, Svelte, vanilla JS).
 *
 * Usage:
 * ```ts
 * const chat = createChat({ client, agentTag: 'support' });
 * chat.subscribe((state) => { ... });
 * chat.sendMessage('Hello');
 * ```
 */

import type { ChatConfig, ChatInstance, ChatState } from './types';
import { ChatStore } from './chat-store';

export function createChat(config: ChatConfig): ChatInstance {
  const store = new ChatStore(config);

  return {
    getState: store.getState,

    subscribe(listener: (state: ChatState) => void): () => void {
      // Wrap the listener to pass state (ChatStore uses bare () => void listeners)
      return store.subscribe(() => {
        listener(store.getState());
      });
    },

    sendMessage: store.sendMessage,
    stop: store.stop,
    retry: store.retry,
    reset: store.reset,
    destroy: store.destroy,
  };
}
