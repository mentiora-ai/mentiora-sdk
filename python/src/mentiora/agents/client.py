"""Client for running agents via the Mentiora API."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator, Iterator

from ..errors import NetworkError, ValidationError
from ..http import HttpClient
from ..sse import SSEEvent
from .types import (
    AgentErrorEvent,
    AgentResolvedEvent,
    AgentRunParams,
    AgentRunResult,
    AgentStreamEvent,
    ChatCompletedEvent,
    OutputTextDeltaEvent,
    ToolCallDeltaEvent,
    ToolCallResultEvent,
)

TAG_REGEX = re.compile(r'^[a-z0-9][a-z0-9\-_]*$')

logger = logging.getLogger('mentiora.sdk')

AGENTS_RUN_PATH = '/api/v1/agents/run'


class AgentsClient:
    """Client for running agents via the Mentiora API."""

    def __init__(self, http_client: HttpClient) -> None:
        """Initialize the agents client.

        Args:
            http_client: The shared HTTP client instance.
        """
        self._http_client = http_client

    @property
    def _debug(self) -> bool:
        return self._http_client.debug

    def run(self, params: AgentRunParams) -> AgentRunResult:
        """Run an agent synchronously and return the complete result.

        Args:
            params: Agent run parameters (tag/agentId, message, etc.).

        Returns:
            The complete agent run result with output and tool calls.

        Raises:
            ValidationError: If params are invalid (empty message, missing tag/agentId).
            NetworkError: On HTTP errors or connection failures.
        """
        self._validate_params(params)
        if self._debug:
            logger.debug(
                '[Mentiora SDK] agents.run: tag=%s agent_id=%s', params.tag, params.agent_id
            )
        body = params.to_api_body(stream=False)
        response = self._http_client.post(AGENTS_RUN_PATH, body)
        return self._parse_run_result(response.body)

    async def run_async(self, params: AgentRunParams) -> AgentRunResult:
        """Run an agent asynchronously and return the complete result.

        Args:
            params: Agent run parameters (tag/agentId, message, etc.).

        Returns:
            The complete agent run result with output and tool calls.

        Raises:
            ValidationError: If params are invalid (empty message, missing tag/agentId).
            NetworkError: On HTTP errors or connection failures.
        """
        self._validate_params(params)
        if self._debug:
            logger.debug(
                '[Mentiora SDK] agents.run_async: tag=%s agent_id=%s', params.tag, params.agent_id
            )
        body = params.to_api_body(stream=False)
        response = await self._http_client.post_async(AGENTS_RUN_PATH, body)
        return self._parse_run_result(response.body)

    def stream(self, params: AgentRunParams) -> Iterator[AgentStreamEvent]:
        """Run an agent with streaming (sync). Yields events as they arrive.

        Args:
            params: Agent run parameters (tag/agentId, message, etc.).

        Yields:
            Typed AgentStreamEvent objects as they arrive from the server.

        Raises:
            ValidationError: If params are invalid.
            NetworkError: On HTTP errors or connection failures.
        """
        self._validate_params(params)
        if self._debug:
            logger.debug(
                '[Mentiora SDK] agents.stream: tag=%s agent_id=%s', params.tag, params.agent_id
            )
        body = params.to_api_body(stream=True)
        for sse_event in self._http_client.post_stream(AGENTS_RUN_PATH, body):
            parsed = self._parse_stream_event(sse_event)
            if parsed is not None:
                if self._debug:
                    logger.debug('[Mentiora SDK] Stream event: type=%s', type(parsed).__name__)
                yield parsed
                if isinstance(parsed, AgentErrorEvent):
                    break

    async def stream_async(self, params: AgentRunParams) -> AsyncIterator[AgentStreamEvent]:
        """Run an agent with streaming (async). Yields events as they arrive.

        Args:
            params: Agent run parameters (tag/agentId, message, etc.).

        Yields:
            Typed AgentStreamEvent objects as they arrive from the server.

        Raises:
            ValidationError: If params are invalid.
            NetworkError: On HTTP errors or connection failures.
        """
        self._validate_params(params)
        if self._debug:
            logger.debug(
                '[Mentiora SDK] agents.stream_async: tag=%s agent_id=%s',
                params.tag,
                params.agent_id,
            )
        body = params.to_api_body(stream=True)
        async for sse_event in self._http_client.post_stream_async(AGENTS_RUN_PATH, body):
            parsed = self._parse_stream_event(sse_event)
            if parsed is not None:
                if self._debug:
                    logger.debug('[Mentiora SDK] Stream event: type=%s', type(parsed).__name__)
                yield parsed
                if isinstance(parsed, AgentErrorEvent):
                    break

    def _validate_params(self, params: AgentRunParams) -> None:
        """Validate agent run parameters."""
        if not params.message or not params.message.strip():
            raise ValidationError('message is required and cannot be empty')
        if not params.tag and not params.agent_id:
            raise ValidationError('Either tag or agent_id must be provided')
        if params.tag and params.agent_id:
            raise ValidationError('Provide either tag or agent_id, not both')
        if params.tag and not TAG_REGEX.match(params.tag):
            raise ValidationError(
                f'Invalid tag format: "{params.tag}". '
                'Must start with a lowercase letter or digit and contain only [a-z0-9-_].'
            )
        if params.model_params:
            if params.model_params.temperature is not None and not (
                0 <= params.model_params.temperature <= 2
            ):
                raise ValidationError('temperature must be between 0 and 2')
            if params.model_params.max_tokens is not None and params.model_params.max_tokens <= 0:
                raise ValidationError('max_tokens must be a positive integer')

    def _parse_run_result(self, body: dict[str, object]) -> AgentRunResult:
        """Parse API JSON response into AgentRunResult."""
        return AgentRunResult.model_validate(body)

    def _extract_assistant_output(self, raw_output: object) -> str:
        """Extract assistant text from the API output field.

        The API may return output as a plain string or as an array of message
        objects: ``[{"type": "message", "content": [{"text": "..."}]}]``.
        """
        if isinstance(raw_output, list):
            assistant_msg = next(
                (o for o in raw_output if isinstance(o, dict) and o.get('type') == 'message'),
                None,
            )
            content = (assistant_msg or {}).get('content', [])
            if content and isinstance(content[0], dict):
                return str(content[0].get('text', ''))
            return ''
        return raw_output if isinstance(raw_output, str) else str(raw_output)

    def _parse_stream_event(self, sse: SSEEvent) -> AgentStreamEvent | None:
        """Parse an SSE event into a typed AgentStreamEvent."""
        # Backend sends `data: [DONE]` as a stream termination signal — skip it
        if sse.data == '[DONE]':
            return None

        try:
            data = json.loads(sse.data)
        except json.JSONDecodeError:
            raise NetworkError(f'Failed to parse SSE event data: {sse.data}') from None

        match sse.event:
            case 'agent.resolved':
                return AgentResolvedEvent.model_validate(data)
            case 'chat.output_text.delta':
                return OutputTextDeltaEvent(delta=data.get('delta', ''))
            case 'chat.tool_call.delta':
                return ToolCallDeltaEvent.model_validate(data)
            case 'chat.tool_call.result':
                return ToolCallResultEvent.model_validate(data)
            case 'chat.completed':
                chat = data.get('chat', data)
                return ChatCompletedEvent(
                    thread_id=chat.get('thread_id', ''),
                    status=chat.get('status', 'completed'),
                    output=self._extract_assistant_output(chat.get('output', '')),
                )
            case 'error':
                return AgentErrorEvent(
                    code=data.get('code', 'UNKNOWN'),
                    message=data.get('message', 'Unknown error'),
                )
            case _:
                # Unknown events silently skipped (forward compatibility)
                return None
