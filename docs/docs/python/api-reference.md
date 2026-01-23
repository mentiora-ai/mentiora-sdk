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
| `api_key` | str | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `project_id` | str | No | Project UUID (optional) |
| `base_url` | str | No | Override base URL (for testing) |
| `timeout` | int | No | Request timeout in ms (default: 30000) |
| `retries` | int | No | Max retry attempts (default: 3) |

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
    trace_id='trace-123',
    span_id='span-456',
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
    trace_id='trace-123',
    span_id='span-456',
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
class TraceEvent:
    trace_id: str              # Unique trace ID
    span_id: str               # Unique span ID
    parent_span_id: str | None  # Parent span for nesting
    name: str                   # Span name, e.g., 'llm.call', 'tool.execute'
    type: 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input: dict | None          # Prompt, tool input, etc.
    output: dict | None         # Response, tool result
    start_time: datetime | str  # ISO 8601 timestamp
    end_time: datetime | str | None
    duration_ms: int | None
    metadata: dict[str, Any] | None
    tags: list[str] | None
    error: TraceError | None
```

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

### Environment

```python
Environment = Literal['staging', 'production']
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
| `tags` | `list[str]` | No | Optional tags to add to all traces |
| `metadata` | `dict[str, Any]` | No | Optional metadata to add to all traces |
| `project_id` | `str` | No | Optional project ID override |

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

### MentioraTracingLangChain

Callback handler for automatically tracing LangChain executions.

```python
class MentioraTracingLangChain(BaseCallbackHandler):
    def __init__(self, options: MentioraTracingLangChainOptions)
```

**MentioraTracingLangChainOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentiora_client` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `tags` | `list[str]` | No | Optional tags to add to all traces |
| `metadata` | `dict[str, Any]` | No | Optional metadata to add to all traces |
| `project_id` | `str` | No | Optional project ID override |

**Example:**

```python
from mentiora import MentioraTracingLangChain, MentioraTracingLangChainOptions

callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production'],
))

await chain.ainvoke({'input': '...'}, {'callbacks': [callback]})
```

**Note:** This class extends LangChain's `BaseCallbackHandler` and implements all required callback methods for tracing LLM calls, chain executions, tool calls, and agent operations.
