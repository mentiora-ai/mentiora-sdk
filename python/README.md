# mentiora-sdk

Python SDK for the Mentiora platform. Provides access to tracing, vector database operations, and other platform features.

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
from mentiora import MentioraClient, MentioraConfig

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    environment='production',  # or 'staging'
)

client = MentioraClient(config)
```

### Tracing

Send agent traces to the Mentiora platform:

```python
from datetime import datetime
from mentiora import MentioraClient, MentioraConfig, TraceEvent

client = MentioraClient(MentioraConfig(
    api_key='your-api-key',
    environment='production',
))

# Send a trace
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

# Flush pending traces
await client.tracing.flush_async()
```

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

### Vector DB (Coming Soon)

Vector database operations will be available through `client.vectordb`:

```python
# Future API
await client.vectordb.upload_file(...)
await client.vectordb.delete_file(...)
await client.vectordb.query(...)
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `api_key` | str | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `project_id` | str | No | Project UUID (optional) |
| `base_url` | str | No | Override base URL (for testing) |
| `timeout` | int | No | Request timeout in ms (default: 30000) |
| `retries` | int | No | Max retry attempts (default: 3) |

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

class TraceError:
    message: str
    type: str | None
    stack: str | None
```

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
