"""LangChain tracing plugin for Mentiora SDK.

Callback handler for automatically tracing LangChain executions.
"""

import logging
import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.outputs import LLMResult

from ..errors import ConfigurationError
from ..types import TraceError, TraceEvent, TraceType, UsageInfo
from ..utils import format_exception_stack, uuid7
from .types import MentioraTracingLangChainOptions

logger = logging.getLogger(__name__)


def _map_langchain_role(role: str) -> str:
    """Map LangChain message roles to standard roles."""
    if role == 'human':
        return 'user'
    if role == 'ai':
        return 'assistant'
    return role


def _get_name_from_serialized(serialized: dict[str, Any] | Any) -> str:
    """Extract name from a serialized LangChain object (LLM, chain, tool, or retriever)."""
    if isinstance(serialized, dict):
        if 'id' in serialized and isinstance(serialized['id'], list) and serialized['id']:
            return str(serialized['id'][-1])
        if 'name' in serialized:
            return str(serialized['name'])
    elif hasattr(serialized, 'id') and isinstance(serialized.id, list) and serialized.id:
        return str(serialized.id[-1])
    elif hasattr(serialized, 'name'):
        return str(serialized.name)
    return 'unknown'


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


async def _send_trace_safely(mentiora_client: Any, event: TraceEvent) -> None:
    """Send trace event (non-blocking, errors are silently ignored)."""
    try:
        await mentiora_client.tracing.send_trace_async(event)
    except Exception as e:
        if mentiora_client.debug:
            logger.debug(
                '[Mentiora SDK - LangChain Plugin] Failed to send trace: trace_id=%s span_id=%s operation=%s error=%s',
                event.trace_id,
                event.span_id,
                event.name,
                str(e),
                exc_info=True,
            )


def _extract_user_prompt(prompts: list[str] | None) -> str | None:
    """Extract the last prompt as a user prompt string."""
    if not isinstance(prompts, list) or len(prompts) == 0:
        return None
    last_prompt = prompts[-1]
    return str(last_prompt) if last_prompt else None


def _extract_assistant_content(generations: list[list[Any]] | None) -> str | None:
    """Extract the assistant's response content from LLM generations."""
    if not generations or len(generations) == 0:
        return None

    first_gen_list = generations[0]
    if not first_gen_list or len(first_gen_list) == 0:
        return None

    first_gen = first_gen_list[0]
    if hasattr(first_gen, 'text'):
        return str(first_gen.text)
    elif isinstance(first_gen, dict):
        return str(first_gen.get('text', ''))

    return None


def _extract_model_name(
    serialized: dict[str, Any] | Any, llm_output: dict[str, Any] | None = None
) -> str | None:
    """Extract actual model name from serialized LLM or response output."""
    if llm_output and isinstance(llm_output, dict):
        model = llm_output.get('model_name') or llm_output.get('modelName')
        if isinstance(model, str):
            return model

    if isinstance(serialized, dict):
        kwargs = serialized.get('kwargs', {})
        if isinstance(kwargs, dict):
            model = kwargs.get('model_name') or kwargs.get('modelName') or kwargs.get('model')
            if isinstance(model, str):
                return model

        if 'id' in serialized and isinstance(serialized['id'], list) and serialized['id']:
            return str(serialized['id'][-1])
        if 'name' in serialized:
            return str(serialized['name'])
    elif hasattr(serialized, 'kwargs'):
        kwargs = serialized.kwargs
        if isinstance(kwargs, dict):
            model = kwargs.get('model_name') or kwargs.get('modelName') or kwargs.get('model')
            if isinstance(model, str):
                return model

    return None


def _format_messages_from_prompts(prompts: list[str] | None) -> list[dict[str, Any]]:
    """Convert prompts list to message format for chat models."""
    if not isinstance(prompts, list):
        return []

    return [
        {
            'role': 'user',
            'content': str(prompt),
        }
        for prompt in prompts
        if prompt
    ]


