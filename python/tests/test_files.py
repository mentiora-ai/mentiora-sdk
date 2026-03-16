"""Tests for FilesClient."""

import base64
from unittest.mock import AsyncMock, MagicMock

import pytest

from mentiora.errors import NetworkError
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


# ===========================================================================
# Download tests
# ===========================================================================


def test_download_returns_bytes(files_client, mock_http):
    """Test download() returns raw bytes from get_raw()."""
    mock_http.get_raw = MagicMock(return_value=b'file content here')
    result = files_client.download('file-123')

    assert result == b'file content here'
    mock_http.get_raw.assert_called_once_with('/api/v1/files/file-123/content')


@pytest.mark.asyncio
async def test_download_async(files_client, mock_http):
    """Test download_async() returns raw bytes from get_raw_async()."""
    mock_http.get_raw_async = AsyncMock(return_value=b'async file content')
    result = await files_client.download_async('file-123')

    assert result == b'async file content'
    mock_http.get_raw_async.assert_called_once_with('/api/v1/files/file-123/content')


# ===========================================================================
# Error path tests
# ===========================================================================


def test_get_not_found_raises(files_client, mock_http):
    """Test get() propagates 404 NetworkError."""
    mock_http.get = MagicMock(
        side_effect=NetworkError(
            'Not found', status_code=404, server_code='not_found', server_message='File not found'
        )
    )
    with pytest.raises(NetworkError) as exc:
        files_client.get('nonexistent-id')
    assert exc.value.status_code == 404
    assert exc.value.server_code == 'not_found'


@pytest.mark.asyncio
async def test_get_async_not_found_raises(files_client, mock_http):
    """Test get_async() propagates 404 NetworkError."""
    mock_http.get_async = AsyncMock(
        side_effect=NetworkError(
            'Not found', status_code=404, server_code='not_found', server_message='File not found'
        )
    )
    with pytest.raises(NetworkError) as exc:
        await files_client.get_async('nonexistent-id')
    assert exc.value.status_code == 404


def test_delete_not_found_raises(files_client, mock_http):
    """Test delete() propagates 404 NetworkError."""
    mock_http.delete = MagicMock(
        side_effect=NetworkError(
            'Not found', status_code=404, server_code='not_found', server_message='File not found'
        )
    )
    with pytest.raises(NetworkError) as exc:
        files_client.delete('nonexistent-id')
    assert exc.value.status_code == 404


def test_delete_conflict_raises(files_client, mock_http):
    """Test delete() propagates 409 Conflict NetworkError."""
    mock_http.delete = MagicMock(
        side_effect=NetworkError(
            'Conflict',
            status_code=409,
            server_code='conflict',
            server_message='File is still referenced',
        )
    )
    with pytest.raises(NetworkError) as exc:
        files_client.delete('referenced-file-id')
    assert exc.value.status_code == 409
    assert exc.value.server_code == 'conflict'


@pytest.mark.asyncio
async def test_delete_async_conflict_raises(files_client, mock_http):
    """Test delete_async() propagates 409 Conflict NetworkError."""
    mock_http.delete_async = AsyncMock(
        side_effect=NetworkError(
            'Conflict',
            status_code=409,
            server_code='conflict',
            server_message='File is still referenced',
        )
    )
    with pytest.raises(NetworkError) as exc:
        await files_client.delete_async('referenced-file-id')
    assert exc.value.status_code == 409


def test_upload_bad_request_raises(files_client, mock_http):
    """Test upload() propagates 400 Bad Request NetworkError."""
    mock_http.post = MagicMock(
        side_effect=NetworkError(
            'Bad request',
            status_code=400,
            server_code='invalid_request',
            server_message='Missing required field: filename',
        )
    )
    with pytest.raises(NetworkError) as exc:
        files_client.upload(UploadFileParams(filename='', content=b'data', mime_type='text/plain'))
    assert exc.value.status_code == 400
    assert exc.value.server_code == 'invalid_request'


def test_download_not_found_raises(files_client, mock_http):
    """Test download() propagates 404 NetworkError."""
    mock_http.get_raw = MagicMock(
        side_effect=NetworkError(
            'Not found', status_code=404, server_code='not_found', server_message='File not found'
        )
    )
    with pytest.raises(NetworkError) as exc:
        files_client.download('nonexistent-id')
    assert exc.value.status_code == 404
