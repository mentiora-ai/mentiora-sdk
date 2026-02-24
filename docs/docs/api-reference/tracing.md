---
title: Tracing
description: "API reference for TracingClient — methods for sending trace events, and types including TraceEvent, TraceError, SendTraceResult, TraceType, and UsageInfo."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Tracing

> For usage examples, see [Usage - Tracing](/usage/tracing).

## TracingClient

Client for sending traces to the Mentiora platform.

### Methods

<SdkTabs>
<TabItem value="typescript">

#### `sendTrace(event: TraceEvent): Promise<SendTraceResult>`

Send a trace event to the platform (async only).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `Promise<SendTraceResult>`

**Example:**

```typescript
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7
  spanId: '019505a0-b7c2-7000-8000-000000000002',  // UUID v7
  name: 'llm.call',
  type: 'llm',
  startTime: new Date(),
  endTime: new Date(),
});
```

#### `flush(): Promise<void>`

Currently a no-op reserved for future batching support. Safe to include in shutdown handlers for forward compatibility.

**Returns:** `Promise<void>`

**Example:**

```typescript
await client.tracing.flush();
```

</TabItem>
<TabItem value="python">

#### `send_trace(event: TraceEvent) -> SendTraceResult`

Send a trace event to the platform (synchronous).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `SendTraceResult`

**Example:**

```python
result = client.tracing.send_trace(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    name='llm.call',
    type='llm',
    start_time=datetime.now(),
    end_time=datetime.now(),
))
```

#### `send_trace_async(event: TraceEvent) -> SendTraceResult`

Send a trace event to the platform (asynchronous).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `SendTraceResult`

**Example:**

```python
result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7
    span_id='019505a0-b7c2-7000-8000-000000000002',   # UUID v7
    name='llm.call',
    type='llm',
    start_time=datetime.now(),
    end_time=datetime.now(),
))
```

#### `flush() -> None`

Currently a no-op reserved for future batching support. Safe to include in shutdown handlers for forward compatibility.

**Returns:** `None`

**Example:**

```python
client.tracing.flush()
```

#### `flush_async() -> None`

Async version of `flush()`. Currently a no-op reserved for future batching support.

**Returns:** `None`

**Example:**

```python
await client.tracing.flush_async()
```

</TabItem>
</SdkTabs>

## Types

### TraceEvent

<SdkTabs>
<TabItem value="typescript">

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
  threadId?: string;         // Optional. If omitted, the SDK sets it to a new UUID v7 before sending.
  name: string;               // Span name, e.g., 'llm.call', 'tool.execute'
  type: 'llm' | 'tool' | 'chat' | 'error' | 'custom';
  input?: unknown;           // Prompt, tool input, etc.
  output?: unknown;          // Response, tool result
  startTime: Date | string;  // ISO 8601 timestamp
  endTime?: Date | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: TraceError;        // Error details (when type === 'error')
  usage?: UsageInfo;         // Token usage (LLM-specific)
  model?: string;            // Model name (e.g., 'gpt-4', 'claude-3')
  provider?: string;         // Provider name (e.g., 'openai', 'anthropic')
}
```

</TabItem>
<TabItem value="python">

```python
class UsageInfo:
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None

class TraceEvent:
    trace_id: str              # Unique trace ID (UUID v7 format)
    span_id: str               # Unique span ID (UUID v7 format)
    parent_span_id: str | None  # Parent span for nesting (UUID v7 format)
    thread_id: str | None      # Optional. If omitted, the SDK sets it to a new UUID v7 before sending.
    name: str                   # Span name, e.g., 'llm.call', 'tool.execute'
    type: 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input: Any | None           # Prompt, tool input, etc.
    output: Any | None          # Response, tool result
    start_time: datetime | str  # ISO 8601 timestamp
    end_time: datetime | str | None
    duration_ms: int | None
    metadata: dict[str, Any] | None
    tags: list[str] | None
    error: TraceError | None
    usage: UsageInfo | None     # Token usage (LLM-specific)
    model: str | None           # Model name (e.g., 'gpt-4', 'claude-3')
    provider: str | None        # Provider name (e.g., 'openai', 'anthropic')
```

</TabItem>
</SdkTabs>

**Note:** `traceId`/`trace_id` and `spanId`/`span_id` must be in UUID v7 format. The plugins automatically generate UUID v7 IDs.

#### Serialization

##### `model_dump_for_api()` (Python only)

Serialize the trace event for the Mentiora API. Handles datetime conversion to ISO 8601 strings and uses camelCase field names as expected by the backend.

```python
event = TraceEvent(...)
payload = event.model_dump_for_api()
# Returns dict with camelCase keys: {'traceId': '...', 'spanId': '...', ...}
```

### TraceError

<SdkTabs>
<TabItem value="typescript">

```typescript
interface TraceError {
  message: string;
  type?: string;
  stack?: string;
}
```

</TabItem>
<TabItem value="python">

```python
class TraceError:
    message: str
    type: str | None
    stack: str | None
```

</TabItem>
</SdkTabs>

### SendTraceResult

<SdkTabs>
<TabItem value="typescript">

```typescript
interface SendTraceResult {
  success: boolean;
  traceId: string;
  spanId: string;
  error?: string;
}
```

</TabItem>
<TabItem value="python">

```python
class SendTraceResult:
    success: bool
    trace_id: str
    span_id: str
    error: str | None
```

</TabItem>
</SdkTabs>

### TraceType

<SdkTabs>
<TabItem value="typescript">

```typescript
type TraceType = 'llm' | 'tool' | 'chat' | 'error' | 'custom';
```

</TabItem>
<TabItem value="python">

```python
TraceType = Literal['llm', 'tool', 'chat', 'error', 'custom']
```

</TabItem>
</SdkTabs>

---

**See also:** [Client](/api-reference/client) | [Errors](/api-reference/errors) | [Plugins](/api-reference/plugins)
