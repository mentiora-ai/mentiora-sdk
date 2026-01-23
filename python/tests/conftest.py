"""Pytest fixtures and test utilities."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from mentiora import MentioraClient, MentioraConfig
from mentiora.types import TraceEvent


@pytest.fixture
def mentiora_config() -> MentioraConfig:
    """Create a test Mentiora config."""
    return MentioraConfig(
        api_key='test-api-key',
        environment='staging',
    )


@pytest.fixture
def mentiora_client(mentiora_config: MentioraConfig) -> MentioraClient:
    """Create a test Mentiora client."""
    return MentioraClient(mentiora_config)


@pytest.fixture
def sample_trace_event() -> TraceEvent:
    """Create a sample trace event."""
    from datetime import datetime
    return TraceEvent(
        trace_id='test-trace-123',
        span_id='test-span-456',
        name='test.operation',
        type='llm',
        input={'messages': [{'role': 'user', 'content': 'Hello'}]},
        output={'response': 'Hello from Mentiora'},
        start_time=datetime.now(),
    )


@pytest.fixture
def mock_http_client():
    """Create a mock HTTP client."""
    mock = MagicMock()
    mock.send_trace = MagicMock()
    mock.send_trace_async = AsyncMock()
    return mock


@pytest.fixture
def mock_openai_client():
    """Create a mock OpenAI client."""
    mock = MagicMock()
    mock.chat = MagicMock()
    mock.chat.completions = MagicMock()
    mock.chat.completions.create = AsyncMock(return_value={
        'choices': [{'message': {'content': 'Test response'}}],
        'model': 'gpt-4',
        'usage': {
            'prompt_tokens': 10,
            'completion_tokens': 20,
            'total_tokens': 30,
        },
    })
    return mock
