/**
 * ChatMessage — Single message bubble.
 *
 * User messages: right-aligned, primary background.
 * Assistant messages: left-aligned, muted background with markdown rendering.
 * Entry animation: fade-in slide-up 300ms.
 */

import React, { useMemo } from 'react';

import type { ChatMessageData } from '../headless/types';
import { renderMarkdown } from '../utils/markdown';
import { cn } from '../utils/cn';

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage(props: Readonly<ChatMessageProps>): React.ReactElement {
  const { message } = props;
  const isUser = message.role === 'user';

  const renderedContent = useMemo(() => {
    if (isUser) return null;
    return renderMarkdown(message.content);
  }, [isUser, message.content]);

  return (
    <div
      className={cn(
        'mntr-message',
        isUser ? 'mntr-message-user' : 'mntr-message-assistant',
        'mntr-animate-in',
      )}
      aria-label={isUser ? 'You said' : 'Assistant replied'}
    >
      <div
        className={cn(
          'mntr-message-bubble',
          isUser ? 'mntr-message-bubble-user' : 'mntr-message-bubble-assistant',
        )}
      >
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <div
            className="mntr-prose"
            dangerouslySetInnerHTML={{ __html: renderedContent ?? '' }}
          />
        )}
        {message.isStreaming && (
          <span className="mntr-streaming-cursor" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
