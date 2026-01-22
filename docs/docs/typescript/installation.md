---
sidebar_position: 1
---

# TypeScript SDK Installation

The TypeScript/JavaScript SDK for the Mentiora platform.

## Installation

Install the package using npm:

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

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0 (optional, for TypeScript projects)

## Import

### ES Modules

```typescript
import { MentioraClient } from '@mentiora/sdk';
```

### CommonJS

```javascript
const { MentioraClient } = require('@mentiora/sdk');
```

## Create a Client

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production', // or 'staging'
});
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `projectId` | string | No | Project UUID (optional) |
| `baseUrl` | string | No | Override base URL (for testing) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |

## Next Steps

- Learn how to [use the SDK](./usage)
- Check out the [API reference](./api-reference)
