---
sidebar_position: 1
title: Quick Start
description: 'Install the Mentiora SDK for TypeScript or Python, configure authentication, and send your first trace in 5 minutes.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Quick Start

Get up and running with the Mentiora SDK in just a few steps.

## Prerequisites

You need a Mentiora account and an API key — see [Authentication](./authentication) for how to create one.

<SdkTabs>
<TabItem value="typescript">

- Node.js >= 20.0.0
- TypeScript >= 5.0 (optional, for TypeScript projects)

</TabItem>
<TabItem value="python">

- Python >= 3.11
- httpx >= 0.28.1
- pydantic >= 2.12.5

</TabItem>
</SdkTabs>

## Installation

<SdkTabs>
<TabItem value="typescript">

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

</TabItem>
<TabItem value="python">

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

</TabItem>
</SdkTabs>

## Authentication Setup

Every request requires an API key. Pass it via the `apiKey` / `api_key` config option, or set the `MENTIORA_API_KEY` environment variable. See the [Authentication](/authentication) page for detailed instructions on creating and managing API keys.

## Configuration Options

<SdkTabs>
<TabItem value="typescript">

| Option    | Type    | Required | Description                                             |
| --------- | ------- | -------- | ------------------------------------------------------- |
| `apiKey`  | string  | Yes      | Project API key — see [Authentication](/authentication) |
| `baseUrl` | string  | No       | Base URL (defaults to https://platform.mentiora.ai)     |
| `timeout` | number  | No       | Request timeout in ms (default: 30000)                  |
| `retries` | number  | No       | Max retry attempts (default: 3)                         |
| `debug`   | boolean | No       | Enable verbose SDK logging (default: false)             |

</TabItem>
<TabItem value="python">

| Option     | Type | Required | Description                                             |
| ---------- | ---- | -------- | ------------------------------------------------------- |
| `api_key`  | str  | Yes      | Project API key — see [Authentication](/authentication) |
| `base_url` | str  | No       | Base URL (defaults to https://platform.mentiora.ai)     |
| `timeout`  | int  | No       | Request timeout in ms (default: 30000)                  |
| `retries`  | int  | No       | Max retry attempts (default: 3)                         |
| `debug`    | bool | No       | Enable verbose SDK logging (default: False)             |

</TabItem>
</SdkTabs>

## Import

<SdkTabs>
<TabItem value="typescript">

### ES Modules

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
```

### CommonJS

```javascript
const { MentioraClient } = require('@mentiora.ai/sdk');
```

</TabItem>
<TabItem value="python">

```python
from mentiora import MentioraClient, MentioraConfig
```

</TabItem>
</SdkTabs>

## Your First Trace

Create a client and send your first trace to the Mentiora platform. Use UUID v7 for `traceId`/`trace_id` and `spanId`/`span_id` (see [Usage - Tracing](./usage/tracing#send-a-trace) for details).

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7
  spanId: '019505a0-b7c2-7000-8000-000000000002', // UUID v7
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

</TabItem>
<TabItem value="python">

```python
import os
from datetime import datetime, timezone
from mentiora import MentioraClient, MentioraConfig, TraceEvent

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
)

client = MentioraClient(config)

result = client.tracing.send_trace(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(timezone.utc),
    end_time=datetime.now(timezone.utc),
    duration_ms=1000,
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
else:
    print(f'Failed: {result.error}')
```

</TabItem>
</SdkTabs>

:::info
For complete, runnable examples see the [Examples](./examples) page.
:::

## Next Steps

- Browse the [example applications](./examples) for complete, runnable code
- Explore the [Usage guide](./usage) for tracing, agents, streaming, and plugins
- Check out the [API reference](./api-reference) for detailed method documentation
