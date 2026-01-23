"""SDK type definitions.

Includes tracing-specific types and shared configuration types.
Future: Additional feature-specific types will be added here.
"""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


TraceType = Literal['llm', 'tool', 'chat', 'error', 'custom']
Environment = Literal['staging', 'production']


class TraceError(BaseModel):
    """Error details for trace events."""

    message: str
    type: Optional[str] = None
    stack: Optional[str] = None


class TraceEvent(BaseModel):
    """Trace event for sending to the Mentiora platform."""

    trace_id: str = Field(..., alias='traceId')
    span_id: str = Field(..., alias='spanId')
    parent_span_id: Optional[str] = Field(None, alias='parentSpanId')
    name: str
    type: TraceType
    input: Optional[dict] = None
    output: Optional[dict] = None
    start_time: datetime | str = Field(..., alias='startTime')
    end_time: Optional[datetime | str] = Field(None, alias='endTime')
    duration_ms: Optional[int] = Field(None, alias='durationMs')
    metadata: Optional[dict[str, Any]] = None
    tags: Optional[list[str]] = None
    error: Optional[TraceError] = None

    @field_validator('type')
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate trace type."""
        valid_types = ['llm', 'tool', 'chat', 'error', 'custom']
        if v not in valid_types:
            raise ValueError(f'type must be one of: {", ".join(valid_types)}')
        return v

    @field_validator('start_time', 'end_time', mode='before')
    @classmethod
    def validate_datetime(cls, v: datetime | str | None) -> str | None:
        """Convert datetime to ISO string if needed."""
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        """Pydantic config."""

        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat(),
        }

    def model_dump_for_api(self) -> dict[str, Any]:
        """Convert to API format with snake_case keys.

        Matches the format expected by the Next.js API and OTEL validation schema.
        Always includes optional fields as null (not missing) to match TypeScript SDK behavior.
        """
        # Get raw values (before validation transforms)
        parent_span_id = getattr(self, 'parent_span_id', None)
        input_data = getattr(self, 'input', None)
        output_data = getattr(self, 'output', None)
        end_time = getattr(self, 'end_time', None)
        duration_ms = getattr(self, 'duration_ms', None)
        metadata = getattr(self, 'metadata', None)
        tags = getattr(self, 'tags', None)
        error = getattr(self, 'error', None)

        # Convert datetime to ISO string
        start_time = self.start_time
        if isinstance(start_time, datetime):
            start_time = start_time.isoformat()
        elif isinstance(start_time, str):
            start_time = start_time
        else:
            start_time = None

        if isinstance(end_time, datetime):
            end_time = end_time.isoformat()
        elif isinstance(end_time, str):
            end_time = end_time
        elif end_time is None:
            end_time = None

        # Map to API snake_case format (matching TypeScript normalizeTraceEvent)
        return {
            'trace_id': self.trace_id,
            'span_id': self.span_id,
            'parent_span_id': parent_span_id if parent_span_id is not None else None,
            'name': self.name,
            'type': self.type,
            'input': input_data if input_data is not None else None,
            'output': output_data if output_data is not None else None,
            'start_time': start_time,
            'end_time': end_time,
            'duration_ms': duration_ms if duration_ms is not None else None,
            'metadata': metadata if metadata is not None else None,
            'tags': tags if tags is not None else [],  # Always array, never null (matches TS)
            'error': error if error is not None else None,
        }


class MentioraConfig(BaseModel):
    """Main SDK configuration."""

    api_key: str = Field(..., alias='apiKey')
    environment: Environment
    project_id: Optional[str] = Field(None, alias='projectId')
    base_url: Optional[str] = Field(None, alias='baseUrl')
    timeout: int = 30000
    retries: int = 3

    @field_validator('environment')
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Validate environment."""
        valid_envs = ['staging', 'production']
        if v not in valid_envs:
            raise ValueError(f'environment must be one of: {", ".join(valid_envs)}')
        return v

    class Config:
        """Pydantic config."""

        populate_by_name = True


class SendTraceResult(BaseModel):
    """Result of sending a trace event."""

    success: bool
    trace_id: str = Field(..., alias='traceId')
    span_id: str = Field(..., alias='spanId')
    error: Optional[str] = None

    class Config:
        """Pydantic config."""

        populate_by_name = True
