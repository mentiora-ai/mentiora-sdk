"""Tests for LangChain plugin."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from langchain_core.outputs import LLMResult

from mentiora import MentioraClient
from mentiora.errors import ConfigurationError
from mentiora.plugins.langchain import MentioraTracingLangChain
from mentiora.plugins.types import MentioraTracingLangChainOptions
from mentiora.types import MentioraConfig


@pytest.fixture
def mentiora_client():
    config = MentioraConfig(api_key='test-key')
    client = MentioraClient(config)
    client.tracing.send_trace_async = AsyncMock()
    yield client
    client.close()


@pytest.fixture
def callback(mentiora_client):
    options = MentioraTracingLangChainOptions(
        mentiora_client=mentiora_client,
        tags=['test'],
        metadata={'env': 'test'},
    )
    return MentioraTracingLangChain(options)


def test_mentiora_tracing_langchain_requires_client():
    """Test that MentioraTracingLangChain requires mentiora_client."""
    # Pydantic validates MentioraClient type before plugin code runs,
    # so None raises pydantic ValidationError, not ConfigurationError.
    with pytest.raises((ConfigurationError, Exception)):
        MentioraTracingLangChain(MentioraTracingLangChainOptions(mentiora_client=None))  # type: ignore


def test_mentiora_tracing_langchain_initialization(mentiora_client):
    """Test MentioraTracingLangChain initialization."""
    options = MentioraTracingLangChainOptions(
        mentiora_client=mentiora_client,
        tags=['test'],
        metadata={'env': 'test'},
    )
    cb = MentioraTracingLangChain(options)
    assert cb.name == 'MentioraTracingLangChain'
    assert cb.mentiora_client == mentiora_client
    assert cb.tags == ['test']
    assert cb.metadata == {'env': 'test'}


@pytest.mark.asyncio
async def test_on_llm_start(callback):
    """Test on_llm_start callback with UUID run_id."""
    run_id = uuid4()
    await callback.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello'],
        run_id=run_id,
    )

    assert str(run_id) in callback.active_runs
    run = callback.active_runs[str(run_id)]
    assert run.run_type == 'llm'
    assert run.input['prompt'] == 'Hello'
    assert run.input['prompts'] == ['Hello']


@pytest.mark.asyncio
async def test_run_id_uuid_type(callback):
    """Test that run_id accepts UUID objects (not just strings)."""
    run_id = uuid4()
    parent_run_id = uuid4()

    # Start parent chain
    await callback.on_chain_start(
        serialized={'name': 'parent-chain'},
        inputs={'input': 'test'},
        run_id=parent_run_id,
    )

    # Start child LLM with parent
    await callback.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello'],
        run_id=run_id,
        parent_run_id=parent_run_id,
    )

    # Both should be tracked
    assert str(run_id) in callback.active_runs
    assert str(parent_run_id) in callback.active_runs


@pytest.mark.asyncio
async def test_on_chat_model_start_end(callback, mentiora_client):
    """Test chat model lifecycle (start -> on_llm_end)."""
    run_id = uuid4()

    # Create mock messages (LangChain message objects)
    mock_msg = MagicMock()
    mock_msg.type = 'human'
    mock_msg.content = 'What is AI?'

    await callback.on_chat_model_start(
        serialized={'kwargs': {'model': 'gpt-4'}},
        messages=[[mock_msg]],
        run_id=run_id,
    )

    assert str(run_id) in callback.active_runs
    run = callback.active_runs[str(run_id)]
    assert run.run_type == 'chat_model'
    assert run.input['prompt'] == 'What is AI?'

    # End with LLMResult (chat model completions route through on_llm_end)
    mock_gen = MagicMock()
    mock_gen.message = MagicMock()
    mock_gen.message.content = 'AI is artificial intelligence.'
    mock_gen.message.type = 'ai'
    mock_gen.generation_info = {}

    mock_response = MagicMock(spec=LLMResult)
    mock_response.generations = [[mock_gen]]
    mock_response.llm_output = {
        'token_usage': {'prompt_tokens': 5, 'completion_tokens': 10, 'total_tokens': 15}
    }

    await callback.on_llm_end(response=mock_response, run_id=run_id)

    # Should have sent trace
    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.type == 'llm'
    assert 'chat_model' in trace_event.name
    assert trace_event.output['content'] == 'AI is artificial intelligence.'
    assert trace_event.usage is not None
    assert trace_event.usage.prompt_tokens == 5
    assert trace_event.metadata['runType'] == 'chat_model'

    # Output should have choices with message structure
    assert 'choices' in trace_event.output
    assert trace_event.output['choices'][0]['message']['role'] == 'assistant'

    # Run should be cleaned up
    assert str(run_id) not in callback.active_runs


@pytest.mark.asyncio
async def test_on_retriever_start_end(callback, mentiora_client):
    """Test retriever lifecycle (start -> end)."""
    run_id = uuid4()

    await callback.on_retriever_start(
        serialized={'name': 'vector-retriever'},
        query='What is Python?',
        run_id=run_id,
    )

    assert str(run_id) in callback.active_runs
    run = callback.active_runs[str(run_id)]
    assert run.run_type == 'retriever'
    assert run.input['query'] == 'What is Python?'
    assert run.input['prompt'] == 'What is Python?'

    # End with documents
    mock_doc1 = MagicMock()
    mock_doc1.page_content = 'Python is a programming language.'
    mock_doc1.metadata = {'source': 'wiki'}

    mock_doc2 = MagicMock()
    mock_doc2.page_content = 'Python was created by Guido.'
    mock_doc2.metadata = {'source': 'docs'}

    await callback.on_retriever_end(
        documents=[mock_doc1, mock_doc2],
        run_id=run_id,
    )

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.type == 'custom'
    assert 'retriever' in trace_event.name
    assert trace_event.output['document_count'] == 2
    assert trace_event.output['content'] == 'Python is a programming language.'
    assert len(trace_event.output['documents']) == 2


@pytest.mark.asyncio
async def test_on_retriever_error(callback, mentiora_client):
    """Test retriever error with proper stack trace."""
    run_id = uuid4()

    await callback.on_retriever_start(
        serialized={'name': 'vector-retriever'},
        query='Test query',
        run_id=run_id,
    )

    try:
        raise ConnectionError('Vector DB connection failed')
    except ConnectionError as e:
        await callback.on_retriever_error(error=e, run_id=run_id)

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.type == 'error'
    assert trace_event.error.message == 'Vector DB connection failed'
    assert trace_event.error.type == 'ConnectionError'
    # Stack trace should be real, not '<traceback object>'
    assert trace_event.error.stack is not None
    assert '<traceback object' not in trace_event.error.stack
    assert 'ConnectionError' in trace_event.error.stack


@pytest.mark.asyncio
async def test_token_usage_from_generation_info(callback, mentiora_client):
    """Test fallback token usage extraction from generation_info."""
    run_id = uuid4()

    await callback.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello'],
        run_id=run_id,
    )

    # Create response where llm_output has no tokens, but generation_info does
    mock_gen = MagicMock()
    mock_gen.text = 'Response text'
    mock_gen.generation_info = {
        'token_usage': {
            'prompt_tokens': 100,
            'completion_tokens': 50,
            'total_tokens': 150,
        }
    }

    mock_response = MagicMock()
    mock_response.generations = [[mock_gen]]
    mock_response.llm_output = {}  # Empty - no tokens here

    await callback.on_llm_end(response=mock_response, run_id=run_id)

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]

    # Should have extracted usage from generation_info
    assert trace_event.usage is not None
    assert trace_event.usage.prompt_tokens == 100
    assert trace_event.usage.completion_tokens == 50
    assert trace_event.usage.total_tokens == 150


@pytest.mark.asyncio
async def test_parent_child_relationships(callback, mentiora_client):
    """Test that parent-child relationships are properly tracked."""
    parent_id = uuid4()
    child_id = uuid4()

    # Start parent chain
    await callback.on_chain_start(
        serialized={'name': 'parent-chain'},
        inputs={'input': 'test'},
        run_id=parent_id,
    )

    parent_run = callback.active_runs[str(parent_id)]
    parent_trace_id = parent_run.trace_id
    parent_span_id = parent_run.span_id

    # Start child LLM
    await callback.on_llm_start(
        serialized={'name': 'child-llm'},
        prompts=['Hello'],
        run_id=child_id,
        parent_run_id=parent_id,
    )

    child_run = callback.active_runs[str(child_id)]

    # Child should inherit parent's trace_id
    assert child_run.trace_id == parent_trace_id
    # Child should have parent's span_id as parent_span_id
    assert child_run.parent_span_id == parent_span_id


@pytest.mark.asyncio
async def test_chain_output_content_extraction(callback, mentiora_client):
    """Test content extraction from various chain output formats."""
    # Test dict with 'output' key
    run_id = uuid4()
    await callback.on_chain_start(
        serialized={'name': 'test-chain'},
        inputs={'input': 'test'},
        run_id=run_id,
    )
    await callback.on_chain_end(
        outputs={'output': 'The answer is 42'},
        run_id=run_id,
    )

    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.output['content'] == 'The answer is 42'

    # Test dict with 'answer' key
    mentiora_client.tracing.send_trace_async.reset_mock()
    run_id2 = uuid4()
    await callback.on_chain_start(
        serialized={'name': 'test-chain'},
        inputs={'input': 'test'},
        run_id=run_id2,
    )
    await callback.on_chain_end(
        outputs={'answer': 'Yes, it works'},
        run_id=run_id2,
    )

    trace_event2 = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event2.output['content'] == 'Yes, it works'


@pytest.mark.asyncio
async def test_stack_trace_format(callback, mentiora_client):
    """Test that stack traces are readable (not '<traceback object at ...>')."""
    run_id = uuid4()

    await callback.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello'],
        run_id=run_id,
    )

    # Create an error with a real traceback
    try:
        raise RuntimeError('Test error with traceback')
    except RuntimeError as e:
        await callback.on_llm_error(error=e, run_id=run_id)

    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.error is not None
    assert trace_event.error.stack is not None
    # The stack trace should contain the actual traceback info
    assert 'RuntimeError: Test error with traceback' in trace_event.error.stack
    assert 'Traceback' in trace_event.error.stack
    # Should NOT be the useless repr
    assert '<traceback object' not in trace_event.error.stack


@pytest.mark.asyncio
async def test_role_remapping_in_chat_model_start(callback, mentiora_client):
    """Test that 'human' maps to 'user' and 'ai' maps to 'assistant'."""
    run_id = uuid4()

    mock_human = MagicMock()
    mock_human.type = 'human'
    mock_human.content = 'Hello'

    mock_ai = MagicMock()
    mock_ai.type = 'ai'
    mock_ai.content = 'Hi there'

    mock_system = MagicMock()
    mock_system.type = 'system'
    mock_system.content = 'You are helpful'

    await callback.on_chat_model_start(
        serialized={'name': 'ChatOpenAI'},
        messages=[[mock_human, mock_ai, mock_system]],
        run_id=run_id,
    )

    run = callback.active_runs[str(run_id)]
    messages = run.input['messages']
    assert messages[0]['role'] == 'user'
    assert messages[1]['role'] == 'assistant'
    assert messages[2]['role'] == 'system'


@pytest.mark.asyncio
async def test_chat_model_error_via_on_llm_error(callback, mentiora_client):
    """Test that chat model errors route through on_llm_error with correct metadata."""
    run_id = uuid4()

    mock_msg = MagicMock()
    mock_msg.type = 'human'
    mock_msg.content = 'Hello'

    await callback.on_chat_model_start(
        serialized={'kwargs': {'model': 'gpt-4'}},
        messages=[[mock_msg]],
        run_id=run_id,
    )

    try:
        raise RuntimeError('Chat model rate limited')
    except RuntimeError as e:
        await callback.on_llm_error(error=e, run_id=run_id)

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.type == 'error'
    assert 'chat_model' in trace_event.name
    assert trace_event.metadata['runType'] == 'chat_model'
    assert trace_event.error.message == 'Chat model rate limited'

    # Run should be cleaned up
    assert str(run_id) not in callback.active_runs


@patch('mentiora.plugins.langchain.time.monotonic')
async def test_stale_runs_are_cleaned_up(mock_monotonic, mentiora_client, callback):
    """Test that stale activeRuns are cleaned up on new start events."""
    # First call at t=0
    mock_monotonic.return_value = 0.0

    old_run_id = uuid4()
    await callback.on_llm_start(
        serialized={'id': ['ChatOpenAI']},
        prompts=['old prompt'],
        run_id=old_run_id,
    )
    assert str(old_run_id) in callback.active_runs

    # Advance time past TTL (300s + 1)
    mock_monotonic.return_value = 301.0

    new_run_id = uuid4()
    await callback.on_llm_start(
        serialized={'id': ['ChatOpenAI']},
        prompts=['new prompt'],
        run_id=new_run_id,
    )

    # Old stale run should be cleaned up, new run should exist
    assert str(old_run_id) not in callback.active_runs
    assert str(new_run_id) in callback.active_runs


@patch('mentiora.plugins.langchain.time.monotonic')
async def test_non_stale_runs_are_kept(mock_monotonic, mentiora_client, callback):
    """Test that non-stale activeRuns are NOT cleaned up."""
    mock_monotonic.return_value = 0.0

    old_run_id = uuid4()
    await callback.on_llm_start(
        serialized={'id': ['ChatOpenAI']},
        prompts=['old prompt'],
        run_id=old_run_id,
    )

    # Advance time but NOT past TTL (TTL is 300s)
    mock_monotonic.return_value = 200.0

    new_run_id = uuid4()
    await callback.on_chain_start(
        serialized={'id': ['RunnableSequence']},
        inputs={'input': 'test'},
        run_id=new_run_id,
    )

    # Both runs should still exist
    assert str(old_run_id) in callback.active_runs
    assert str(new_run_id) in callback.active_runs


@pytest.mark.asyncio
async def test_capture_content_true_includes_input_output(mentiora_client):
    """Test that capture_content=True (default) includes input/output in trace."""
    options = MentioraTracingLangChainOptions(
        mentiora_client=mentiora_client,
        capture_content=True,
    )
    cb = MentioraTracingLangChain(options)
    run_id = uuid4()

    await cb.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello secret data'],
        run_id=run_id,
    )

    mock_gen = MagicMock()
    mock_gen.text = 'Response text'
    mock_gen.generation_info = {}

    mock_response = MagicMock(spec=LLMResult)
    mock_response.generations = [[mock_gen]]
    mock_response.llm_output = {}

    await cb.on_llm_end(response=mock_response, run_id=run_id)

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.input is not None
    assert trace_event.output is not None
    assert trace_event.input['prompt'] == 'Hello secret data'


@pytest.mark.asyncio
async def test_capture_content_false_omits_input_output(mentiora_client):
    """Test that capture_content=False omits input/output from trace."""
    options = MentioraTracingLangChainOptions(
        mentiora_client=mentiora_client,
        capture_content=False,
    )
    cb = MentioraTracingLangChain(options)
    run_id = uuid4()

    await cb.on_llm_start(
        serialized={'name': 'test-llm'},
        prompts=['Hello secret data'],
        run_id=run_id,
    )

    mock_gen = MagicMock()
    mock_gen.text = 'Response text'
    mock_gen.generation_info = {}

    mock_response = MagicMock(spec=LLMResult)
    mock_response.generations = [[mock_gen]]
    mock_response.llm_output = {}

    await cb.on_llm_end(response=mock_response, run_id=run_id)

    assert mentiora_client.tracing.send_trace_async.called
    trace_event = mentiora_client.tracing.send_trace_async.call_args[0][0]
    assert trace_event.input is None
    assert trace_event.output is None
    # But other fields should still be present
    assert trace_event.type == 'llm'
    assert trace_event.name is not None
