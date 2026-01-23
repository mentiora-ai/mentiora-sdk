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
    environment='production',
)

client = MentioraClient(config)
```

## Tracing

### Send a Trace

Send agent traces to the Mentiora platform for observability and debugging.

**Async (recommended):**

```python
from datetime import datetime
from mentiora import TraceEvent

result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='trace-123',
    span_id='span-456',
    parent_span_id='span-parent',  # optional
    name='llm.call',
    type='llm',  # 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(),
    end_time=datetime.now(),
    duration_ms=1000,
    metadata={
        'model': 'gpt-4o-mini',
        'provider': 'openai',
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
from mentiora import TraceEvent

result = client.tracing.send_trace(TraceEvent(
    trace_id='trace-123',
    span_id='span-456',
    parent_span_id='span-parent',  # optional
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(),
    end_time=datetime.now(),
    duration_ms=1000,
    metadata={
        'model': 'gpt-4o-mini',
        'provider': 'openai',
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
    trace_id='trace-123',
    span_id='span-parent',
    name='agent.run',
    type='custom',
    start_time=datetime.now(),
))

# Child trace
await client.tracing.send_trace_async(TraceEvent(
    trace_id='trace-123',
    span_id='span-child',
    parent_span_id='span-parent',
    name='llm.call',
    type='llm',
    start_time=datetime.now(),
    end_time=datetime.now(),
))
```

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

## Vector DB (Coming Soon)

Vector database operations will be available through `client.vectordb`:

```python
# Future API
await client.vectordb.upload_file(...)
await client.vectordb.delete_file(...)
await client.vectordb.query(...)
```

## Plugins

The SDK provides plugins for automatic tracing of popular frameworks.

### OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
pip install openai
```

```python
from mentiora import track_openai, MentioraClient, MentioraConfig, TrackOpenAIOptions
from openai import AsyncOpenAI

# Initialize Mentiora client
mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    environment='production',
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

# Use tracked_client instead of openai_client - all calls are automatically traced
response = await tracked_client.chat.completions.create(
    model='gpt-4o-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)

# Embeddings are also traced
embeddings = await tracked_client.embeddings.create(
    model='text-embedding-3-small',
    input='Hello world',
)
```

The plugin automatically captures:
- Model name and provider
- Request messages/prompts
- Response content
- Token usage (prompt, completion, total)
- Errors and stack traces
- Duration and timestamps

### LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
pip install langchain langchain-core
```

```python
from mentiora import MentioraTracingLangChain, MentioraClient, MentioraConfig, MentioraTracingLangChainOptions
from langchain_openai import ChatOpenAI
from langchain.chains import LLMChain
from langchain_core.prompts import PromptTemplate

# Initialize Mentiora client
mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    environment='production',
))

# Create callback handler
callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production', 'langchain-integration'],
    metadata={'environment': 'prod'},
))

# Use with LangChain chains
llm = ChatOpenAI(temperature=0)
prompt = PromptTemplate.from_template('Say hello to {name}')
chain = LLMChain(llm=llm, prompt=prompt)

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

## Next Steps

- Check out the [API reference](./api-reference) for detailed method documentation
