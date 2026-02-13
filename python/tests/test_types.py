"""Tests for SDK type definitions."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError as PydanticValidationError

from mentiora.types import MentioraConfig, TraceError, TraceEvent, UsageInfo


def test_model_dump_for_api_datetime_format():
    """Test that model_dump_for_api serializes datetimes as ISO 8601 with Z suffix."""
    event = TraceEvent(
        trace_id='t1',
        span_id='s1',
        name='test',
        type='llm',
        start_time=datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC),
        end_time=datetime(2025, 1, 15, 12, 0, 1, tzinfo=UTC),
    )
    api = event.model_dump_for_api()
    assert api['start_time'].endswith('Z')
    assert api['end_time'].endswith('Z')
    assert '+00:00' not in api['start_time']


def test_model_dump_for_api_includes_usage():
    """Test that model_dump_for_api includes usage info when present."""
    event = TraceEvent(
        trace_id='t1',
        span_id='s1',
        name='test',
        type='llm',
        start_time=datetime.now(),
        usage=UsageInfo(prompt_tokens=10, completion_tokens=20, total_tokens=30),
    )
    api = event.model_dump_for_api()
    assert api['usage'] == {'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30}


def test_model_dump_for_api_error_serialization():
    """Test that model_dump_for_api serializes error as dict."""
    event = TraceEvent(
        trace_id='t1',
        span_id='s1',
        name='test',
        type='error',
        start_time=datetime.now(),
        error=TraceError(message='boom', type='RuntimeError', stack='Traceback...'),
    )
    api = event.model_dump_for_api()
    assert api['error']['message'] == 'boom'
    assert api['error']['type'] == 'RuntimeError'
    assert api['error']['stack'] == 'Traceback...'


def test_trace_event_invalid_type():
    """Test that TraceEvent rejects invalid type values."""
    with pytest.raises(PydanticValidationError):
        TraceEvent(
            trace_id='t1',
            span_id='s1',
            name='test',
            type='invalid',  # type: ignore
            start_time=datetime.now(),
        )


def test_config_extra_forbid():
    """Test that MentioraConfig rejects extra fields."""
    with pytest.raises(PydanticValidationError):
        MentioraConfig(api_key='test-key', environment='staging')  # type: ignore


def test_usage_info_partial():
    """Test UsageInfo with only some fields set."""
    usage = UsageInfo(prompt_tokens=10)
    assert usage.prompt_tokens == 10
    assert usage.completion_tokens is None
    assert usage.total_tokens is None


def test_model_dump_for_api_tags_default_empty():
    """Test that tags defaults to empty list in API output when not provided."""
    event = TraceEvent(
        trace_id='t1',
        span_id='s1',
        name='test',
        type='llm',
        start_time=datetime.now(),
    )
    api = event.model_dump_for_api()
    assert api['tags'] == []
