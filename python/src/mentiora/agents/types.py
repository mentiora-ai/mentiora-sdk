"""Agent request, response, and streaming event types."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ── Request ──


class ModelParams(BaseModel):
    """Optional model parameter overrides."""

    model_config = ConfigDict(populate_by_name=True)

    temperature: float | None = None
    max_tokens: int | None = Field(None, alias='maxTokens')
    seed: int | None = None


class AgentRunParams(BaseModel):
    """Parameters for client.agents.run() / stream()."""

    model_config = ConfigDict(populate_by_name=True, extra='forbid')

    # Agent resolution (at least tag or agent_id required)
    tag: str | None = None
    agent_id: str | None = Field(None, alias='agentId')
    revision: int | None = None

    # Message (required)
    message: str

    # Conversation context
    thread_id: str | None = Field(None, alias='threadId')

    # Optional overrides
    model_id: str | None = Field(None, alias='modelId')
    model_params: ModelParams | None = Field(None, alias='modelParams')

    # Tracking
    end_user_id: str | None = Field(None, alias='endUserId')
    metadata: dict[str, Any] | None = None

    def to_api_body(self, *, stream: bool = False) -> dict[str, Any]:
        """Serialize to API wire format (snake_case keys)."""
        body: dict[str, Any] = {'message': self.message, 'stream': stream}
        if self.tag is not None:
            body['tag'] = self.tag
        if self.agent_id is not None:
            body['agent_id'] = self.agent_id
        if self.revision is not None:
            body['revision'] = self.revision
        if self.thread_id is not None:
            body['thread_id'] = self.thread_id
        if self.model_id is not None:
            body['model_id'] = self.model_id
        if self.model_params is not None:
            mp: dict[str, Any] = {}
            if self.model_params.temperature is not None:
                mp['temperature'] = self.model_params.temperature
            if self.model_params.max_tokens is not None:
                mp['max_tokens'] = self.model_params.max_tokens
            if self.model_params.seed is not None:
                mp['seed'] = self.model_params.seed
            if mp:
                body['model_params'] = mp
        if self.end_user_id is not None:
            body['end_user_id'] = self.end_user_id
        if self.metadata is not None:
            body['metadata'] = self.metadata
        return body


# ── Sync Response ──


class AgentToolCall(BaseModel):
    """A tool call made during agent execution."""

    model_config = ConfigDict(populate_by_name=True)

    tool_call_id: str = Field(alias='toolCallId')
    name: str
    arguments: Any
    result: Any | None = None


class UsageInfo(BaseModel):
    """Token usage information."""

    model_config = ConfigDict(populate_by_name=True)

    prompt_tokens: int | None = Field(None, alias='promptTokens')
    completion_tokens: int | None = Field(None, alias='completionTokens')


class AgentRunResult(BaseModel):
    """Result of a synchronous agent.run() call."""

    model_config = ConfigDict(populate_by_name=True)

    thread_id: str = Field(alias='threadId')
    trace_id: str | None = Field(None, alias='traceId')
    agent_id: str = Field(alias='agentId')
    agent_revision: int = Field(alias='agentRevision')
    agent_tag: str | None = Field(None, alias='agentTag')
    output: str
    tool_calls: list[AgentToolCall] = Field(default_factory=list, alias='toolCalls')
    status: Literal['completed', 'failed']
    usage: UsageInfo | None = None


# ── Streaming Events ──


class AgentResolvedEvent(BaseModel):
    """Emitted once at stream start with resolved agent metadata."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal['agent_resolved'] = 'agent_resolved'
    agent_id: str = Field(alias='agentId')
    agent_revision: int = Field(alias='agentRevision')
    agent_tag: str | None = Field(None, alias='agentTag')
    thread_id: str = Field(alias='threadId')


class OutputTextDeltaEvent(BaseModel):
    """Streaming text chunk from the agent."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal['output_text_delta'] = 'output_text_delta'
    delta: str


class ToolCallDeltaEvent(BaseModel):
    """Streaming tool call argument chunk."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal['tool_call_delta'] = 'tool_call_delta'
    tool_call_id: str = Field(alias='toolCallId')
    name: str
    arguments_delta: str = Field(alias='argumentsDelta')


class ToolCallResultEvent(BaseModel):
    """Completed tool call with result."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal['tool_call_result'] = 'tool_call_result'
    tool_call_id: str = Field(alias='toolCallId')
    name: str
    arguments: Any
    result: Any


class ChatCompletedEvent(BaseModel):
    """Emitted when agent execution completes."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal['chat_completed'] = 'chat_completed'
    thread_id: str = Field(alias='threadId')
    status: Literal['completed', 'failed']
    output: str


class AgentErrorEvent(BaseModel):
    """Error event from the agent backend."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal['error'] = 'error'
    code: str
    message: str


# Union type for stream consumers
AgentStreamEvent = (
    AgentResolvedEvent
    | OutputTextDeltaEvent
    | ToolCallDeltaEvent
    | ToolCallResultEvent
    | ChatCompletedEvent
    | AgentErrorEvent
)
