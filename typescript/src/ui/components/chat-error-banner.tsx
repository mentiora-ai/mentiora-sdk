/**
 * ChatErrorBanner — Error display with retry button.
 *
 * Network error: red banner with "Retry" button.
 * Offline: "Please check your connection" (no retry button).
 * role="alert" for screen readers.
 */

import React from 'react';

import { useChatContext } from './provider';

export function ChatErrorBanner(): React.ReactElement | null {
  const { error, status, retry } = useChatContext();

  if (status !== 'error' || !error) return null;

  const isOffline =
    typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine;

  return (
    <div className="mntr-error-banner" role="alert">
      <div className="mntr-error-content">
        <span className="mntr-error-icon" aria-hidden="true">
          ⚠
        </span>
        <span className="mntr-error-text">
          {isOffline
            ? 'Please check your internet connection.'
            : error.message || 'Something went wrong.'}
        </span>
      </div>
      {!isOffline && (
        <button
          type="button"
          className="mntr-error-retry"
          onClick={retry}
          aria-label="Retry"
        >
          Retry
        </button>
      )}
    </div>
  );
}
