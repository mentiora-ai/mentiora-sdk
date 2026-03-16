/**
 * Knowledge request and response types.
 */

export interface CreateKnowledgeParams {
  name: string;
  description?: string;
}

export interface UpdateKnowledgeParams {
  knowledgeId: string;
  name: string;
  description?: string;
}

export interface AddDocumentsParams {
  knowledgeId: string;
  fileIds: string[];
}

export interface KnowledgeSummary {
  knowledgeId: string;
  name: string;
  description: string | null;
  documentCount: number;
  lastIngestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDetails {
  knowledgeId: string;
  name: string;
  description: string | null;
  documentCount: number;
  lastIngestedAt: string | null;
  statusCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKnowledgeResult {
  knowledgeId: string;
}

export interface DocumentSummary {
  documentId: string;
  knowledgeId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  fileSize: number | null;
  status: string;
  lastIngestedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  parseError: string | null;
}

export interface DocumentDetails extends DocumentSummary {
  chunkCount: number | null;
  averageChunkSize: number | null;
  embeddingModel: string | null;
}

export interface AddDocumentsResult {
  documents: DocumentSummary[];
}

export interface ListDocumentsResult {
  data: DocumentSummary[];
  totalCount: number;
}

export interface PaginationOptions {
  offset?: number;
  count?: number;
}

export interface ListKnowledgeResult {
  data: KnowledgeSummary[];
  totalCount: number;
}

export interface DeleteResult {
  deleted: boolean;
}
