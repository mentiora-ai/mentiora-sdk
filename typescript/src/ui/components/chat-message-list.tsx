/**
 * ChatMessageList — Scrollable message area with smart scroll behavior.
 *
 * role="log" aria-live="polite" for accessibility.
 * Wires use-scroll.ts for pinned mode and "New messages" pill.
 */

import React, { useMemo } from 'react';

import { useChatContext } from './provider';
import { ChatMessage } from './chat-message';
import { ChatToolCall } from './chat-tool-call';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { ChatSuggestionChips } from './chat-suggestion-chips';
import { useScroll } from '../hooks/use-scroll';

export function ChatMessageList(): React.ReactElement {
  const ctx = useChatContext();
  const { messages, toolCalls, status } = ctx;

  const isLatestMessageFromUser = useMemo(() => {
    if (messages.length === 0) return false;
    return messages[messages.length - 1].role === 'user';
  }, [messages]);

  const { scrollRef, showNewMessagesPill, scrollToBottom } = useScroll({
    messageCount: messages.length,
    isLatestMessageFromUser,
  });

  const hasMessages = messages.length > 0 || toolCalls.length > 0;

  return (
    <div className="mntr-message-list-wrapper">
      <div
        ref={scrollRef}
        className="mntr-message-list"
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {!hasMessages && (
          <div className="mntr-empty-state">
            <p className="mntr-empty-state-text">Send a message to start the conversation.</p>
          </div>
        )}

        {messages.map((message) => {
          const messageEl = <ChatMessage key={message.id} message={message} />;

          if (ctx.renderMessage) {
            return ctx.renderMessage(message, () => messageEl);
          }
          return messageEl;
        })}

        {/* Tool calls displayed inline */}
        {toolCalls.map((tc) => (
          <ChatToolCall key={tc.toolCallId} toolCall={tc} />
        ))}

        {/* Typing indicator / tool status */}
        {status === 'streaming' && <ChatTypingIndicator />}

        {/* Suggestion chips below last assistant message */}
        <ChatSuggestionChips />
      </div>

      {/* "New messages" pill */}
      {showNewMessagesPill && (
        <button
          type="button"
          className="mntr-new-messages-pill"
          onClick={scrollToBottom}
          aria-label="Scroll to new messages"
        >
          ↓ New messages
        </button>
      )}
    </div>
  );
}
