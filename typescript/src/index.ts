/**
 * @mentiora.ai/sdk
 *
 * Official SDK for the Mentiora platform.
 * Provides AI observability and tracing.
 */

export { AgentsClient } from './agents';
export type {
  AgentErrorEvent,
  AgentResolvedEvent,
  AgentRunParams,
  AgentRunResult,
  AgentStreamEvent,
  AgentToolCall,
  ChatCompletedEvent,
  ModelParams,
  OutputTextDeltaEvent,
  SuggestionsEvent,
  ToolCallDeltaEvent,
  ToolCallResultEvent,
} from './agents';
export { MentioraClient } from './client';
export type { SdkMode } from './client';
export { FilesClient } from './files';
export type {
  DeleteFileResult,
  FileMetadata as SdkFileMetadata,
  ListFilesResult,
  UploadFileParams,
  UploadFileResult,
} from './files';
export { KnowledgeClient } from './knowledge';
export type {
  AddDocumentsParams,
  AddDocumentsResult,
  CreateKnowledgeParams,
  CreateKnowledgeResult,
  DeleteResult,
  DocumentDetails,
  DocumentSummary,
  KnowledgeDetails,
  KnowledgeSummary,
  ListDocumentsResult,
  ListKnowledgeResult,
  PaginationOptions,
  UpdateKnowledgeParams,
} from './knowledge';
export { createStreamResponse, SSE_HEADERS } from './streaming';
export type { CreateStreamResponseOptions } from './streaming';
export { ConfigurationError, MentioraError, NetworkError, ValidationError } from './errors';
export type {
  MentioraBrowserConfig,
  MentioraConfig,
  MentioraServerConfig,
  SendTraceResult,
  TraceError,
  TraceEvent,
  TraceType,
  UsageInfo,
} from './types';
