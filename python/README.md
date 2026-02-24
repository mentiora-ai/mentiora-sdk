# mentiora-sdk

Python SDK for the Mentiora platform. Provides AI observability and tracing.

## Installation

```bash
pip install mentiora-sdk
```

For optional dependencies:

```bash
# With OpenAI plugin support
pip install mentiora-sdk[openai]

# With LangChain plugin support
pip install mentiora-sdk[langchain]

# With both
pip install mentiora-sdk[openai,langchain]
```

## Usage

### Basic Setup

```python
import os
from mentiora import MentioraClient, MentioraConfig

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    # Optional: base_url defaults to https://platform.mentiora.ai
)

client = MentioraClient(config)
```

### Authentication

To obtain an API key:

1. Sign in to the [Mentiora dashboard](https://platform.mentiora.ai)
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"** and copy the key immediately (it's only shown once)
4. Set it as an environment variable:

```bash
export MENTIORA_API_KEY=your-api-key-here
```

See the [Authentication guide](https://docs.mentiora.ai/authentication) for details on key management and security best practices.

### Sync vs Async API

The Python SDK provides both synchronous and asynchronous APIs to match your application's architecture:

#### Async API (Recommended for async frameworks)

```python
# For async applications (FastAPI, aiohttp, AsyncOpenAI, etc.)
result = await client.tracing.send_trace_async(event)
await client.tracing.flush_async()
```

#### Sync API (For synchronous frameworks)

```python
# For sync applications (Flask, Django WSGI, scripts, sync OpenAI, etc.)
result = client.tracing.send_trace(event)
client.tracing.flush()
```

#### When to use which API:

- **Use Async API** when working with:
  - FastAPI, Starlette, aiohttp, Sanic
  - AsyncOpenAI, async LangChain components
  - Any application using `async`/`await` patterns

- **Use Sync API** when working with:
  - Flask, Django (WSGI mode), Bottle
  - Standard OpenAI client (sync)
  - Scripts, CLI tools, Jupyter notebooks
  - Any traditional synchronous Python code

#### Best Practice: Match your SDK API to your application's async/sync nature

```python
# ✅ Good: Async app using async SDK
async def handle_request():
    result = await client.tracing.send_trace_async(event)
    return result

# ✅ Good: Sync app using sync SDK
def handle_request():
    result = client.tracing.send_trace(event)
    return result

# ❌ Bad: Mixing sync in async (blocks event loop!)
async def handle_request():
    result = client.tracing.send_trace(event)  # Don't do this!
    return result
```

### Resource Cleanup

The SDK supports context managers for automatic resource cleanup:

```python
# Sync context manager
with MentioraClient(config) as client:
    result = client.tracing.send_trace(event)
# Cleanup happens automatically

# Async context manager
async with MentioraClient(config) as client:
    result = await client.tracing.send_trace_async(event)
# Cleanup happens automatically

# Manual cleanup (if not using context managers)
client.close()  # For sync
await client.aclose()  # For async
```

### Tracing

Send agent traces to the Mentiora platform:

```python
from datetime import datetime
from mentiora import MentioraClient, MentioraConfig, TraceEvent, UsageInfo

client = MentioraClient(MentioraConfig(
    api_key='your-api-key',
))

# Send a trace
result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000003',  # optional, UUID v7 format
    name='llm.call',
    type='llm',  # 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(),
    end_time=datetime.now(),
    duration_ms=1000,
    usage=UsageInfo(
        prompt_tokens=10,
        completion_tokens=25,
        total_tokens=35,
    ),
    model='gpt-5-mini',
    provider='openai',
    metadata={
        'environment': 'prod',
    },
    tags=['production', 'support-agent'],
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
else:
    print(f'Failed: {result.error}')

# Flush pending traces
await client.tracing.flush_async()
```

### OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
pip install openai
```

```python
import os
from mentiora import track_openai, MentioraClient, MentioraConfig, TrackOpenAIOptions
from openai import AsyncOpenAI

# Initialize Mentiora client
mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Initialize OpenAI client
openai_client = AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Wrap OpenAI client with tracing
tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        tags=['production', 'openai-integration'],
        metadata={'environment': 'prod'},
    ),
)

# Use tracked_client instead of openai_client - chat completions are automatically traced
response = await tracked_client.chat.completions.create(
    model='gpt-5-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
```

Only chat completions (via `chat.completions.create`) are traced by the OpenAI plugin; embeddings and image calls are not traced.

The plugin automatically captures:

- All request parameters (model, messages, temperature, max_tokens, tools, response_format, etc.)
- Multimodal message support (text + image content arrays)
- Response content and metadata (id, created, system_fingerprint, service_tier)
- Token usage (prompt, completion, total) for both streaming and non-streaming
- Refusal handling (when the model refuses a request)
- Tool/function calls and responses
- OpenAI response ID (`openai_id` in trace metadata) for correlation with OpenAI logs
- Errors and stack traces
- Duration and timestamps

> **Note:** For streaming requests, the plugin automatically injects `stream_options={'include_usage': True}` to capture token usage. This does not affect your application behavior.

### LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
pip install langchain langchain-core
```

```python
import os
from mentiora import MentioraTracingLangChain, MentioraClient, MentioraConfig, MentioraTracingLangChainOptions
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# Initialize Mentiora client
mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Create callback handler
callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production', 'langchain-integration'],
    metadata={'environment': 'prod'},
))

# Use with LangChain LCEL chains
llm = ChatOpenAI(model='gpt-5-mini')
prompt = ChatPromptTemplate.from_template('Say hello to {name}')
chain = prompt | llm

# Invoke with callback - all operations are automatically traced
await chain.ainvoke({'name': 'World'}, {'callbacks': [callback]})

# Works with agents, tools, retrievers, and other LangChain components
```

The callback handler automatically traces:

- LLM calls (with token usage)
- Chain executions
- Tool calls
- Agent operations
- Retriever operations
- Parent-child span relationships
- Errors and failures

## Configuration

| Option     | Type | Required | Description                                                                     |
| ---------- | ---- | -------- | ------------------------------------------------------------------------------- |
| `api_key`  | str  | Yes      | Project API key — see [Authentication](https://docs.mentiora.ai/authentication) |
| `base_url` | str  | No       | Base URL (defaults to https://platform.mentiora.ai)                             |
| `timeout`  | int  | No       | Request timeout in ms (default: 30000)                                          |
| `retries`  | int  | No       | Max retry attempts (default: 3)                                                 |
| `debug`    | bool | No       | Enable verbose SDK logging (default: False)                                     |

## Error Handling

The SDK returns typed results instead of throwing errors:

```python
result = await client.tracing.send_trace_async(event)

if not result.success:
    # Handle error
    print(result.error)
```

For configuration or validation errors, the SDK raises:

- `ConfigurationError` - Invalid configuration
- `ValidationError` - Invalid trace event data
- `NetworkError` - Network/HTTP errors (with status code)

## TraceEvent Schema

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

class TraceError:
    message: str
    type: str | None
    stack: str | None
```

**Note:** `trace_id` and `span_id` must be in UUID v7 format (e.g., `019505a0-b7c2-7000-8000-000000000001`). The plugins automatically generate UUID v7 IDs.

## Requirements

- Python >= 3.11

## Development

```bash
# Install development dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run linting
ruff check .
ruff format .

# Run type checking
mypy src/
```
