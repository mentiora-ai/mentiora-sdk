---
sidebar_position: 1
slug: /
---

# Welcome to Mentiora SDK

The **Mentiora SDK** provides official client libraries for integrating with the Mentiora platform. Use it to send agent traces, manage vector databases, and access other platform features.

## What is Mentiora?

Mentiora is a platform for building, deploying, and observing AI agents. The SDK enables you to:

- **Tracing**: Send agent traces to the Mentiora platform for observability and debugging
- **Vector DB**: Upload, manage, and query files in the vector database (coming soon)
- **More features**: Additional capabilities coming soon

## SDKs Available

- **[TypeScript/JavaScript SDK](./typescript/installation)** - For Node.js and browser applications
- **[Python SDK](./python/installation)** - For Python applications

## Quick Start

### TypeScript/JavaScript

```bash
npm install @mentiora/sdk
```

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production',
});
```

### Python

```bash
pip install mentiora-sdk
```

```python
from mentiora import MentioraClient, MentioraConfig
import os

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    environment='production',
)

client = MentioraClient(config)
```

Ready to dive in? Check out the [Getting Started guide](./getting-started) or jump to the [TypeScript SDK documentation](./typescript/installation) or [Python SDK documentation](./python/installation).
