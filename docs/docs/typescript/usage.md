---
sidebar_position: 2
---

# TypeScript SDK Usage

Learn how to use the Mentiora TypeScript SDK to send traces and interact with the platform.

## Basic Setup

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production',
});
```

## Tracing

### Send a Trace

Send agent traces to the Mentiora platform for observability and debugging:

```typescript
const result = await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-456',
  parentSpanId: 'span-parent', // optional
  name: 'llm.call',
  type: 'llm', // 'llm' | 'tool' | 'chat' | 'error' | 'custom'
  input: { messages: [{ role: 'user', content: 'Hello' }] },
  output: { response: 'Hello from Mentiora' },
  startTime: new Date(),
  endTime: new Date(),
  durationMs: 1000,
  metadata: {
    model: 'gpt-4o-mini',
    provider: 'openai',
  },
  tags: ['production', 'support-agent'],
});

if (result.success) {
  console.log(`Trace sent: ${result.traceId}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

### Flush Pending Traces

Flush any pending traces in the queue:

```typescript
await client.tracing.flush();
```

### Trace Types

The SDK supports several trace types:

- `llm` - LLM API calls
- `tool` - Tool/function executions
- `chat` - Chat interactions
- `error` - Error events
- `custom` - Custom trace types

### Nested Traces

Create nested traces using `parentSpanId`:

```typescript
// Parent trace
await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-parent',
  name: 'agent.run',
  type: 'custom',
  startTime: new Date(),
});

// Child trace
await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-child',
  parentSpanId: 'span-parent',
  name: 'llm.call',
  type: 'llm',
  startTime: new Date(),
  endTime: new Date(),
});
```

## Error Handling

The SDK returns typed results instead of throwing errors:

```typescript
const result = await client.tracing.sendTrace(event);

if (!result.success) {
  // Handle error
  console.error(result.error);
}
```

For configuration or validation errors, the SDK throws:

- `ConfigurationError` - Invalid configuration
- `ValidationError` - Invalid trace event data
- `NetworkError` - Network/HTTP errors (with status code)

## Vector DB (Coming Soon)

Vector database operations will be available through `client.vectordb`:

```typescript
// Future API
await client.vectordb.uploadFile(...);
await client.vectordb.deleteFile(...);
await client.vectordb.query(...);
```

## Next Steps

- Check out the [API reference](./api-reference) for detailed method documentation
