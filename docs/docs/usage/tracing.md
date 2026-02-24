---
sidebar_label: Tracing
sidebar_position: 1
description: 'Send traces to Mentiora with the TypeScript and Python SDK. Nested traces, thread grouping, and error handling.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Tracing

## Send a Trace

Send agent traces to the Mentiora platform for observability and debugging.

<SdkTabs>
<TabItem value="typescript">

```typescript
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7 format
  spanId: '019505a0-b7c2-7000-8000-000000000002', // UUID v7 format
  parentSpanId: '019505a0-b7c2-7000-8000-000000000003', // optional, UUID v7 format
  threadId: '019505a0-b7c2-7000-8000-000000000000', // optional; omit to let SDK generate UUID v7
  name: 'llm.call',
  type: 'llm', // 'llm' | 'tool' | 'chat' | 'error' | 'custom'
  input: { messages: [{ role: 'user', content: 'Hello' }] },
  output: { response: 'Hello from Mentiora' },
  startTime: new Date(),
  endTime: new Date(),
  durationMs: 1000,
  usage: {
    prompt_tokens: 10,
    completion_tokens: 25,
    total_tokens: 35,
  },
  model: 'gpt-5-mini',
  provider: 'openai',
  metadata: {
    environment: 'prod',
  },
  tags: ['production', 'support-agent'],
});

if (result.success) {
  console.log(`Trace sent: ${result.traceId}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
from datetime import datetime, timezone
from mentiora import TraceEvent, UsageInfo

result = await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000003',  # optional, UUID v7 format
    thread_id='019505a0-b7c2-7000-8000-000000000000',  # optional; omit to let SDK generate UUID v7
    name='llm.call',
    type='llm',  # 'llm' | 'tool' | 'chat' | 'error' | 'custom'
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(timezone.utc),
    end_time=datetime.now(timezone.utc),
    duration_ms=1000,
    usage=UsageInfo(
        prompt_tokens=10,
        completion_tokens=25,
        total_tokens=35,
    ),
    model='gpt-5-mini',
    provider='openai',
    metadata={
        'environment': 'prod',
    },
    tags=['production', 'support-agent'],
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
else:
    print(f'Failed: {result.error}')
```

**Sync (for synchronous code):**

```python
from datetime import datetime, timezone
from mentiora import TraceEvent, UsageInfo

result = client.tracing.send_trace(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000003',  # optional, UUID v7 format
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'Hello'}]},
    output={'response': 'Hello from Mentiora'},
    start_time=datetime.now(timezone.utc),
    end_time=datetime.now(timezone.utc),
    duration_ms=1000,
    usage=UsageInfo(
        prompt_tokens=10,
        completion_tokens=25,
        total_tokens=35,
    ),
    model='gpt-5-mini',
    provider='openai',
    metadata={
        'environment': 'prod',
    },
    tags=['production', 'support-agent'],
))

if result.success:
    print(f'Trace sent: {result.trace_id}')
else:
    print(f'Failed: {result.error}')
```

</TabItem>
</SdkTabs>

## Flush Pending Traces

Flush any pending traces in the queue:

<SdkTabs>
<TabItem value="typescript">

```typescript
await client.tracing.flush();
```

</TabItem>
<TabItem value="python">

**Async:**

```python
await client.tracing.flush_async()
```

**Sync:**

```python
client.tracing.flush()
```

</TabItem>
</SdkTabs>

## Trace Types

The SDK supports several trace types:

- `llm` - LLM API calls
- `tool` - Tool/function executions
- `chat` - Chat interactions
- `error` - Error events
- `custom` - Custom trace types

## Nested Traces

Create nested traces using `parentSpanId` (TypeScript) or `parent_span_id` (Python):

<SdkTabs>
<TabItem value="typescript">

```typescript
// Parent trace
await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7 format
  spanId: '019505a0-b7c2-7000-8000-000000000002', // UUID v7 format
  name: 'agent.run',
  type: 'custom',
  startTime: new Date(),
});

// Child trace
await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // Same trace ID
  spanId: '019505a0-b7c2-7000-8000-000000000003', // UUID v7 format
  parentSpanId: '019505a0-b7c2-7000-8000-000000000002', // Parent span ID
  name: 'llm.call',
  type: 'llm',
  startTime: new Date(),
  endTime: new Date(),
});
```

</TabItem>
<TabItem value="python">

```python
# Parent trace
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    name='agent.run',
    type='custom',
    start_time=datetime.now(timezone.utc),
))

