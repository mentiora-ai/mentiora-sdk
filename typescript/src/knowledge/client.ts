/**
 * KnowledgeClient — manage knowledge bases and documents via the Mentiora API.
 */

import type { HttpClient } from '../http';
import type {
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
} from './types';

const KNOWLEDGE_PATH = '/api/v1/knowledge';

export class KnowledgeClient {
  constructor(private readonly httpClient: HttpClient) {}

  // ── Knowledge base CRUD ──

  /**
   * Create a knowledge base.
   */
  async create(params: CreateKnowledgeParams): Promise<CreateKnowledgeResult> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.description !== undefined) body.description = params.description;

    const response = await this.httpClient.post(KNOWLEDGE_PATH, body);
    const data = response.body as Record<string, unknown>;
    return { knowledgeId: data.knowledge_id as string };
  }

  /**
   * List knowledge bases with optional pagination.
   */
  async list(options?: PaginationOptions): Promise<ListKnowledgeResult> {
    const params: Record<string, string> = {};
    if (options?.offset !== undefined) params.offset = String(options.offset);
    if (options?.count !== undefined) params.count = String(options.count);

    const response = await this.httpClient.get(
      KNOWLEDGE_PATH,
      Object.keys(params).length > 0 ? params : undefined
    );
    const body = response.body as Record<string, unknown>;
    const rawData = body.data as Array<Record<string, unknown>>;
    return {
      data: rawData.map(mapKnowledgeSummary),
      totalCount: body.total_count as number,
    };
  }

  /**
   * Get knowledge base details.
   */
  async get(knowledgeId: string): Promise<KnowledgeDetails> {
    const response = await this.httpClient.get(`${KNOWLEDGE_PATH}/${knowledgeId}`);
    return mapKnowledgeDetails(response.body as Record<string, unknown>);
  }

  /**
   * Update a knowledge base.
   */
  async update(params: UpdateKnowledgeParams): Promise<KnowledgeDetails> {
    const body: Record<string, unknown> = { name: params.name };
    if (params.description !== undefined) body.description = params.description;

    const response = await this.httpClient.put(`${KNOWLEDGE_PATH}/${params.knowledgeId}`, body);
    return mapKnowledgeDetails(response.body as Record<string, unknown>);
  }

  /**
   * Delete a knowledge base.
   */
  async delete(knowledgeId: string): Promise<DeleteResult> {
    const response = await this.httpClient.delete(`${KNOWLEDGE_PATH}/${knowledgeId}`);
    const data = response.body as Record<string, unknown>;
    return { deleted: data.deleted as boolean };
  }

  // ── Document operations ──

  /**
   * Add documents to a knowledge base. Triggers async ingestion.
   */
  async addDocuments(params: AddDocumentsParams): Promise<AddDocumentsResult> {
    const response = await this.httpClient.post(
      `${KNOWLEDGE_PATH}/${params.knowledgeId}/documents`,
      { file_ids: params.fileIds }
    );
    const body = response.body as Record<string, unknown>;
    const rawDocs = body.documents as Array<Record<string, unknown>>;
    return { documents: rawDocs.map(mapDocumentSummary) };
  }

  /**
   * List documents in a knowledge base with optional pagination.
   */
  async listDocuments(
    knowledgeId: string,
    options?: PaginationOptions
  ): Promise<ListDocumentsResult> {
    const params: Record<string, string> = {};
    if (options?.offset !== undefined) params.offset = String(options.offset);
    if (options?.count !== undefined) params.count = String(options.count);

    const response = await this.httpClient.get(
      `${KNOWLEDGE_PATH}/${knowledgeId}/documents`,
      Object.keys(params).length > 0 ? params : undefined
    );
    const body = response.body as Record<string, unknown>;
    const rawData = body.data as Array<Record<string, unknown>>;
    return {
      data: rawData.map(mapDocumentSummary),
      totalCount: body.total_count as number,
    };
  }

  /**
   * Get document details. Useful for polling ingestion status.
   */
  async getDocument(knowledgeId: string, documentId: string): Promise<DocumentDetails> {
    const response = await this.httpClient.get(
      `${KNOWLEDGE_PATH}/${knowledgeId}/documents/${documentId}`
    );
    return mapDocumentDetails(response.body as Record<string, unknown>);
  }

  /**
   * Delete a document from a knowledge base.
   */
  async deleteDocument(knowledgeId: string, documentId: string): Promise<DeleteResult> {
    const response = await this.httpClient.delete(
      `${KNOWLEDGE_PATH}/${knowledgeId}/documents/${documentId}`
    );
    const data = response.body as Record<string, unknown>;
    return { deleted: data.deleted as boolean };
  }
}

function mapKnowledgeSummary(raw: Record<string, unknown>): KnowledgeSummary {
  return {
    knowledgeId: raw.knowledge_id as string,
    name: raw.name as string,
    description: (raw.description as string) ?? null,
    documentCount: raw.document_count as number,
    lastIngestedAt: (raw.last_ingested_at as string) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

function mapKnowledgeDetails(raw: Record<string, unknown>): KnowledgeDetails {
  return {
    ...mapKnowledgeSummary(raw),
    statusCounts: (raw.status_counts as Record<string, number>) ?? {},
  };
}

function mapDocumentSummary(raw: Record<string, unknown>): DocumentSummary {
  return {
    documentId: raw.document_id as string,
    knowledgeId: raw.knowledge_id as string,
    fileId: raw.file_id as string,
    filename: raw.filename as string,
    mimeType: raw.mime_type as string,
    fileSize: (raw.file_size as number) ?? null,
    status: raw.status as string,
    lastIngestedAt: (raw.last_ingested_at as string) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: (raw.updated_at as string) ?? null,
    parseError: (raw.parse_error as string) ?? null,
  };
}

function mapDocumentDetails(raw: Record<string, unknown>): DocumentDetails {
  return {
    ...mapDocumentSummary(raw),
    chunkCount: (raw.chunk_count as number) ?? null,
    averageChunkSize: (raw.average_chunk_size as number) ?? null,
    embeddingModel: (raw.embedding_model as string) ?? null,
  };
}
