/**
 * ChatSuggestionChips — Suggestion pills below the last assistant message.
 *
 * Initial suggestions from props (empty state only).
 * Server-provided follow-ups from chat.suggestions event.
 * Only shown when suggestions are available.
 * Click → sendMessage(chip.message).
 * role="group" aria-label="Suggested replies".
 */

import React, { useCallback } from 'react';

import { useChatContext } from './provider';

export function ChatSuggestionChips(): React.ReactElement | null {
  const { suggestions, sendMessage, status } = useChatContext();

  const handleClick = useCallback(
    (message: string) => {
      sendMessage(message);
    },
    [sendMessage],
  );

  if (!suggestions || suggestions.length === 0) return null;
  if (status === 'streaming') return null;

  return (
    <div
      className="mntr-suggestion-chips"
      role="group"
      aria-label="Suggested replies"
    >
      {suggestions.map((suggestion) => (
        <button
          key={`${suggestion.label}-${suggestion.message}`}
          type="button"
          className="mntr-suggestion-chip"
          onClick={() => handleClick(suggestion.message)}
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
