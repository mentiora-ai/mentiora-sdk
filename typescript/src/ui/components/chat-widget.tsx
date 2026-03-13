/**
 * ChatWidget — Drop-in chat widget combining bubble + panel.
 *
 * This is the primary public API. Renders a floating trigger button (bubble)
 * that opens a chat panel, or an inline panel when position="inline".
 *
 * Focus trap when open, Escape to close.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MentioraClient } from '../../client';
import type { MentioraError } from '../../errors';
import type { ChatMessageData, SuggestionItem } from '../headless/types';
import { useChat } from '../hooks/use-chat';
import { MentioraChatProvider } from './provider';
import type { ChatContextValue, ToolCallRenderData } from './provider';
import { ChatContainer } from './chat-container';
import { ChatBubble } from './chat-bubble';
import { cn } from '../utils/cn';

// ── Theme Types ──

export interface ChatTheme {
  [key: `--mntr-${string}`]: string;
}

// ── Props ──

export interface ChatWidgetProps {
  client: MentioraClient;
  agentTag?: string;
  agentId?: string;

  // Appearance
  theme?: ChatTheme | 'light' | 'dark' | 'auto';
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  className?: string;
  style?: React.CSSProperties;

  // Behavior
  greeting?: string;
  suggestions?: SuggestionItem[];
  placeholder?: string;
  title?: string;
  persistHistory?: boolean;
  storageKey?: string;

  // Identity & metadata
  metadata?: Record<string, unknown>;
  endUserId?: string;

  // Trust & compliance
  disclosure?: string | React.ReactNode;
  feedbackEnabled?: boolean;
  onFeedback?: (rating: 'positive' | 'negative', threadId: string) => void;

  // Tool status
  toolLabels?: Record<string, string>;

  // Customization
  renderMessage?: (
    message: ChatMessageData,
    defaultRender: () => React.ReactElement,
  ) => React.ReactElement;
  renderToolResult?: (
    toolCall: ToolCallRenderData,
    defaultRender: () => React.ReactElement,
  ) => React.ReactElement;
  onMessage?: (message: ChatMessageData) => void;
  onError?: (error: MentioraError) => void;
  onThreadChange?: (threadId: string) => void;
}

export function ChatWidget(props: Readonly<ChatWidgetProps>): React.ReactElement {
  const {
    client,
    agentTag,
    agentId,
    theme = 'light',
    position = 'bottom-right',
    className,
    style,
    greeting,
    suggestions,
    placeholder,
    title,
    persistHistory,
    storageKey,
    metadata,
    endUserId,
    disclosure,
    toolLabels,
    renderMessage,
    renderToolResult,
    onMessage,
    onError,
    onThreadChange,
  } = props;

  const [isOpen, setIsOpen] = useState(position === 'inline');
  const panelRef = useRef<HTMLDivElement>(null);

  const chat = useChat({
    client,
    agentTag,
    agentId,
    metadata,
    endUserId,
    suggestions,
    persistHistory,
    storageKey,
    onMessage,
    onError,
    onThreadChange,
  });

  // Escape to close
  useEffect(() => {
    if (!isOpen || position === 'inline') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, position]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen || position === 'inline') return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    // Delay to avoid closing immediately on the bubble click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, position]);

  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleToggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Theme data attribute
  const themeAttr = useMemo(() => {
    if (typeof theme === 'string') return theme;
    return undefined;
  }, [theme]);

  // Theme CSS variable overrides
  const themeStyle = useMemo((): React.CSSProperties => {
    if (typeof theme === 'object') {
      return { ...style, ...theme } as React.CSSProperties;
    }
    return style ?? {};
  }, [theme, style]);

  // Build context value
  const contextValue = useMemo<ChatContextValue>(
    () => ({
      messages: chat.messages,
      toolCalls: chat.toolCalls,
      activeToolCall: chat.activeToolCall,
      activeToolCallCount: chat.activeToolCallCount,
      suggestions: chat.suggestions,
      status: chat.status,
      error: chat.error,
      threadId: chat.threadId,
      sendMessage: chat.sendMessage,
      stop: chat.stop,
      retry: chat.retry,
      reset: chat.reset,
      toolLabels,
      disclosure,
      renderMessage,
      renderToolResult,
    }),
    [chat, toolLabels, disclosure, renderMessage, renderToolResult],
  );

  const isInline = position === 'inline';

  return (
    <div
      className={cn('mntr-widget', className)}
      data-mntr-chat=""
      data-mntr-theme={themeAttr}
      data-mntr-position={position}
      style={themeStyle}
    >
      <MentioraChatProvider value={contextValue}>
        {/* Bubble trigger (not shown in inline mode) */}
        {!isInline && (
          <ChatBubble
            isOpen={isOpen}
            onClick={handleToggle}
            position={position}
          />
        )}

        {/* Chat panel */}
        {(isOpen || isInline) && (
          <div
            ref={panelRef}
            className={cn(
              'mntr-panel',
              isInline ? 'mntr-panel-inline' : 'mntr-panel-floating',
              position === 'bottom-left' && 'mntr-panel-left',
            )}
            role="dialog"
            aria-label="Chat"
          >
            <ChatContainer
              title={title}
              greeting={greeting}
              onClose={isInline ? undefined : handleClose}
            />
          </div>
        )}
      </MentioraChatProvider>
    </div>
  );
}
