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
  /** Optional tags to add to all traces */
  tags?: string[];
  /** Optional metadata to add to all traces */
  metadata?: Record<string, unknown>;
  /** Optional project ID override */
  projectId?: string;
}

/**
 * Options for MentioraTracingLangChain callback handler.
 */
export interface MentioraTracingLangChainOptions {
  /** Mentiora client instance for sending traces */
  mentioraClient: MentioraClient;
  /** Optional tags to add to all traces */
  tags?: string[];
  /** Optional metadata to add to all traces */
  metadata?: Record<string, unknown>;
  /** Optional project ID override */
  projectId?: string;
}
