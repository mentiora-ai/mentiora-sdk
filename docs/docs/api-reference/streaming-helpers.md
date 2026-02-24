---
title: Streaming Helpers
description: "API reference for streaming helper utilities — createStreamResponse, stream_events, format_sse_event, and SSE_HEADERS constants."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Streaming Helpers

> For usage examples, see [Usage - Streaming Helpers](/usage/streaming-helpers).

<SdkTabs>
<TabItem value="typescript">

## `createStreamResponse(events, options?): Response`

Create a web-standard `Response` that streams SSE events from an `AsyncIterable<AgentStreamEvent>`. Uses `TransformStream` so back-pressure is handled automatically and the response can be returned immediately. Works with any framework that supports the Fetch API `Response` type (Next.js, Remix, Hono, etc.).

**Parameters:**

- `events: AsyncIterable<AgentStreamEvent>` - The async iterable from `client.agents.stream()`
- `options?: CreateStreamResponseOptions` - Optional configuration

**Returns:** `Response` - A streaming SSE response

**CreateStreamResponseOptions:**

| Option | Type | Description |
|--------|------|-------------|
| `transform` | `(event: AgentStreamEvent) => object \| null` | Custom transform function. Return an object to emit it as an SSE event, or `null` to skip. |
| `headers` | `Record<string, string>` | Additional headers merged with default SSE headers. |

The default transform maps `output_text_delta`, `chat_completed`, and `error` events to simplified SSE payloads. All other event types are skipped.

**Example:**

```typescript
import { createStreamResponse } from '@mentiora.ai/sdk';

// In a Next.js Route Handler or similar
export async function POST(req: Request) {
  const { message } = await req.json();
  const events = client.agents.stream({ tag: 'production', message });
  return createStreamResponse(events);
}
```

## `SSE_HEADERS`

Standard SSE headers for streaming responses. Used internally by `createStreamResponse` and exported for custom implementations.

```typescript
const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
};
```

</TabItem>
<TabItem value="python">

## `stream_events(events, transform=None) -> AsyncIterator[str]`

Async generator that converts agent stream events into SSE-formatted strings. Designed for use with async web frameworks like FastAPI, Starlette, or Quart.

**Parameters:**

- `events: AsyncIterator[AgentStreamEvent]` - An async iterator of events, typically from `client.agents.stream_async()`
- `transform: Callable[[AgentStreamEvent], dict[str, object] | None] | None` - Optional callable that maps each event to a dict (serialized as SSE) or `None` to skip the event

**Yields:** SSE-formatted strings (`data: {...}\n\n`)

The default transform maps `output_text_delta`, `chat_completed`, and `error` events to simplified SSE payloads. All other event types are skipped. Exceptions are caught and emitted as error events.

**Example:**

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from mentiora import stream_events, SSE_HEADERS, AgentRunParams

app = FastAPI()

@app.post('/chat')
async def chat(message: str):
    events = client.agents.stream_async(AgentRunParams(
        tag='production',
        message=message,
    ))
    return StreamingResponse(
        stream_events(events),
        headers=SSE_HEADERS,
    )
```

## `format_sse_event(data: dict[str, object]) -> str`

Format a dictionary as a Server-Sent Event data line.

**Parameters:**

- `data: dict[str, object]` - The data to serialize

**Returns:** SSE-formatted string (`data: {...}\n\n`)

## `SSE_HEADERS`

Standard SSE headers for streaming responses. Use with `StreamingResponse` or similar.

```python
SSE_HEADERS: dict[str, str] = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
}
```

</TabItem>
</SdkTabs>

---

**See also:** [Agents](/api-reference/agents) | [Plugins](/api-reference/plugins)
