---
sidebar_position: 1
---

# TypeScript SDK Installation

Install and configure the TypeScript/JavaScript SDK for the Mentiora platform.

## Installation

Install the package using pnpm:

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

## Requirements

- Node.js >= 20.0.0
- TypeScript >= 5.0 (optional, for TypeScript projects)

## Import

### ES Modules

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
```

### CommonJS

```javascript
const { MentioraClient } = require('@mentiora.ai/sdk');
```

## Create a Client

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  // baseUrl defaults to https://platform.mentiora.ai
});
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Project API key — see [Authentication](/authentication) |
| `baseUrl` | string | No | Base URL (defaults to https://platform.mentiora.ai) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |
| `debug` | boolean | No | Enable verbose SDK logging (default: false) |

## Next Steps

- Learn how to [use the SDK](./usage)
- Check out the [API reference](./api-reference)
