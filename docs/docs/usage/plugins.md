---
sidebar_label: Plugins
sidebar_position: 4
description: 'Auto-trace OpenAI and LangChain calls with the Mentiora SDK plugins.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Plugins

The SDK provides plugins for automatic tracing of popular frameworks.

## OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client.

### Installation

<SdkTabs>
<TabItem value="typescript">

```bash
pnpm add openai
```

</TabItem>
<TabItem value="python">

```bash
uv pip install openai
```

</TabItem>
</SdkTabs>

### Basic Usage

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { trackOpenAI } from '@mentiora.ai/sdk/openai';
import OpenAI from 'openai';

// Initialize Mentiora client
const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Wrap OpenAI client with tracing
const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  tags: ['production', 'openai-integration'],
  metadata: { environment: 'prod' },
});

// Use trackedClient instead of openaiClient - chat completions are automatically traced
const response = await trackedClient.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

> For a complete runnable example, see [`examples/typescript/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/openai-integration).

</TabItem>
<TabItem value="python">

```python
import os
from mentiora import track_openai, MentioraClient, MentioraConfig, TrackOpenAIOptions
from openai import AsyncOpenAI

# Initialize Mentiora client
mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Initialize OpenAI client
openai_client = AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Wrap OpenAI client with tracing
tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        tags=['production', 'openai-integration'],
        metadata={'environment': 'prod'},
    ),
)

# Use tracked_client instead of openai_client - chat completions are automatically traced
response = await tracked_client.chat.completions.create(
    model='gpt-5-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
```

> For a complete runnable example, see [`examples/python/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/openai-integration).

</TabItem>
</SdkTabs>

The OpenAI plugin traces chat completions (via `chat.completions.create`); embeddings and image calls are not currently traced.

### Multi-turn Conversations

To group multiple OpenAI calls into a conversation, provide a `threadId` (TypeScript) or `thread_id` (Python) when wrapping the client:

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { trackOpenAI } from '@mentiora.ai/sdk/openai';
import { v7 as uuidv7 } from 'uuid';

// One threadId per conversation (see Thread ID section above)
const threadId = uuidv7();

// Wrap client with threadId - all calls will be grouped
const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  threadId: threadId, // All traces will use this threadId
  tags: ['conversation'],
});

// Turn 1
const response1 = await trackedClient.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [{ role: 'user', content: 'What is TypeScript?' }],
});

// Turn 2 - same trackedClient = same threadId
const response2 = await trackedClient.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [
    { role: 'user', content: 'What is TypeScript?' },
    { role: 'assistant', content: response1.choices[0].message.content },
    { role: 'user', content: 'What are its main benefits?' },
  ],
});

// Both calls are grouped together in the platform by threadId
```

</TabItem>
<TabItem value="python">

```python
from mentiora import track_openai, MentioraClient, TrackOpenAIOptions
from mentiora.utils import uuid7
from openai import AsyncOpenAI

# One thread_id per conversation (see Thread ID section above)
thread_id = str(uuid7())

# Wrap client with thread_id - all calls will be grouped
tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(
        mentiora_client=mentiora_client,
        thread_id=thread_id,  # All traces will use this thread_id
        tags=['conversation'],
    ),
)

# Turn 1
response1 = await tracked_client.chat.completions.create(
    model='gpt-5-mini',
    messages=[{'role': 'user', 'content': 'What is Python?'}],
)

# Turn 2 - same tracked_client = same thread_id
response2 = await tracked_client.chat.completions.create(
    model='gpt-5-mini',
    messages=[
        {'role': 'user', 'content': 'What is Python?'},
        {'role': 'assistant', 'content': response1.choices[0].message.content},
        {'role': 'user', 'content': 'What are its main use cases?'},
    ],
)

# Both calls are grouped together in the platform by thread_id
```

</TabItem>
</SdkTabs>

The plugin automatically captures:

- All request parameters (model, messages, temperature, max_tokens, tools, response_format, etc.)
- Multimodal message support (text + image content arrays)
- Response content and metadata (id, created, system_fingerprint, service_tier)
- Token usage (prompt, completion, total) for both streaming and non-streaming
- Refusal handling (when the model refuses a request)
- Tool/function calls and responses
- OpenAI response ID (`openai_id` in trace metadata) for correlation with OpenAI logs
- Errors and stack traces
- Duration and timestamps
- Thread ID for conversation grouping

:::note
For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage. This does not affect your application behavior.
:::

## LangChain Integration

Automatically trace LangChain executions using the callback handler.

### Installation

<SdkTabs>
<TabItem value="typescript">

```bash
pnpm add @langchain/core @langchain/openai langchain
```

</TabItem>
<TabItem value="python">

```bash
uv pip install langchain langchain-core
```

</TabItem>
</SdkTabs>

### Basic Usage

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { MentioraTracingLangChain } from '@mentiora.ai/sdk/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Initialize Mentiora client
const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

// Create callback handler
const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['production', 'langchain-integration'],
  metadata: { environment: 'prod' },
});

// Use with LangChain LCEL chains
const llm = new ChatOpenAI({ model: 'gpt-5-mini' });
const prompt = ChatPromptTemplate.fromTemplate('Say hello to {name}');
const chain = prompt.pipe(llm);

// Invoke with callback - all operations are automatically traced
await chain.invoke({ name: 'World' }, { callbacks: [callback] });

// Works with agents, tools, retrievers, and other LangChain components
```

