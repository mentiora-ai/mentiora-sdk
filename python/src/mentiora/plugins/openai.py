"""OpenAI tracing plugin for Mentiora SDK.

Wraps OpenAI client to automatically trace API calls.
Supports both sync (OpenAI) and async (AsyncOpenAI) clients,
as well as streaming and non-streaming responses.
"""

import logging
from datetime import UTC, datetime
from functools import wraps
from typing import Any

from uuid_utils import uuid7

from ..errors import ConfigurationError
from ..types import TraceError, TraceEvent, UsageInfo
from ..utils import format_exception_stack
from .types import TrackOpenAIOptions

logger = logging.getLogger(__name__)


def _to_dict(obj: Any) -> dict[str, Any] | None:
    """Convert Pydantic model or dict to dict."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, 'model_dump'):
        return obj.model_dump()  # type: ignore[no-any-return]
    return None


def _extract_token_usage(response: Any) -> UsageInfo | None:
    """Extract token usage from OpenAI response."""
    response_dict = _to_dict(response)
    if not response_dict:
        return None

    usage = response_dict.get('usage')
    if not usage or not isinstance(usage, dict):
        return None

    usage_info = {}
    if isinstance(usage.get('prompt_tokens'), int):
        usage_info['prompt_tokens'] = usage.get('prompt_tokens')
    if isinstance(usage.get('completion_tokens'), int):
        usage_info['completion_tokens'] = usage.get('completion_tokens')
    if isinstance(usage.get('total_tokens'), int):
        usage_info['total_tokens'] = usage.get('total_tokens')

    return UsageInfo(**usage_info) if usage_info else None


def _extract_model(request: Any, response: Any) -> str | None:
    """Extract model name from OpenAI request or response."""
    response_dict = _to_dict(response)
    if response_dict:
        model = response_dict.get('model')
        if isinstance(model, str):
            return model

    request_dict = _to_dict(request) if not isinstance(request, dict) else request
    if request_dict:
        model = request_dict.get('model')
        if isinstance(model, str):
            return model

    return None


def _extract_user_prompt(messages: list[dict[str, Any]] | None) -> str | None:
    """Extract the last user message content as a prompt string."""
    if not isinstance(messages, list) or len(messages) == 0:
        return None

    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get('role') == 'user':
            content = msg.get('content')
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                text_parts = [
                    part.get('text')
                    for part in content
                    if isinstance(part, dict) and part.get('type') == 'text'
                ]
                text_parts_filtered: list[str] = [t for t in text_parts if isinstance(t, str)]
                if text_parts_filtered:
                    return '\n'.join(text_parts_filtered)

    return None


def _extract_assistant_response(response_dict: dict[str, Any] | None) -> str | None:
    """Extract the assistant's response content from OpenAI response."""
    if not response_dict:
        return None

    choices = response_dict.get('choices', [])
    if not isinstance(choices, list) or len(choices) == 0:
        return None

    first_choice = choices[0]
    if isinstance(first_choice, dict):
        message = first_choice.get('message', {})
        if isinstance(message, dict):
            content = message.get('content')
            if isinstance(content, str):
                return content
            refusal = message.get('refusal')
            if isinstance(refusal, str):
                return f'[REFUSED] {refusal}'
            # If content is None but tool_calls exist, describe them
            tool_calls = message.get('tool_calls')
            if tool_calls and isinstance(tool_calls, list):
                descriptions = []
                for tc in tool_calls:
                    if isinstance(tc, dict):
                        fn = tc.get('function', {})
                        if isinstance(fn, dict):
                            descriptions.append(
                                f'{fn.get("name", "unknown")}({fn.get("arguments", "")})'
                            )
                if descriptions:
                    return '; '.join(descriptions)

    return None


