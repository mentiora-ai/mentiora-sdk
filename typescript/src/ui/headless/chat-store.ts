/**
 * ChatStore — Framework-agnostic state machine for the chat UI.
 *
 * Consumes `client.agents.stream()` and manages messages, tool calls,
 * suggestions, and error state. Compatible with React's useSyncExternalStore
 * and any subscribe/getState pattern (Vue, Svelte, vanilla JS).
 */

import { v7 as uuidv7 } from 'uuid';

import type { MentioraClient } from '../../client';
import { MentioraError, NetworkError } from '../../errors';
import type { AgentStreamEvent } from '../../agents/types';
import type {
  ActiveToolCallInfo,
  ChatConfig,
  ChatMessageData,
  ChatState,
  ChatStatus,
  SuggestionItem,
  ToolCallData,
} from './types';

// ── Helpers ──

function createInitialState(threadId?: string): ChatState {
  return {
    status: 'idle',
    messages: [],
    toolCalls: {},
    toolCallOrder: [],
    activeToolCall: null,
    activeToolCallCount: 0,
    suggestions: [],
    error: null,
    threadId: threadId ?? uuidv7(),
    lastUserMessage: null,
  };
}

/**
 * Derive the active tool call info from the tool calls map.
 * Handles parallel tool calls: shows first tool label, or "Running N tasks..."
 * when multiple are in-flight.
 */
function deriveActiveToolCall(
  toolCalls: Record<string, ToolCallData>,
): { info: ActiveToolCallInfo | null; count: number } {
  const inProgress = Object.values(toolCalls).filter((tc) => tc.status === 'started');
  if (inProgress.length === 0) {
    return { info: null, count: 0 };
  }
  return {
    info: { toolName: inProgress[0].toolName, status: 'in_progress' },
    count: inProgress.length,
  };
}

// ── Store ──

type Listener = () => void;

export class ChatStore {
  private state: ChatState;
  private listeners = new Set<Listener>();
  private client: MentioraClient;
  private config: ChatConfig;
  private abortController: AbortController | null = null;
  private streamGenerator: AsyncGenerator<AgentStreamEvent> | null = null;

  constructor(config: ChatConfig) {
    this.config = config;
    this.client = config.client;
    this.state = createInitialState(config.threadId);
  }

  // ── Public API ──

  getState = (): ChatState => {
    return this.state;
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  sendMessage = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed || this.state.status === 'streaming') return;

    // Abort any previous stream
    this.abortStream();

    const userMessageId = `user-${uuidv7()}`;
    const userMessage: ChatMessageData = {
      id: userMessageId,
      role: 'user',
      content: trimmed,
    };

    this.setState((prev) => ({
      ...prev,
      status: 'streaming',
      error: null,
      lastUserMessage: trimmed,
      suggestions: [], // Clear suggestions on new message
      messages: [...prev.messages, userMessage],
    }));

