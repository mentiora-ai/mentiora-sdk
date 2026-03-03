/**
 * FilesClient — manage files via the Mentiora API.
 */

import type { HttpClient } from '../http';
import type {
  DeleteFileResult,
  FileMetadata,
  ListFilesResult,
  UploadFileParams,
  UploadFileResult,
} from './types';

const FILES_PATH = '/api/v1/files';

export class FilesClient {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Upload a file. Content is base64-encoded for transport.
   *
   * @param params - Upload parameters including filename, content, and mimeType.
   * @returns The uploaded file ID.
   */
  async upload(params: UploadFileParams): Promise<UploadFileResult> {
    const contentBase64 = typeof Buffer !== 'undefined'
      ? Buffer.from(params.content).toString('base64')
      : btoa(String.fromCharCode(...params.content));

    const body: Record<string, unknown> = {
      filename: params.filename,
      content: contentBase64,
      mime_type: params.mimeType,
    };
    if (params.description !== undefined) {
      body.description = params.description;
    }

    const response = await this.httpClient.post(FILES_PATH, body);
    const data = response.body as Record<string, unknown>;
    return { fileId: data.file_id as string };
  }

  /**
   * List files with optional search and pagination.
   *
   * @param options - Optional query, offset, and count parameters.
   * @returns List of file metadata and total count.
   */
  async list(options?: {
    query?: string;
    offset?: number;
    count?: number;
  }): Promise<ListFilesResult> {
    const params: Record<string, string> = {};
    if (options?.query !== undefined) params.query = options.query;
    if (options?.offset !== undefined) params.offset = String(options.offset);
    if (options?.count !== undefined) params.count = String(options.count);

    const response = await this.httpClient.get(
      FILES_PATH,
      Object.keys(params).length > 0 ? params : undefined,
    );
    const body = response.body as Record<string, unknown>;
    const rawData = body.data as Array<Record<string, unknown>>;

    return {
      data: rawData.map(mapFileMetadata),
      totalCount: body.total_count as number,
    };
  }

  /**
   * Get file metadata (no content).
   *
   * @param fileId - The file ID.
   * @returns File metadata.
   */
  async get(fileId: string): Promise<FileMetadata> {
    const response = await this.httpClient.get(`${FILES_PATH}/${fileId}`);
    return mapFileMetadata(response.body as Record<string, unknown>);
  }

  /**
   * Delete a file.
   *
   * @param fileId - The file ID.
   * @returns Deletion result.
   * @throws {@link NetworkError} if the file is still referenced (409 Conflict).
   */
  async delete(fileId: string): Promise<DeleteFileResult> {
    const response = await this.httpClient.delete(`${FILES_PATH}/${fileId}`);
    const data = response.body as Record<string, unknown>;
    return { deleted: data.deleted as boolean };
  }
}

function mapFileMetadata(raw: Record<string, unknown>): FileMetadata {
  return {
    fileId: raw.file_id as string,
    filename: raw.filename as string,
    mimeType: raw.mime_type as string,
    size: raw.size as number,
    description: (raw.description as string) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}