def _format_messages(messages: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Convert OpenAI chat completion messages to structured format."""
    if not isinstance(messages, list):
        return []

    formatted = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        entry: dict[str, Any] = {
            'role': msg.get('role'),
            'content': msg.get('content'),
        }
        if msg.get('tool_calls') is not None:
            entry['tool_calls'] = msg.get('tool_calls')
        if msg.get('tool_call_id') is not None:
            entry['tool_call_id'] = msg.get('tool_call_id')
        if msg.get('name') is not None:
            entry['name'] = msg.get('name')
        if msg.get('refusal') is not None:
            entry['refusal'] = msg.get('refusal')
        if msg.get('function_call') is not None:
            entry['function_call'] = msg.get('function_call')
        formatted.append(entry)
    return formatted


def _build_input_data(kwargs: dict[str, Any]) -> dict[str, Any]:
    """Build trace input data from chat.completions.create kwargs, capturing all params dynamically."""
    messages = kwargs.get('messages')
    result = dict(kwargs)
    result['prompt'] = _extract_user_prompt(messages)
    result['messages'] = _format_messages(messages)
    return {k: v for k, v in result.items() if v is not None}


def _extract_token_usage_dict(response: Any) -> dict[str, Any] | None:
    """Extract token usage as a plain dict for embedding in output data."""
    response_dict = _to_dict(response) if not isinstance(response, dict) else response
    if not response_dict:
        return None
    usage = response_dict.get('usage')
    if not usage or not isinstance(usage, dict):
        return None
    result: dict[str, Any] = {}
    if isinstance(usage.get('prompt_tokens'), int):
        result['prompt_tokens'] = usage['prompt_tokens']
    if isinstance(usage.get('completion_tokens'), int):
        result['completion_tokens'] = usage['completion_tokens']
    if isinstance(usage.get('total_tokens'), int):
        result['total_tokens'] = usage['total_tokens']
    return result if result else None


def _build_output_data(response: Any) -> dict[str, Any] | None:
    """Build trace output data from a non-streaming OpenAI response."""
    response_dict = _to_dict(response)
    if not response_dict:
        return None

    assistant_content = _extract_assistant_response(response_dict)
    choices = response_dict.get('choices', [])
    usage_dict = _extract_token_usage_dict(response_dict)

    formatted_choices = []
    if isinstance(choices, list):
        for choice in choices:
            message = choice.get('message', {})
            msg_entry: dict[str, Any] = {
                'role': message.get('role'),
                'content': message.get('content'),
                'tool_calls': message.get('tool_calls'),
            }
            if message.get('refusal') is not None:
                msg_entry['refusal'] = message.get('refusal')
            choice_entry: dict[str, Any] = {
                'index': choice.get('index'),
                'message': msg_entry,
                'finish_reason': choice.get('finish_reason'),
            }
            if choice.get('logprobs') is not None:
                choice_entry['logprobs'] = choice.get('logprobs')
            formatted_choices.append(choice_entry)

    output: dict[str, Any] = {
        'id': response_dict.get('id'),
        'content': assistant_content,
        'choices': formatted_choices,
        'model': response_dict.get('model'),
        'created': response_dict.get('created'),
        'system_fingerprint': response_dict.get('system_fingerprint'),
        'service_tier': response_dict.get('service_tier'),
    }
    if usage_dict:
        output['usage'] = usage_dict
    return output


async def _send_trace_safely_async(mentiora_client: Any, event: TraceEvent) -> None:
    """Send trace event async (non-blocking, errors are silently ignored)."""
    try:
        await mentiora_client.tracing.send_trace_async(event)
    except Exception as e:
        if mentiora_client.debug:
            logger.debug(
                '[Mentiora SDK - OpenAI Plugin] Failed to send trace: trace_id=%s span_id=%s operation=%s error=%s',
                event.trace_id,
                event.span_id,
                event.name,
                str(e),
                exc_info=True,
            )


def _send_trace_safely_sync(mentiora_client: Any, event: TraceEvent) -> None:
    """Send trace event sync (non-blocking, errors are silently ignored)."""
    try:
        mentiora_client.tracing.send_trace(event)
    except Exception as e:
        if mentiora_client.debug:
            logger.debug(
                '[Mentiora SDK - OpenAI Plugin] Failed to send trace: trace_id=%s span_id=%s operation=%s error=%s',
                event.trace_id,
                event.span_id,
                event.name,
                str(e),
                exc_info=True,
            )


def _is_async_client(client: Any) -> bool:
    """Detect if the OpenAI client is an AsyncOpenAI instance."""
    # Check class name hierarchy to avoid importing openai directly
    for cls in type(client).__mro__:
        if cls.__name__ == 'AsyncOpenAI':
            return True
    return False


def _build_trace_event(
    *,
    trace_id: str,
    span_id: str,
    thread_id: str,
    input_data: dict[str, Any],
    output_data: Any,
    start_time: datetime,
    end_time: datetime,
    model: str | None,
    token_usage: UsageInfo | None,
    error: TraceError | None,
    options: TrackOpenAIOptions,
    response: Any = None,
) -> TraceEvent:
    """Build a TraceEvent for an OpenAI call."""
    duration_ms = int((end_time - start_time).total_seconds() * 1000)

    metadata: dict[str, Any] = {
        'method': 'chat.completions.create',
    }
    if response is not None:
        response_d = _to_dict(response) if not isinstance(response, dict) else response
        response_d = response_d or {}
        created = response_d.get('created')
        if created is not None:
            metadata['created'] = created
        openai_id = response_d.get('id')
        if isinstance(openai_id, str):
            metadata['openai_id'] = openai_id
    metadata.update(options.metadata or {})

    capture = options.capture_content

    return TraceEvent(
        trace_id=trace_id,
        span_id=span_id,
        thread_id=thread_id,
        name='openai.chat.completions.create',
        type='error' if error else 'llm',
        input=input_data if capture else None,
        output=(output_data if not error else None) if capture else None,
        start_time=start_time,
        end_time=end_time,
        duration_ms=duration_ms,
        metadata=metadata,
        tags=options.tags,
        usage=token_usage,
        model=model,
        provider='openai',
        error=error,
    )


def _wrap_async_stream(
    stream: Any,
    *,
    trace_id: str,
    span_id: str,
    thread_id: str,
    input_data: dict[str, Any],
    start_time: datetime,
    model: str | None,
    options: TrackOpenAIOptions,
) -> Any:
    """Wrap an async streaming response to accumulate chunks and send trace on completion."""
    accumulated_content: list[str] = []
    accumulated_refusal: list[str] = []
    accumulated_tool_calls: dict[int, dict[str, Any]] = {}
    final_model: str | None = model
    finish_reason: str | None = None
    usage_info: UsageInfo | None = None
    stream_id: str | None = None
    system_fingerprint: str | None = None
    stream_created: int | None = None

    stream_error: TraceError | None = None

    async def _async_generator() -> Any:
        nonlocal \
            final_model, \
            finish_reason, \
            usage_info, \
            stream_id, \
            system_fingerprint, \
            stream_created, \
            stream_error

        try:
            async for chunk in stream:
                yield chunk

                chunk_dict = _to_dict(chunk)
                if not chunk_dict:
                    continue

                # Track stream-level fields
                if chunk_dict.get('id'):
                    stream_id = chunk_dict['id']
                if chunk_dict.get('model'):
                    final_model = chunk_dict['model']
                if chunk_dict.get('system_fingerprint'):
                    system_fingerprint = chunk_dict['system_fingerprint']
                if isinstance(chunk_dict.get('created'), int):
                    stream_created = chunk_dict['created']

                # Track usage (some providers send it in the last chunk)
                if chunk_dict.get('usage'):
                    usage_info = _extract_token_usage(chunk)

                choices = chunk_dict.get('choices', [])
                if not choices:
                    continue

                first_choice = choices[0] if isinstance(choices, list) else None
                if not first_choice or not isinstance(first_choice, dict):
                    continue

                if first_choice.get('finish_reason'):
                    finish_reason = first_choice['finish_reason']

                delta = first_choice.get('delta', {})
                if not isinstance(delta, dict):
                    continue

                # Accumulate content
                if delta.get('content'):
                    accumulated_content.append(delta['content'])

                # Accumulate refusal
                if isinstance(delta.get('refusal'), str):
                    accumulated_refusal.append(delta['refusal'])

                # Accumulate tool calls
                for tc in delta.get('tool_calls', []) or []:
                    if not isinstance(tc, dict):
                        continue
                    idx = tc.get('index', 0)
                    if idx not in accumulated_tool_calls:
                        accumulated_tool_calls[idx] = {
                            'id': tc.get('id', ''),
                            'type': tc.get('type', 'function'),
                            'function': {'name': '', 'arguments': ''},
                        }
                    if tc.get('id'):
                        accumulated_tool_calls[idx]['id'] = tc['id']
                    fn = tc.get('function', {})
                    if isinstance(fn, dict):
                        if fn.get('name'):
                            accumulated_tool_calls[idx]['function']['name'] = fn['name']
                        if fn.get('arguments'):
                            accumulated_tool_calls[idx]['function']['arguments'] += fn['arguments']
        except Exception as e:
            stream_error = TraceError(
                message=str(e),
                type=type(e).__name__,
                stack=format_exception_stack(e),
            )
            raise
        finally:
            # Send trace on stream completion (or abandonment)
            end_time = datetime.now(UTC)

            content = ''.join(accumulated_content) if accumulated_content else None
            refusal = ''.join(accumulated_refusal) if accumulated_refusal else None
            tool_calls_list = (
                [accumulated_tool_calls[k] for k in sorted(accumulated_tool_calls)]
                if accumulated_tool_calls
                else None
            )

            # Build assistant content description
            assistant_content = content
            if not assistant_content and refusal:
                assistant_content = f'[REFUSED] {refusal}'
            if not assistant_content and tool_calls_list:
                descriptions = []
                for tc in tool_calls_list:
                    fn = tc.get('function', {})
                    descriptions.append(f'{fn.get("name", "unknown")}({fn.get("arguments", "")})')
                assistant_content = '; '.join(descriptions)

            message_entry: dict[str, Any] = {
                'role': 'assistant',
                'content': content,
                'tool_calls': tool_calls_list,
            }
            if refusal is not None:
                message_entry['refusal'] = refusal

            output_data: dict[str, Any] = {
                'id': stream_id,
                'content': assistant_content,
                'choices': [
                    {
                        'index': 0,
                        'message': message_entry,
                        'finish_reason': finish_reason,
                    }
                ],
                'model': final_model,
                'created': stream_created,
                'system_fingerprint': system_fingerprint,
            }
            if usage_info:
                output_data['usage'] = {
                    'prompt_tokens': usage_info.prompt_tokens,
                    'completion_tokens': usage_info.completion_tokens,
                    'total_tokens': usage_info.total_tokens,
                }

            # Build a pseudo-response dict for metadata extraction
            pseudo_response = {'id': stream_id, 'created': stream_created}

            trace_event = _build_trace_event(
                trace_id=trace_id,
                span_id=span_id,
                thread_id=thread_id,
                input_data=input_data,
                output_data=output_data,
                start_time=start_time,
                end_time=end_time,
                model=final_model,
                token_usage=usage_info,
                error=stream_error,
                options=options,
                response=pseudo_response,
            )

            await _send_trace_safely_async(options.mentiora_client, trace_event)

    return _async_generator()


def _wrap_sync_stream(
    stream: Any,
    *,
    trace_id: str,
    span_id: str,
    thread_id: str,
    input_data: dict[str, Any],
    start_time: datetime,
    model: str | None,
    options: TrackOpenAIOptions,
) -> Any:
    """Wrap a sync streaming response to accumulate chunks and send trace on completion."""
    accumulated_content: list[str] = []
    accumulated_refusal: list[str] = []
    accumulated_tool_calls: dict[int, dict[str, Any]] = {}
    final_model: str | None = model
    finish_reason: str | None = None
    usage_info: UsageInfo | None = None
    stream_id: str | None = None
    system_fingerprint: str | None = None
    stream_created: int | None = None

    stream_error: TraceError | None = None

    def _sync_generator() -> Any:
        nonlocal \
            final_model, \
            finish_reason, \
            usage_info, \
            stream_id, \
            system_fingerprint, \
            stream_created, \
            stream_error

        try:
            for chunk in stream:
                yield chunk

                chunk_dict = _to_dict(chunk)
                if not chunk_dict:
                    continue

                # Track stream-level fields
                if chunk_dict.get('id'):
                    stream_id = chunk_dict['id']
                if chunk_dict.get('model'):
                    final_model = chunk_dict['model']
                if chunk_dict.get('system_fingerprint'):
                    system_fingerprint = chunk_dict['system_fingerprint']
                if isinstance(chunk_dict.get('created'), int):
                    stream_created = chunk_dict['created']

                if chunk_dict.get('usage'):
                    usage_info = _extract_token_usage(chunk)

                choices = chunk_dict.get('choices', [])
                if not choices:
                    continue

                first_choice = choices[0] if isinstance(choices, list) else None
                if not first_choice or not isinstance(first_choice, dict):
                    continue

                if first_choice.get('finish_reason'):
                    finish_reason = first_choice['finish_reason']

                delta = first_choice.get('delta', {})
                if not isinstance(delta, dict):
                    continue

                if delta.get('content'):
                    accumulated_content.append(delta['content'])

                if isinstance(delta.get('refusal'), str):
                    accumulated_refusal.append(delta['refusal'])

                for tc in delta.get('tool_calls', []) or []:
                    if not isinstance(tc, dict):
                        continue
                    idx = tc.get('index', 0)
                    if idx not in accumulated_tool_calls:
                        accumulated_tool_calls[idx] = {
                            'id': tc.get('id', ''),
                            'type': tc.get('type', 'function'),
                            'function': {'name': '', 'arguments': ''},
                        }
                    if tc.get('id'):
                        accumulated_tool_calls[idx]['id'] = tc['id']
                    fn = tc.get('function', {})
                    if isinstance(fn, dict):
                        if fn.get('name'):
                            accumulated_tool_calls[idx]['function']['name'] = fn['name']
                        if fn.get('arguments'):
                            accumulated_tool_calls[idx]['function']['arguments'] += fn['arguments']
        except Exception as e:
            stream_error = TraceError(
                message=str(e),
                type=type(e).__name__,
                stack=format_exception_stack(e),
            )
            raise
        finally:
            end_time = datetime.now(UTC)

            content = ''.join(accumulated_content) if accumulated_content else None
            refusal = ''.join(accumulated_refusal) if accumulated_refusal else None
            tool_calls_list = (
                [accumulated_tool_calls[k] for k in sorted(accumulated_tool_calls)]
                if accumulated_tool_calls
                else None
            )

            assistant_content = content
            if not assistant_content and refusal:
                assistant_content = f'[REFUSED] {refusal}'
            if not assistant_content and tool_calls_list:
                descriptions = []
                for tc in tool_calls_list:
                    fn = tc.get('function', {})
                    descriptions.append(f'{fn.get("name", "unknown")}({fn.get("arguments", "")})')
                assistant_content = '; '.join(descriptions)

            message_entry: dict[str, Any] = {
                'role': 'assistant',
                'content': content,
                'tool_calls': tool_calls_list,
            }
            if refusal is not None:
                message_entry['refusal'] = refusal

            output_data: dict[str, Any] = {
                'id': stream_id,
                'content': assistant_content,
                'choices': [
                    {
                        'index': 0,
                        'message': message_entry,
                        'finish_reason': finish_reason,
                    }
                ],
                'model': final_model,
                'created': stream_created,
                'system_fingerprint': system_fingerprint,
            }
            if usage_info:
                output_data['usage'] = {
                    'prompt_tokens': usage_info.prompt_tokens,
                    'completion_tokens': usage_info.completion_tokens,
                    'total_tokens': usage_info.total_tokens,
                }

            pseudo_response = {'id': stream_id, 'created': stream_created}

            trace_event = _build_trace_event(
                trace_id=trace_id,
                span_id=span_id,
                thread_id=thread_id,
                input_data=input_data,
                output_data=output_data,
                start_time=start_time,
                end_time=end_time,
                model=final_model,
                token_usage=usage_info,
                error=stream_error,
                options=options,
                response=pseudo_response,
            )

            _send_trace_safely_sync(options.mentiora_client, trace_event)

    return _sync_generator()


def _wrap_async_method(
    original_method: Any,
    options: TrackOpenAIOptions,
) -> Any:
    """Wrap async OpenAI chat.completions.create with tracing."""

    @wraps(original_method)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        start_time = datetime.now(UTC)
        span_id = str(uuid7())
        trace_id = str(uuid7())
        thread_id = (options.thread_id and options.thread_id.strip()) or str(uuid7())

        input_data = _build_input_data(kwargs)
        model = kwargs.get('model')

        # Inject stream_options.include_usage for streaming requests
        call_kwargs = kwargs
        if kwargs.get('stream'):
            existing = kwargs.get('stream_options') or {}
            call_kwargs = {**kwargs, 'stream_options': {**existing, 'include_usage': True}}

        try:
            response = await original_method(*args, **call_kwargs)

            # Handle async streaming responses
            if kwargs.get('stream', False):
                return _wrap_async_stream(
                    response,
                    trace_id=trace_id,
                    span_id=span_id,
                    thread_id=thread_id,
                    input_data=input_data,
                    start_time=start_time,
                    model=model,
                    options=options,
                )

            # Non-streaming response
            end_time = datetime.now(UTC)
            output_data = _build_output_data(response)
            token_usage = _extract_token_usage(response)
            model = _extract_model(kwargs, response) or model

            trace_event = _build_trace_event(
                trace_id=trace_id,
                span_id=span_id,
                thread_id=thread_id,
                input_data=input_data,
                output_data=output_data,
                start_time=start_time,
                end_time=end_time,
                model=model,
                token_usage=token_usage,
                error=None,
                options=options,
                response=response,
            )

            await _send_trace_safely_async(options.mentiora_client, trace_event)
            return response

        except Exception as err:
            end_time = datetime.now(UTC)

            error = TraceError(
                message=str(err),
                type=type(err).__name__,
                stack=format_exception_stack(err),
            )

            trace_event = _build_trace_event(
                trace_id=trace_id,
                span_id=span_id,
                thread_id=thread_id,
                input_data=input_data,
                output_data=None,
                start_time=start_time,
                end_time=end_time,
                model=model,
                token_usage=None,
                error=error,
                options=options,
            )

            await _send_trace_safely_async(options.mentiora_client, trace_event)
            raise

    return wrapped


def _wrap_sync_method(
    original_method: Any,
    options: TrackOpenAIOptions,
) -> Any:
    """Wrap sync OpenAI chat.completions.create with tracing."""

    @wraps(original_method)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        start_time = datetime.now(UTC)
        span_id = str(uuid7())
        trace_id = str(uuid7())
        thread_id = (options.thread_id and options.thread_id.strip()) or str(uuid7())

        input_data = _build_input_data(kwargs)
        model = kwargs.get('model')

        # Inject stream_options.include_usage for streaming requests
        call_kwargs = kwargs
        if kwargs.get('stream'):
            existing = kwargs.get('stream_options') or {}
            call_kwargs = {**kwargs, 'stream_options': {**existing, 'include_usage': True}}

        try:
            response = original_method(*args, **call_kwargs)

            # Handle sync streaming responses
            if kwargs.get('stream', False):
                return _wrap_sync_stream(
                    response,
                    trace_id=trace_id,
                    span_id=span_id,
                    thread_id=thread_id,
                    input_data=input_data,
                    start_time=start_time,
                    model=model,
                    options=options,
                )

            # Non-streaming response
            end_time = datetime.now(UTC)
            output_data = _build_output_data(response)
            token_usage = _extract_token_usage(response)
            model = _extract_model(kwargs, response) or model

            trace_event = _build_trace_event(
                trace_id=trace_id,
                span_id=span_id,
                thread_id=thread_id,
                input_data=input_data,
                output_data=output_data,
                start_time=start_time,
                end_time=end_time,
                model=model,
                token_usage=token_usage,
                error=None,
                options=options,
                response=response,
            )

            _send_trace_safely_sync(options.mentiora_client, trace_event)
            return response

        except Exception as err:
            end_time = datetime.now(UTC)

            error = TraceError(
                message=str(err),
                type=type(err).__name__,
                stack=format_exception_stack(err),
            )

            trace_event = _build_trace_event(
                trace_id=trace_id,
                span_id=span_id,
                thread_id=thread_id,
                input_data=input_data,
                output_data=None,
                start_time=start_time,
                end_time=end_time,
                model=model,
                token_usage=None,
                error=error,
                options=options,
            )

            _send_trace_safely_sync(options.mentiora_client, trace_event)
            raise

    return wrapped


_MENTIORA_PATCHED_ATTR = '_mentiora_patched'


def track_openai(openai_client: Any, options: TrackOpenAIOptions) -> Any:
    """Track OpenAI client to automatically send traces to Mentiora.

    Monkey-patches chat.completions.create to intercept requests/responses.
    Supports both sync (OpenAI) and async (AsyncOpenAI) clients,
    as well as streaming and non-streaming responses.

    Args:
        openai_client: OpenAI or AsyncOpenAI client instance
        options: Plugin configuration options (TrackOpenAIOptions)

    Returns:
        The same OpenAI client with tracing enabled (monkey-patched in place)

    Example:
        ```python
        from mentiora import track_openai, MentioraClient, MentioraConfig
        from openai import OpenAI

        mentiora_client = MentioraClient(MentioraConfig(api_key='your-api-key'))
        client = OpenAI(api_key='...')
        track_openai(client, TrackOpenAIOptions(mentiora_client=mentiora_client))

        # Use client as normal - traces are sent automatically
        response = client.chat.completions.create(model='gpt-4', messages=[...])
        ```
    """
    if not options.mentiora_client:
        raise ConfigurationError('mentiora_client is required')

    if getattr(openai_client, _MENTIORA_PATCHED_ATTR, None) is True:
        if options.mentiora_client.debug:
            logger.debug('OpenAI client already patched, skipping.')
        return openai_client

    # Only patch chat.completions.create
    if (
        hasattr(openai_client, 'chat')
        and hasattr(openai_client.chat, 'completions')
        and hasattr(openai_client.chat.completions, 'create')
    ):
        original_create = openai_client.chat.completions.create

        if _is_async_client(openai_client):
            openai_client.chat.completions.create = _wrap_async_method(original_create, options)
        else:
            openai_client.chat.completions.create = _wrap_sync_method(original_create, options)

    setattr(openai_client, _MENTIORA_PATCHED_ATTR, True)
    return openai_client
