/**
 * @mentiora/tracing-sdk
 *
 * SDK for sending agent traces to the Mentiora platform.
 */

export { MentioraTracing } from './client';
export {
  ConfigurationError,
  MentioraTracingError,
  NetworkError,
  ValidationError
} from './errors';
export type {
  Environment,
  MentioraTracingConfig,
  SendTraceResult,
  TraceError,
  TraceEvent,
  TraceType
} from './types';

