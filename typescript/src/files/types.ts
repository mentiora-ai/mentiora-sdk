/**
 * File request and response types.
 */

export interface UploadFileParams {
  /** Name of the file. */
  filename: string;
  /** Raw file content as a Buffer or Uint8Array. Will be base64-encoded for transport. */
  content: Uint8Array | Buffer;
  /** MIME type of the file. */
  mimeType: string;
  /** Optional description. */
  description?: string;
}

export interface FileMetadata {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadFileResult {
  fileId: string;
}

export interface ListFilesResult {
  data: FileMetadata[];
  totalCount: number;
}

export interface DeleteFileResult {
  deleted: boolean;
}
