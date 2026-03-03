"""File request and response types."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UploadFileParams(BaseModel):
    """Parameters for client.files.upload()."""

    model_config = ConfigDict(populate_by_name=True)

    filename: str
    content: bytes
    mime_type: str = Field(alias='mimeType')
    description: str | None = None


class FileMetadata(BaseModel):
    """File metadata returned by list/get operations."""

    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias='fileId')
    filename: str
    mime_type: str = Field(alias='mimeType')
    size: int
    description: str | None = None
    created_at: str = Field(alias='createdAt')
    updated_at: str = Field(alias='updatedAt')


class UploadFileResult(BaseModel):
    """Result of a file upload."""

    file_id: str


class ListFilesResult(BaseModel):
    """Result of listing files."""

    data: list[FileMetadata]
    total_count: int


class DeleteFileResult(BaseModel):
    """Result of deleting a file."""

    deleted: bool
