"""SDK type definitions.

Includes tracing-specific types and shared configuration types.
Future: Additional feature-specific types will be added here.
"""

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

TraceType = Literal['llm', 'tool', 'chat', 'error', 'custom']


class TraceError(BaseModel):
    """Error details for trace events."""

    message: str = Field(description='Human-readable error message.')
    type: str | None = Field(
        default=None, description='Error type or class name (e.g., "TypeError").'
    )
    stack: str | None = Field(default=None, description='Stack trace string, if available.')


class UsageInfo(BaseModel):
    """Token usage information for LLM calls."""

    prompt_tokens: int | None = Field(
        default=None, description='Number of input/prompt tokens consumed.'
    )
    completion_tokens: int | None = Field(
        default=None, description='Number of output/completion tokens generated.'
    )
    total_tokens: int | None = Field(
        default=None, description='Total tokens (prompt + completion).'
    )


class TraceEvent(BaseModel):
    """Trace event for sending to the Mentiora platform.

    The `thread_id` field (alias: `threadId`) must be a UUID v7 string for
    compatibility with the Mentiora backend.
    """

    trace_id: str = Field(..., alias='traceId', description='Unique trace ID (UUID v7 format).')
    span_id: str = Field(..., alias='spanId', description='Unique span ID (UUID v7 format).')
    parent_span_id: str | None = Field(
        None, alias='parentSpanId', description='Parent span ID for nesting (UUID v7 format).'
    )
    thread_id: str | None = Field(
        None,
        alias='threadId',
        description='Thread/conversation ID for grouping traces (UUID v7). Auto-generated if omitted.',
    )
    name: str = Field(description="Span name, e.g., 'llm.call', 'tool.execute'.")
    type: TraceType = Field(description="Trace type: 'llm', 'tool', 'chat', 'error', or 'custom'.")
    input: Any | None = Field(default=None, description='Prompt, tool input, or other input data.')
    output: Any | None = Field(
        default=None, description='Response, tool result, or other output data.'
    )
    start_time: datetime | str = Field(
        ..., alias='startTime', description='Start time (ISO 8601 string or datetime).'
    )
    end_time: datetime | str | None = Field(
        None, alias='endTime', description='End time (ISO 8601 string or datetime).'
    )
    duration_ms: int | None = Field(
        None, alias='durationMs', description='Duration in milliseconds.'
    )
    metadata: dict[str, Any] | None = Field(
        default=None, description='Additional key-value metadata.'
    )
    tags: list[str] | None = Field(default=None, description='Tags for filtering and grouping.')
    error: TraceError | None = Field(default=None, description='Error details, if applicable.')
    usage: UsageInfo | None = Field(
        default=None, description='Token usage information (LLM-specific).'
    )
    model: str | None = Field(default=None, description="Model name (e.g., 'gpt-4', 'claude-3').")
    provider: str | None = Field(
        default=None, description="Provider name (e.g., 'openai', 'anthropic')."
    )

    @field_validator('type')
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate trace type."""
        valid_types = ['llm', 'tool', 'chat', 'error', 'custom']
        if v not in valid_types:
            raise ValueError(f'type must be one of: {", ".join(valid_types)}')
        return v

    model_config = ConfigDict(populate_by_name=True)

    @field_serializer('start_time', 'end_time')
    @classmethod
    def serialize_datetime(cls, v: datetime | str | None) -> str | None:
        """Serialize datetime fields to ISO 8601 with UTC fallback."""
        if v is None:
            return None
        if isinstance(v, datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=UTC)
            return v.isoformat()
        return str(v)

    def model_dump_for_api(self) -> dict[str, Any]:
        """Convert to API format with snake_case keys.

        Matches the format expected by the Mentiora API.
        Optional fields are included as null when absent so the payload shape is consistent.
        """
        raw = self.model_dump(mode='python')

        # Serialize datetimes to ISO 8601 with timezone.
        # Normalize UTC +00:00 to Z for strict validators (e.g. Zod).
        def _normalize_utc(s: str) -> str:
            return s[:-6] + 'Z' if s.endswith('+00:00') else s

        def _to_iso(dt: datetime | str | None) -> str | None:
            if dt is None:
                return None
            if isinstance(dt, datetime):
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=UTC)
                return _normalize_utc(dt.isoformat())
            s = str(dt).strip()
            if not s:
                return None
            try:
                parsed = datetime.fromisoformat(s.replace('Z', '+00:00'))
            except ValueError:
                if ' ' in s and 'T' not in s:
                    try:
                        parsed = datetime.fromisoformat(s.replace(' ', 'T', 1))
                    except ValueError:
                        return s
                else:
                    return s
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return _normalize_utc(parsed.isoformat())

        raw['start_time'] = _to_iso(raw.get('start_time'))
        raw['end_time'] = _to_iso(raw.get('end_time'))

        # Usage: exclude None sub-values
        if raw.get('usage') is not None:
            raw['usage'] = {k: v for k, v in raw['usage'].items() if v is not None}

        # Tags default to empty list when absent
        if raw.get('tags') is None:
            raw['tags'] = []

        # thread_id: only include when non-empty string
        thread_id = raw.pop('thread_id', None)
        if isinstance(thread_id, str) and thread_id.strip():
            raw['thread_id'] = thread_id

        return raw


class MentioraConfig(BaseModel):
    """Main SDK configuration."""

    api_key: str = Field(
        ..., alias='apiKey', description='Project API key (from the Mentiora platform).'
    )
    base_url: str | None = Field(
        None,
        alias='baseUrl',
        description='Base URL (defaults to https://platform.mentiora.ai if not provided).',
    )
    timeout: int = Field(default=30000, description='Request timeout in milliseconds.')
    retries: int = Field(default=3, description='Maximum number of retry attempts.')
    debug: bool = Field(
        default=False,
        description='Enable verbose SDK logging (HTTP requests, retries, responses).',
    )

    model_config = ConfigDict(populate_by_name=True, extra='forbid')


class SendTraceResult(BaseModel):
    """Result of sending a trace event."""

    success: bool = Field(description='Whether the trace was sent successfully.')
    trace_id: str = Field(..., alias='traceId', description='Trace ID of the sent event.')
    span_id: str = Field(..., alias='spanId', description='Span ID of the sent event.')
    error: str | None = Field(default=None, description='Error message, if the send failed.')

    model_config = ConfigDict(populate_by_name=True)
