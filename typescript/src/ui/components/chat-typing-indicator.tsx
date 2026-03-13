/**
 * ChatTypingIndicator — Animated dots + tool status label.
 *
 * Shows generic thinking dots before any tool call.
 * Shows tool-specific label + spinner during tool calls.
 * Debounce 150ms to avoid flash on fast tools.
 * role="status" aria-live="polite".
 */

import React, { useEffect, useState } from 'react';

import { useChatContext } from './provider';
import { getParallelToolLabel } from '../utils/tool-labels';

const DEBOUNCE_MS = 150;

export function ChatTypingIndicator(): React.ReactElement {
  const { activeToolCall, activeToolCallCount, toolLabels, status } = useChatContext();

  // Debounce tool status to avoid flash on fast tools
  const [debouncedToolLabel, setDebouncedToolLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!activeToolCall) {
      setDebouncedToolLabel(null);
      return;
    }

    const label = getParallelToolLabel(
      activeToolCallCount,
      activeToolCall.toolName,
      toolLabels,
    );

    // If label is empty string, the tool is hidden
    if (!label) {
      setDebouncedToolLabel(null);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedToolLabel(label);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [activeToolCall, activeToolCallCount, toolLabels]);

  if (status !== 'streaming') return <></>;

  return (
    <div className="mntr-typing-indicator" role="status" aria-live="polite">
      {debouncedToolLabel ? (
        <div className="mntr-tool-status">
          <span className="mntr-tool-spinner" aria-hidden="true" />
          <span className="mntr-tool-label">{debouncedToolLabel}</span>
        </div>
      ) : (
        <div className="mntr-typing-dots" aria-label="Assistant is thinking">
          <span className="mntr-dot" />
          <span className="mntr-dot" />
          <span className="mntr-dot" />
        </div>
      )}
    </div>
  );
}
