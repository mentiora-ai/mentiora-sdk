/**
 * Tests for FilesClient.
 */

import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, HttpResponse } from '../../http';
import { FilesClient } from '../client';

function createMockHttpClient(
  overrides: {
    post?: (path: string, body: unknown) => Promise<HttpResponse>;
    get?: (path: string, params?: Record<string, string>) => Promise<HttpResponse>;
    delete?: (path: string, params?: Record<string, string>) => Promise<HttpResponse>;
  } = {}
): HttpClient {
  return {
    post: overrides.post ?? vi.fn(),
    get: overrides.get ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
  } as unknown as HttpClient;
}

const FILE_METADATA_RESPONSE = {
  file_id: 'file-123',
  filename: 'test.pdf',
  mime_type: 'application/pdf',
  size: 1024,
  description: 'A test file',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('FilesClient', () => {
  describe('upload()', () => {
    it('sends POST with base64-encoded content', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 201,
        body: { file_id: 'file-123' },
      });
      const client = new FilesClient(createMockHttpClient({ post: postMock }));

      const result = await client.upload({
        filename: 'test.txt',
        content: new TextEncoder().encode('hello world'),
        mimeType: 'text/plain',
      });

      expect(result.fileId).toBe('file-123');
      expect(postMock).toHaveBeenCalledOnce();
      const [path, body] = postMock.mock.calls[0];
      expect(path).toBe('/api/v1/files');
      expect(body.filename).toBe('test.txt');
      expect(body.mime_type).toBe('text/plain');
      expect(typeof body.content).toBe('string'); // base64
      expect(body.description).toBeUndefined();
    });

    it('includes description when provided', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 201,
        body: { file_id: 'file-123' },
      });
      const client = new FilesClient(createMockHttpClient({ post: postMock }));

      await client.upload({
        filename: 'doc.pdf',
        content: Buffer.from('pdf'),
        mimeType: 'application/pdf',
        description: 'Important doc',
      });

      const body = postMock.mock.calls[0][1];
      expect(body.description).toBe('Important doc');
    });
  });

  describe('list()', () => {
    it('returns parsed file metadata', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: {
          object: 'list',
          data: [FILE_METADATA_RESPONSE],
          total_count: 1,
        },
      });
      const client = new FilesClient(createMockHttpClient({ get: getMock }));

      const result = await client.list();

      expect(result.data).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.data[0].fileId).toBe('file-123');
      expect(result.data[0].filename).toBe('test.pdf');
      expect(getMock).toHaveBeenCalledWith('/api/v1/files', undefined);
    });

    it('passes query params', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { object: 'list', data: [], total_count: 0 },
      });
      const client = new FilesClient(createMockHttpClient({ get: getMock }));

      await client.list({ query: 'report', offset: 10, count: 5 });

      const params = getMock.mock.calls[0][1];
      expect(params).toEqual({ query: 'report', offset: '10', count: '5' });
    });
  });

  describe('get()', () => {
    it('returns file metadata', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: FILE_METADATA_RESPONSE,
      });
      const client = new FilesClient(createMockHttpClient({ get: getMock }));

      const result = await client.get('file-123');

      expect(result.fileId).toBe('file-123');
      expect(result.mimeType).toBe('application/pdf');
      expect(getMock).toHaveBeenCalledWith('/api/v1/files/file-123');
    });
  });

  describe('delete()', () => {
    it('returns deletion result', async () => {
      const deleteMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { deleted: true },
      });
      const client = new FilesClient(createMockHttpClient({ delete: deleteMock }));

      const result = await client.delete('file-123');

      expect(result.deleted).toBe(true);
      expect(deleteMock).toHaveBeenCalledWith('/api/v1/files/file-123');
    });
  });
});