> For a complete runnable example, see [`examples/typescript/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/langchain-integration).

</TabItem>
<TabItem value="python">

```python
import os
from mentiora import MentioraTracingLangChain, MentioraClient, MentioraConfig, MentioraTracingLangChainOptions
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# Initialize Mentiora client
mentiora_client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Create callback handler
callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    tags=['production', 'langchain-integration'],
    metadata={'environment': 'prod'},
))

# Use with LangChain LCEL chains
llm = ChatOpenAI(model='gpt-5-mini')
prompt = ChatPromptTemplate.from_template('Say hello to {name}')
chain = prompt | llm

# Invoke with callback - all operations are automatically traced
await chain.ainvoke({'name': 'World'}, {'callbacks': [callback]})

# Works with agents, tools, retrievers, and other LangChain components
```

> For a complete runnable example, see [`examples/python/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/langchain-integration).

</TabItem>
</SdkTabs>

### Multi-turn Conversations

To group multiple LangChain operations into a conversation, provide a `threadId` (TypeScript) or `thread_id` (Python) when creating the callback:

<SdkTabs>
<TabItem value="typescript">

```typescript
import { v7 as uuidv7 } from 'uuid';

// One threadId per conversation (see Thread ID section above)
const threadId = uuidv7();

// Create callback with threadId - all traces will be grouped
const callback = new MentioraTracingLangChain({
  mentioraClient,
  threadId: threadId, // All traces will use this threadId
  tags: ['conversation'],
});

// Turn 1
const chain1 = ChatPromptTemplate.fromTemplate(
  'Generate a question about {topic}',
).pipe(llm);
const result1 = await chain1.invoke(
  { topic: 'TypeScript' },
  { callbacks: [callback] },
);

// Turn 2 - same callback = same threadId
const chain2 = ChatPromptTemplate.fromTemplate('Answer this: {question}').pipe(
  llm,
);
const result2 = await chain2.invoke(
  { question: result1.content },
  { callbacks: [callback] },
);

// Both operations are grouped together in the platform by threadId
```

</TabItem>
<TabItem value="python">

```python
from mentiora.utils import uuid7

# One thread_id per conversation (see Thread ID section above)
thread_id = str(uuid7())

# Create callback with thread_id - all traces will be grouped
callback = MentioraTracingLangChain(MentioraTracingLangChainOptions(
    mentiora_client=mentiora_client,
    thread_id=thread_id,  # All traces will use this thread_id
    tags=['conversation'],
))

# Turn 1
chain1 = ChatPromptTemplate.from_template('Generate a question about {topic}') | llm
result1 = await chain1.ainvoke({'topic': 'Python'}, {'callbacks': [callback]})

# Turn 2 - same callback = same thread_id
chain2 = ChatPromptTemplate.from_template('Answer this: {question}') | llm
result2 = await chain2.ainvoke({'question': result1.content}, {'callbacks': [callback]})

# Both operations are grouped together in the platform by thread_id
```

</TabItem>
</SdkTabs>

The callback handler automatically traces:

- LLM calls (with token usage)
- Chain executions
- Tool calls
- Agent operations
- Retriever operations
- Parent-child span relationships
- Errors and failures
- Thread ID for conversation grouping

## Privacy Mode

Both plugins support a `captureContent` / `capture_content` option. Set it to `false` / `False` to disable capturing request and response content, while still collecting metadata, timing, and token usage:

<SdkTabs>
<TabItem value="typescript">

```typescript
trackOpenAI(openai, {
  mentioraClient: client,
  captureContent: false,
});
```

</TabItem>
<TabItem value="python">

```python
track_openai(openai_client, TrackOpenAIOptions(
    mentiora_client=client,
    capture_content=False,
))
```

</TabItem>
</SdkTabs>

## See Also

- [Streaming Helpers](/usage/streaming-helpers) -- SSE utilities for web frontends
- [Plugins API Reference](/api-reference/plugins) -- full method and type reference
- [Examples](/examples) -- complete, runnable code samples
