"""Type definitions for plugin options."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from ..client import MentioraClient


class TrackOpenAIOptions(BaseModel):
    """Options for track_openai plugin."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    mentiora_client: MentioraClient = Field(
        description='Initialized MentioraClient instance used to send traces.'
    )
    thread_id: str | None = Field(
        default=None,
        description='Thread/conversation ID for grouping traces (UUID v7 string).',
    )
    tags: list[str] | None = Field(
        default=None, description='Tags to attach to every trace from this client.'
    )
    metadata: dict[str, Any] | None = Field(
        default=None, description='Additional metadata to attach to every trace from this client.'
    )
    capture_content: bool = Field(
        default=True,
        description='When False, input/output fields are omitted from traces for privacy.',
    )


class MentioraTracingLangChainOptions(BaseModel):
    """Options for MentioraTracingLangChain callback handler."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    mentiora_client: MentioraClient = Field(
        description='Initialized MentioraClient instance used to send traces.'
    )
    thread_id: str | None = Field(
        default=None,
        description='Thread/conversation ID for grouping traces (UUID v7 string).',
    )
    tags: list[str] | None = Field(
        default=None, description='Tags to attach to every trace from this handler.'
    )
    metadata: dict[str, Any] | None = Field(
        default=None, description='Additional metadata to attach to every trace from this handler.'
    )
    capture_content: bool = Field(
        default=True,
        description='When False, input/output fields are omitted from traces for privacy.',
    )
