---
sidebar_label: Files
sidebar_position: 5
description: 'Upload, download, list, and delete files via the Mentiora SDK. Store binary data for analysis alongside your projects.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Files

Manage binary files (PDFs, CSVs, images, documents, etc.) attached to your Mentiora project. Files are stored server-side and can be used for analysis, knowledge bases, or any custom workflow.

## Upload a File

<SdkTabs>
<TabItem value="typescript">

```typescript
import { readFileSync } from 'fs';

const result = await client.files.upload({
  filename: 'report.pdf',
  content: readFileSync('./report.pdf'),
  mimeType: 'application/pdf',
  description: 'Q1 sales report',
});

console.log(`Uploaded: ${result.fileId}`);
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
from mentiora import UploadFileParams

with open('report.pdf', 'rb') as f:
    result = await client.files.upload_async(UploadFileParams(
        filename='report.pdf',
        content=f.read(),
        mime_type='application/pdf',
        description='Q1 sales report',
    ))

print(f'Uploaded: {result.file_id}')
```

**Sync:**

```python
from mentiora import UploadFileParams

with open('report.pdf', 'rb') as f:
    result = client.files.upload(UploadFileParams(
        filename='report.pdf',
        content=f.read(),
        mime_type='application/pdf',
        description='Q1 sales report',
    ))

print(f'Uploaded: {result.file_id}')
```

</TabItem>
</SdkTabs>

The SDK handles base64 encoding automatically. Maximum file size is 50 MB.

## List Files

<SdkTabs>
<TabItem value="typescript">

```typescript
// List all files
const files = await client.files.list();
console.log(`Total: ${files.totalCount}`);
for (const file of files.data) {
  console.log(`${file.filename} (${file.size} bytes)`);
}

// Search by name or description
const results = await client.files.list({ query: 'report' });

// Paginate
const page2 = await client.files.list({ offset: 10, count: 10 });
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
# List all files
files = await client.files.list_async()
print(f'Total: {files.total_count}')
for file in files.data:
    print(f'{file.filename} ({file.size} bytes)')

# Search by name or description
results = await client.files.list_async(query='report')

# Paginate
page2 = await client.files.list_async(offset=10, count=10)
```

**Sync:**

```python
files = client.files.list()
results = client.files.list(query='report')
page2 = client.files.list(offset=10, count=10)
```

</TabItem>
</SdkTabs>

## Get File Metadata

<SdkTabs>
<TabItem value="typescript">

```typescript
const file = await client.files.get('019d6d5d-d384-7793-9e0f-2592a9986021');
console.log(`${file.filename} — ${file.mimeType} — ${file.size} bytes`);
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
file = await client.files.get_async('019d6d5d-d384-7793-9e0f-2592a9986021')
print(f'{file.filename} — {file.mime_type} — {file.size} bytes')
```

**Sync:**

```python
file = client.files.get('019d6d5d-d384-7793-9e0f-2592a9986021')
```

</TabItem>
</SdkTabs>

## Download a File

<SdkTabs>
<TabItem value="typescript">

```typescript
const content = await client.files.download('019d6d5d-d384-7793-9e0f-2592a9986021');
// content is a Uint8Array — write to disk or process in memory
import { writeFileSync } from 'fs';
writeFileSync('./downloaded-report.pdf', content);
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
content = await client.files.download_async('019d6d5d-d384-7793-9e0f-2592a9986021')
# content is bytes — write to disk or process in memory
with open('downloaded-report.pdf', 'wb') as f:
    f.write(content)
```

**Sync:**

```python
content = client.files.download('019d6d5d-d384-7793-9e0f-2592a9986021')
with open('downloaded-report.pdf', 'wb') as f:
    f.write(content)
```

</TabItem>
</SdkTabs>

## Delete a File

Deletion fails with a `409 Conflict` error if the file is still referenced by a knowledge base document. Remove the reference first, then delete.

<SdkTabs>
<TabItem value="typescript">

```typescript
const result = await client.files.delete('019d6d5d-d384-7793-9e0f-2592a9986021');
console.log(`Deleted: ${result.deleted}`);
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
result = await client.files.delete_async('019d6d5d-d384-7793-9e0f-2592a9986021')
print(f'Deleted: {result.deleted}')
```

**Sync:**

```python
result = client.files.delete('019d6d5d-d384-7793-9e0f-2592a9986021')
```

</TabItem>
</SdkTabs>

## Supported File Types

The platform accepts a wide range of file types including:

- **Documents**: PDF, DOCX, DOC, ODT, RTF
- **Structured data**: CSV, TSV, JSON, JSONL, XML, YAML
- **Text**: TXT, Markdown, HTML
- **Images**: PNG, JPEG, GIF, WebP, SVG, TIFF, BMP
- **Email**: EML
- **eBooks**: EPUB

## See Also

- [Files API Reference](/api-reference/files) -- full method and type reference
- [Authentication](/authentication) -- setting up your API key
- [Examples](/examples) -- complete, runnable code samples