    this.config.onMessage?.(userMessage);
    this.consumeStream(trimmed);
  };

  stop = (): void => {
    this.abortStream();

    // Keep partial message, transition to idle
    this.setState((prev) => {
      const messages = prev.messages.map((msg) =>
        msg.isStreaming ? { ...msg, isStreaming: false } : msg,
      );
      return { ...prev, status: 'idle', messages };
    });
  };

  retry = (): void => {
    const lastMessage = this.state.lastUserMessage;
    if (!lastMessage) return;

    // Abort any previous stream
    this.abortStream();

    this.setState((prev) => ({
      ...prev,
      status: 'streaming',
      error: null,
    }));

    this.consumeStream(lastMessage);
  };

  reset = (): void => {
    this.abortStream();
    const newThreadId = uuidv7();
    this.state = createInitialState(newThreadId);
    this.notify();
    this.config.onThreadChange?.(newThreadId);
  };

  clearHistory = (): void => {
    this.reset();
  };

  /**
   * Replace state wholesale — used by persistence to restore from localStorage.
   */
  restoreState(partial: Partial<ChatState>): void {
    this.setState((prev) => ({ ...prev, ...partial }));
  }

  destroy = (): void => {
    this.abortStream();
    this.listeners.clear();
  };

  // ── Internal ──

  private setState(updater: (prev: ChatState) => ChatState): void {
    this.state = updater(this.state);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private abortStream(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.streamGenerator = null;
  }

  private async consumeStream(message: string): Promise<void> {
    const controller = new AbortController();
    this.abortController = controller;

    const params = {
      message,
      ...(this.config.agentTag && { tag: this.config.agentTag }),
      ...(this.config.agentId && { agentId: this.config.agentId }),
      ...(this.state.threadId && { threadId: this.state.threadId }),
      ...(this.config.metadata && { metadata: this.config.metadata }),
      ...(this.config.endUserId && { endUserId: this.config.endUserId }),
    };

    try {
      const generator = this.client.agents.stream(params);
      this.streamGenerator = generator;

      for await (const event of generator) {
        if (controller.signal.aborted) break;
        this.handleEvent(event);
      }

      // Stream completed normally
      if (!controller.signal.aborted) {
        this.setState((prev) => {
          // Finalize any streaming assistant message
          const messages = prev.messages.map((msg) =>
            msg.isStreaming ? { ...msg, isStreaming: false } : msg,
          );
          return {
            ...prev,
            status: prev.status === 'error' ? 'error' : 'idle',
            messages,
            activeToolCall: null,
            activeToolCallCount: 0,
          };
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;

      const error =
        err instanceof MentioraError
          ? err
          : new NetworkError(
              err instanceof Error ? err.message : 'Stream failed',
            );

      this.setState((prev) => ({
        ...prev,
        status: 'error',
        error: {
          code: error instanceof NetworkError ? (error.serverCode ?? 'NETWORK_ERROR') : error.code,
          message: error.message,
        },
        activeToolCall: null,
        activeToolCallCount: 0,
        // Keep partial messages — finalize streaming flag
        messages: prev.messages.map((msg) =>
          msg.isStreaming ? { ...msg, isStreaming: false } : msg,
        ),
      }));

      this.config.onError?.(error);
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
        this.streamGenerator = null;
      }
    }
  }

  private handleEvent(event: AgentStreamEvent): void {
    switch (event.type) {
      case 'agent_resolved':
        this.handleAgentResolved(event);
        break;
      case 'output_text_delta':
        this.handleOutputDelta(event);
        break;
      case 'tool_call_delta':
        this.handleToolCallDelta(event);
        break;
      case 'tool_call_result':
        this.handleToolCallResult(event);
        break;
      case 'suggestions':
        this.handleSuggestions(event);
        break;
      case 'chat_completed':
        this.handleChatCompleted(event);
        break;
      case 'error':
        this.handleError(event);
        break;
    }
  }

  private handleAgentResolved(event: Extract<AgentStreamEvent, { type: 'agent_resolved' }>): void {
    const prevThreadId = this.state.threadId;
    this.setState((prev) => ({
      ...prev,
      threadId: event.threadId,
    }));
    if (event.threadId !== prevThreadId) {
      this.config.onThreadChange?.(event.threadId);
    }
  }

  private handleOutputDelta(event: Extract<AgentStreamEvent, { type: 'output_text_delta' }>): void {
    this.setState((prev) => {
      const messages = [...prev.messages];
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.role === 'assistant' && lastMessage.isStreaming) {
        // Append to existing streaming message
        messages[messages.length - 1] = {
          ...lastMessage,
          content: `${lastMessage.content}${event.delta}`,
        };
      } else {
        // Create new assistant message
        const newMsg: ChatMessageData = {
          id: `assistant-${uuidv7()}`,
          role: 'assistant',
          content: event.delta,
          isStreaming: true,
        };
        messages.push(newMsg);
      }

      return {
        ...prev,
        messages,
        // Clear active tool call when text starts streaming
        activeToolCall: null,
        activeToolCallCount: 0,
      };
    });
  }

  private handleToolCallDelta(
    event: Extract<AgentStreamEvent, { type: 'tool_call_delta' }>,
  ): void {
    this.setState((prev) => {
      const nextToolCalls = { ...prev.toolCalls };
      const existing = nextToolCalls[event.toolCallId];
      const toolName = event.name || existing?.toolName || 'tool_call';
      const combinedArguments = `${existing?.argumentsAccumulated ?? ''}${event.argumentsDelta ?? ''}`;

      nextToolCalls[event.toolCallId] = {
        toolCallId: event.toolCallId,
        toolName,
        status: 'started',
        argumentsAccumulated: combinedArguments,
        result: existing?.result,
        errorMessage: existing?.errorMessage,
      };

      const nextOrder = existing
        ? prev.toolCallOrder
        : [...prev.toolCallOrder, event.toolCallId];

      const { info, count } = deriveActiveToolCall(nextToolCalls);

      return {
        ...prev,
        toolCalls: nextToolCalls,
        toolCallOrder: nextOrder,
        activeToolCall: info,
        activeToolCallCount: count,
      };
    });
  }

  private handleToolCallResult(
    event: Extract<AgentStreamEvent, { type: 'tool_call_result' }>,
  ): void {
    this.setState((prev) => {
      const nextToolCalls = { ...prev.toolCalls };
      const existing = nextToolCalls[event.toolCallId];

      nextToolCalls[event.toolCallId] = {
        toolCallId: event.toolCallId,
        toolName: event.name || existing?.toolName || 'tool_call',
        status: 'result',
        argumentsAccumulated:
          typeof event.arguments === 'string'
            ? event.arguments
            : (existing?.argumentsAccumulated ?? ''),
        result: event.result,
        errorMessage: undefined,
      };

      const nextOrder = existing
        ? prev.toolCallOrder
        : [...prev.toolCallOrder, event.toolCallId];

      const { info, count } = deriveActiveToolCall(nextToolCalls);

      return {
        ...prev,
        toolCalls: nextToolCalls,
        toolCallOrder: nextOrder,
        activeToolCall: info,
        activeToolCallCount: count,
      };
    });
  }

  private handleSuggestions(event: Extract<AgentStreamEvent, { type: 'suggestions' }>): void {
    this.setState((prev) => ({
      ...prev,
      suggestions: event.suggestions,
    }));
  }

  private handleChatCompleted(
    event: Extract<AgentStreamEvent, { type: 'chat_completed' }>,
  ): void {
    this.setState((prev) => {
      const messages = [...prev.messages];

      // Finalize assistant message with completed output
      if (event.output) {
        let updated = false;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            messages[i] = {
              ...messages[i],
              content: event.output,
              isStreaming: false,
            };
            updated = true;
            break;
          }
        }
        if (!updated) {
          messages.push({
            id: `assistant-${uuidv7()}`,
            role: 'assistant',
            content: event.output,
            isStreaming: false,
          });
        }
      } else {
        // Clear streaming flag
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && messages[i].isStreaming) {
            messages[i] = { ...messages[i], isStreaming: false };
            break;
          }
        }
      }

      // Notify about the final assistant message
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        this.config.onMessage?.(lastAssistant);
      }

      return {
        ...prev,
        threadId: event.threadId || prev.threadId,
        status: event.status === 'failed' ? 'error' : 'idle',
        messages,
        activeToolCall: null,
        activeToolCallCount: 0,
        error:
          event.status === 'failed'
            ? { code: 'AGENT_FAILED', message: 'Agent execution failed' }
            : null,
      };
    });
  }

  private handleError(event: Extract<AgentStreamEvent, { type: 'error' }>): void {
    this.setState((prev) => ({
      ...prev,
      status: 'error',
      error: { code: event.code, message: event.message },
      activeToolCall: null,
      activeToolCallCount: 0,
      // Mark in-progress tool calls as errored
      toolCalls: Object.fromEntries(
        Object.entries(prev.toolCalls).map(([id, tc]) => [
          id,
          tc.status === 'started'
            ? { ...tc, status: 'error' as const, errorMessage: event.message }
            : tc,
        ]),
      ),
    }));

    this.config.onError?.(new NetworkError(event.message));
  }
}

export { createInitialState };
