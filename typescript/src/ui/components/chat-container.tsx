/**
 * ChatContainer — Panel layout: header + messages + error + input.
 *
 * Composes the internal components into the standard chat panel layout.
 */

import React from 'react';

import { ChatHeader } from './chat-header';
import { ChatMessageList } from './chat-message-list';
import { ChatErrorBanner } from './chat-error-banner';
import { ChatInput } from './chat-input';
import { cn } from '../utils/cn';

interface ChatContainerProps {
  title?: string;
  greeting?: string;
  onClose?: () => void;
  className?: string;
}

export function ChatContainer(props: Readonly<ChatContainerProps>): React.ReactElement {
  const { title, greeting, onClose, className } = props;

  return (
    <div className={cn('mntr-container', className)}>
      <ChatHeader title={title} onClose={onClose} />
      {greeting && (
        <div className="mntr-greeting">
          <p className="mntr-greeting-text">{greeting}</p>
        </div>
      )}
      <ChatMessageList />
      <ChatErrorBanner />
      <div className="mntr-footer">
        <ChatInput />
      </div>
    </div>
  );
}
