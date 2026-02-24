---
sidebar_label: Agents
sidebar_position: 2
description: "Run and stream AI agents with the Mentiora SDK. Multi-turn conversations, tool calls, and error handling."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Agents

A Mentiora Agent is a hosted AI workflow configured and deployed on the Mentiora platform. Agents encapsulate a system prompt, model settings, and optional tool definitions into a single deployable unit. You interact with agents through the SDK without managing the underlying infrastructure.

Agents are resolved by **tag** (e.g. `'production'`, `'staging'`) or by explicit **agentId** / **agent_id** with an optional **revision** number. Tags point to a specific agent revision and can be reassigned in the dashboard, making it easy to promote new versions without changing client code.

The SDK provides two interaction modes: `run()` waits for the agent to finish and returns the complete result, while `stream()` yields incremental events (text deltas, tool calls, completion) as they arrive via Server-Sent Events. Use `run()` for simple request/response patterns and `stream()` when you need real-time output in a UI.

**Note:** Unlike tracing methods (which return `SendTraceResult` and never throw), agent methods **throw exceptions** on errors (`ValidationError`, `NetworkError`).

## Quick Start

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({ apiKey: process.env.MENTIORA_API_KEY });

const result = await client.agents.run({
  tag: 'production',
  message: 'What is the weather today?',
});
console.log(result.output);
```

</TabItem>
<TabItem value="python">

```python
import os
from mentiora import MentioraClient, MentioraConfig, AgentRunParams

client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))

result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What is the weather today?',
))
print(result.output)
```

</TabItem>
</SdkTabs>

## Streaming

Stream agent responses in real time using Server-Sent Events:

<SdkTabs>
<TabItem value="typescript">

```typescript
for await (const event of client.agents.stream({
  tag: 'production',
  message: 'Write a poem about TypeScript.',
})) {
  switch (event.type) {
    case 'output_text_delta':
      process.stdout.write(event.delta);
      break;
    case 'chat_completed':
      console.log(`\nDone: ${event.status}`);
      break;
    case 'error':
      console.error(`\nError: ${event.message}`);
      break;
  }
}
```

</TabItem>
<TabItem value="python">

**Async (recommended):**

```python
from mentiora import AgentRunParams

async for event in client.agents.stream_async(AgentRunParams(
    tag='production',
    message='Write a poem about Python.',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
    elif event.type == 'chat_completed':
        print(f'\nDone: {event.status}')
    elif event.type == 'error':
        print(f'\nError: {event.message}')
```

**Sync:**

```python
for event in client.agents.stream(AgentRunParams(
    tag='production',
    message='Write a poem about Python.',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
    elif event.type == 'chat_completed':
        print(f'\nDone: {event.status}')
    elif event.type == 'error':
        print(f'\nError: {event.message}')
```

</TabItem>
</SdkTabs>

:::tip[Streaming to a web frontend?]
Use the built-in [Streaming Helpers](/usage/streaming-helpers) to forward agent events as SSE with a single function call — works with Next.js, FastAPI, and other frameworks.
:::

## Multi-turn Conversations

Use `threadId` (TypeScript) or `thread_id` (Python) to continue conversations across multiple agent calls:

<SdkTabs>
<TabItem value="typescript">

```typescript
// First turn
const result1 = await client.agents.run({
  tag: 'production',
  message: 'What is TypeScript?',
});
const threadId = result1.threadId; // Save the thread ID

// Continue the conversation
const result2 = await client.agents.run({
  tag: 'production',
  message: 'What are its main benefits?',
  threadId, // Same thread continues the conversation
});
```

</TabItem>
<TabItem value="python">

```python
# First turn
result1 = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What is Python?',
))
thread_id = result1.thread_id  # Save the thread ID

# Continue the conversation
result2 = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What are its main use cases?',
    thread_id=thread_id,  # Same thread continues the conversation
))
```

</TabItem>
</SdkTabs>

## Agent Resolution

Identify which agent to run using either a **tag** or **agentId**/**agent_id** (but not both):

<SdkTabs>
<TabItem value="typescript">

```typescript
// By tag (recommended for production)
const result = await client.agents.run({
  tag: 'production',
  message: 'Hello',
});

// By agent ID with specific revision
const result2 = await client.agents.run({
  agentId: 'agent-abc-123',
  revision: 5,
  message: 'Hello',
});
```

</TabItem>
<TabItem value="python">

```python
# By tag (recommended for production)
result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='Hello',
))

# By agent ID with specific revision
result = await client.agents.run_async(AgentRunParams(
    agent_id='agent-abc-123',
    revision=5,
    message='Hello',
))
```

</TabItem>
</SdkTabs>

## End-User Tracking

Pass `endUserId` (TypeScript) or `end_user_id` (Python) to associate agent calls with specific end-users:

<SdkTabs>
<TabItem value="typescript">

```typescript
const result = await client.agents.run({
  tag: 'production',
  message: 'Hello',
  endUserId: 'user-123',
});
```

</TabItem>
<TabItem value="python">

```python
result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='Hello',
    end_user_id='user-123',
))
```

</TabItem>
</SdkTabs>

## Retry Behavior

- **Non-streaming** (`run()` / `run_async()`): Retries up to 3 times on 5xx errors and rate limits (429), with exponential backoff and jitter.
- **Streaming** (`stream()` / `stream_async()`): **No retry** -- the stream is opened once. If the connection fails mid-stream, a `NetworkError` is raised. Implement your own retry logic around the stream call if needed.

<SdkTabs>
<TabItem value="typescript">

| Mode | Method | Retries |
| --- | --- | --- |
| Non-streaming | `run()` | Up to 3 |
| Streaming | `stream()` | None |

</TabItem>
<TabItem value="python">

| Mode | Methods | Retries |
| --- | --- | --- |
| Non-streaming | `run()` / `run_async()` | Up to 3 |
| Streaming | `stream()` / `stream_async()` | None |

</TabItem>
</SdkTabs>

## Error Handling

Agent methods throw exceptions instead of returning error results:

<SdkTabs>
<TabItem value="typescript">

```typescript
import { ValidationError, NetworkError } from '@mentiora.ai/sdk';

try {
  const result = await client.agents.run({
    tag: 'production',
    message: 'Hello',
  });
  console.log(result.output);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Invalid parameters: ${error.message}`);
  } else if (error instanceof NetworkError) {
    console.error(`Network error (status ${error.statusCode}): ${error.message}`);
  }
}
```

For streaming, an `AgentErrorEvent` is yielded when the server reports an error, and the stream stops automatically:

```typescript
for await (const event of client.agents.stream(params)) {
  if (event.type === 'error') {
    console.error(`Agent error [${event.code}]: ${event.message}`);
    break;
  }
}
```

</TabItem>
<TabItem value="python">

```python
from mentiora.errors import ValidationError, NetworkError

try:
    result = await client.agents.run_async(AgentRunParams(
        tag='production',
        message='Hello',
    ))
    print(result.output)
except ValidationError as e:
    print(f'Invalid parameters: {e}')
except NetworkError as e:
    print(f'Network error (status {e.status_code}): {e}')
```

For streaming, an `AgentErrorEvent` is yielded when the server reports an error, and the stream stops automatically:

```python
async for event in client.agents.stream_async(params):
    if event.type == 'error':
        print(f'Agent error [{event.code}]: {event.message}')
        break
```

</TabItem>
</SdkTabs>

## See Also

- [Plugins](/usage/plugins) -- auto-trace OpenAI and LangChain calls
- [Streaming Helpers](/usage/streaming-helpers) -- SSE utilities for web frontends
- [Agents API Reference](/api-reference/agents) -- full method and type reference
