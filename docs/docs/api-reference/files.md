---
title: Files
description: "API reference for FilesClient — methods for uploading, listing, downloading, and deleting files, and types including FileMetadata, UploadFileParams, UploadFileResult, ListFilesResult, and DeleteFileResult."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Files

> For usage examples, see [Usage - Files](/usage/files).

## FilesClient

Client for managing files on the Mentiora platform.

### Methods

<SdkTabs>
<TabItem value="typescript">

#### `upload(params: UploadFileParams): Promise<UploadFileResult>`

Upload a file. Content is base64-encoded for transport automatically.

**Parameters:**

- `params: UploadFileParams` - Upload parameters

**Returns:** `Promise<UploadFileResult>`

**Example:**

```typescript
const result = await client.files.upload({
  filename: 'data.csv',
  content: Buffer.from('col1,col2\na,b'),
  mimeType: 'text/csv',
  description: 'Sample dataset',
});
```

#### `list(options?: { query?: string; offset?: number; count?: number }): Promise<ListFilesResult>`

List files with optional search and pagination.

**Parameters:**

- `options.query` - Optional search string (matches filename and description)
- `options.offset` - Pagination offset (default: 0)
- `options.count` - Number of results (default: 50, max: 500)

**Returns:** `Promise<ListFilesResult>`

**Example:**

```typescript
const files = await client.files.list({ query: 'report', offset: 0, count: 10 });
```

#### `get(fileId: string): Promise<FileMetadata>`

Get file metadata (no content).

**Parameters:**

- `fileId: string` - The file ID

**Returns:** `Promise<FileMetadata>`

**Example:**

```typescript
const file = await client.files.get('019d6d5d-d384-7793-9e0f-2592a9986021');
```

#### `download(fileId: string): Promise<Uint8Array>`

Download file content as raw bytes.

**Parameters:**

- `fileId: string` - The file ID

**Returns:** `Promise<Uint8Array>`

**Example:**

```typescript
const content = await client.files.download('019d6d5d-d384-7793-9e0f-2592a9986021');
```

#### `delete(fileId: string): Promise<DeleteFileResult>`

Delete a file. Throws `NetworkError` with status 409 if the file is still referenced by a knowledge base document.

**Parameters:**

- `fileId: string` - The file ID

**Returns:** `Promise<DeleteFileResult>`

**Example:**

```typescript
const result = await client.files.delete('019d6d5d-d384-7793-9e0f-2592a9986021');
```

</TabItem>
<TabItem value="python">

#### `upload(params: UploadFileParams) -> UploadFileResult`

Upload a file (synchronous). Content is base64-encoded for transport automatically.

**Parameters:**

- `params: UploadFileParams` - Upload parameters

**Returns:** `UploadFileResult`

**Example:**

```python
result = client.files.upload(UploadFileParams(
    filename='data.csv',
    content=b'col1,col2\na,b',
    mime_type='text/csv',
    description='Sample dataset',
))
```

#### `upload_async(params: UploadFileParams) -> UploadFileResult`

Upload a file (asynchronous).

**Parameters:**

- `params: UploadFileParams` - Upload parameters

**Returns:** `UploadFileResult`

**Example:**

```python
result = await client.files.upload_async(UploadFileParams(
    filename='data.csv',
    content=b'col1,col2\na,b',
    mime_type='text/csv',
))
```

#### `list(query=None, offset=None, count=None) -> ListFilesResult`

List files with optional search and pagination (synchronous).

**Parameters:**

- `query: str | None` - Optional search string (matches filename and description)
- `offset: int | None` - Pagination offset
- `count: int | None` - Number of results (default: 50, max: 500)

**Returns:** `ListFilesResult`

**Example:**

```python
files = client.files.list(query='report', offset=0, count=10)
```

#### `list_async(query=None, offset=None, count=None) -> ListFilesResult`

List files (asynchronous).

**Returns:** `ListFilesResult`

#### `get(file_id: str) -> FileMetadata`

Get file metadata (synchronous, no content).

**Parameters:**