# Child trace
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # Same trace ID
    span_id='019505a0-b7c2-7000-8000-000000000003',  # UUID v7 format
    parent_span_id='019505a0-b7c2-7000-8000-000000000002',  # Parent span ID
    name='llm.call',
    type='llm',
    start_time=datetime.now(timezone.utc),
    end_time=datetime.now(timezone.utc),
))
```

</TabItem>
</SdkTabs>

## Thread ID for Conversations

Group multiple traces into conversational threads using `threadId` (TypeScript) or `thread_id` (Python). This is useful for tracking multi-turn conversations where each turn is a separate trace. If you omit the thread ID, the SDK sets it to a new UUID v7 before sending.

<SdkTabs>
<TabItem value="typescript">

Use one stable UUID v7 per conversation (e.g. from the `uuid` package, which the SDK depends on).

```typescript
import { v7 as uuidv7 } from 'uuid';

// One threadId per conversation
const threadId = uuidv7();

// First turn
await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7 format
  spanId: '019505a0-b7c2-7000-8000-000000000002', // UUID v7 format
  threadId: threadId, // Group into conversation
  name: 'llm.call',
  type: 'llm',
  input: { messages: [{ role: 'user', content: 'What is TypeScript?' }] },
  output: { response: 'TypeScript is a programming language...' },
  startTime: new Date(),
  endTime: new Date(),
});

// Second turn - same threadId
await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000003', // Different trace ID
  spanId: '019505a0-b7c2-7000-8000-000000000004', // Different span ID
  threadId: threadId, // Same threadId groups them together
  name: 'llm.call',
  type: 'llm',
  input: {
    messages: [{ role: 'user', content: 'What are its main benefits?' }],
  },
  output: { response: 'TypeScript provides static typing...' },
  startTime: new Date(),
  endTime: new Date(),
});

// All traces with the same threadId will be grouped together in the platform
```

</TabItem>
<TabItem value="python">

Use one stable UUID v7 per conversation; the SDK ships a built-in `uuid7()` helper.

```python
from mentiora.utils import uuid7

# One thread_id per conversation
thread_id = str(uuid7())

# First turn
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000001',  # UUID v7 format
    span_id='019505a0-b7c2-7000-8000-000000000002',  # UUID v7 format
    thread_id=thread_id,  # Group into conversation
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'What is Python?'}]},
    output={'response': 'Python is a programming language...'},
    start_time=datetime.now(timezone.utc),
    end_time=datetime.now(timezone.utc),
))

# Second turn - same thread_id
await client.tracing.send_trace_async(TraceEvent(
    trace_id='019505a0-b7c2-7000-8000-000000000003',  # Different trace ID
    span_id='019505a0-b7c2-7000-8000-000000000004',  # Different span ID
    thread_id=thread_id,  # Same thread_id groups them together
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'What are its main use cases?'}]},
    output={'response': 'Python is commonly used for...'},
    start_time=datetime.now(timezone.utc),
    end_time=datetime.now(timezone.utc),
))

# All traces with the same thread_id will be grouped together in the platform
```

</TabItem>
</SdkTabs>

**Important:** The thread ID must be a UUID v7 format. The platform will group all traces with the same thread ID into a conversational thread for easier analysis and debugging of multi-turn interactions.

## Error Handling

The SDK returns typed results instead of throwing/raising errors:

<SdkTabs>
<TabItem value="typescript">

```typescript
const result = await client.tracing.sendTrace(event);

if (!result.success) {
  // Handle error
  console.error(result.error);
}
```

</TabItem>
<TabItem value="python">

```python
# Async
result = await client.tracing.send_trace_async(event)

# Or sync
result = client.tracing.send_trace(event)

if not result.success:
    # Handle error
    print(result.error)
```

</TabItem>
</SdkTabs>

For configuration or validation errors, the SDK throws (TypeScript) or raises (Python):

- `ConfigurationError` - Invalid configuration
- `ValidationError` - Invalid trace event data
- `NetworkError` - Network/HTTP errors (with status code)

## See Also

- [Agents](/usage/agents) -- run and stream AI agents hosted on the platform
- [Tracing API Reference](/api-reference/tracing) -- full method and type reference
- [Examples](/examples) -- complete, runnable code samples
