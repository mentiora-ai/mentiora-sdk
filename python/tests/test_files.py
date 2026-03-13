"""Tests for FilesClient."""

import base64
from unittest.mock import AsyncMock, MagicMock

import pytest

from mentiora.files.client import FilesClient
from mentiora.files.types import (
    DeleteFileResult,
    FileMetadata,
    ListFilesResult,
    UploadFileParams,
    UploadFileResult,
)
from mentiora.http import HttpResponse

FILE_METADATA_RESPONSE = {
    'file_id': 'file-123',
    'filename': 'test.pdf',
    'mime_type': 'application/pdf',
    'size': 1024,
    'description': 'A test file',
    'created_at': '2025-01-01T00:00:00Z',
    'updated_at': '2025-01-01T00:00:00Z',
}


@pytest.fixture
def mock_http():
    mock = MagicMock()
    mock.debug = False
    mock.post = MagicMock(return_value=HttpResponse(201, {'file_id': 'file-123'}))
    mock.post_async = AsyncMock(return_value=HttpResponse(201, {'file_id': 'file-123'}))
    mock.get = MagicMock(
        return_value=HttpResponse(
            200,
            {
                'object': 'list',
                'data': [FILE_METADATA_RESPONSE],
                'total_count': 1,
            },
        )
    )
    mock.get_async = AsyncMock(
        return_value=HttpResponse(
            200,
            {
                'object': 'list',
                'data': [FILE_METADATA_RESPONSE],
                'total_count': 1,
            },
        )
    )
    mock.delete = MagicMock(return_value=HttpResponse(200, {'deleted': True}))
    mock.delete_async = AsyncMock(return_value=HttpResponse(200, {'deleted': True}))
    return mock


@pytest.fixture
def files_client(mock_http):
    return FilesClient(mock_http)


# ===========================================================================
# Upload tests
# ===========================================================================


def test_upload_sends_base64_content(files_client, mock_http):
    """Test upload() base64-encodes content and sends correct body."""
    content = b'hello world'
    result = files_client.upload(
        UploadFileParams(filename='test.txt', content=content, mime_type='text/plain')
    )

    assert isinstance(result, UploadFileResult)
    assert result.file_id == 'file-123'

    call_args = mock_http.post.call_args
    assert call_args[0][0] == '/api/v1/files'
    body = call_args[0][1]
    assert body['filename'] == 'test.txt'
    assert body['mime_type'] == 'text/plain'
    assert body['content'] == base64.b64encode(content).decode('ascii')
    assert 'description' not in body


def test_upload_with_description(files_client, mock_http):
    """Test upload() includes description when provided."""
    files_client.upload(
        UploadFileParams(
            filename='doc.pdf',
            content=b'pdf content',
            mime_type='application/pdf',
            description='Important doc',
        )
    )
    body = mock_http.post.call_args[0][1]
    assert body['description'] == 'Important doc'


@pytest.mark.asyncio
async def test_upload_async(files_client, mock_http):
    """Test upload_async() sends correct body."""
    result = await files_client.upload_async(
        UploadFileParams(filename='test.txt', content=b'data', mime_type='text/plain')
    )
    assert result.file_id == 'file-123'
    mock_http.post_async.assert_called_once()


# ===========================================================================
# List tests
# ===========================================================================


def test_list_returns_files(files_client, mock_http):
    """Test list() returns parsed file metadata."""
    result = files_client.list()

    assert isinstance(result, ListFilesResult)
    assert len(result.data) == 1
    assert result.total_count == 1
    assert result.data[0].file_id == 'file-123'
    assert result.data[0].filename == 'test.pdf'
    mock_http.get.assert_called_once_with('/api/v1/files', None)


def test_list_with_params(files_client, mock_http):
    """Test list() passes query params."""
    files_client.list(query='report', offset=10, count=5)

    call_args = mock_http.get.call_args
    assert call_args[0][0] == '/api/v1/files'
    params = call_args[0][1]
    assert params['query'] == 'report'
    assert params['offset'] == '10'
    assert params['count'] == '5'


@pytest.mark.asyncio
async def test_list_async(files_client, mock_http):
    """Test list_async() returns parsed file metadata."""
    result = await files_client.list_async()
    assert len(result.data) == 1
    mock_http.get_async.assert_called_once()


# ===========================================================================
# Get tests
# ===========================================================================


def test_get_returns_metadata(files_client, mock_http):
    """Test get() returns file metadata."""
    mock_http.get = MagicMock(return_value=HttpResponse(200, FILE_METADATA_RESPONSE))
    result = files_client.get('file-123')

    assert isinstance(result, FileMetadata)
    assert result.file_id == 'file-123'
    assert result.mime_type == 'application/pdf'
    mock_http.get.assert_called_once_with('/api/v1/files/file-123')


@pytest.mark.asyncio
async def test_get_async(files_client, mock_http):
    """Test get_async() returns file metadata."""
    mock_http.get_async = AsyncMock(return_value=HttpResponse(200, FILE_METADATA_RESPONSE))
    result = await files_client.get_async('file-123')
    assert result.file_id == 'file-123'


# ===========================================================================
# Delete tests
# ===========================================================================


def test_delete_returns_result(files_client, mock_http):
    """Test delete() returns deletion result."""
    result = files_client.delete('file-123')

    assert isinstance(result, DeleteFileResult)
    assert result.deleted is True
    mock_http.delete.assert_called_once_with('/api/v1/files/file-123')


@pytest.mark.asyncio
async def test_delete_async(files_client, mock_http):
    """Test delete_async() returns deletion result."""
    result = await files_client.delete_async('file-123')
    assert result.deleted is True
    mock_http.delete_async.assert_called_once()
