"""OpenAI tracing plugin for Mentiora SDK.

Wraps OpenAI client to automatically trace API calls.
"""

import logging
import secrets
from datetime import datetime
from functools import wraps
from typing import Any, Callable, TypeVar

from ..types import TraceEvent, TraceError
from .types import TrackOpenAIOptions

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=Callable[..., Any])


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


def _extract_token_usage(response: dict[str, Any] | None) -> dict[str, int] | None:
    """Extract token usage from OpenAI response."""
    if not response or not isinstance(response, dict):
        return None

    usage = response.get('usage')
    if not usage or not isinstance(usage, dict):
        return None

    return {
        'promptTokens': usage.get('prompt_tokens'),
        'completionTokens': usage.get('completion_tokens'),
        'totalTokens': usage.get('total_tokens'),
    }


def _extract_model(request: dict[str, Any] | None, response: dict[str, Any] | None) -> str | None:
    """Extract model name from OpenAI request or response."""
    # Try response first
    if response and isinstance(response, dict):
        model = response.get('model')
        if isinstance(model, str):
            return model

    # Try request
    if request and isinstance(request, dict):
        model = request.get('model')
        if isinstance(model, str):
            return model

    return None


def _format_messages(messages: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Convert OpenAI chat completion messages to string format."""
    if not isinstance(messages, list):
        return []

    return [
        {
            'role': msg.get('role'),
            'content': msg.get('content'),
        }
        for msg in messages
        if isinstance(msg, dict)
    ]


async def _send_trace_safely(mentiora_client: Any, event: TraceEvent) -> None:  # type: ignore[type-arg]
    """Send trace event (non-blocking, errors are logged but don't throw)."""
    try:
        await mentiora_client.tracing.send_trace_async(event)
    except Exception as error:
        # Log error but don't break user's application
        logger.error('[MentioraTracingOpenAI] Failed to send trace: %s', error)


def _wrap_method(
    original_method: T,
    method_name: str,
    options: TrackOpenAIOptions,
    trace_id: str | None = None,
) -> T:
    """Wrap OpenAI client method to add tracing."""

    @wraps(original_method)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        start_time = datetime.now()
        span_id = _generate_span_id()
        current_trace_id = trace_id or _generate_trace_id()

        # Extract request data
        request = args[0] if args else kwargs
        if not isinstance(request, dict):
            request = {}

        model = _extract_model(request, None)

        # Build trace event input
        input_data: dict[str, Any] | None = None
        if method_name == 'chat.completions.create' and request.get('messages'):
            input_data = {
                'messages': _format_messages(request.get('messages')),
                'model': request.get('model'),
                'temperature': request.get('temperature'),
                'max_tokens': request.get('max_tokens'),
                'stream': request.get('stream'),
            }
        elif method_name == 'embeddings.create' and request:
            input_data = {
                'input': request.get('input'),
                'model': request.get('model'),
            }
        elif method_name == 'images.generate' and request:
            input_data = {
                'prompt': request.get('prompt'),
                'model': request.get('model'),
                'n': request.get('n'),
                'size': request.get('size'),
            }
        else:
            input_data = request

        response: Any = None
        error: TraceError | None = None

        try:
            # Call original method
            response = await original_method(*args, **kwargs)

            # Handle streaming responses
            if hasattr(response, '__aiter__'):
                # For streaming, we'll trace the initial call and completion
                # The actual streaming data is handled separately
                end_time = datetime.now()
                duration_ms = int((end_time - start_time).total_seconds() * 1000)

                trace_event = TraceEvent(
                    trace_id=current_trace_id,
                    span_id=span_id,
                    name=f'openai.{method_name}',
                    type='llm',
                    input=input_data,
                    output={'streaming': True},
                    start_time=start_time,
                    end_time=end_time,
                    duration_ms=duration_ms,
                    metadata={
                        'provider': 'openai',
                        'model': model,
                        'method': method_name,
                        **(options.metadata or {}),
                    },
                    tags=options.tags,
                )

                await _send_trace_safely(options.mentiora_client, trace_event)
                return response

            # Extract output
            output: dict[str, Any] | None = None
            if method_name == 'chat.completions.create' and response:
                if isinstance(response, dict):
                    output = {
                        'choices': response.get('choices'),
                        'model': response.get('model'),
                    }
            elif method_name == 'embeddings.create' and response:
                if isinstance(response, dict):
                    output = {
                        'data': response.get('data'),
                        'model': response.get('model'),
                    }
            elif method_name == 'images.generate' and response:
                if isinstance(response, dict):
                    output = {
                        'data': response.get('data'),
                    }
            else:
                output = response

            end_time = datetime.now()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            token_usage = _extract_token_usage(response if isinstance(response, dict) else None)
            model = _extract_model(request, response if isinstance(response, dict) else None)

            metadata: dict[str, Any] = {
                'provider': 'openai',
                'method': method_name,
                **(options.metadata or {}),
            }
            if model:
                metadata['model'] = model
            if token_usage:
                metadata.update(token_usage)

            trace_event = TraceEvent(
                trace_id=current_trace_id,
                span_id=span_id,
                name=f'openai.{method_name}',
                type='llm',
                input=input_data,
                output=output,
                start_time=start_time,
                end_time=end_time,
                duration_ms=duration_ms,
                metadata=metadata,
                tags=options.tags,
            )

            await _send_trace_safely(options.mentiora_client, trace_event)
            return response

        except Exception as err:
            end_time = datetime.now()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)

            error = TraceError(
                message=str(err),
                type=type(err).__name__,
                stack=str(err.__traceback__) if hasattr(err, '__traceback__') else None,
            )

            trace_event = TraceEvent(
                trace_id=current_trace_id,
                span_id=span_id,
                name=f'openai.{method_name}',
                type='error',
                input=input_data,
                start_time=start_time,
                end_time=end_time,
                duration_ms=duration_ms,
                error=error,
                metadata={
                    'provider': 'openai',
                    'model': model,
                    'method': method_name,
                    **(options.metadata or {}),
                },
                tags=options.tags,
            )

            await _send_trace_safely(options.mentiora_client, trace_event)

            # Re-throw the original error
            raise

    return wrapped  # type: ignore[return-value]


def _wrap_namespace(
    namespace: Any,
    namespace_name: str,
    options: TrackOpenAIOptions,
    trace_id: str | None = None,
) -> Any:
    """Wrap OpenAI client namespace (e.g., chat.completions)."""
    wrapped: dict[str, Any] = {}

    if not hasattr(namespace, '__dict__'):
        return namespace

    for key in dir(namespace):
        if key.startswith('_'):
            continue

        value = getattr(namespace, key, None)

        if callable(value) and not isinstance(value, type):
            wrapped[key] = _wrap_method(
                value,
                f'{namespace_name}.{key}',
                options,
                trace_id,
            )
        elif hasattr(value, '__dict__') or (isinstance(value, object) and not isinstance(value, (str, int, float, bool, type(None)))):
            # Recursively wrap nested namespaces
            wrapped[key] = _wrap_namespace(
                value,
                f'{namespace_name}.{key}',
                options,
                trace_id,
            )
        else:
            wrapped[key] = value

    # Create a proxy-like object
    class WrappedNamespace:
        def __init__(self, original: Any, wrapped_dict: dict[str, Any]) -> None:
            self._original = original
            self._wrapped = wrapped_dict

        def __getattr__(self, name: str) -> Any:
            if name in self._wrapped:
                return self._wrapped[name]
            return getattr(self._original, name)

    return WrappedNamespace(namespace, wrapped)


def track_openai(openai_client: Any, options: TrackOpenAIOptions) -> Any:
    """Track OpenAI client to automatically send traces to Mentiora.

    Args:
        openai_client: OpenAI client instance to wrap
        options: Plugin configuration options (TrackOpenAIOptions)

    Returns:
        Wrapped OpenAI client with tracing enabled

    Example:
        ```python
        from mentiora import track_openai, MentioraClient
        from openai import OpenAI

        mentiora_client = MentioraClient({ ... })
        openai_client = OpenAI(api_key='...')
        tracked_client = track_openai(openai_client, {'mentiora_client': mentiora_client})

        # Use tracked_client instead of openai_client
        response = await tracked_client.chat.completions.create({ ... })
        ```
    """
    if not options.mentiora_client:
        raise ValueError('mentiora_client is required')

    # Create a proxy to intercept method calls
    class TrackedOpenAIClient:
        def __init__(self, original: Any, opts: Any) -> None:
            self._original = original
            self._options = opts

        def __getattr__(self, name: str) -> Any:
            value = getattr(self._original, name)

            # Wrap main API namespaces
            if name == 'chat' and value:
                return _wrap_namespace(value, 'chat', self._options)
            if name == 'embeddings' and value:
                return _wrap_namespace(value, 'embeddings', self._options)
            if name == 'images' and value:
                return _wrap_namespace(value, 'images', self._options)

            # Return original value for other properties
            return value

    return TrackedOpenAIClient(openai_client, options)
