/**
 * Tests for FilesClient.
 */

import { describe, expect, it, vi } from 'vitest';
import { NetworkError } from '../../errors';
import type { HttpClient, HttpResponse } from '../../http';
import { FilesClient } from '../client';

function createMockHttpClient(
  overrides: {
    post?: (path: string, body: unknown) => Promise<HttpResponse>;
    get?: (path: string, params?: Record<string, string>) => Promise<HttpResponse>;
    delete?: (path: string, params?: Record<string, string>) => Promise<HttpResponse>;
    getRaw?: (path: string) => Promise<Uint8Array>;
  } = {}
): HttpClient {
  return {
    post: overrides.post ?? vi.fn(),
    get: overrides.get ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
    getRaw: overrides.getRaw ?? vi.fn(),
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

  describe('download()', () => {
    it('returns raw bytes from getRaw()', async () => {
      const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const getRawMock = vi.fn().mockResolvedValue(content);
      const client = new FilesClient(createMockHttpClient({ getRaw: getRawMock }));

      const result = await client.download('file-123');

      expect(result).toEqual(content);
      expect(getRawMock).toHaveBeenCalledWith('/api/v1/files/file-123/content');
    });
  });

  describe('snake_case → camelCase field mapping', () => {
    it('mapFileMetadata maps every snake_case field from the API response', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: FILE_METADATA_RESPONSE,
      });
      const client = new FilesClient(createMockHttpClient({ get: getMock }));

      const result = await client.get('file-123');

      expect(result).toEqual({
        fileId: 'file-123',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        description: 'A test file',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      });
      // Ensure no field is undefined (would indicate a broken key mapping)
      for (const [key, value] of Object.entries(result)) {
        expect(value, `field "${key}" should not be undefined`).not.toBeUndefined();
      }
    });

    it('upload() parses file_id from response', async () => {
      const postMock = vi.fn().mockResolvedValue({
        status: 201,
        body: { file_id: 'file-456' },
      });
      const client = new FilesClient(createMockHttpClient({ post: postMock }));

      const result = await client.upload({
        filename: 'test.txt',
        content: new TextEncoder().encode('data'),
        mimeType: 'text/plain',
      });

      expect(result.fileId).toBe('file-456');
    });

    it('list() parses total_count and maps all file fields', async () => {
      const getMock = vi.fn().mockResolvedValue({
        status: 200,
        body: { object: 'list', data: [FILE_METADATA_RESPONSE], total_count: 42 },
      });
      const client = new FilesClient(createMockHttpClient({ get: getMock }));

      const result = await client.list();

      expect(result.totalCount).toBe(42);
      const file = result.data[0];
      expect(file.fileId).toBe('file-123');
      expect(file.mimeType).toBe('application/pdf');
      expect(file.createdAt).toBe('2025-01-01T00:00:00Z');
      expect(file.updatedAt).toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('error paths', () => {
    it('get() throws NetworkError on 404', async () => {
      const getMock = vi
        .fn()
        .mockRejectedValue(new NetworkError('Not found', 404, 'not_found', 'File not found'));
      const client = new FilesClient(createMockHttpClient({ get: getMock }));

      await expect(client.get('nonexistent-id')).rejects.toThrow(NetworkError);
      await expect(client.get('nonexistent-id')).rejects.toMatchObject({
        statusCode: 404,
        serverCode: 'not_found',
      });
    });

    it('delete() throws NetworkError on 404', async () => {
      const deleteMock = vi
        .fn()
        .mockRejectedValue(new NetworkError('Not found', 404, 'not_found', 'File not found'));
      const client = new FilesClient(createMockHttpClient({ delete: deleteMock }));

      await expect(client.delete('nonexistent-id')).rejects.toThrow(NetworkError);
      await expect(client.delete('nonexistent-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('delete() throws NetworkError on 409 conflict', async () => {
      const deleteMock = vi
        .fn()
        .mockRejectedValue(
          new NetworkError('Conflict', 409, 'conflict', 'File is still referenced')
        );
      const client = new FilesClient(createMockHttpClient({ delete: deleteMock }));

      await expect(client.delete('referenced-file-id')).rejects.toThrow(NetworkError);
      await expect(client.delete('referenced-file-id')).rejects.toMatchObject({
        statusCode: 409,
        serverCode: 'conflict',
      });
    });

    it('upload() throws NetworkError on 400 bad request', async () => {
      const postMock = vi
        .fn()
        .mockRejectedValue(
          new NetworkError('Bad request', 400, 'invalid_request', 'Missing required field')
        );
      const client = new FilesClient(createMockHttpClient({ post: postMock }));

      await expect(
        client.upload({
          filename: '',
          content: new TextEncoder().encode('data'),
          mimeType: 'text/plain',
        })
      ).rejects.toThrow(NetworkError);
      await expect(
        client.upload({
          filename: '',
          content: new TextEncoder().encode('data'),
          mimeType: 'text/plain',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        serverCode: 'invalid_request',
      });
    });

    it('download() throws NetworkError on 404', async () => {
      const getRawMock = vi
        .fn()
        .mockRejectedValue(new NetworkError('Not found', 404, 'not_found', 'File not found'));
      const client = new FilesClient(createMockHttpClient({ getRaw: getRawMock }));

      await expect(client.download('nonexistent-id')).rejects.toThrow(NetworkError);
      await expect(client.download('nonexistent-id')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
