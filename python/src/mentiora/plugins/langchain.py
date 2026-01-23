"""LangChain tracing plugin for Mentiora SDK.

Callback handler for automatically tracing LangChain executions.
"""

import logging
import secrets
from datetime import datetime
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult

from ..types import TraceError, TraceEvent, TraceType
from .types import MentioraTracingLangChainOptions

logger = logging.getLogger(__name__)


def _generate_trace_id() -> str:
    """Generate a random hex string for trace ID (32 hex chars = 16 bytes).

    OpenTelemetry spec requires trace_id to be 16 bytes (32 hex characters).
    """
    return secrets.token_hex(16)


def _generate_span_id() -> str:
    """Generate a random hex string for span ID (16 hex chars = 8 bytes).

    OpenTelemetry spec requires span_id to be 8 bytes (16 hex characters).
    """
    return secrets.token_hex(8)


def _map_run_type_to_trace_type(run_type: str) -> TraceType:
    """Convert LangChain run type to our TraceType."""
    run_type_lower = run_type.lower()
    if run_type_lower == 'llm':
        return 'llm'
    if run_type_lower == 'tool':
        return 'tool'
    if run_type_lower in ['chain', 'agent', 'retriever']:
        return 'custom'
    return 'custom'


async def _send_trace_safely(mentiora_client: Any, event: TraceEvent) -> None:  # type: ignore[type-arg]
    """Send trace event (non-blocking, errors are logged but don't throw)."""
    try:
        await mentiora_client.tracing.send_trace_async(event)
    except Exception as error:
        # Log error but don't break user's application
        logger.error('[MentioraTracingLangChain] Failed to send trace: %s', error)


class ActiveRun:
    """Track active run information."""

    def __init__(
        self,
        start_time: datetime,
        trace_id: str,
        span_id: str,
        parent_span_id: str | None,
        run_type: str,
        name: str,
        input: Any | None = None,
    ) -> None:
        """Initialize active run."""
        self.start_time = start_time
        self.trace_id = trace_id
        self.span_id = span_id
        self.parent_span_id = parent_span_id
        self.run_type = run_type
        self.name = name
        self.input = input


