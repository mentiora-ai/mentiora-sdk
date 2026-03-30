# mentiora-ai-sdk

Python SDK for the [Mentiora](https://mentiora.ai) observability platform. Provides AI observability, tracing, and agent execution.

## Installation

```bash
pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

Or with uv:

```bash
uv pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

With optional dependencies:

```bash
# OpenAI plugin
pip install "mentiora-ai-sdk[openai] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"

# LangChain plugin
pip install "mentiora-ai-sdk[langchain] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"

# Both
pip install "mentiora-ai-sdk[openai,langchain] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

## Quick Start

```python
import os
from datetime import datetime
from mentiora import MentioraClient, MentioraConfig, TraceEvent

client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Send a trace
result = client.tracing.send_trace(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',
    span_id='019505a0-b7c2-7000-8000-000000000002',
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hi there!'},
    start_time=datetime.now(),
    model='gpt-5-mini',
    provider='openai',
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
```

## Authentication

To obtain an API key:

1. Sign in to the [Mentiora dashboard](https://platform.mentiora.ai)
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"** and copy the key immediately (it's only shown once)
4. Set it as an environment variable:

```bash
export MENTIORA_API_KEY=your-api-key-here
```

See the [Authentication guide](https://docs.mentiora.ai/authentication) for details on key management and security best practices.

## Sync vs Async API

The Python SDK provides both synchronous and asynchronous APIs:

### Async API (recommended for async frameworks)

```python
result = await client.tracing.send_trace_async(event)
await client.tracing.flush_async()

agent_result = await client.agents.run_async(params)
async for event in client.agents.stream_async(params):
    ...
```

### Sync API (for synchronous frameworks)

```python
result = client.tracing.send_trace(event)
client.tracing.flush()

agent_result = client.agents.run(params)
for event in client.agents.stream(params):
    ...
```

**When to use which:**

- **Async** — FastAPI, Starlette, aiohttp, AsyncOpenAI, async LangChain
- **Sync** — Flask, Django (WSGI), scripts, CLI tools, Jupyter notebooks, sync OpenAI

```python
# ✅ Async app using async SDK
async def handle_request():
    result = await client.tracing.send_trace_async(event)
    return result

# ✅ Sync app using sync SDK
def handle_request():
    result = client.tracing.send_trace(event)
    return result

# ❌ Don't mix sync calls in async code (blocks the event loop)
async def handle_request():
    result = client.tracing.send_trace(event)  # Don't do this!
```

## Configuration

| Option     | Type   | Required | Default                        | Description                                                                 |
| ---------- | ------ | :------: | ------------------------------ | --------------------------------------------------------------------------- |
| `api_key`  | `str`  |   Yes    | —                              | Project API key ([Authentication](https://docs.mentiora.ai/authentication)) |
| `base_url` | `str`  |    No    | `https://platform.mentiora.ai` | Override base URL                                                           |
| `timeout`  | `int`  |    No    | `30000`                        | Request timeout in milliseconds                                             |
| `retries`  | `int`  |    No    | `3`                            | Max retry attempts                                                          |
| `debug`    | `bool` |    No    | `False`                        | Enable verbose SDK logging                                                  |

## Core Tracing

### send_trace / send_trace_async

Send a trace event to the Mentiora platform:

```python
from datetime import datetime
from mentiora import MentioraClient, MentioraConfig, TraceEvent, UsageInfo

client = MentioraClient(MentioraConfig(api_key='your-api-key'))

result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    parent_span_id='019505a0-b7c2-7000-8000-000000000003',  # optional
    thread_id='019505a0-b7c2-7000-8000-000000000004',  # optional, auto-generated if omitted
    name='llm.call',
    type='llm',  # 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(),
    end_time=datetime.now(),
    duration_ms=1000,
    usage=UsageInfo(prompt_tokens=10, completion_tokens=25, total_tokens=35),
    model='gpt-5-mini',
    provider='openai',
    metadata={'environment': 'prod'},
    tags=['production', 'support-agent'],
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
else:
    print(f'Failed: {result.error}')
```

The result is a `SendTraceResult` with `success`, `trace_id`, `span_id`, and an optional `error` field. Tracing is non-throwing — failures are returned in the result object, never raised.

### flush / flush_async

Flush pending traces (reserved for future batching):

```python
client.tracing.flush()        # sync
await client.tracing.flush_async()  # async
```

### TraceEvent Schema

```python
class TraceEvent:
    trace_id: str              # UUID v7 (required)
    span_id: str               # UUID v7 (required)
    parent_span_id: str | None # UUID v7
    thread_id: str | None      # UUID v7, auto-generated if omitted
    name: str                  # e.g., 'llm.call', 'tool.execute'
    type: TraceType            # 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input: Any | None
    output: Any | None
    start_time: datetime | str # ISO 8601 or datetime (required)
    end_time: datetime | str | None
    duration_ms: int | None
    metadata: dict[str, Any] | None
    tags: list[str] | None
    error: TraceError | None   # TraceError(message, type?, stack?)
    usage: UsageInfo | None    # UsageInfo(prompt_tokens?, completion_tokens?, total_tokens?)
    model: str | None
    provider: str | None
```

All IDs must be UUID v7 format. The plugins generate these automatically.

## Agent Execution

The `AgentsClient` (accessed via `client.agents`) lets you run AI agents and stream their responses. Both sync and async variants are available.

### run / run_async

Execute an agent and get the complete result:

```python
from mentiora import MentioraClient, MentioraConfig, AgentRunParams

client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Async
result = await client.agents.run_async(AgentRunParams(
    tag='support-agent',
    message='How do I reset my password?',
    end_user_id='user-123',
))

# Sync
result = client.agents.run(AgentRunParams(
    tag='support-agent',
    message='How do I reset my password?',
    end_user_id='user-123',
))

print(result.output)          # assistant's text response
print(result.thread_id)       # conversation thread ID
print(result.tool_calls)      # tool invocations made
print(result.status)          # 'completed' | 'failed'
```

### stream / stream_async

Stream agent responses as they arrive:

```python
# Async streaming
async for event in client.agents.stream_async(AgentRunParams(
    tag='support-agent',
    message='How do I reset my password?',
)):
    match event.type:
        case 'agent_resolved':
            print(f'Agent: {event.agent_id} (thread: {event.thread_id})')
        case 'output_text_delta':
            print(event.delta, end='', flush=True)
        case 'tool_call_result':
            print(f'Tool {event.name}: {event.result}')
        case 'chat_completed':
            print(f'\nDone ({event.status})')
        case 'error':
            print(f'Error [{event.code}]: {event.message}')

# Sync streaming
for event in client.agents.stream(AgentRunParams(
    tag='support-agent',
    message='How do I reset my password?',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
```

### Multi-turn Conversations

Reuse `thread_id` to continue a conversation:

```python
first = await client.agents.run_async(AgentRunParams(
    tag='support-agent',
    message='How do I reset my password?',
))

follow_up = await client.agents.run_async(AgentRunParams(
    tag='support-agent',
    message='What if I forgot my email too?',
    thread_id=first.thread_id,  # continue the conversation
))
```

### AgentRunParams

```python
class AgentRunParams:
    tag: str | None              # resolve agent by tag (use tag or agent_id)
    agent_id: str | None         # explicit agent ID
    revision: int | None         # agent revision (with agent_id)
    message: str                 # user message (required)
    thread_id: str | None        # thread ID for multi-turn conversations
    model_id: str | None         # override default model
    model_params: ModelParams | None  # override model parameters
    end_user_id: str | None      # end-user identifier for tracking
    metadata: dict[str, Any] | None  # arbitrary metadata

class ModelParams:
    temperature: float | None
    max_tokens: int | None
    seed: int | None
```

### AgentStreamEvent

Streaming events are a discriminated union with eight types:

| Event Type          | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `agent_resolved`    | Emitted once at stream start with agent metadata and `thread_id` |
| `output_text_delta` | Text chunk from the agent (`delta`)                              |
| `tool_call_delta`   | Tool call argument chunk (`arguments_delta`)                     |
| `tool_call_result`  | Completed tool call with `arguments` and `result`                |
| `suggestions`       | Follow-up suggestion prompts (`suggestions`)                     |
| `chat_completed`    | Agent execution finished with `output` and `status`              |
| `error`             | Error with `code` and `message`                                  |
| `custom`            | Unknown SSE event passthrough (`event`, `data`)                  |

## Streaming Helpers

Bridge agent streaming events to Server-Sent Events (SSE) for web frameworks.

### stream_events

Convert an async iterator of agent events into SSE-formatted strings:

```python
from mentiora import MentioraClient, MentioraConfig, AgentRunParams, stream_events

client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))

# Example: FastAPI endpoint returning an SSE stream
from starlette.responses import StreamingResponse

@app.post('/chat')
async def chat(message: str):
    events = client.agents.stream_async(AgentRunParams(
        tag='support-agent',
        message=message,
    ))

    return StreamingResponse(
        stream_events(events),
        media_type='text/event-stream',
    )
```

### format_sse_event

Format a single dictionary as an SSE data line:

```python
from mentiora import format_sse_event

sse_string = format_sse_event({'type': 'delta', 'delta': 'Hello'})
# "data: {\"type\": \"delta\", \"delta\": \"Hello\"}\n\n"
```

### SSE_HEADERS

Pre-configured headers for SSE responses:

```python
from mentiora import SSE_HEADERS

# {
#     'Content-Type': 'text/event-stream; charset=utf-8',
#     'Cache-Control': 'no-cache, no-transform',
#     'Connection': 'keep-alive',
#     'X-Accel-Buffering': 'no',
# }
```

## OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
pip install openai
```

```python
import os
from mentiora import MentioraClient, MentioraConfig, track_openai, TrackOpenAIOptions
from openai import AsyncOpenAI

mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

tracked_client = track_openai(
    AsyncOpenAI(),
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        tags=['production'],
        metadata={'environment': 'prod'},
    ),
)

# Use tracked_client normally — chat completions are automatically traced
response = await tracked_client.chat.completions.create(
    model='gpt-5-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
```

The plugin traces `chat.completions.create` and supports both sync (`OpenAI`) and async (`AsyncOpenAI`) clients. It automatically captures:

- Request parameters (model, messages, temperature, max_tokens, tools, response_format, etc.)
- Multimodal content (text + image arrays)
- Response content and metadata (id, created, system_fingerprint, service_tier)
- Token usage (prompt, completion, total) for streaming and non-streaming
- Refusal handling
- Tool/function calls and responses
- OpenAI response ID (`openai_id` in trace metadata)
- Errors, stack traces, duration, and timestamps

> **Note:** For streaming requests, the plugin injects `stream_options={'include_usage': True}` to capture token usage. This does not affect your application behavior.

### TrackOpenAIOptions

| Option            | Type             | Required | Default        | Description                  |
| ----------------- | ---------------- | :------: | -------------- | ---------------------------- |
| `mentiora_client` | `MentioraClient` |   Yes    | —              | Initialized Mentiora client  |
| `thread_id`       | `str`            |    No    | auto-generated | UUID v7 thread ID            |
| `tags`            | `list[str]`      |    No    | —              | Tags for all traces          |
| `metadata`        | `dict[str, Any]` |    No    | —              | Metadata for all traces      |
| `capture_content` | `bool`           |    No    | `True`         | Capture input/output content |

## LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
pip install langchain langchain-core
```

```python
import os
from mentiora import (
    MentioraClient,
    MentioraConfig,
    MentioraTracingLangChain,
    MentioraTracingLangChainOptions,
)
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production'],
    metadata={'environment': 'prod'},
))

llm = ChatOpenAI(model='gpt-5-mini')
prompt = ChatPromptTemplate.from_template('Say hello to {name}')
chain = prompt | llm

await chain.ainvoke({'name': 'World'}, {'callbacks': [callback]})
```

The callback handler traces LLM calls (with token usage), chain executions, tool calls, agent operations, retriever operations, parent-child span relationships, and errors.

### MentioraTracingLangChainOptions

| Option            | Type             | Required | Default        | Description                  |
| ----------------- | ---------------- | :------: | -------------- | ---------------------------- |
| `mentiora_client` | `MentioraClient` |   Yes    | —              | Initialized Mentiora client  |
| `thread_id`       | `str`            |    No    | auto-generated | UUID v7 thread ID            |
| `tags`            | `list[str]`      |    No    | —              | Tags for all traces          |
| `metadata`        | `dict[str, Any]` |    No    | —              | Metadata for all traces      |
| `capture_content` | `bool`           |    No    | `True`         | Capture input/output content |

## Resource Cleanup

The SDK supports context managers for automatic resource cleanup:

```python
# Sync context manager
with MentioraClient(config) as client:
    result = client.tracing.send_trace(event)

# Async context manager
async with MentioraClient(config) as client:
    result = await client.tracing.send_trace_async(event)

# Manual cleanup
client.close()         # sync
await client.aclose()  # async
```

## Error Handling

### Result Types

Tracing methods return typed results instead of raising:

```python
result = await client.tracing.send_trace_async(event)

if not result.success:
    print(result.error)  # string error message
```

### Exception Classes

For configuration, validation, and network errors, the SDK raises typed exceptions:

| Exception Class      | Code                  | Description                                        |
| -------------------- | --------------------- | -------------------------------------------------- |
| `MentioraError`      | varies                | Base exception class                               |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Invalid SDK configuration (e.g., missing API key)  |
| `ValidationError`    | `VALIDATION_ERROR`    | Invalid input data (e.g., missing required fields) |
| `NetworkError`       | `NETWORK_ERROR`       | HTTP or network failure (includes `status_code`)   |

```python
from mentiora import ConfigurationError, ValidationError, NetworkError

try:
    await client.agents.run_async(params)
except NetworkError as err:
    print(f'HTTP {err.status_code}: {err.message}')
```

## Requirements

- Python >= 3.11

## Development

```bash
# Install development dependencies
uv pip install -e ".[dev,openai,langchain]"

# Run tests
pytest

# Lint and format
ruff check .
ruff format .

# Type checking
mypy src/
```
