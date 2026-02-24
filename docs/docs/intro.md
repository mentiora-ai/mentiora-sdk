---
sidebar_position: 1
slug: /
description: "Official TypeScript and Python SDK for the Mentiora AI observability platform."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Welcome to Mentiora SDK

The **Mentiora SDK** provides official TypeScript and Python client libraries for integrating with the [Mentiora platform](https://platform.mentiora.ai).

## What is Mentiora?

Mentiora is a platform for building, deploying, and observing AI agents. The SDK lets you:

- **Run Agents** — Execute AI agents hosted on the platform, with support for streaming and multi-turn conversations
- **Trace** — Send traces to the Mentiora platform for observability and debugging of your AI workflows
- **Auto-instrument** — Automatically capture traces from OpenAI and LangChain with drop-in plugins
- **Stream to UIs** — Use built-in SSE helpers to pipe agent responses to web frontends

## Quick Start

<SdkTabs>
<TabItem value="typescript">

```bash
pnpm add @mentiora.ai/sdk
```

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
```

</TabItem>
<TabItem value="python">

```bash
pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

```python
import os
from mentiora import MentioraClient, MentioraConfig

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
)

client = MentioraClient(config)
```

</TabItem>
</SdkTabs>

:::tip[First time?]
Start with [Authentication](./authentication) to get your API key, then follow the [Quick Start](./quick-start) guide.
:::

## What's in the SDK?

| Feature | Description |
|---------|-------------|
| [Agents](./usage/agents) | Run and stream AI agents hosted on the Mentiora platform |
| [Tracing](./usage/tracing) | Send traces for observability and debugging |
| [Plugins](./usage/plugins) | Auto-trace OpenAI and LangChain calls with zero code changes |
| [Streaming Helpers](./usage/streaming-helpers) | SSE utilities for piping agent responses to web frontends |

Check out our [example applications](./examples) for complete, runnable code, or jump to the [Usage guide](./usage).
