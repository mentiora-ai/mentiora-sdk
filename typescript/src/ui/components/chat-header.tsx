/**
 * ChatHeader — Header with title, status indicator, and close/reset actions.
 */

import React from 'react';

import { useChatContext } from './provider';

interface ChatHeaderProps {
  title?: string;
  onClose?: () => void;
}

export function ChatHeader(props: Readonly<ChatHeaderProps>): React.ReactElement {
  const { title = 'Chat', onClose } = props;
  const { reset, disclosure } = useChatContext();

  return (
    <div className="mntr-header">
      <div className="mntr-header-left">
        <span className="mntr-header-title">{title}</span>
        {disclosure && <span className="mntr-header-disclosure">{disclosure}</span>}
      </div>
      <div className="mntr-header-actions">
        <button
          type="button"
          className="mntr-header-button"
          onClick={reset}
          aria-label="New conversation"
          title="New conversation"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
        </button>
        {onClose && (
          <button
            type="button"
            className="mntr-header-button"
            onClick={onClose}
            aria-label="Close chat"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
