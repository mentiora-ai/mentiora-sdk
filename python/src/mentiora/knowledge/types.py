"""Knowledge request and response types."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class CreateKnowledgeParams(BaseModel):
    """Parameters for client.knowledge.create()."""

    name: str
    description: str | None = None


class UpdateKnowledgeParams(BaseModel):
    """Parameters for client.knowledge.update()."""

    model_config = ConfigDict(populate_by_name=True)

    knowledge_id: str = Field(alias='knowledgeId')
    name: str
    description: str | None = None


class AddDocumentsParams(BaseModel):
    """Parameters for client.knowledge.add_documents()."""

    model_config = ConfigDict(populate_by_name=True)

    knowledge_id: str = Field(alias='knowledgeId')
    file_ids: list[str] = Field(alias='fileIds')


class KnowledgeSummary(BaseModel):
    """Knowledge base summary returned by list operations."""

    model_config = ConfigDict(populate_by_name=True)

    knowledge_id: str = Field(alias='knowledgeId')
    name: str
    description: str | None = None
    document_count: int = Field(alias='documentCount')
    last_ingested_at: str | None = Field(None, alias='lastIngestedAt')
    created_at: str = Field(alias='createdAt')
    updated_at: str = Field(alias='updatedAt')


class KnowledgeDetails(BaseModel):
    """Detailed knowledge base info returned by get/update operations."""

    model_config = ConfigDict(populate_by_name=True)

    knowledge_id: str = Field(alias='knowledgeId')
    name: str
    description: str | None = None
    document_count: int = Field(alias='documentCount')
    last_ingested_at: str | None = Field(None, alias='lastIngestedAt')
    status_counts: dict[str, int] = Field(default_factory=dict, alias='statusCounts')
    created_at: str = Field(alias='createdAt')
    updated_at: str = Field(alias='updatedAt')


class CreateKnowledgeResult(BaseModel):
    """Result of creating a knowledge base."""

    knowledge_id: str


class DocumentSummary(BaseModel):
    """Document summary returned by list/add operations."""

    model_config = ConfigDict(populate_by_name=True)

    document_id: str = Field(alias='documentId')
    knowledge_id: str = Field(alias='knowledgeId')
    file_id: str = Field(alias='fileId')
    filename: str
    mime_type: str = Field(alias='mimeType')
    file_size: int | None = Field(None, alias='fileSize')
    status: str
    last_ingested_at: str | None = Field(None, alias='lastIngestedAt')
    created_at: str = Field(alias='createdAt')
    updated_at: str | None = Field(None, alias='updatedAt')
    parse_error: str | None = Field(None, alias='parseError')


class DocumentDetails(BaseModel):
    """Detailed document info returned by get_document."""

    model_config = ConfigDict(populate_by_name=True)

    document_id: str = Field(alias='documentId')
    knowledge_id: str = Field(alias='knowledgeId')
    file_id: str = Field(alias='fileId')
    filename: str
    mime_type: str = Field(alias='mimeType')
    file_size: int | None = Field(None, alias='fileSize')
    status: str
    last_ingested_at: str | None = Field(None, alias='lastIngestedAt')
    created_at: str = Field(alias='createdAt')
    updated_at: str | None = Field(None, alias='updatedAt')
    parse_error: str | None = Field(None, alias='parseError')
    chunk_count: int | None = Field(None, alias='chunkCount')
    average_chunk_size: float | None = Field(None, alias='averageChunkSize')
    embedding_model: str | None = Field(None, alias='embeddingModel')


class AddDocumentsResult(BaseModel):
    """Result of adding documents to a knowledge base."""

    documents: list[DocumentSummary]


class ListDocumentsResult(BaseModel):
    """Result of listing documents."""

    data: list[DocumentSummary]


class DeleteResult(BaseModel):
    """Result of a delete operation."""

    deleted: bool
