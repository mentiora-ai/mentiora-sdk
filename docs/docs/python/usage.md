---
sidebar_position: 2
---

# Python SDK Usage

Learn how to use the Mentiora Python SDK to send traces and interact with the platform.

## Basic Setup

```python
from mentiora import MentioraClient, MentioraConfig
import os

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
)

client = MentioraClient(config)
```

## Sync vs Async API

The Python SDK provides both synchronous and asynchronous APIs to match your application's architecture:

### Async API (Recommended)

Use the async API when working with async frameworks or applications:

```python
# For async applications (FastAPI, aiohttp, AsyncOpenAI, etc.)
result = await client.tracing.send_trace_async(event)
await client.tracing.flush_async()
```

**When to use async:**
- FastAPI, Starlette, aiohttp, Sanic
- AsyncOpenAI, async LangChain components
- Any application using `async`/`await` patterns

### Sync API

Use the sync API for traditional synchronous Python code:

```python
# For sync applications (Flask, Django WSGI, scripts, etc.)
result = client.tracing.send_trace(event)
client.tracing.flush()
```

**When to use sync:**
- Flask, Django (WSGI mode), Bottle
- Standard OpenAI client (sync)
- Scripts, CLI tools, Jupyter notebooks
- Traditional synchronous Python code

### Best Practice

**Always match your SDK API to your application's async/sync nature:**

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

## Resource Cleanup

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

## Tracing

### Send a Trace

Send agent traces to the Mentiora platform for observability and debugging.

**Async (recommended):**

```python
from datetime import datetime
from mentiora import TraceEvent, UsageInfo

result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000003',  # optional, UUID v7 format
    thread_id='019505a0-b7c2-7000-8000-000000000000',  # optional; omit to let SDK generate UUID v7
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
    model='gpt-4o-mini',
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
```

**Sync (for synchronous code):**

```python
from datetime import datetime
from mentiora import TraceEvent, UsageInfo

result = client.tracing.send_trace(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000003',  # optional, UUID v7 format
    name='llm.call',
    type='llm',
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
    model='gpt-4o-mini',
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
```

### Flush Pending Traces

Flush any pending traces in the queue:

**Async:**

```python
await client.tracing.flush_async()
```

**Sync:**

```python
client.tracing.flush()
```

### Trace Types

The SDK supports several trace types:

- `llm` - LLM API calls
- `tool` - Tool/function executions
- `chat` - Chat interactions
- `error` - Error events
- `custom` - Custom trace types

### Nested Traces

Create nested traces using `parent_span_id`:

```python
# Parent trace
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    name='agent.run',
    type='custom',
    start_time=datetime.now(),
))

# Child trace
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # Same trace ID
    span_id='019505a0-b7c2-7000-8000-000000000003',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000002',  # Parent span ID
    name='llm.call',
    type='llm',
    start_time=datetime.now(),
    end_time=datetime.now(),
))
```

### Thread ID for Conversations

Group multiple traces into conversational threads using `thread_id`. This is useful for tracking multi-turn conversations where each turn is a separate trace. Use one stable UUID v7 per conversation; the SDK depends on `uuid-utils`, which provides `uuid7()`. If you omit `thread_id`, the SDK sets it to a new UUID v7 before sending.

```python
from uuid_utils import uuid7

# One thread_id per conversation
thread_id = str(uuid7())

# First turn
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    thread_id=thread_id,  # Group into conversation
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'What is Python?'}]},
    output={'response': 'Python is a programming language...'},
    start_time=datetime.now(),
    end_time=datetime.now(),
))

# Second turn - same thread_id
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000003',  # Different trace ID
    span_id='019505a0-b7c2-7000-8000-000000000004',  # Different span ID
    thread_id=thread_id,  # Same thread_id groups them together
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'What are its main use cases?'}]},
    output={'response': 'Python is commonly used for...'},
    start_time=datetime.now(),
    end_time=datetime.now(),
))

# All traces with the same thread_id will be grouped together in the platform
```

**Important:** `thread_id` must be a UUID v7 format. The platform will group all traces with the same `thread_id` into a conversational thread for easier analysis and debugging of multi-turn interactions.

## Error Handling

The SDK returns typed results instead of raising errors:

```python
# Async
result = await client.tracing.send_trace_async(event)

# Or sync
result = client.tracing.send_trace(event)

if not result.success:
    # Handle error
    print(result.error)
```

For configuration or validation errors, the SDK raises:

- `ConfigurationError` - Invalid configuration
- `ValidationError` - Invalid trace event data
- `NetworkError` - Network/HTTP errors (with status code)

## Agents

Run AI agents hosted on the Mentiora platform. The agents API supports both synchronous (complete response) and streaming modes.

**Note:** Unlike tracing methods (which return `SendTraceResult` and never throw), agent methods **throw exceptions** on errors (`ValidationError`, `NetworkError`).

### Quick Start

```python
from mentiora import MentioraClient, MentioraConfig, AgentRunParams

client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))

result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What is the weather today?',
))
print(result.output)
```

### Streaming

Stream agent responses in real time using Server-Sent Events:

**Async (recommended):**

```python
from mentiora import AgentRunParams

async for event in client.agents.stream_async(AgentRunParams(
    tag='production',
    message='Write a poem about Python.',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
    elif event.type == 'chat_completed':
        print(f'\nDone: {event.status}')
    elif event.type == 'error':
        print(f'\nError: {event.message}')
```

