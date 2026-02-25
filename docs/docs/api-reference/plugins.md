---
title: Plugins
description: "API reference for Mentiora SDK plugins — trackOpenAI / track_openai for OpenAI tracing, and MentioraTracingLangChain for LangChain callback tracing."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Plugins

> For usage examples, see [Usage - Plugins](/usage/plugins).

## trackOpenAI / track_openai

Wraps an OpenAI client to automatically trace API calls.

<SdkTabs>
<TabItem value="typescript">

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
| `threadId` | string | No | Thread/conversation ID (UUID v7) for grouping traces |
| `tags` | `string[]` | No | Optional tags to add to all traces |
| `metadata` | `Record<string, unknown>` | No | Optional metadata to add to all traces |
| `captureContent` | boolean | No | Whether to capture input/output content (default: true). Set to false for privacy. |

**Example:**

```typescript
import { trackOpenAI } from '@mentiora.ai/sdk/openai';
import OpenAI from 'openai';

const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  tags: ['production'],
});
```

</TabItem>
<TabItem value="python">

```python
def track_openai(
    openai_client: OpenAI | AsyncOpenAI,
    options: TrackOpenAIOptions
) -> OpenAI | AsyncOpenAI
```

**Parameters:**

- `openai_client: OpenAI | AsyncOpenAI` - The OpenAI client instance to wrap (supports both sync and async clients)
- `options: TrackOpenAIOptions` - Plugin configuration options

**Returns:** Wrapped OpenAI client with tracing enabled

**TrackOpenAIOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentiora_client` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `thread_id` | str | No | Thread/conversation ID (UUID v7) for grouping traces |
| `tags` | `list[str]` | No | Optional tags to add to all traces |
| `metadata` | `dict[str, Any]` | No | Optional metadata to add to all traces |
| `capture_content` | bool | No | Whether to capture input/output content (default: True). Set to False for privacy. |

**Example:**

```python
from mentiora import track_openai, TrackOpenAIOptions
from openai import AsyncOpenAI

tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        tags=['production'],
    ),
)
```

</TabItem>
</SdkTabs>

**Captured trace data:**

Each traced call produces a `TraceEvent` with:
- **input**: All parameters passed to `chat.completions.create` (model, messages, temperature, tools, etc.), plus a `prompt` field extracted from the last user message. Multimodal content arrays (text + images) are supported.
- **output**: Full response data including `id`, `created`, `system_fingerprint`, `service_tier`, `usage`, and per-choice `logprobs` and `refusal` fields.
- **metadata**: Includes `openai_id` (the OpenAI response ID, e.g. `chatcmpl-...`) and `created` timestamp for correlation with OpenAI's logs.

For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage statistics. Refusal content is accumulated across stream chunks.

## MentioraTracingLangChain

Callback handler for automatically tracing LangChain executions.

<SdkTabs>
<TabItem value="typescript">

```typescript
class MentioraTracingLangChain extends BaseCallbackHandler {
  constructor(options: MentioraTracingLangChainOptions)
}
```

**MentioraTracingLangChainOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentioraClient` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `threadId` | string | No | Thread/conversation ID (UUID v7) for grouping traces |
| `tags` | `string[]` | No | Optional tags to add to all traces |
| `metadata` | `Record<string, unknown>` | No | Optional metadata to add to all traces |
| `captureContent` | boolean | No | Whether to capture input/output content (default: true). Set to false for privacy. |

**Example:**

```typescript
import { MentioraTracingLangChain } from '@mentiora.ai/sdk/langchain';

const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['production'],
});

await chain.invoke({ input: '...' }, { callbacks: [callback] });
```

**Note:** This class extends LangChain's `BaseCallbackHandler` and implements all required callback methods for tracing LLM calls, chain executions, tool calls, and agent operations.

</TabItem>
<TabItem value="python">

```python
class MentioraTracingLangChain(AsyncCallbackHandler):
    def __init__(self, options: MentioraTracingLangChainOptions)
```

**MentioraTracingLangChainOptions:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mentiora_client` | `MentioraClient` | Yes | Mentiora client instance for sending traces |
| `thread_id` | str | No | Thread/conversation ID (UUID v7) for grouping traces |
| `tags` | `list[str]` | No | Optional tags to add to all traces |
| `metadata` | `dict[str, Any]` | No | Optional metadata to add to all traces |
| `capture_content` | bool | No | Whether to capture input/output content (default: True). Set to False for privacy. |

**Example:**

```python
from mentiora import MentioraTracingLangChain, MentioraTracingLangChainOptions

callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production'],
))

await chain.ainvoke({'input': '...'}, {'callbacks': [callback]})
```

**Note:** This class extends LangChain's `AsyncCallbackHandler` and implements all required callback methods for tracing LLM calls, chain executions, tool calls, and agent operations.

</TabItem>
</SdkTabs>

---

**See also:** [Tracing](/api-reference/tracing) | [Streaming Helpers](/api-reference/streaming-helpers)
