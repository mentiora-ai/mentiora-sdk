# @mentiora/tracing-sdk

TypeScript/JavaScript SDK for sending agent traces to the Mentiora platform.

## Installation

```bash
npm install @mentiora/tracing-sdk
```

## Usage

```typescript
import { MentioraTracing } from '@mentiora/tracing-sdk';

const tracing = new MentioraTracing({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production', // or 'staging'
});

// Send a trace
const result = await tracing.sendTrace({
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

// Flush pending traces
await tracing.flush();
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `projectId` | string | No | Project UUID (optional) |
| `baseUrl` | string | No | Override base URL (for testing) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |

## Error Handling

The SDK returns typed results instead of throwing errors:

```typescript
const result = await tracing.sendTrace(event);

if (!result.success) {
  // Handle error
  console.error(result.error);
}
```

For configuration or validation errors, the SDK throws:
- `ConfigurationError` - Invalid configuration
- `ValidationError` - Invalid trace event data
- `NetworkError` - Network/HTTP errors (with status code)

## TraceEvent Schema

```typescript
interface TraceEvent {
  traceId: string;           // Unique trace ID
  spanId: string;            // Unique span ID
  parentSpanId?: string;     // Parent span for nesting
  name: string;              // Span name, e.g., 'llm.call', 'tool.execute'
  type: 'llm' | 'tool' | 'chat' | 'error' | 'custom';
  input?: unknown;           // Prompt, tool input, etc.
  output?: unknown;          // Response, tool result
  startTime: Date | string;  // ISO 8601 timestamp
  endTime?: Date | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: {
    message: string;
    type?: string;
    stack?: string;
  };
}
```

## Requirements

- Node.js >= 18.0.0
