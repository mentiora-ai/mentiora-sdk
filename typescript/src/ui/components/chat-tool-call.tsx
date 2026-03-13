/**
 * ChatToolCall — Tool call result display.
 *
 * Three states: started (spinner), result (rendered), error (red card).
 * Supports renderToolResult prop for custom rendering with graceful fallback.
 */

import React from 'react';

import type { ToolCallData } from '../headless/types';
import { useChatContext } from './provider';
import { cn } from '../utils/cn';

interface ChatToolCallProps {
  toolCall: ToolCallData;
}

export function ChatToolCall(props: Readonly<ChatToolCallProps>): React.ReactElement {
  const { toolCall } = props;
  const { renderToolResult } = useChatContext();

  const defaultRender = (): React.ReactElement => {
    switch (toolCall.status) {
      case 'started':
        return (
          <div className="mntr-tool-call mntr-tool-call-started">
            <span className="mntr-tool-spinner" aria-hidden="true" />
            <span className="mntr-tool-call-name">{toolCall.toolName}</span>
          </div>
        );
      case 'result':
        return (
          <div className="mntr-tool-call mntr-tool-call-result">
            <span className="mntr-tool-call-check" aria-hidden="true">
              ✓
            </span>
            <span className="mntr-tool-call-name">{toolCall.toolName}</span>
          </div>
        );
      case 'error':
        return (
          <div className="mntr-tool-call mntr-tool-call-error" role="alert">
            <span className="mntr-tool-call-error-icon" aria-hidden="true">
              ✕
            </span>
            <span className="mntr-tool-call-name">{toolCall.toolName}</span>
            {toolCall.errorMessage && (
              <span className="mntr-tool-call-error-msg">{toolCall.errorMessage}</span>
            )}
          </div>
        );
    }
  };

  if (renderToolResult) {
    try {
      return renderToolResult(
        {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          status: toolCall.status,
          result: toolCall.result,
          errorMessage: toolCall.errorMessage,
        },
        defaultRender,
      );
    } catch {
      // Graceful fallback on render error
      return defaultRender();
    }
  }

  return defaultRender();
}