class MentioraTracingLangChain(BaseCallbackHandler):
    """Mentiora tracing callback handler for LangChain.

    Automatically traces LLM calls, chain executions, tool calls, and other LangChain operations.

    Example:
        ```python
        from mentiora import MentioraTracingLangChain, MentioraClient
        from langchain_openai import ChatOpenAI
        from langchain.chains import LLMChain

        mentiora_client = MentioraClient({ ... })
        callback = MentioraTracingLangChain({'mentiora_client': mentiora_client})

        llm = ChatOpenAI(temperature=0)
        chain = LLMChain(llm=llm, prompt=prompt)

        # Invoke with callback - all operations are automatically traced
        await chain.invoke({'input': '...'}, {'callbacks': [callback]})
        ```
    """

    name = 'MentioraTracingLangChain'

    def __init__(self, options: MentioraTracingLangChainOptions) -> None:
        """Initialize callback handler."""
        super().__init__()
        self.mentiora_client = options.mentiora_client
        self.tags = options.tags
        self.metadata = options.metadata or {}
        self.project_id = options.project_id

        if not self.mentiora_client:
            raise ValueError('mentiora_client is required')

        # Track active runs for parent-child relationships
        self.active_runs: dict[str, ActiveRun] = {}

    def _get_or_create_trace_id(self, run_id: str, parent_run_id: str | None) -> str:
        """Get or create trace ID for a run."""
        if parent_run_id:
            parent_run = self.active_runs.get(parent_run_id)
            if parent_run:
                return parent_run.trace_id
        return _generate_trace_id()

    def _get_span_id(self, run_id: str) -> str | None:
        """Get span ID for a run (from active_runs if exists, otherwise generate)."""
        run = self.active_runs.get(run_id)
        return run.span_id if run else None

    def _get_llm_name(self, llm: dict[str, Any] | Any) -> str:
        """Extract LLM name from serialized LLM object."""
        if isinstance(llm, dict):
            if 'id' in llm and isinstance(llm['id'], list) and llm['id']:
                return str(llm['id'][-1])
            if 'name' in llm:
                return str(llm['name'])
        elif hasattr(llm, 'id') and isinstance(llm.id, list) and llm.id:
            return str(llm.id[-1])
        elif hasattr(llm, 'name'):
            return str(llm.name)
        return 'unknown'

    def _get_chain_name(self, chain: dict[str, Any] | Any) -> str:
        """Extract chain name from serialized chain object."""
        if isinstance(chain, dict):
            if 'id' in chain and isinstance(chain['id'], list) and chain['id']:
                return str(chain['id'][-1])
            if 'name' in chain:
                return str(chain['name'])
        elif hasattr(chain, 'id') and isinstance(chain.id, list) and chain.id:
            return str(chain.id[-1])
        elif hasattr(chain, 'name'):
            return str(chain.name)
        return 'unknown'

    def _get_tool_name(self, tool: dict[str, Any] | Any) -> str:
        """Extract tool name from serialized tool object."""
        if isinstance(tool, dict):
            if 'id' in tool and isinstance(tool['id'], list) and tool['id']:
                return str(tool['id'][-1])
            if 'name' in tool:
                return str(tool['name'])
        elif hasattr(tool, 'id') and isinstance(tool.id, list) and tool.id:
            return str(tool.id[-1])
        elif hasattr(tool, 'name'):
            return str(tool.name)
        return 'unknown'

    async def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: str,
        parent_run_id: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle LLM start."""
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = _generate_span_id()

        self.active_runs[run_id] = ActiveRun(
            start_time=datetime.now(),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='llm',
            name=self._get_llm_name(serialized),
            input=prompts,
        )

    async def on_llm_end(self, response: LLMResult, *, run_id: str, **kwargs: Any) -> None:
        """Handle LLM end."""
        run = self.active_runs.get(run_id)
        if not run:
            return

        end_time = datetime.now()
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        # Extract output (generations)
        output_data = None
        if response.generations:
            output_data = [
                [
                    {
                        'text': gen.text,
                        'generationInfo': gen.generation_info,
                    }
                    for gen in gen_list
                ]
                for gen_list in response.generations
            ]

        # Extract token usage
        token_usage = None
        if response.llm_output and isinstance(response.llm_output, dict):
            usage = response.llm_output.get('tokenUsage')
            if usage and isinstance(usage, dict):
                token_usage = {
                    'promptTokens': usage.get('promptTokens'),
                    'completionTokens': usage.get('completionTokens'),
                    'totalTokens': usage.get('totalTokens'),
                }

        metadata: dict[str, Any] = {
            'provider': 'langchain',
            'runType': 'llm',
            'model': run.name,
            **self.metadata,
        }
        if token_usage:
            metadata.update(token_usage)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            name=f'langchain.llm.{run.name}',
            type='llm',
            input=run.input,
            output=output_data,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata=metadata,
            tags=self.tags,
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(run_id, None)

    async def on_llm_error(self, error: Exception, *, run_id: str, **kwargs: Any) -> None:
        """Handle LLM error."""
        run = self.active_runs.get(run_id)
        if not run:
            return

        end_time = datetime.now()
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            name=f'langchain.llm.{run.name}',
            type='error',
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=str(error.__traceback__) if hasattr(error, '__traceback__') else None,
            ),
            metadata={
                'provider': 'langchain',
                'runType': 'llm',
                'model': run.name,
                **self.metadata,
            },
            tags=self.tags,
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(run_id, None)

    async def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: str,
        parent_run_id: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle chain start."""
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = _generate_span_id()

        self.active_runs[run_id] = ActiveRun(
            start_time=datetime.now(),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='chain',
            name=self._get_chain_name(serialized),
            input=inputs,
        )

    async def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: str,
        **kwargs: Any,
    ) -> None:
        """Handle chain end."""
        run = self.active_runs.get(run_id)
        if not run:
            return

        end_time = datetime.now()
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            name=f'langchain.chain.{run.name}',
            type=_map_run_type_to_trace_type(run.run_type),
            input=run.input or {},
            output=outputs,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata={
                'provider': 'langchain',
                'runType': run.run_type,
                **self.metadata,
            },
            tags=self.tags,
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(run_id, None)

    async def on_chain_error(self, error: Exception, *, run_id: str, **kwargs: Any) -> None:
        """Handle chain error."""
        run = self.active_runs.get(run_id)
        if not run:
            return

        end_time = datetime.now()
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            name=f'langchain.chain.{run.name}',
            type='error',
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=str(error.__traceback__) if hasattr(error, '__traceback__') else None,
            ),
            metadata={
                'provider': 'langchain',
                'runType': run.run_type,
                **self.metadata,
            },
            tags=self.tags,
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(run_id, None)

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: str,
        parent_run_id: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle tool start."""
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = _generate_span_id()

        self.active_runs[run_id] = ActiveRun(
            start_time=datetime.now(),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='tool',
            name=self._get_tool_name(serialized),
            input=input_str,
        )

    async def on_tool_end(self, output: str, *, run_id: str, **kwargs: Any) -> None:
        """Handle tool end."""
        run = self.active_runs.get(run_id)
        if not run:
            return

        end_time = datetime.now()
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            name=f'langchain.tool.{run.name}',
            type='tool',
            input=run.input or {},
            output=output,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata={
                'provider': 'langchain',
                'runType': 'tool',
                **self.metadata,
            },
            tags=self.tags,
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(run_id, None)

    async def on_tool_error(self, error: Exception, *, run_id: str, **kwargs: Any) -> None:
        """Handle tool error."""
        run = self.active_runs.get(run_id)
        if not run:
            return

        end_time = datetime.now()
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            name=f'langchain.tool.{run.name}',
            type='error',
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=str(error.__traceback__) if hasattr(error, '__traceback__') else None,
            ),
            metadata={
                'provider': 'langchain',
                'runType': 'tool',
                **self.metadata,
            },
            tags=self.tags,
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(run_id, None)
