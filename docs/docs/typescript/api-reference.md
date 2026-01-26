---
sidebar_position: 3
---

# TypeScript SDK API Reference

Complete API reference for the Mentiora TypeScript SDK.

## MentioraClient

Main client class for interacting with the Mentiora platform.

### Constructor

```typescript
new MentioraClient(options: ClientOptions)
```

#### ClientOptions

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `projectId` | string | No | Project UUID (optional) |
| `baseUrl` | string | No | Override base URL (for testing) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |

### Properties

#### `tracing`

Access to tracing functionality.

```typescript
client.tracing: TracingClient
```

## TracingClient

Client for sending traces to the Mentiora platform.

### Methods

#### `sendTrace(event: TraceEvent): Promise<SendTraceResult>`

Send a trace event to the platform (async only).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `Promise<SendTraceResult>`

**Note:** TypeScript SDK methods are async-only. For synchronous operations, use Python SDK's `send_trace()` method.

**Example:**

```typescript
const result = await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-456',
  name: 'llm.call',
  type: 'llm',
  startTime: new Date(),
  endTime: new Date(),
});
```

#### `flush(): Promise<void>`

Flush any pending traces in the queue (async only).

**Returns:** `Promise<void>`

**Note:** Currently a no-op, reserved for future batching functionality.

**Example:**

```typescript
await client.tracing.flush();
```

## Types

### TraceEvent

```typescript
interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface TraceEvent {
  traceId: string;           // Unique trace ID (UUID v7 format)
  spanId: string;            // Unique span ID (UUID v7 format)
  parentSpanId?: string;     // Parent span for nesting (UUID v7 format)
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
  usage?: UsageInfo;         // Token usage (LLM-specific)
  model?: string;            // Model name (e.g., 'gpt-4', 'claude-3')
  provider?: string;         // Provider name (e.g., 'openai', 'anthropic')
}
```

**Note:** `traceId` and `spanId` must be in UUID v7 format. The plugins automatically generate UUID v7 IDs.

### SendTraceResult

```typescript
interface SendTraceResult {
  success: boolean;
  traceId: string;
  spanId: string;
  error?: string;
}
```

## Errors

### ConfigurationError

Thrown when the client configuration is invalid.

```typescript
class ConfigurationError extends Error {
  constructor(message: string);
}
```

### ValidationError

Thrown when trace event data is invalid.

```typescript
class ValidationError extends Error {
  constructor(message: string);
}
```

### NetworkError

Thrown when a network or HTTP error occurs.

```typescript
class NetworkError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number);
}
```

## Plugins

### trackOpenAI

Wraps an OpenAI client to automatically trace API calls.

```typescript
function trackOpenAI(
  openaiClient: OpenAI,
  options: TrackOpenAIOptions
): OpenAI
```

**Parameters:**

- `openaiClient: OpenAI` - The OpenAI client instance to wrap
- `options: TrackOpenAIOptions` - Plugin configuration options

**Returns:** Wrapped OpenAI client with tracing enabled

**TrackOpenAIOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentioraClient` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `tags` | `string[]` | No | Optional tags to add to all traces |
| `metadata` | `Record<string, unknown>` | No | Optional metadata to add to all traces |
| `projectId` | `string` | No | Optional project ID override |

**Example:**

```typescript
import { trackOpenAI } from '@mentiora/sdk';
import OpenAI from 'openai';

const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  tags: ['production'],
});
```

### MentioraTracingLangChain

Callback handler for automatically tracing LangChain executions.

```typescript
class MentioraTracingLangChain extends BaseCallbackHandler {
  constructor(options: MentioraTracingLangChainOptions)
}
```

**MentioraTracingLangChainOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentioraClient` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `tags` | `string[]` | No | Optional tags to add to all traces |
| `metadata` | `Record<string, unknown>` | No | Optional metadata to add to all traces |
| `projectId` | `string` | No | Optional project ID override |

**Example:**

```typescript
import { MentioraTracingLangChain } from '@mentiora/sdk';

const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['production'],
});

await chain.invoke({ input: '...' }, { callbacks: [callback] });
```

**Note:** This class extends LangChain's `BaseCallbackHandler` and implements all required callback methods for tracing LLM calls, chain executions, tool calls, and agent operations.
