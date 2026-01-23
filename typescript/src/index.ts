/**
 * @mentiora/sdk
 *
 * Official SDK for the Mentiora platform.
 * Provides access to tracing, vector DB, and other platform features.
 */

export { MentioraClient } from './client';
export {
  ConfigurationError,
  MentioraError,
  NetworkError,
  ValidationError
} from './errors';
export type {
  Environment,
  MentioraConfig,
  SendTraceResult,
  TraceError,
  TraceEvent,
  TraceType
} from './types';
export { trackOpenAI, MentioraTracingLangChain } from './plugins';
export type {
  TrackOpenAIOptions,
  MentioraTracingLangChainOptions
} from './plugins/types';
