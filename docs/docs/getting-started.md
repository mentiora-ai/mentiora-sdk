---
sidebar_position: 2
---

# Getting Started

Get up and running with the Mentiora SDK in just a few steps.

## Prerequisites

- Node.js >= 18.0.0 (for TypeScript/JavaScript SDK)
- Python >= 3.11 (for Python SDK)
- A Mentiora account and API key

## Installation

### TypeScript/JavaScript

Install the SDK using npm:

```bash
npm install @mentiora/sdk
```

Or with yarn:

```bash
yarn add @mentiora/sdk
```

Or with pnpm:

```bash
pnpm add @mentiora/sdk
```

### Python

Install the SDK using pip:

```bash
pip install mentiora-sdk
```

For optional plugin support:

```bash
# With OpenAI plugin support
pip install mentiora-sdk[openai]

# With LangChain plugin support
pip install mentiora-sdk[langchain]

# With both
pip install mentiora-sdk[openai,langchain]
```

## Basic Setup

### TypeScript/JavaScript

Create a client instance with your API key:

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production', // or 'staging'
});
```

### Python

Create a client instance with your API key:

```python
from mentiora import MentioraClient, MentioraConfig

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    environment='production',  # or 'staging'
)

client = MentioraClient(config)
```

## Your First Trace

### TypeScript/JavaScript

Send your first trace to the Mentiora platform:

```typescript
const result = await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-456',
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

Send your first trace to the Mentiora platform:

```python
from datetime import datetime
from mentiora import TraceEvent

result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='trace-123',
    span_id='span-456',
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

## Next Steps

- Learn more about the [TypeScript SDK](./typescript/installation) or [Python SDK](./python/installation)
- Explore [usage examples](./typescript/usage) or [Python usage examples](./python/usage)
- Check out the [API reference](./typescript/api-reference) or [Python API reference](./python/api-reference)
