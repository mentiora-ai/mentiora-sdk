---
sidebar_position: 3
---

# Getting Started

Get up and running with the Mentiora SDK in just a few steps.

## Prerequisites

- Node.js >= 20.0.0 (for TypeScript/JavaScript SDK)
- Python >= 3.11 (for Python SDK)
- A Mentiora account and an API key — see [Authentication](./authentication) for how to create one

## Installation

### TypeScript/JavaScript

Install the SDK using pnpm:

```bash
pnpm add @mentiora.ai/sdk
```

Or with npm:

```bash
npm install @mentiora.ai/sdk
```

Or with yarn:

```bash
yarn add @mentiora.ai/sdk
```

### Python

Install the SDK using pip:

```bash
pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

Or with uv:

```bash
uv pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

For optional plugin support:

```bash
# With OpenAI plugin support
pip install "mentiora-ai-sdk[openai] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"

# With LangChain plugin support
pip install "mentiora-ai-sdk[langchain] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"

# With both
pip install "mentiora-ai-sdk[openai,langchain] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

## Basic Setup

### TypeScript/JavaScript

Create a client instance with your API key:

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
```

### Python

Create a client instance with your API key:

```python
import os
from mentiora import MentioraClient, MentioraConfig

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
)

client = MentioraClient(config)
```

## Your First Trace

### TypeScript/JavaScript

Send your first trace to the Mentiora platform. Use UUID v7 for `traceId` and `spanId` (see [Usage → Tracing](./typescript/usage#send-a-trace) for details).

```typescript
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7
  spanId: '019505a0-b7c2-7000-8000-000000000002',  // UUID v7
  name: 'llm.call',
  type: 'llm',
  input: { messages: [{ role: 'user', content: 'Hello' }] },
  output: { response: 'Hello from Mentiora' },
  startTime: new Date(),
  endTime: new Date(),
  durationMs: 1000,
});

if (result.success) {
  console.log(`Trace sent: ${result.traceId}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

### Python

Send your first trace to the Mentiora platform. Use UUID v7 for `trace_id` and `span_id` (see [Usage → Tracing](./python/usage#send-a-trace) for details).

```python
from datetime import datetime
from mentiora import TraceEvent

result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(),
    end_time=datetime.now(),
    duration_ms=1000,
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
else:
    print(f'Failed: {result.error}')
```

> For complete, runnable examples see the [Examples](./examples) page.

## Next Steps

- Browse the [example applications](./examples) for complete, runnable code
- Learn more about the [TypeScript SDK](./typescript/installation) or [Python SDK](./python/installation)
- Explore [TypeScript usage guide](./typescript/usage) or [Python usage guide](./python/usage)
- Check out the [API reference](./typescript/api-reference) or [Python API reference](./python/api-reference)
