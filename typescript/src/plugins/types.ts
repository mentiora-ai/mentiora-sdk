/**
 * Type definitions for plugin options.
 */

import type { MentioraClient } from '../client';

/**
 * Options for trackOpenAI plugin.
 */
export interface TrackOpenAIOptions {
  /** Mentiora client instance for sending traces */
  mentioraClient: MentioraClient;
  /** Optional thread/conversation ID (UUID v7) for grouping traces */
  threadId?: string;
  /** Optional tags to add to all traces */
  tags?: string[];
  /** Optional metadata to add to all traces */
  metadata?: Record<string, unknown>;
  /** Whether to capture input/output content in traces (default: true). Set to false for privacy. */
  captureContent?: boolean;
}

/**
 * Options for MentioraTracingLangChain callback handler.
 */
export interface MentioraTracingLangChainOptions {
  /** Mentiora client instance for sending traces */
  mentioraClient: MentioraClient;
  /** Optional thread/conversation ID (UUID v7) for grouping traces */
  threadId?: string;
  /** Optional tags to add to all traces */
  tags?: string[];
  /** Optional metadata to add to all traces */
  metadata?: Record<string, unknown>;
  /** Whether to capture input/output content in traces (default: true). Set to false for privacy. */
  captureContent?: boolean;
}
