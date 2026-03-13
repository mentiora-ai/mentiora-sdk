/**
 * Tests for KnowledgeClient.
 */

import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, HttpResponse } from '../../http';
import { KnowledgeClient } from '../client';

function createMockHttpClient(
  overrides: {
    post?: (path: string, body: unknown) => Promise<HttpResponse>;
    get?: (path: string, params?: Record<string, string>) => Promise<HttpResponse>;
    put?: (path: string, body: unknown) => Promise<HttpResponse>;
    delete?: (path: string, params?: Record<string, string>) => Promise<HttpResponse>;
  } = {}
): HttpClient {
  return {
    post: overrides.post ?? vi.fn(),
    get: overrides.get ?? vi.fn(),
    put: overrides.put ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
  } as unknown as HttpClient;
}

const KB_SUMMARY = {
  knowledge_id: 'kb-1',
  name: 'Test KB',
  description: 'A test knowledge base',
  document_count: 3,
  last_ingested_at: '2025-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const KB_DETAILS = {
  ...KB_SUMMARY,
  status_counts: { PENDING: 0, INGESTING: 0, READY: 3, FAILED: 0 },
};

const DOC_SUMMARY = {
  document_id: 'doc-1',
  knowledge_id: 'kb-1',
  file_id: 'file-1',
  filename: 'report.pdf',
  mime_type: 'application/pdf',
  file_size: 2048,
  status: 'PENDING',
  last_ingested_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  parse_error: null,
};

const DOC_DETAILS = {
  ...DOC_SUMMARY,
  chunk_count: 10,
  average_chunk_size: 500.0,
  embedding_model: 'text-embedding-3-small',
};

describe('KnowledgeClient', () => {
  describe('create()', () => {
    it('sends POST with name and description', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 201,
        body: { knowledge_id: 'kb-1' },
      });
      const client = new KnowledgeClient(createMockHttpClient({ post: postMock }));

      const result = await client.create({ name: 'My KB', description: 'desc' });

      expect(result.knowledgeId).toBe('kb-1');
      const [path, body] = postMock.mock.calls[0];
      expect(path).toBe('/api/v1/knowledge');
      expect(body).toEqual({ name: 'My KB', description: 'desc' });
    });

    it('omits description when not provided', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 201,
        body: { knowledge_id: 'kb-1' },
      });
      const client = new KnowledgeClient(createMockHttpClient({ post: postMock }));

      await client.create({ name: 'My KB' });
      const body = postMock.mock.calls[0][1];
      expect(body.description).toBeUndefined();
    });
  });

  describe('list()', () => {
    it('returns parsed summaries with total count', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { object: 'list', data: [KB_SUMMARY], total_count: 1 },
      });
      const client = new KnowledgeClient(createMockHttpClient({ get: getMock }));

      const result = await client.list();

      expect(result.data).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.data[0].knowledgeId).toBe('kb-1');
      expect(result.data[0].name).toBe('Test KB');
      expect(result.data[0].documentCount).toBe(3);
    });

    it('passes pagination params', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { object: 'list', data: [KB_SUMMARY], total_count: 5 },
      });
      const client = new KnowledgeClient(createMockHttpClient({ get: getMock }));

      const result = await client.list({ offset: 10, count: 5 });

      expect(result.totalCount).toBe(5);
      expect(getMock).toHaveBeenCalledWith('/api/v1/knowledge', { offset: '10', count: '5' });
    });
  });

  describe('get()', () => {
    it('returns knowledge details', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: KB_DETAILS,
      });
      const client = new KnowledgeClient(createMockHttpClient({ get: getMock }));

      const result = await client.get('kb-1');

      expect(result.knowledgeId).toBe('kb-1');
      expect(result.statusCounts).toEqual({ PENDING: 0, INGESTING: 0, READY: 3, FAILED: 0 });
      expect(getMock).toHaveBeenCalledWith('/api/v1/knowledge/kb-1');
    });
  });

  describe('update()', () => {
    it('sends PUT with name and description', async () => {
      const putMock = vi.fn().mockResolvedValue({
        status: 200,
        body: KB_DETAILS,
      });
      const client = new KnowledgeClient(createMockHttpClient({ put: putMock }));

      const result = await client.update({
        knowledgeId: 'kb-1',
        name: 'Updated KB',
        description: 'new desc',
      });

      expect(result.knowledgeId).toBe('kb-1');
      const [path, body] = putMock.mock.calls[0];
      expect(path).toBe('/api/v1/knowledge/kb-1');
      expect(body).toEqual({ name: 'Updated KB', description: 'new desc' });
    });
  });

  describe('delete()', () => {
    it('returns deletion result', async () => {
      const deleteMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { deleted: true },
      });
      const client = new KnowledgeClient(createMockHttpClient({ delete: deleteMock }));

      const result = await client.delete('kb-1');

      expect(result.deleted).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith('/api/v1/knowledge/kb-1');
    });
  });

  describe('addDocuments()', () => {
    it('sends file_ids and returns documents', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 201,
        body: { documents: [DOC_SUMMARY] },
      });
      const client = new KnowledgeClient(createMockHttpClient({ post: postMock }));

      const result = await client.addDocuments({
        knowledgeId: 'kb-1',
        fileIds: ['file-1'],
      });

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].documentId).toBe('doc-1');
      expect(result.documents[0].status).toBe('PENDING');

      const [path, body] = postMock.mock.calls[0];
      expect(path).toBe('/api/v1/knowledge/kb-1/documents');
      expect(body).toEqual({ file_ids: ['file-1'] });
    });
  });

  describe('listDocuments()', () => {
    it('returns document summaries with total count', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { object: 'list', data: [DOC_SUMMARY], total_count: 1 },
      });
      const client = new KnowledgeClient(createMockHttpClient({ get: getMock }));

      const result = await client.listDocuments('kb-1');

      expect(result.data).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.data[0].filename).toBe('report.pdf');
      expect(getMock).toHaveBeenCalledWith('/api/v1/knowledge/kb-1/documents', undefined);
    });

    it('passes pagination params', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { object: 'list', data: [], total_count: 0 },
      });
      const client = new KnowledgeClient(createMockHttpClient({ get: getMock }));

      await client.listDocuments('kb-1', { offset: 0, count: 10 });

      expect(getMock).toHaveBeenCalledWith('/api/v1/knowledge/kb-1/documents', {
        offset: '0',
        count: '10',
      });
    });
  });

  describe('getDocument()', () => {
    it('returns document details', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: DOC_DETAILS,
      });
      const client = new KnowledgeClient(createMockHttpClient({ get: getMock }));

      const result = await client.getDocument('kb-1', 'doc-1');

      expect(result.documentId).toBe('doc-1');
      expect(result.chunkCount).toBe(10);
      expect(result.embeddingModel).toBe('text-embedding-3-small');
      expect(getMock).toHaveBeenCalledWith('/api/v1/knowledge/kb-1/documents/doc-1');
    });
  });

  describe('deleteDocument()', () => {
    it('returns deletion result', async () => {
      const deleteMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { deleted: true },
      });
      const client = new KnowledgeClient(createMockHttpClient({ delete: deleteMock }));

      const result = await client.deleteDocument('kb-1', 'doc-1');

      expect(result.deleted).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith('/api/v1/knowledge/kb-1/documents/doc-1');
    });
  });
});
