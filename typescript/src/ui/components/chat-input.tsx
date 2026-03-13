/**
 * ChatInput — Text input with send/stop button.
 *
 * Enter to send, Shift+Enter for newline (if textarea mode).
 * Send button becomes Stop button during streaming.
 * enterKeyHint="send" on mobile.
 */

import React, { useCallback, useRef, useState } from 'react';

import { useChatContext } from './provider';
import { cn } from '../utils/cn';

export function ChatInput(): React.ReactElement {
  const { sendMessage, stop, status } = useChatContext();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isStreaming = status === 'streaming';

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setValue('');
    inputRef.current?.focus();
  }, [value, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleButtonClick = useCallback(() => {
    if (isStreaming) {
      stop();
    } else {
      handleSubmit();
    }
  }, [isStreaming, stop, handleSubmit]);

  return (
    <div className="mntr-input-container">
      <input
        ref={inputRef}
        type="text"
        className="mntr-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        aria-label="Type a message"
        enterKeyHint="send"
        spellCheck="false"
        autoComplete="off"
        disabled={isStreaming}
      />
      <button
        type="button"
        className={cn(
          'mntr-send-button',
          isStreaming && 'mntr-stop-button',
        )}
        onClick={handleButtonClick}
        aria-label={isStreaming ? 'Stop' : 'Send message'}
        disabled={!isStreaming && !value.trim()}
      >
        {isStreaming ? (
          <StopIcon />
        ) : (
          <SendIcon />
        )}
      </button>
    </div>
  );
}

// ── Inline SVG Icons ──

function SendIcon(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
}

function StopIcon(): React.ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
