"""Client for managing knowledge bases via the Mentiora API."""

from __future__ import annotations

import logging

from ..http import HttpClient
from .types import (
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
    ListKnowledgeResult,
    UpdateKnowledgeParams,
)

logger = logging.getLogger('mentiora.sdk')

KNOWLEDGE_PATH = '/api/v1/knowledge'


class KnowledgeClient:
    """Client for creating, listing, updating, and deleting knowledge bases and documents."""

    def __init__(self, http_client: HttpClient) -> None:
        self._http_client = http_client

    @property
    def _debug(self) -> bool:
        return self._http_client.debug

    # ── Knowledge base CRUD ──

    def create(self, params: CreateKnowledgeParams) -> CreateKnowledgeResult:
        """Create a knowledge base (sync)."""
        if self._debug:
            logger.debug('[Mentiora SDK] knowledge.create: name=%s', params.name)
        body = {'name': params.name}
        if params.description is not None:
            body['description'] = params.description
        response = self._http_client.post(KNOWLEDGE_PATH, body)
        return CreateKnowledgeResult.model_validate(response.body)

    async def create_async(self, params: CreateKnowledgeParams) -> CreateKnowledgeResult:
        """Create a knowledge base (async)."""
        if self._debug:
            logger.debug('[Mentiora SDK] knowledge.create_async: name=%s', params.name)
        body = {'name': params.name}
        if params.description is not None:
            body['description'] = params.description
        response = await self._http_client.post_async(KNOWLEDGE_PATH, body)
        return CreateKnowledgeResult.model_validate(response.body)

    def list(
        self,
        offset: int | None = None,
        count: int | None = None,
    ) -> ListKnowledgeResult:
        """List knowledge bases with optional pagination (sync)."""
        params: dict[str, str] = {}
        if offset is not None:
            params['offset'] = str(offset)
        if count is not None:
            params['count'] = str(count)
        response = self._http_client.get(KNOWLEDGE_PATH, params or None)
        body = response.body
        return ListKnowledgeResult(
            data=[KnowledgeSummary.model_validate(kb) for kb in body.get('data', [])],
            total_count=body.get('total_count', 0),
        )

    async def list_async(
        self,
        offset: int | None = None,
        count: int | None = None,
    ) -> ListKnowledgeResult:
        """List knowledge bases with optional pagination (async)."""
        params: dict[str, str] = {}
        if offset is not None:
            params['offset'] = str(offset)
        if count is not None:
            params['count'] = str(count)
        response = await self._http_client.get_async(KNOWLEDGE_PATH, params or None)
        body = response.body
        return ListKnowledgeResult(
            data=[KnowledgeSummary.model_validate(kb) for kb in body.get('data', [])],
            total_count=body.get('total_count', 0),
        )

    def get(self, knowledge_id: str) -> KnowledgeDetails:
        """Get knowledge base details (sync)."""
        response = self._http_client.get(f'{KNOWLEDGE_PATH}/{knowledge_id}')
        return KnowledgeDetails.model_validate(response.body)

    async def get_async(self, knowledge_id: str) -> KnowledgeDetails:
        """Get knowledge base details (async)."""
        response = await self._http_client.get_async(f'{KNOWLEDGE_PATH}/{knowledge_id}')
        return KnowledgeDetails.model_validate(response.body)

    def update(self, params: UpdateKnowledgeParams) -> KnowledgeDetails:
        """Update a knowledge base (sync)."""
        if self._debug:
            logger.debug(
                '[Mentiora SDK] knowledge.update: id=%s name=%s',
                params.knowledge_id,
                params.name,
            )
        body = {'name': params.name}
        if params.description is not None:
            body['description'] = params.description
        response = self._http_client.put(f'{KNOWLEDGE_PATH}/{params.knowledge_id}', body)
        return KnowledgeDetails.model_validate(response.body)

    async def update_async(self, params: UpdateKnowledgeParams) -> KnowledgeDetails:
        """Update a knowledge base (async)."""
        if self._debug:
            logger.debug(
                '[Mentiora SDK] knowledge.update_async: id=%s name=%s',
                params.knowledge_id,
                params.name,
            )
        body = {'name': params.name}
        if params.description is not None:
            body['description'] = params.description
        response = await self._http_client.put_async(
            f'{KNOWLEDGE_PATH}/{params.knowledge_id}', body
        )
        return KnowledgeDetails.model_validate(response.body)

    def delete(self, knowledge_id: str) -> DeleteResult:
        """Delete a knowledge base (sync)."""
        response = self._http_client.delete(f'{KNOWLEDGE_PATH}/{knowledge_id}')
        return DeleteResult.model_validate(response.body)

    async def delete_async(self, knowledge_id: str) -> DeleteResult:
        """Delete a knowledge base (async)."""
        response = await self._http_client.delete_async(f'{KNOWLEDGE_PATH}/{knowledge_id}')
        return DeleteResult.model_validate(response.body)

    # ── Document operations ──

    def add_documents(self, params: AddDocumentsParams) -> AddDocumentsResult:
        """Add documents to a knowledge base (sync). Triggers async ingestion."""
        if self._debug:
            logger.debug(
                '[Mentiora SDK] knowledge.add_documents: id=%s files=%s',
                params.knowledge_id,
                params.file_ids,
            )
        response = self._http_client.post(
            f'{KNOWLEDGE_PATH}/{params.knowledge_id}/documents',
            {'file_ids': params.file_ids},
        )
        docs = [DocumentSummary.model_validate(d) for d in response.body.get('documents', [])]
        return AddDocumentsResult(documents=docs)

    async def add_documents_async(self, params: AddDocumentsParams) -> AddDocumentsResult:
        """Add documents to a knowledge base (async). Triggers async ingestion."""
        if self._debug:
            logger.debug(
                '[Mentiora SDK] knowledge.add_documents_async: id=%s files=%s',
                params.knowledge_id,
                params.file_ids,
            )
        response = await self._http_client.post_async(
            f'{KNOWLEDGE_PATH}/{params.knowledge_id}/documents',
            {'file_ids': params.file_ids},
        )
        docs = [DocumentSummary.model_validate(d) for d in response.body.get('documents', [])]
        return AddDocumentsResult(documents=docs)

    def list_documents(
        self,
        knowledge_id: str,
        offset: int | None = None,
        count: int | None = None,
    ) -> ListDocumentsResult:
        """List documents in a knowledge base with optional pagination (sync)."""
        params: dict[str, str] = {}
        if offset is not None:
            params['offset'] = str(offset)
        if count is not None:
            params['count'] = str(count)
        response = self._http_client.get(
            f'{KNOWLEDGE_PATH}/{knowledge_id}/documents', params or None
        )
        body = response.body
        return ListDocumentsResult(
            data=[DocumentSummary.model_validate(d) for d in body.get('data', [])],
            total_count=body.get('total_count', 0),
        )

    async def list_documents_async(
        self,
        knowledge_id: str,
        offset: int | None = None,
        count: int | None = None,
    ) -> ListDocumentsResult:
        """List documents in a knowledge base with optional pagination (async)."""
        params: dict[str, str] = {}
        if offset is not None:
            params['offset'] = str(offset)
        if count is not None:
            params['count'] = str(count)
        response = await self._http_client.get_async(
            f'{KNOWLEDGE_PATH}/{knowledge_id}/documents', params or None
        )
        body = response.body
        return ListDocumentsResult(
            data=[DocumentSummary.model_validate(d) for d in body.get('data', [])],
            total_count=body.get('total_count', 0),
        )

    def get_document(self, knowledge_id: str, document_id: str) -> DocumentDetails:
        """Get document details (sync). Useful for polling ingestion status."""
        response = self._http_client.get(f'{KNOWLEDGE_PATH}/{knowledge_id}/documents/{document_id}')
        return DocumentDetails.model_validate(response.body)

    async def get_document_async(self, knowledge_id: str, document_id: str) -> DocumentDetails:
        """Get document details (async). Useful for polling ingestion status."""
        response = await self._http_client.get_async(
            f'{KNOWLEDGE_PATH}/{knowledge_id}/documents/{document_id}'
        )
        return DocumentDetails.model_validate(response.body)

    def delete_document(self, knowledge_id: str, document_id: str) -> DeleteResult:
        """Delete a document from a knowledge base (sync)."""
        response = self._http_client.delete(
            f'{KNOWLEDGE_PATH}/{knowledge_id}/documents/{document_id}'
        )
        return DeleteResult.model_validate(response.body)

    async def delete_document_async(self, knowledge_id: str, document_id: str) -> DeleteResult:
        """Delete a document from a knowledge base (async)."""
        response = await self._http_client.delete_async(
            f'{KNOWLEDGE_PATH}/{knowledge_id}/documents/{document_id}'
        )
        return DeleteResult.model_validate(response.body)
