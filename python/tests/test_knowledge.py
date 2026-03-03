"""Tests for KnowledgeClient."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from mentiora.http import HttpResponse
from mentiora.knowledge.client import KnowledgeClient
from mentiora.knowledge.types import (
    AddDocumentsParams,
    AddDocumentsResult,
    CreateKnowledgeParams,
    CreateKnowledgeResult,
    DeleteResult,
    DocumentDetails,
    DocumentSummary,
    KnowledgeDetails,
    KnowledgeSummary,
    ListDocumentsResult,
    UpdateKnowledgeParams,
)


KB_SUMMARY_RESPONSE = {
    'knowledge_id': 'kb-1',
    'name': 'Test KB',
    'description': 'A test knowledge base',
    'document_count': 3,
    'last_ingested_at': '2025-01-01T00:00:00Z',
    'created_at': '2025-01-01T00:00:00Z',
    'updated_at': '2025-01-01T00:00:00Z',
}

KB_DETAILS_RESPONSE = {
    **KB_SUMMARY_RESPONSE,
    'status_counts': {'PENDING': 0, 'INGESTING': 0, 'READY': 3, 'FAILED': 0},
}

DOC_SUMMARY_RESPONSE = {
    'document_id': 'doc-1',
    'knowledge_id': 'kb-1',
    'file_id': 'file-1',
    'filename': 'report.pdf',
    'mime_type': 'application/pdf',
    'file_size': 2048,
    'status': 'PENDING',
    'last_ingested_at': None,
    'created_at': '2025-01-01T00:00:00Z',
    'updated_at': '2025-01-01T00:00:00Z',
    'parse_error': None,
}

DOC_DETAILS_RESPONSE = {
    **DOC_SUMMARY_RESPONSE,
    'chunk_count': 10,
    'average_chunk_size': 500.0,
    'embedding_model': 'text-embedding-3-small',
}


@pytest.fixture
def mock_http():
    mock = MagicMock()
    mock.debug = False
    mock.post = MagicMock(
        return_value=HttpResponse(201, {'knowledge_id': 'kb-1'})
    )
    mock.post_async = AsyncMock(
        return_value=HttpResponse(201, {'knowledge_id': 'kb-1'})
    )
    mock.get = MagicMock(
        return_value=HttpResponse(200, {'object': 'list', 'data': [KB_SUMMARY_RESPONSE]})
    )
    mock.get_async = AsyncMock(
        return_value=HttpResponse(200, {'object': 'list', 'data': [KB_SUMMARY_RESPONSE]})
    )
    mock.put = MagicMock(
        return_value=HttpResponse(200, KB_DETAILS_RESPONSE)
    )
    mock.put_async = AsyncMock(
        return_value=HttpResponse(200, KB_DETAILS_RESPONSE)
    )
    mock.delete = MagicMock(
        return_value=HttpResponse(200, {'deleted': True})
    )
    mock.delete_async = AsyncMock(
        return_value=HttpResponse(200, {'deleted': True})
    )
    return mock


@pytest.fixture
def kb_client(mock_http):
    return KnowledgeClient(mock_http)


# ===========================================================================
# Create tests
# ===========================================================================


def test_create_sends_correct_body(kb_client, mock_http):
    """Test create() sends name and description."""
    result = kb_client.create(CreateKnowledgeParams(name='My KB', description='desc'))

    assert isinstance(result, CreateKnowledgeResult)
    assert result.knowledge_id == 'kb-1'

    call_args = mock_http.post.call_args
    assert call_args[0][0] == '/api/v1/knowledge'
    body = call_args[0][1]
    assert body['name'] == 'My KB'
    assert body['description'] == 'desc'


def test_create_without_description(kb_client, mock_http):
    """Test create() omits description when not provided."""
    kb_client.create(CreateKnowledgeParams(name='My KB'))

    body = mock_http.post.call_args[0][1]
    assert 'description' not in body


@pytest.mark.asyncio
async def test_create_async(kb_client, mock_http):
    """Test create_async() sends correct body."""
    result = await kb_client.create_async(CreateKnowledgeParams(name='Async KB'))
    assert result.knowledge_id == 'kb-1'
    mock_http.post_async.assert_called_once()


# ===========================================================================
# List tests
# ===========================================================================


def test_list_returns_summaries(kb_client, mock_http):
    """Test list() returns parsed knowledge base summaries."""
    result = kb_client.list()

    assert len(result) == 1
    assert isinstance(result[0], KnowledgeSummary)
    assert result[0].knowledge_id == 'kb-1'
    assert result[0].name == 'Test KB'
    assert result[0].document_count == 3


@pytest.mark.asyncio
async def test_list_async(kb_client, mock_http):
    """Test list_async() returns parsed summaries."""
    result = await kb_client.list_async()
    assert len(result) == 1


# ===========================================================================
# Get tests
# ===========================================================================


def test_get_returns_details(kb_client, mock_http):
    """Test get() returns knowledge base details."""
    mock_http.get = MagicMock(return_value=HttpResponse(200, KB_DETAILS_RESPONSE))
    result = kb_client.get('kb-1')

    assert isinstance(result, KnowledgeDetails)
    assert result.knowledge_id == 'kb-1'
    assert result.status_counts == {'PENDING': 0, 'INGESTING': 0, 'READY': 3, 'FAILED': 0}
    mock_http.get.assert_called_once_with('/api/v1/knowledge/kb-1')


@pytest.mark.asyncio
async def test_get_async(kb_client, mock_http):
    """Test get_async() returns details."""
    mock_http.get_async = AsyncMock(return_value=HttpResponse(200, KB_DETAILS_RESPONSE))
    result = await kb_client.get_async('kb-1')
    assert result.knowledge_id == 'kb-1'


# ===========================================================================
# Update tests
# ===========================================================================


def test_update_sends_correct_body(kb_client, mock_http):
    """Test update() sends name and description via PUT."""
    result = kb_client.update(
        UpdateKnowledgeParams(knowledge_id='kb-1', name='Updated KB', description='new desc')
    )

    assert isinstance(result, KnowledgeDetails)
    call_args = mock_http.put.call_args
    assert call_args[0][0] == '/api/v1/knowledge/kb-1'
    body = call_args[0][1]
    assert body['name'] == 'Updated KB'
    assert body['description'] == 'new desc'


@pytest.mark.asyncio
async def test_update_async(kb_client, mock_http):
    """Test update_async() sends correct body."""
    result = await kb_client.update_async(
        UpdateKnowledgeParams(knowledge_id='kb-1', name='Updated')
    )
    assert isinstance(result, KnowledgeDetails)
    mock_http.put_async.assert_called_once()


# ===========================================================================
# Delete tests
# ===========================================================================


def test_delete_returns_result(kb_client, mock_http):
    """Test delete() returns deletion result."""
    result = kb_client.delete('kb-1')

    assert isinstance(result, DeleteResult)
    assert result.deleted is True
    mock_http.delete.assert_called_once_with('/api/v1/knowledge/kb-1')


@pytest.mark.asyncio
async def test_delete_async(kb_client, mock_http):
    """Test delete_async() returns deletion result."""
    result = await kb_client.delete_async('kb-1')
    assert result.deleted is True


# ===========================================================================
# Add documents tests
# ===========================================================================


def test_add_documents_sends_file_ids(kb_client, mock_http):
    """Test add_documents() sends file_ids and returns document summaries."""
    mock_http.post = MagicMock(
        return_value=HttpResponse(201, {'documents': [DOC_SUMMARY_RESPONSE]})
    )
    result = kb_client.add_documents(
        AddDocumentsParams(knowledge_id='kb-1', file_ids=['file-1'])
    )

    assert isinstance(result, AddDocumentsResult)
    assert len(result.documents) == 1
    assert result.documents[0].document_id == 'doc-1'
    assert result.documents[0].status == 'PENDING'

    call_args = mock_http.post.call_args
    assert call_args[0][0] == '/api/v1/knowledge/kb-1/documents'
    assert call_args[0][1] == {'file_ids': ['file-1']}


@pytest.mark.asyncio
async def test_add_documents_async(kb_client, mock_http):
    """Test add_documents_async() sends correct body."""
    mock_http.post_async = AsyncMock(
        return_value=HttpResponse(201, {'documents': [DOC_SUMMARY_RESPONSE]})
    )
    result = await kb_client.add_documents_async(
        AddDocumentsParams(knowledge_id='kb-1', file_ids=['file-1', 'file-2'])
    )
    assert len(result.documents) == 1


# ===========================================================================
# List documents tests
# ===========================================================================


def test_list_documents_returns_summaries(kb_client, mock_http):
    """Test list_documents() returns document summaries."""
    mock_http.get = MagicMock(
        return_value=HttpResponse(200, {'object': 'list', 'data': [DOC_SUMMARY_RESPONSE]})
    )
    result = kb_client.list_documents('kb-1')

    assert isinstance(result, ListDocumentsResult)
    assert len(result.data) == 1
    assert result.data[0].filename == 'report.pdf'
    mock_http.get.assert_called_once_with('/api/v1/knowledge/kb-1/documents')


@pytest.mark.asyncio
async def test_list_documents_async(kb_client, mock_http):
    """Test list_documents_async() returns summaries."""
    mock_http.get_async = AsyncMock(
        return_value=HttpResponse(200, {'object': 'list', 'data': [DOC_SUMMARY_RESPONSE]})
    )
    result = await kb_client.list_documents_async('kb-1')
    assert len(result.data) == 1


# ===========================================================================
# Get document tests
# ===========================================================================


def test_get_document_returns_details(kb_client, mock_http):
    """Test get_document() returns document details."""
    mock_http.get = MagicMock(
        return_value=HttpResponse(200, DOC_DETAILS_RESPONSE)
    )
    result = kb_client.get_document('kb-1', 'doc-1')

    assert isinstance(result, DocumentDetails)
    assert result.document_id == 'doc-1'
    assert result.chunk_count == 10
    assert result.embedding_model == 'text-embedding-3-small'
    mock_http.get.assert_called_once_with('/api/v1/knowledge/kb-1/documents/doc-1')


@pytest.mark.asyncio
async def test_get_document_async(kb_client, mock_http):
    """Test get_document_async() returns details."""
    mock_http.get_async = AsyncMock(
        return_value=HttpResponse(200, DOC_DETAILS_RESPONSE)
    )
    result = await kb_client.get_document_async('kb-1', 'doc-1')
    assert result.chunk_count == 10


# ===========================================================================
# Delete document tests
# ===========================================================================


def test_delete_document_returns_result(kb_client, mock_http):
    """Test delete_document() returns deletion result."""
    result = kb_client.delete_document('kb-1', 'doc-1')

    assert isinstance(result, DeleteResult)
    assert result.deleted is True
    mock_http.delete.assert_called_once_with('/api/v1/knowledge/kb-1/documents/doc-1')


@pytest.mark.asyncio
async def test_delete_document_async(kb_client, mock_http):
    """Test delete_document_async() returns deletion result."""
    result = await kb_client.delete_document_async('kb-1', 'doc-1')
    assert result.deleted is True
