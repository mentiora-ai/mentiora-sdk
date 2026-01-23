"""Type definitions for plugin options."""

from typing import Any, Optional

from pydantic import BaseModel

from ..client import MentioraClient


class TrackOpenAIOptions(BaseModel):
    """Options for track_openai plugin."""

    mentiora_client: MentioraClient
    tags: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None
    project_id: Optional[str] = None


class MentioraTracingLangChainOptions(BaseModel):
    """Options for MentioraTracingLangChain callback handler."""

    mentiora_client: MentioraClient
    tags: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None
    project_id: Optional[str] = None