def _extract_usage_from_llm_output(llm_output: dict[str, Any]) -> UsageInfo | None:
    """Extract token usage from llm_output dict (handles multiple formats)."""
    # Try nested tokenUsage/token_usage first (LangChain format)
    usage = llm_output.get('tokenUsage') or llm_output.get('token_usage')
    if usage and isinstance(usage, dict):
        prompt_tokens = usage.get('promptTokens') or usage.get('prompt_tokens')
        completion_tokens = usage.get('completionTokens') or usage.get('completion_tokens')
        total_tokens = usage.get('totalTokens') or usage.get('total_tokens')

        usage_dict = {}
        if isinstance(prompt_tokens, int):
            usage_dict['prompt_tokens'] = prompt_tokens
        if isinstance(completion_tokens, int):
            usage_dict['completion_tokens'] = completion_tokens
        if isinstance(total_tokens, int):
            usage_dict['total_tokens'] = total_tokens

        if usage_dict:
            return UsageInfo(**usage_dict)

    # Try direct keys in llm_output
    prompt_tokens = llm_output.get('prompt_tokens') or llm_output.get('promptTokens')
    completion_tokens = llm_output.get('completion_tokens') or llm_output.get('completionTokens')
    total_tokens = llm_output.get('total_tokens') or llm_output.get('totalTokens')

    usage_dict = {}
    if isinstance(prompt_tokens, int):
        usage_dict['prompt_tokens'] = prompt_tokens
    if isinstance(completion_tokens, int):
        usage_dict['completion_tokens'] = completion_tokens
    if isinstance(total_tokens, int):
        usage_dict['total_tokens'] = total_tokens

    if usage_dict:
        return UsageInfo(**usage_dict)

    return None


def _extract_usage_from_generation_info(generations: list[list[Any]] | None) -> UsageInfo | None:
    """Fallback: extract token usage from generation_info of the first generation."""
    if not generations or len(generations) == 0:
        return None

    first_gen_list = generations[0]
    if not first_gen_list or len(first_gen_list) == 0:
        return None

    first_gen = first_gen_list[0]
    gen_info = getattr(first_gen, 'generation_info', None)
    if not gen_info or not isinstance(gen_info, dict):
        return None

    # Try token_usage or usage keys inside generation_info
    usage = gen_info.get('token_usage') or gen_info.get('usage')
    if usage and isinstance(usage, dict):
        usage_dict = {}
        prompt_tokens = usage.get('prompt_tokens') or usage.get('promptTokens')
        completion_tokens = usage.get('completion_tokens') or usage.get('completionTokens')
        total_tokens = usage.get('total_tokens') or usage.get('totalTokens')

        if isinstance(prompt_tokens, int):
            usage_dict['prompt_tokens'] = prompt_tokens
        if isinstance(completion_tokens, int):
            usage_dict['completion_tokens'] = completion_tokens
        if isinstance(total_tokens, int):
            usage_dict['total_tokens'] = total_tokens

        if usage_dict:
            return UsageInfo(**usage_dict)

    return None


_RUN_TTL_SECONDS = 300  # 5 minutes


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
        serialized: Any | None = None,
    ) -> None:
        """Initialize active run."""
        self.start_time = start_time
        self.trace_id = trace_id
        self.span_id = span_id
        self.parent_span_id = parent_span_id
        self.run_type = run_type
        self.name = name
        self.input = input
        self.serialized = serialized
        self.created_at = time.monotonic()


