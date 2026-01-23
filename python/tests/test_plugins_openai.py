"""Tests for OpenAI plugin."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from mentiora.plugins.openai import track_openai, TrackOpenAIOptions
from mentiora import MentioraClient
from mentiora.types import MentioraConfig


@pytest.mark.asyncio
async def test_track_openai_requires_client():
    """Test that track_openai requires mentiora_client."""
    mock_openai = MagicMock()
    with pytest.raises(ValueError, match='mentiora_client is required'):
        track_openai(mock_openai, TrackOpenAIOptions(mentiora_client=None))  # type: ignore


@pytest.mark.asyncio
async def test_track_openai_wraps_client():
    """Test that track_openai wraps OpenAI client."""
    mentiora_config = MentioraConfig(api_key='test-key', environment='staging')
    mentiora_client = MentioraClient(mentiora_config)

    mock_openai = MagicMock()
    mock_openai.chat = MagicMock()
    mock_openai.chat.completions = MagicMock()
    mock_openai.chat.completions.create = AsyncMock(return_value={
        'choices': [{'message': {'content': 'Test'}}],
        'model': 'gpt-4',
    })

    options = TrackOpenAIOptions(mentiora_client=mentiora_client)
    tracked = track_openai(mock_openai, options)

    # Should have wrapped the client
    assert tracked is not None
    assert hasattr(tracked, 'chat')

    mentiora_client.close()