**Sync:**

```python
for event in client.agents.stream(AgentRunParams(
    tag='production',
    message='Write a poem about Python.',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
    elif event.type == 'chat_completed':
        print(f'\nDone: {event.status}')
    elif event.type == 'error':
        print(f'\nError: {event.message}')
```

### Multi-turn Conversations

Use `thread_id` to continue conversations across multiple agent calls:

```python
# First turn
result1 = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What is Python?',
))
thread_id = result1.thread_id  # Save the thread ID

# Continue the conversation
result2 = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What are its main use cases?',
    thread_id=thread_id,  # Same thread continues the conversation
))
```

### Agent Resolution

Identify which agent to run using either a **tag** or **agent_id** (but not both):

```python
# By tag (recommended for production)
result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='Hello',
))

# By agent ID with specific revision
result = await client.agents.run_async(AgentRunParams(
    agent_id='agent-abc-123',
    revision=5,
    message='Hello',
))
```

### End-User Tracking

Pass `end_user_id` to associate agent calls with specific end-users:

```python
result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='Hello',
    end_user_id='user-123',
))
```

### Retry Behavior

- **Non-streaming** (`run()` / `run_async()`): Retries up to 3 times on 5xx errors and rate limits (429), with exponential backoff and jitter.
- **Streaming** (`stream()` / `stream_async()`): **No retry** — the stream is opened once. If the connection fails mid-stream, a `NetworkError` is raised. Implement your own retry logic around the stream call if needed.

### Error Handling

Agent methods throw exceptions instead of returning error results:

```python
from mentiora.errors import ValidationError, NetworkError

try:
    result = await client.agents.run_async(AgentRunParams(
        tag='production',
        message='Hello',
    ))
    print(result.output)
except ValidationError as e:
    print(f'Invalid parameters: {e}')
except NetworkError as e:
    print(f'Network error (status {e.status_code}): {e}')
```

For streaming, an `AgentErrorEvent` is yielded when the server reports an error, and the stream stops automatically:

```python
async for event in client.agents.stream_async(params):
    if event.type == 'error':
        print(f'Agent error [{event.code}]: {event.message}')
        break
```

## Plugins

The SDK provides plugins for automatic tracing of popular frameworks.

### OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
uv pip install openai
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
    model='gpt-4o-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
```

> For a complete runnable example, see [`examples/python/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/openai-integration).

The OpenAI plugin traces chat completions (via `chat.completions.create`); embeddings and image calls are not currently traced.

**Multi-turn conversations with thread_id:**

To group multiple OpenAI calls into a conversation, provide a `thread_id` when wrapping the client:

```python
from uuid_utils import uuid7
from mentiora import track_openai, MentioraClient, TrackOpenAIOptions
from openai import AsyncOpenAI

# One thread_id per conversation (see Thread ID section above)
thread_id = str(uuid7())

# Wrap client with thread_id - all calls will be grouped
tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        thread_id=thread_id,  # All traces will use this thread_id
        tags=['conversation'],
    ),
)

# Turn 1
response1 = await tracked_client.chat.completions.create(
    model='gpt-4o-mini',
    messages=[{'role': 'user', 'content': 'What is Python?'}],
)

# Turn 2 - same tracked_client = same thread_id
response2 = await tracked_client.chat.completions.create(
    model='gpt-4o-mini',
    messages=[
        {'role': 'user', 'content': 'What is Python?'},
        {'role': 'assistant', 'content': response1.choices[0].message.content},
        {'role': 'user', 'content': 'What are its main use cases?'},
    ],
)

# Both calls are grouped together in the platform by thread_id
```

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
- Thread ID for conversation grouping

> **Note:** For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage. This does not affect your application behavior.

### LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
uv pip install langchain langchain-core
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
llm = ChatOpenAI(model='gpt-4o-mini')
prompt = ChatPromptTemplate.from_template('Say hello to {name}')
chain = prompt | llm

# Invoke with callback - all operations are automatically traced
await chain.ainvoke({'name': 'World'}, {'callbacks': [callback]})

# Works with agents, tools, retrievers, and other LangChain components
```

**Multi-turn conversations with thread_id:**

To group multiple LangChain operations into a conversation, provide a `thread_id` when creating the callback:

```python
from uuid_utils import uuid7

# One thread_id per conversation (see Thread ID section above)
thread_id = str(uuid7())

# Create callback with thread_id - all traces will be grouped
callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    thread_id=thread_id,  # All traces will use this thread_id
    tags=['conversation'],
))

# Turn 1
chain1 = ChatPromptTemplate.from_template('Generate a question about {topic}') | llm
result1 = await chain1.ainvoke({'topic': 'Python'}, {'callbacks': [callback]})

# Turn 2 - same callback = same thread_id
chain2 = ChatPromptTemplate.from_template('Answer this: {question}') | llm
result2 = await chain2.ainvoke({'question': result1.content}, {'callbacks': [callback]})

# Both operations are grouped together in the platform by thread_id
```

> For a complete runnable example, see [`examples/python/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/langchain-integration).

The callback handler automatically traces:
- LLM calls (with token usage)
- Chain executions
- Tool calls
- Agent operations
- Retriever operations
- Parent-child span relationships
- Errors and failures
- Thread ID for conversation grouping

## Next Steps

- Check out the [API reference](./api-reference) for detailed method documentation