class MentioraTracingLangChain(AsyncCallbackHandler):
    """Mentiora tracing callback handler for LangChain.

    Automatically traces LLM calls, chain executions, tool calls,
    retriever queries, and other LangChain operations.

    Example:
        ```python
        from mentiora import MentioraTracingLangChain, MentioraClient, MentioraConfig
        from langchain_openai import ChatOpenAI
        from langchain_core.prompts import ChatPromptTemplate

        mentiora_client = MentioraClient(MentioraConfig(api_key='your-api-key'))
        callback = MentioraTracingLangChain(
            MentioraTracingLangChainOptions(mentiora_client=mentiora_client)
        )

        llm = ChatOpenAI(temperature=0)
        chain = ChatPromptTemplate.from_template('{input}') | llm

        # Invoke with callback - all operations are automatically traced
        await chain.ainvoke({'input': '...'}, config={'callbacks': [callback]})
        ```
    """

    name = 'MentioraTracingLangChain'

    def __init__(self, options: MentioraTracingLangChainOptions) -> None:
        """Initialize callback handler."""
        super().__init__()

        if not options.mentiora_client:
            raise ConfigurationError('mentiora_client is required')

        self.mentiora_client = options.mentiora_client
        self.thread_id = (options.thread_id and options.thread_id.strip()) or str(uuid7())
        self.tags = options.tags
        self.metadata = options.metadata or {}
        self.capture_content = options.capture_content

        # Track active runs for parent-child relationships
        self.active_runs: dict[str, ActiveRun] = {}

    def _cleanup_stale_runs(self) -> None:
        """Remove active runs older than TTL to prevent memory leaks."""
        now = time.monotonic()
        stale_keys = [
            key
            for key, run in self.active_runs.items()
            if (now - run.created_at) > _RUN_TTL_SECONDS
        ]
        for key in stale_keys:
            self.active_runs.pop(key, None)

    def _get_or_create_trace_id(self, run_id: UUID, parent_run_id: UUID | None) -> str:
        """Get or create trace ID for a run."""
        if parent_run_id:
            parent_run = self.active_runs.get(str(parent_run_id))
            if parent_run:
                return parent_run.trace_id
        return str(uuid7())

    def _get_span_id(self, run_id: UUID) -> str | None:
        """Get span ID for a run (from active_runs if exists, otherwise generate)."""
        run = self.active_runs.get(str(run_id))
        return run.span_id if run else None

    def _get_llm_name(
        self, llm: dict[str, Any] | Any, llm_output: dict[str, Any] | None = None
    ) -> str:
        """Extract LLM name from serialized LLM object, preferring actual model name."""
        model_name = _extract_model_name(llm, llm_output)
        if model_name:
            return model_name

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

    async def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle LLM start."""
        self._cleanup_stale_runs()
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = str(uuid7())

        input_data: dict[str, Any] = {
            'prompt': _extract_user_prompt(prompts),
            'prompts': prompts,
        }
        messages = _format_messages_from_prompts(prompts)
        if messages:
            input_data['messages'] = messages

        self.active_runs[str(run_id)] = ActiveRun(
            start_time=datetime.now(UTC),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='llm',
            name=self._get_llm_name(serialized),
            input=input_data,
            serialized=serialized,
        )

    async def on_llm_end(self, response: LLMResult, *, run_id: UUID, **kwargs: Any) -> None:
        """Handle LLM/chat model end."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        is_chat_model = run.run_type == 'chat_model'
        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        content: str | None = None
        output_data: dict[str, Any] = {}

        if is_chat_model:
            choices_data: list[dict[str, Any]] = []
            if response.generations and len(response.generations) > 0:
                first_gen_list = response.generations[0]
                if first_gen_list and len(first_gen_list) > 0:
                    first_gen = first_gen_list[0]
                    if hasattr(first_gen, 'message'):
                        msg = first_gen.message
                        if hasattr(msg, 'content'):
                            content = str(msg.content)
                        raw_role = (
                            getattr(msg, 'type', 'assistant')
                            if hasattr(msg, 'type')
                            else 'assistant'
                        )
                        choices_data.append(
                            {
                                'message': {
                                    'role': _map_langchain_role(raw_role),
                                    'content': content,
                                },
                                'generation_info': getattr(first_gen, 'generation_info', {}),
                            }
                        )
                    elif hasattr(first_gen, 'text'):
                        content = str(first_gen.text)
                        choices_data.append(
                            {
                                'text': content,
                                'generation_info': getattr(first_gen, 'generation_info', {}),
                            }
                        )

            output_data = {'content': content}
            if choices_data:
                output_data['choices'] = choices_data
        else:
            content = _extract_assistant_content(response.generations)

            generations_data = None
            if response.generations:
                generations_data = [
                    [
                        {
                            'text': gen.text,
                            'generationInfo': gen.generation_info,
                        }
                        for gen in gen_list
                    ]
                    for gen_list in response.generations
                ]

            output_data = {'content': content}
            if generations_data:
                output_data['generations'] = generations_data

        # Extract token usage with fallback to generation_info
        usage_info: UsageInfo | None = None
        if response.llm_output and isinstance(response.llm_output, dict):
            usage_info = _extract_usage_from_llm_output(response.llm_output)
        if not usage_info:
            usage_info = _extract_usage_from_generation_info(response.generations)

        model_name = self._get_llm_name(run.serialized, response.llm_output)
        if not model_name or model_name == 'unknown':
            model_name = run.name if isinstance(run.name, str) else 'unknown'

        run_type_label = 'chat_model' if is_chat_model else 'llm'

        capture = self.capture_content

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.{run_type_label}.{run.name}',
            type='llm',
            input=run.input if capture else None,
            output=output_data if capture else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata={
                'runType': run_type_label,
                **self.metadata,
            },
            tags=self.tags,
            usage=usage_info,
            model=model_name,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_llm_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        """Handle LLM/chat model error."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        is_chat_model = run.run_type == 'chat_model'
        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        model_name = self._get_llm_name(run.serialized) if run.serialized else run.name
        if not model_name or model_name == 'unknown':
            model_name = run.name if isinstance(run.name, str) else 'unknown'

        run_type_label = 'chat_model' if is_chat_model else 'llm'

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.{run_type_label}.{run.name}',
            type='error',
            input=run.input if self.capture_content else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=format_exception_stack(error),
            ),
            metadata={
                'runType': run_type_label,
                **self.metadata,
            },
            tags=self.tags,
            model=model_name,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[Any]],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle chat model start (for ChatOpenAI and other chat models)."""
        self._cleanup_stale_runs()
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = str(uuid7())

        formatted_messages: list[dict[str, Any]] = []
        last_user_content: str | None = None

        if messages and len(messages) > 0:
            first_message_list = messages[0]
            if isinstance(first_message_list, list):
                for msg in first_message_list:
                    if hasattr(msg, 'content') and hasattr(msg, 'type'):
                        raw_role = getattr(msg, 'type', 'user')
                        role = _map_langchain_role(raw_role)
                        content = getattr(msg, 'content', '')
                        formatted_messages.append(
                            {
                                'role': role,
                                'content': str(content),
                            }
                        )
                        if role == 'user':
                            last_user_content = str(content)
                    elif isinstance(msg, dict):
                        raw_role = msg.get('type') or msg.get('role', 'user')
                        role = _map_langchain_role(raw_role)
                        content = msg.get('content', '')
                        formatted_messages.append(
                            {
                                'role': role,
                                'content': str(content),
                            }
                        )
                        if role == 'user':
                            last_user_content = str(content)

        input_data: dict[str, Any] = {
            'prompt': last_user_content,
            'messages': formatted_messages,
        }

        self.active_runs[str(run_id)] = ActiveRun(
            start_time=datetime.now(UTC),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='chat_model',
            name=self._get_llm_name(serialized),
            input=input_data,
            serialized=serialized,
        )

    async def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle chain start."""
        self._cleanup_stale_runs()
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = str(uuid7())

        input_data: dict[str, Any] = dict(inputs) if isinstance(inputs, dict) else {}
        prompt = None

        for key in ['input', 'prompt', 'query', 'question', 'text', 'message']:
            if key in input_data and isinstance(input_data[key], str):
                prompt = input_data[key]
                break

        if not prompt:
            for value in input_data.values():
                if isinstance(value, str) and value.strip():
                    prompt = value
                    break

        if prompt:
            input_data['prompt'] = prompt

        self.active_runs[str(run_id)] = ActiveRun(
            start_time=datetime.now(UTC),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='chain',
            name=_get_name_from_serialized(serialized),
            input=input_data,
            serialized=serialized,
        )

    async def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Handle chain end."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        content = None
        output_data: dict[str, Any] = {}

        if isinstance(outputs, str):
            content = outputs
            output_data = {'content': content, 'raw_output': outputs}
        elif not isinstance(outputs, dict) and outputs is not None:
            if hasattr(outputs, 'content'):
                content = str(outputs.content) if outputs.content is not None else None
            elif hasattr(outputs, 'text'):
                content = str(outputs.text) if outputs.text is not None else None
            elif hasattr(outputs, 'message') and hasattr(outputs.message, 'content'):
                content = (
                    str(outputs.message.content) if outputs.message.content is not None else None
                )

            try:
                if hasattr(outputs, 'model_dump'):
                    output_data = outputs.model_dump()
                elif hasattr(outputs, 'dict'):
                    output_data = outputs.dict()
                elif hasattr(outputs, '__dict__'):
                    output_data = outputs.__dict__.copy()
                else:
                    output_data = (
                        dict(outputs)
                        if hasattr(outputs, '__iter__') and not isinstance(outputs, str)
                        else {}
                    )
            except Exception:
                output_data = {'raw_output': repr(outputs)}

            if content:
                output_data['content'] = content
        elif isinstance(outputs, dict):
            output_data = dict(outputs)

            for key in ['output', 'text', 'answer', 'response', 'result', 'content']:
                if key in output_data:
                    value = output_data[key]
                    if isinstance(value, str):
                        content = value
                        break
                    elif isinstance(value, dict) and 'text' in value:
                        content = value['text']
                        break
                    elif isinstance(value, dict) and 'content' in value:
                        content = value['content']
                        break
                    elif hasattr(value, 'content'):
                        content = str(value.content) if value.content is not None else None
                        if content:
                            break
                    elif hasattr(value, 'text'):
                        content = str(value.text) if value.text is not None else None
                        if content:
                            break

            if not content:
                for value in output_data.values():
                    if isinstance(value, str) and value.strip():
                        content = value
                        break
                    elif hasattr(value, 'content') and value.content:
                        content = str(value.content)
                        break

            if not content and len(output_data) == 1:
                single_value = next(iter(output_data.values()))
                if isinstance(single_value, str) and single_value.strip():
                    content = single_value

        if 'content' not in output_data:
            output_data['content'] = content
        elif output_data['content'] is None and content:
            output_data['content'] = content

        capture = self.capture_content

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.chain.{run.name}',
            type=_map_run_type_to_trace_type(run.run_type),
            input=(run.input or {}) if capture else None,
            output=output_data if capture else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata={
                'runType': run.run_type,
                **self.metadata,
            },
            tags=self.tags,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_chain_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        """Handle chain error."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.chain.{run.name}',
            type='error',
            input=(run.input or {}) if self.capture_content else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=format_exception_stack(error),
            ),
            metadata={
                'runType': run.run_type,
                **self.metadata,
            },
            tags=self.tags,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle tool start."""
        self._cleanup_stale_runs()
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = str(uuid7())

        input_data: dict[str, Any] = {'input': input_str}

        self.active_runs[str(run_id)] = ActiveRun(
            start_time=datetime.now(UTC),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='tool',
            name=_get_name_from_serialized(serialized),
            input=input_data,
            serialized=serialized,
        )

    async def on_tool_end(self, output: str, *, run_id: UUID, **kwargs: Any) -> None:
        """Handle tool end."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        input_data: dict[str, Any] = {}
        if isinstance(run.input, dict):
            input_data = run.input
        elif isinstance(run.input, str):
            input_data = {'input': run.input}

        output_data: dict[str, Any] = {
            'output': output,
            'content': output,
        }

        capture = self.capture_content

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.tool.{run.name}',
            type='tool',
            input=input_data if capture else None,
            output=output_data if capture else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata={
                'runType': 'tool',
                **self.metadata,
            },
            tags=self.tags,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_tool_error(self, error: BaseException, *, run_id: UUID, **kwargs: Any) -> None:
        """Handle tool error."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        input_data: dict[str, Any] = {}
        if isinstance(run.input, dict):
            input_data = run.input
        elif isinstance(run.input, str):
            input_data = {'input': run.input}

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.tool.{run.name}',
            type='error',
            input=input_data if self.capture_content else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=format_exception_stack(error),
            ),
            metadata={
                'runType': 'tool',
                **self.metadata,
            },
            tags=self.tags,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_retriever_start(
        self,
        serialized: dict[str, Any],
        query: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **kwargs: Any,
    ) -> None:
        """Handle retriever start."""
        self._cleanup_stale_runs()
        trace_id = self._get_or_create_trace_id(run_id, parent_run_id)
        parent_span_id = self._get_span_id(parent_run_id) if parent_run_id else None
        span_id = str(uuid7())

        input_data: dict[str, Any] = {
            'query': query,
            'prompt': query,
        }

        self.active_runs[str(run_id)] = ActiveRun(
            start_time=datetime.now(UTC),
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            run_type='retriever',
            name=_get_name_from_serialized(serialized),
            input=input_data,
            serialized=serialized,
        )

    async def on_retriever_end(
        self,
        documents: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Handle retriever end."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        # Extract document data
        docs_list: list[dict[str, Any]] = []
        first_content: str | None = None

        if documents:
            for doc in documents:
                doc_data: dict[str, Any] = {}
                if hasattr(doc, 'page_content'):
                    doc_data['page_content'] = doc.page_content
                    if first_content is None:
                        first_content = doc.page_content
                if hasattr(doc, 'metadata'):
                    doc_data['metadata'] = doc.metadata
                docs_list.append(doc_data)

        output_data: dict[str, Any] = {
            'documents': docs_list,
            'content': first_content,
            'document_count': len(docs_list),
        }

        capture = self.capture_content

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.retriever.{run.name}',
            type='custom',
            input=(run.input or {}) if capture else None,
            output=output_data if capture else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            metadata={
                'runType': 'retriever',
                **self.metadata,
            },
            tags=self.tags,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)

    async def on_retriever_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Handle retriever error."""
        run = self.active_runs.get(str(run_id))
        if not run:
            return

        end_time = datetime.now(UTC)
        duration_ms = int((end_time - run.start_time).total_seconds() * 1000)

        trace_event = TraceEvent(
            trace_id=run.trace_id,
            span_id=run.span_id,
            parent_span_id=run.parent_span_id,
            thread_id=self.thread_id,
            name=f'langchain.retriever.{run.name}',
            type='error',
            input=(run.input or {}) if self.capture_content else None,
            start_time=run.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            error=TraceError(
                message=str(error),
                type=type(error).__name__,
                stack=format_exception_stack(error),
            ),
            metadata={
                'runType': 'retriever',
                **self.metadata,
            },
            tags=self.tags,
            provider='langchain',
        )

        await _send_trace_safely(self.mentiora_client, trace_event)
        self.active_runs.pop(str(run_id), None)
