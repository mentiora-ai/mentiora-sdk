---
sidebar_position: 3
---

# Python SDK API Reference

Complete API reference for the Mentiora Python SDK.

## MentioraClient

Main client class for interacting with the Mentiora platform.

### Constructor

```python
MentioraClient(config: MentioraConfig)
```

#### MentioraConfig

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `api_key` | str | Yes | Project API key — see [Authentication](/authentication) |
| `base_url` | str | No | Base URL (defaults to https://platform.mentiora.ai) |
| `timeout` | int | No | Request timeout in ms (default: 30000) |
| `retries` | int | No | Max retry attempts (default: 3) |
| `debug` | bool | No | Enable verbose SDK logging (default: false) |

### Properties

#### `tracing`

Access to tracing functionality.

```python
client.tracing: TracingClient
```

### Methods

#### `close() -> None`

Close HTTP clients and cleanup resources.

```python
client.close()
```

#### `aclose() -> None`

Close async HTTP clients and cleanup resources.

```python
await client.aclose()
```

## TracingClient

Client for sending traces to the Mentiora platform.

### Methods

#### `send_trace(event: TraceEvent) -> SendTraceResult`

Send a trace event to the platform (synchronous).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `SendTraceResult`

**Example:**

```python
result = client.tracing.send_trace(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    name='llm.call',
    type='llm',
    start_time=datetime.now(),
    end_time=datetime.now(),
))
```

#### `send_trace_async(event: TraceEvent) -> SendTraceResult`

Send a trace event to the platform (asynchronous).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `SendTraceResult`

**Example:**

```python
result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    name='llm.call',
    type='llm',
    start_time=datetime.now(),
    end_time=datetime.now(),
))
```

#### `flush() -> None`

Flush any pending traces in the queue (synchronous).

**Returns:** `None`

**Example:**

```python
client.tracing.flush()
```

#### `flush_async() -> None`

Flush any pending traces in the queue (asynchronous).

**Returns:** `None`

**Example:**

```python
await client.tracing.flush_async()
```

## Types

### TraceEvent

```python
class UsageInfo:
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None

class TraceEvent:
    trace_id: str              # Unique trace ID (UUID v7 format)
    span_id: str               # Unique span ID (UUID v7 format)
    parent_span_id: str | None  # Parent span for nesting (UUID v7 format)
    thread_id: str | None      # Optional. If omitted, the SDK sets it to a new UUID v7 before sending.
    name: str                   # Span name, e.g., 'llm.call', 'tool.execute'
    type: 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input: Any | None           # Prompt, tool input, etc.
    output: Any | None          # Response, tool result
    start_time: datetime | str  # ISO 8601 timestamp
    end_time: datetime | str | None
    duration_ms: int | None
    metadata: dict[str, Any] | None
    tags: list[str] | None
    error: TraceError | None
    usage: UsageInfo | None     # Token usage (LLM-specific)
    model: str | None           # Model name (e.g., 'gpt-4', 'claude-3')
    provider: str | None        # Provider name (e.g., 'openai', 'anthropic')
```

**Note:** `trace_id` and `span_id` must be in UUID v7 format. The plugins automatically generate UUID v7 IDs.

### TraceError

```python
class TraceError:
    message: str
    type: str | None
    stack: str | None
```

### SendTraceResult

```python
class SendTraceResult:
    success: bool
    trace_id: str
    span_id: str
    error: str | None
```

### TraceType

```python
TraceType = Literal['llm', 'tool', 'chat', 'error', 'custom']
```

## Errors

### ConfigurationError

Raised when the client configuration is invalid.

```python
class ConfigurationError(MentioraError):
    def __init__(self, message: str)
```

### ValidationError

Raised when trace event data is invalid.

```python
class ValidationError(MentioraError):
    def __init__(self, message: str)
```

### NetworkError

Raised when a network or HTTP error occurs.

```python
class NetworkError(MentioraError):
    def __init__(self, message: str, status_code: int | None = None)
    status_code: int | None
```

### MentioraError

Base exception for all Mentiora SDK errors.

```python
class MentioraError(Exception):
    def __init__(self, message: str, code: str)
    message: str
    code: str
    name: str
```

## Plugins

### track_openai

Wraps an OpenAI client to automatically trace API calls.

```python
def track_openai(
    openai_client: OpenAI | AsyncOpenAI,
    options: TrackOpenAIOptions
) -> OpenAI | AsyncOpenAI
```

**Parameters:**

- `openai_client: OpenAI | AsyncOpenAI` - The OpenAI client instance to wrap (supports both sync and async clients)
- `options: TrackOpenAIOptions` - Plugin configuration options

**Returns:** Wrapped OpenAI client with tracing enabled

**TrackOpenAIOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentiora_client` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `thread_id` | str | No | Thread/conversation ID (UUID v7) for grouping traces |
| `tags` | `list[str]` | No | Optional tags to add to all traces |
| `metadata` | `dict[str, Any]` | No | Optional metadata to add to all traces |
| `capture_content` | bool | No | Whether to capture input/output content (default: True). Set to False for privacy. |

**Example:**

```python
from mentiora import track_openai, TrackOpenAIOptions
from openai import AsyncOpenAI

tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        tags=['production'],
    ),
)
```

**Captured trace data:**

Each traced call produces a `TraceEvent` with:
- **input**: All parameters passed to `chat.completions.create` (model, messages, temperature, tools, etc.), plus a `prompt` field extracted from the last user message. Multimodal content arrays (text + images) are supported.
- **output**: Full response data including `id`, `created`, `system_fingerprint`, `service_tier`, `usage`, and per-choice `logprobs` and `refusal` fields.
- **metadata**: Includes `openai_id` (the OpenAI response ID, e.g. `chatcmpl-...`) and `created` timestamp for correlation with OpenAI's logs.

For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage statistics. Refusal content is accumulated across stream chunks.

### MentioraTracingLangChain

Callback handler for automatically tracing LangChain executions.

```python
class MentioraTracingLangChain(AsyncCallbackHandler):
    def __init__(self, options: MentioraTracingLangChainOptions)
```

**MentioraTracingLangChainOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentiora_client` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `thread_id` | str | No | Thread/conversation ID (UUID v7) for grouping traces |
| `tags` | `list[str]` | No | Optional tags to add to all traces |
| `metadata` | `dict[str, Any]` | No | Optional metadata to add to all traces |
| `capture_content` | bool | No | Whether to capture input/output content (default: True). Set to False for privacy. |

**Example:**

```python
from mentiora import MentioraTracingLangChain, MentioraTracingLangChainOptions

callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production'],
))

await chain.ainvoke({'input': '...'}, {'callbacks': [callback]})
```

**Note:** This class extends LangChain's `AsyncCallbackHandler` and implements all required callback methods for tracing LLM calls, chain executions, tool calls, and agent operations.