- `file_id: str` - The file ID

**Returns:** `FileMetadata`

**Example:**

```python
file = client.files.get('019d6d5d-d384-7793-9e0f-2592a9986021')
```

#### `get_async(file_id: str) -> FileMetadata`

Get file metadata (asynchronous).

**Returns:** `FileMetadata`

#### `download(file_id: str) -> bytes`

Download file content as raw bytes (synchronous).

**Parameters:**

- `file_id: str` - The file ID

**Returns:** `bytes`

**Example:**

```python
content = client.files.download('019d6d5d-d384-7793-9e0f-2592a9986021')
```

#### `download_async(file_id: str) -> bytes`

Download file content as raw bytes (asynchronous).

**Returns:** `bytes`

#### `delete(file_id: str) -> DeleteFileResult`

Delete a file (synchronous). Raises `NetworkError` with status 409 if the file is still referenced by a knowledge base document.

**Parameters:**

- `file_id: str` - The file ID

**Returns:** `DeleteFileResult`

**Example:**

```python
result = client.files.delete('019d6d5d-d384-7793-9e0f-2592a9986021')
```

#### `delete_async(file_id: str) -> DeleteFileResult`

Delete a file (asynchronous).

**Returns:** `DeleteFileResult`

</TabItem>
</SdkTabs>

## Types

### UploadFileParams

<SdkTabs>
<TabItem value="typescript">

```typescript
interface UploadFileParams {
  filename: string;              // Name of the file
  content: Uint8Array | Buffer;  // Raw file content (base64-encoded automatically)
  mimeType: string;              // MIME type (e.g., 'application/pdf')
  description?: string;          // Optional description
}
```

</TabItem>
<TabItem value="python">

```python
class UploadFileParams:
    filename: str           # Name of the file
    content: bytes          # Raw file content (base64-encoded automatically)
    mime_type: str          # MIME type (e.g., 'application/pdf')
    description: str | None # Optional description
```

</TabItem>
</SdkTabs>

### FileMetadata

<SdkTabs>
<TabItem value="typescript">

```typescript
interface FileMetadata {
  fileId: string;            // Unique file identifier
  filename: string;          // Original filename
  mimeType: string;          // MIME type
  size: number;              // File size in bytes
  description: string | null; // Optional description
  createdAt: string;         // ISO 8601 timestamp
  updatedAt: string;         // ISO 8601 timestamp
}
```

</TabItem>
<TabItem value="python">

```python
class FileMetadata:
    file_id: str              # Unique file identifier
    filename: str             # Original filename
    mime_type: str            # MIME type
    size: int                 # File size in bytes
    description: str | None   # Optional description
    created_at: str           # ISO 8601 timestamp
    updated_at: str           # ISO 8601 timestamp
```

</TabItem>
</SdkTabs>

### UploadFileResult

<SdkTabs>
<TabItem value="typescript">

```typescript
interface UploadFileResult {
  fileId: string;  // ID of the uploaded file
}
```

</TabItem>
<TabItem value="python">

```python
class UploadFileResult:
    file_id: str  # ID of the uploaded file
```

</TabItem>
</SdkTabs>

### ListFilesResult

<SdkTabs>
<TabItem value="typescript">

```typescript
interface ListFilesResult {
  data: FileMetadata[];  // Array of file metadata
  totalCount: number;    // Total number of files matching the query
}
```

</TabItem>
<TabItem value="python">

```python
class ListFilesResult:
    data: list[FileMetadata]  # List of file metadata
    total_count: int          # Total number of files matching the query
```

</TabItem>
</SdkTabs>

### DeleteFileResult

<SdkTabs>
<TabItem value="typescript">

```typescript
interface DeleteFileResult {
  deleted: boolean;  // true if the file was deleted
}
```

</TabItem>
<TabItem value="python">

```python
class DeleteFileResult:
    deleted: bool  # True if the file was deleted
```

</TabItem>
</SdkTabs>

---

**See also:** [Client](/api-reference/client) | [Errors](/api-reference/errors) | [Tracing](/api-reference/tracing)
