"""Tests for LangChain plugin."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from mentiora.plugins.langchain import MentioraTracingLangChain, MentioraTracingLangChainOptions
from mentiora import MentioraClient
from mentiora.types import MentioraConfig


def test_mentiora_tracing_langchain_requires_client():
    """Test that MentioraTracingLangChain requires mentiora_client."""
    with pytest.raises(ValueError, match='mentiora_client is required'):
        MentioraTracingLangChain(MentioraTracingLangChainOptions(mentiora_client=None))  # type: ignore


def test_mentiora_tracing_langchain_initialization():
    """Test MentioraTracingLangChain initialization."""
    mentiora_config = MentioraConfig(api_key='test-key', environment='staging')
    mentiora_client = MentioraClient(mentiora_config)

    options = MentioraTracingLangChainOptions(
        mentiora_client=mentiora_client,
        tags=['test'],
        metadata={'env': 'test'},
    )

    callback = MentioraTracingLangChain(options)
    assert callback.name == 'MentioraTracingLangChain'
    assert callback.mentiora_client == mentiora_client
    assert callback.tags == ['test']
    assert callback.metadata == {'env': 'test'}

    mentiora_client.close()


@pytest.mark.asyncio
async def test_on_llm_start():
    """Test on_llm_start callback."""
    mentiora_config = MentioraConfig(api_key='test-key', environment='staging')
    mentiora_client = MentioraClient(mentiora_config)
    mentiora_client.tracing.send_trace_async = AsyncMock()

    options = MentioraTracingLangChainOptions(mentiora_client=mentiora_client)
    callback = MentioraTracingLangChain(options)

    await callback.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello'],
        run_id='run-123',
    )

    assert 'run-123' in callback.active_runs
    run = callback.active_runs['run-123']
    assert run.run_type == 'llm'
    assert run.name == 'unknown'  # Default when name extraction fails

    mentiora_client.close()
