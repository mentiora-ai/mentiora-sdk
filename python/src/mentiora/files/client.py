"""Client for managing files via the Mentiora API."""

from __future__ import annotations

import base64
import logging

from ..http import HttpClient
from .types import (
    DeleteFileResult,
    FileMetadata,
    ListFilesResult,
    UploadFileParams,
    UploadFileResult,
)

logger = logging.getLogger('mentiora.sdk')

FILES_PATH = '/api/v1/files'


class FilesClient:
    """Client for uploading, listing, and deleting files."""

    def __init__(self, http_client: HttpClient) -> None:
        self._http_client = http_client

    @property
    def _debug(self) -> bool:
        return self._http_client.debug

    def upload(self, params: UploadFileParams) -> UploadFileResult:
        """Upload a file (sync).

        Args:
            params: Upload parameters including filename, content bytes, and mime_type.

        Returns:
            The uploaded file ID.
        """
        if self._debug:
            logger.debug('[Mentiora SDK] files.upload: filename=%s', params.filename)
        body = {
            'filename': params.filename,
            'content': base64.b64encode(params.content).decode('ascii'),
            'mime_type': params.mime_type,
        }
        if params.description is not None:
            body['description'] = params.description
        response = self._http_client.post(FILES_PATH, body)
        return UploadFileResult.model_validate(response.body)

    async def upload_async(self, params: UploadFileParams) -> UploadFileResult:
        """Upload a file (async)."""
        if self._debug:
            logger.debug('[Mentiora SDK] files.upload_async: filename=%s', params.filename)
        body = {
            'filename': params.filename,
            'content': base64.b64encode(params.content).decode('ascii'),
            'mime_type': params.mime_type,
        }
        if params.description is not None:
            body['description'] = params.description
        response = await self._http_client.post_async(FILES_PATH, body)
        return UploadFileResult.model_validate(response.body)

    def list(
        self,
        query: str | None = None,
        offset: int | None = None,
        count: int | None = None,
    ) -> ListFilesResult:
        """List files (sync).

        Args:
            query: Optional search query to filter by filename or description.
            offset: Pagination offset.
            count: Number of results to return.

        Returns:
            List of file metadata and total count.
        """
        params: dict[str, str] = {}
        if query is not None:
            params['query'] = query
        if offset is not None:
            params['offset'] = str(offset)
        if count is not None:
            params['count'] = str(count)

        response = self._http_client.get(FILES_PATH, params or None)
        body = response.body
        return ListFilesResult(
            data=[FileMetadata.model_validate(f) for f in body.get('data', [])],
            total_count=body.get('total_count', 0),
        )

    async def list_async(
        self,
        query: str | None = None,
        offset: int | None = None,
        count: int | None = None,
    ) -> ListFilesResult:
        """List files (async)."""
        params: dict[str, str] = {}
        if query is not None:
            params['query'] = query
        if offset is not None:
            params['offset'] = str(offset)
        if count is not None:
            params['count'] = str(count)

        response = await self._http_client.get_async(FILES_PATH, params or None)
        body = response.body
        return ListFilesResult(
            data=[FileMetadata.model_validate(f) for f in body.get('data', [])],
            total_count=body.get('total_count', 0),
        )

    def get(self, file_id: str) -> FileMetadata:
        """Get file metadata (sync).

        Args:
            file_id: The file ID.

        Returns:
            File metadata (no content).
        """
        response = self._http_client.get(f'{FILES_PATH}/{file_id}')
        return FileMetadata.model_validate(response.body)

    async def get_async(self, file_id: str) -> FileMetadata:
        """Get file metadata (async)."""
        response = await self._http_client.get_async(f'{FILES_PATH}/{file_id}')
        return FileMetadata.model_validate(response.body)

    def delete(self, file_id: str) -> DeleteFileResult:
        """Delete a file (sync).

        Args:
            file_id: The file ID.

        Returns:
            Deletion result.

        Raises:
            NetworkError: If the file is still referenced (409 Conflict).
        """
        response = self._http_client.delete(f'{FILES_PATH}/{file_id}')
        return DeleteFileResult.model_validate(response.body)

    async def delete_async(self, file_id: str) -> DeleteFileResult:
        """Delete a file (async)."""
        response = await self._http_client.delete_async(f'{FILES_PATH}/{file_id}')
        return DeleteFileResult.model_validate(response.body)
