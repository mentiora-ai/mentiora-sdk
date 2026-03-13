/**
 * ChatBubble — Floating trigger button.
 *
 * 44×44px minimum touch target.
 * aria-label="Open chat" aria-expanded.
 */

import React from 'react';

import { cn } from '../utils/cn';

interface ChatBubbleProps {
  isOpen: boolean;
  onClick: () => void;
  position: 'bottom-right' | 'bottom-left';
}

export function ChatBubble(props: Readonly<ChatBubbleProps>): React.ReactElement {
  const { isOpen, onClick, position } = props;

  return (
    <button
      type="button"
      className={cn(
        'mntr-bubble',
        position === 'bottom-left' ? 'mntr-bubble-left' : 'mntr-bubble-right',
      )}
      onClick={onClick}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
      aria-expanded={isOpen}
    >
      {isOpen ? (
        <svg
          width="24"
          height="24"
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
      ) : (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
    </button>
  );
}
