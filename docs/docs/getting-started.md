---
sidebar_position: 2
---

# Getting Started

Get up and running with the Mentiora SDK in just a few steps.

## Prerequisites

- Node.js >= 18.0.0 (for TypeScript/JavaScript SDK)
- A Mentiora account and API key

## Installation

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

## Basic Setup

Create a client instance with your API key:

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production', // or 'staging'
});
```

## Your First Trace

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

## Next Steps

- Learn more about the [TypeScript SDK](./typescript/installation)
- Explore [usage examples](./typescript/usage)
- Check out the [API reference](./typescript/api-reference)
