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

#### `sendTrace(event: TraceEvent): Promise<TraceResult>`

Send a trace event to the platform.

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `Promise<TraceResult>`

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

Flush any pending traces in the queue.

**Returns:** `Promise<void>`

**Example:**

```typescript
await client.tracing.flush();
```

## Types

### TraceEvent

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

### TraceResult

```typescript
type TraceResult = 
  | { success: true; traceId: string }
  | { success: false; error: string };
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
