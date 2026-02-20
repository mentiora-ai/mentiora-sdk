---
sidebar_position: 1
slug: /
---

# Welcome to Mentiora SDK

The **Mentiora SDK** provides official client libraries for integrating with the Mentiora platform.

## What is Mentiora?

Mentiora is a platform for building, deploying, and observing AI agents. The SDK currently supports:

- **Tracing** — Send agent traces to the Mentiora platform for observability and debugging

## SDKs Available

- **[TypeScript/JavaScript SDK](./typescript/installation)** - For Node.js applications
- **[Python SDK](./python/installation)** - For Python applications

## Quick Start

### TypeScript/JavaScript

```bash
pnpm add @mentiora.ai/sdk
```

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
```

### Python

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

Check out our [example applications](./examples) for complete, runnable code.

> **First time?** Start with [Authentication](./authentication) to get your API key, then follow the [Getting Started](./getting-started) guide.

Ready to dive in? Check out the [Getting Started guide](./getting-started) or jump to the [TypeScript SDK documentation](./typescript/installation) or [Python SDK documentation](./python/installation).
