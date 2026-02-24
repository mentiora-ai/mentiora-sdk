---
sidebar_label: Streaming Helpers
sidebar_position: 3
description: "SSE utilities for streaming agent output to web frontends with the Mentiora SDK."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Streaming Helpers

The SDK provides helpers to convert agent streams into Server-Sent Events (SSE) responses, ready for your web framework of choice.

## Quick Start

<SdkTabs>
<TabItem value="typescript">

Use `createStreamResponse` in a Next.js Route Handler (or any framework supporting the Fetch API `Response` type):

```typescript
import { createStreamResponse } from '@mentiora.ai/sdk';
import { client } from '@/lib/mentiora';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { message } = await req.json();
  return createStreamResponse(
    client.agents.stream({ tag: 'production', message }),
  );
}
```

`createStreamResponse` maps agent events to simplified SSE payloads by default:

| Agent event          | SSE payload                                        |
| -------------------- | -------------------------------------------------- |
| `output_text_delta`  | `{ type: "delta", delta }`                         |
| `chat_completed`     | `{ type: "done", threadId, output, status }`       |
| `error`              | `{ type: "error", message }`                       |

All other event types are skipped. Pass a custom `transform` to change this behavior:

```typescript
createStreamResponse(stream, {
  transform: (event) => {
    if (event.type === 'output_text_delta') return { text: event.delta };
    return null; // returning null skips the event
  },
});
```

:::note[Next.js]
Add `export const runtime = 'nodejs'` to your route file to ensure the handler runs in the Node.js runtime rather than the Edge runtime.
:::

</TabItem>
<TabItem value="python">

Use `stream_events()` with FastAPI to stream agent responses to a frontend:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from mentiora import MentioraClient, MentioraConfig, AgentRunParams, SSE_HEADERS, stream_events

app = FastAPI()
client = MentioraClient(MentioraConfig(api_key='...'))

@app.post('/chat/stream')
async def chat_stream(message: str):
    events = client.agents.stream_async(AgentRunParams(tag='production', message=message))
    return StreamingResponse(
        stream_events(events),
        media_type=SSE_HEADERS['Content-Type'],
        headers=SSE_HEADERS,
    )
```

`stream_events()` converts SDK events into SSE-formatted strings:
- `output_text_delta` -> `{"type":"delta","delta":"<text>"}`
- `chat_completed` -> `{"type":"done","threadId":"...","output":"...","status":"..."}`
- `error` -> `{"type":"error","message":"..."}`

Other event types (e.g. `tool_call_delta`) are skipped by default. Exceptions raised during streaming are caught and yielded as error events.

</TabItem>
</SdkTabs>

## Custom Transform

<SdkTabs>
<TabItem value="typescript">

```typescript
createStreamResponse(stream, {
  transform: (event) => {
    if (event.type === 'output_text_delta') return { text: event.delta };
    return null; // returning null skips the event
  },
});
```

</TabItem>
<TabItem value="python">

```python
from mentiora.agents.types import AgentStreamEvent

def my_transform(event: AgentStreamEvent) -> dict[str, object] | None:
    if event.type == 'output_text_delta':
        return {'text': event.delta}
    return None  # skip all other events

stream_events(events, transform=my_transform)
```

</TabItem>
</SdkTabs>

## Low-Level Helpers

<SdkTabs>
<TabItem value="typescript">

For custom setups where you manage the response yourself, `SSE_HEADERS` provides the standard headers:

```typescript
import { SSE_HEADERS } from '@mentiora.ai/sdk';

// Express / Node.js http
res.writeHead(200, SSE_HEADERS);
```

</TabItem>
<TabItem value="python">

For full control over the event loop, use `SSE_HEADERS` and `format_sse_event()` directly:

```python
from mentiora import AgentRunParams, SSE_HEADERS, format_sse_event

async def event_generator():
    async for event in client.agents.stream_async(AgentRunParams(tag='production', message='Hi')):
        if event.type == 'output_text_delta':
            yield format_sse_event({'type': 'delta', 'delta': event.delta})

return StreamingResponse(event_generator(), headers=SSE_HEADERS)
```

</TabItem>
</SdkTabs>

## Full-Stack Examples

For complete chatbot applications using these streaming helpers, see:

- **TypeScript (Next.js):** [`examples/typescript/chatbot-ui`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/chatbot-ui)
- **Python (FastAPI):** [`examples/python/chatbot-ui`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/chatbot-ui)

## See Also

- [Streaming Helpers API Reference](/api-reference/streaming-helpers)
- [Examples](/examples)
