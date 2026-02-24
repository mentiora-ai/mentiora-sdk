"""Tests for agent types and models."""

import pytest
from pydantic import ValidationError as PydanticValidationError

from mentiora.agents.types import (
    AgentRunParams,
    AgentRunResult,
    AgentToolCall,
    ModelParams,
    UsageInfo,
)


def test_agent_run_params_to_api_body_with_tag():
    """Test to_api_body with tag-based resolution."""
    params = AgentRunParams(tag='production', message='Hello')
    body = params.to_api_body(stream=False)
    assert body == {'message': 'Hello', 'stream': False, 'tag': 'production'}


def test_agent_run_params_to_api_body_with_agent_id():
    """Test to_api_body with explicit agent ID."""
    params = AgentRunParams(agent_id='agent-123', message='Hi', revision=5)
    body = params.to_api_body(stream=True)
    assert body == {
        'message': 'Hi',
        'stream': True,
        'agent_id': 'agent-123',
        'revision': 5,
    }


def test_agent_run_params_to_api_body_all_optional_fields():
    """Test to_api_body includes all optional fields when set."""
    params = AgentRunParams(
        tag='staging',
        message='Tell me a joke',
        thread_id='thread-abc',
        model_id='gpt-4o',
        model_params=ModelParams(temperature=0.7, max_tokens=1024, seed=42),
        end_user_id='user-xyz',
        metadata={'session': 'test'},
    )
    body = params.to_api_body(stream=False)
    assert body == {
        'message': 'Tell me a joke',
        'stream': False,
        'tag': 'staging',
        'thread_id': 'thread-abc',
        'model_id': 'gpt-4o',
        'model_params': {'temperature': 0.7, 'max_tokens': 1024, 'seed': 42},
        'end_user_id': 'user-xyz',
        'metadata': {'session': 'test'},
    }


def test_agent_run_params_to_api_body_omits_none_fields():
    """Test to_api_body omits fields that are None."""
    params = AgentRunParams(tag='prod', message='Hello')
    body = params.to_api_body()
    assert 'agent_id' not in body
    assert 'revision' not in body
    assert 'thread_id' not in body
    assert 'model_id' not in body
    assert 'model_params' not in body
    assert 'end_user_id' not in body
    assert 'metadata' not in body


def test_agent_run_params_camel_case_alias():
    """Test AgentRunParams accepts camelCase aliases."""
    params = AgentRunParams(
        agentId='agent-1',  # type: ignore[call-arg]
        message='Hello',
        threadId='thread-1',  # type: ignore[call-arg]
        modelId='gpt-4',  # type: ignore[call-arg]
        endUserId='user-1',  # type: ignore[call-arg]
    )
    assert params.agent_id == 'agent-1'
    assert params.thread_id == 'thread-1'
    assert params.model_id == 'gpt-4'
    assert params.end_user_id == 'user-1'


def test_agent_run_params_extra_forbid():
    """Test that unknown fields are rejected."""
    with pytest.raises(PydanticValidationError, match='Extra inputs are not permitted'):
        AgentRunParams(tag='prod', message='Hello', unknown_field='bad')  # type: ignore[call-arg]


def test_model_params_camel_case_alias():
    """Test ModelParams accepts camelCase maxTokens alias."""
    mp = ModelParams(maxTokens=512)  # type: ignore[call-arg]
    assert mp.max_tokens == 512


def test_agent_run_result_parses_api_response():
    """Test AgentRunResult can parse a snake_case API response."""
    api_response = {
        'thread_id': 'thread-abc',
        'trace_id': 'trace-123',
        'agent_id': 'agent-456',
        'agent_revision': 3,
        'agent_tag': 'production',
        'output': 'The refund policy is...',
        'tool_calls': [
            {
                'tool_call_id': 'tc-1',
                'name': 'search_docs',
                'arguments': {'query': 'refund'},
                'result': {'docs': ['doc1']},
            }
        ],
        'status': 'completed',
        'usage': {'prompt_tokens': 100, 'completion_tokens': 50},
    }
    result = AgentRunResult.model_validate(api_response)
    assert result.thread_id == 'thread-abc'
    assert result.trace_id == 'trace-123'
    assert result.agent_id == 'agent-456'
    assert result.agent_revision == 3
    assert result.agent_tag == 'production'
    assert result.output == 'The refund policy is...'
    assert result.status == 'completed'
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].tool_call_id == 'tc-1'
    assert result.tool_calls[0].name == 'search_docs'
    assert result.tool_calls[0].result == {'docs': ['doc1']}
    assert result.usage == UsageInfo(prompt_tokens=100, completion_tokens=50)


def test_agent_run_result_parses_minimal_response():
    """Test AgentRunResult with minimal required fields."""
    api_response = {
        'thread_id': 'thread-1',
        'agent_id': 'agent-1',
        'agent_revision': 1,
        'output': 'Hi',
        'status': 'completed',
    }
    result = AgentRunResult.model_validate(api_response)
    assert result.thread_id == 'thread-1'
    assert result.trace_id is None
    assert result.agent_tag is None
    assert result.tool_calls == []
    assert result.usage is None


def test_agent_tool_call_camel_case_alias():
    """Test AgentToolCall accepts camelCase alias."""
    tc = AgentToolCall.model_validate(
        {
            'toolCallId': 'tc-1',
            'name': 'search',
            'arguments': {'q': 'test'},
        }
    )
    assert tc.tool_call_id == 'tc-1'


def test_model_params_empty_not_serialized():
    """Test that empty ModelParams doesn't produce model_params in API body."""
    params = AgentRunParams(
        tag='prod',
        message='Hello',
        model_params=ModelParams(),
    )
    body = params.to_api_body()
    # All ModelParams fields are None, so model_params dict would be empty
    assert 'model_params' not in body
