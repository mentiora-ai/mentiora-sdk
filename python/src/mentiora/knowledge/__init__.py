"""Knowledge client and types for the Mentiora SDK."""

from .client import KnowledgeClient
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
    UpdateKnowledgeParams,
)

__all__ = [
    'KnowledgeClient',
    'AddDocumentsParams',
    'AddDocumentsResult',
    'CreateKnowledgeParams',
    'CreateKnowledgeResult',
    'DeleteResult',
    'DocumentDetails',
    'DocumentSummary',
    'KnowledgeDetails',
    'KnowledgeSummary',
    'ListDocumentsResult',
    'UpdateKnowledgeParams',
]
