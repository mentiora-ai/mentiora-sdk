---
sidebar_position: 4
description: 'Runnable code examples for the Mentiora SDK: tracing, agents, OpenAI, LangChain, and chatbot UI.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Examples

Complete, runnable example applications demonstrating how to use the Mentiora SDK.

## Basic Tracing

Manual trace instrumentation with full control over trace events, parent-child spans, and conversation threading.

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { v7 as uuidv7 } from 'uuid';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

const result = await client.tracing.sendTrace({
  traceId: uuidv7(),
  spanId: uuidv7(),
  threadId: uuidv7(),
  name: 'llm.call',
  type: 'llm',
  input: { messages: [{ role: 'user', content: 'Hello!' }] },
  output: { content: 'Hi there!' },
  startTime: new Date(),
  endTime: new Date(),
  durationMs: 1200,
  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
  model: 'gpt-4o',
  provider: 'openai',
});
```

[Full source: `examples/typescript/basic-tracing`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/basic-tracing)

</TabItem>
<TabItem value="python">

```python
import os
from mentiora import MentioraClient, MentioraConfig, TraceEvent, UsageInfo
from mentiora.utils import uuid7

client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))

result = client.tracing.send_trace(TraceEvent(
    trace_id=str(uuid7()),
    span_id=str(uuid7()),
    thread_id=str(uuid7()),
    name='llm.call',
    type='llm',
    input={'messages': [{'role': 'user', 'content': 'Hello!'}]},
    output={'content': 'Hi there!'},
    start_time=datetime.now(timezone.utc).isoformat(),
    end_time=datetime.now(timezone.utc).isoformat(),
    duration_ms=1200,
    usage=UsageInfo(prompt_tokens=10, completion_tokens=8, total_tokens=18),
    model='gpt-4o',
    provider='openai',
))
```

[Full source: `examples/python/basic-tracing`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/basic-tracing)

</TabItem>
</SdkTabs>

## OpenAI Integration {#openai-integration}

Automatic tracing of OpenAI API calls with zero code changes to your existing OpenAI usage.

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { trackOpenAI } from '@mentiora.ai/sdk/openai';
import OpenAI from 'openai';

const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  tags: ['my-app'],
});

// Use trackedClient exactly like your regular OpenAI client
const response = await trackedClient.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

[Full source: `examples/typescript/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/openai-integration)

</TabItem>
<TabItem value="python">

```python
import os
from mentiora import MentioraClient, MentioraConfig, track_openai, TrackOpenAIOptions
from openai import AsyncOpenAI

mentiora_client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))
openai_client = AsyncOpenAI(api_key=os.getenv('OPENAI_API_KEY'))

tracked_client = track_openai(
    openai_client,
    TrackOpenAIOptions(mentiora_client=mentiora_client, tags=['my-app']),
)

response = await tracked_client.chat.completions.create(
    model='gpt-5-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
```

[Full source: `examples/python/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/openai-integration)

</TabItem>
</SdkTabs>

## LangChain Integration {#langchain-integration}

Automatic tracing of LangChain operations using a callback handler.

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { MentioraTracingLangChain } from '@mentiora.ai/sdk/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['my-app'],
});

const llm = new ChatOpenAI({ model: 'gpt-5-mini' });
const prompt = ChatPromptTemplate.fromTemplate('Tell me about {topic}');
const chain = prompt.pipe(llm);

const result = await chain.invoke({ topic: 'AI' }, { callbacks: [callback] });
```

[Full source: `examples/typescript/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/langchain-integration)

</TabItem>
<TabItem value="python">

```python
import os
from mentiora import MentioraClient, MentioraConfig, MentioraTracingLangChain, MentioraTracingLangChainOptions
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

mentiora_client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))
callback = MentioraTracingLangChain(
    MentioraTracingLangChainOptions(mentiora_client=mentiora_client, tags=['my-app']),
)

llm = ChatOpenAI(model='gpt-5-mini')
prompt = ChatPromptTemplate.from_template('Tell me about {topic}')
chain = prompt | llm

result = await chain.ainvoke({'topic': 'AI'}, {'callbacks': [callback]})
```

[Full source: `examples/python/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/langchain-integration)

</TabItem>
</SdkTabs>

## Agent Run (Non-Streaming) {#agent-run}

Run an agent and get the complete response in a single call.

<SdkTabs>
<TabItem value="typescript">

```typescript
const result = await client.agents.run({
  tag: 'my-agent',
  message: 'What is the weather in Paris?',
});
console.log(result.output);
console.log(`Thread: ${result.threadId}`);
```

</TabItem>
<TabItem value="python">

```python
from mentiora.models import AgentRunParams

result = client.agents.run(AgentRunParams(
    tag='my-agent',
    message='What is the weather in Paris?',
))
print(result.output)
print(f"Thread: {result.thread_id}")
```

</TabItem>
</SdkTabs>

## Agent Streaming {#agent-streaming}

Stream agent responses token-by-token for real-time output.

<SdkTabs>
<TabItem value="typescript">

```typescript
const stream = client.agents.stream({
  tag: 'my-agent',
  message: 'Tell me a story',
});
for await (const event of stream) {
  if (event.type === 'output_text_delta') {
    process.stdout.write(event.delta);
  }
}
```

</TabItem>
<TabItem value="python">

```python
from mentiora.models import AgentRunParams

async for event in client.agents.stream_async(AgentRunParams(
    tag='my-agent',
    message='Tell me a story',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
```

</TabItem>
</SdkTabs>

## Multi-Turn Conversation {#multi-turn}

Continue a conversation across multiple messages by passing the `threadId` from the first response.

<SdkTabs>
<TabItem value="typescript">

```typescript
let threadId: string | undefined;

// First message
const first = await client.agents.run({
  tag: 'assistant',
  message: 'Hello!',
});
threadId = first.threadId;

// Follow-up (same thread)
const second = await client.agents.run({
  tag: 'assistant',
  message: 'What did I just say?',
  threadId,
});
```

</TabItem>
<TabItem value="python">

```python
from mentiora.models import AgentRunParams

# First message
first = client.agents.run(AgentRunParams(
    tag='assistant', message='Hello!',
))
thread_id = first.thread_id

# Follow-up (same thread)
second = client.agents.run(AgentRunParams(
    tag='assistant', message='What did I just say?', thread_id=thread_id,
))
```

</TabItem>
</SdkTabs>

## Full-Stack Chatbot {#chatbot-ui}

Complete chatbot applications with streaming UI, built with the SDK's [streaming helpers](./usage/streaming-helpers):

- **TypeScript (Next.js):** [`examples/typescript/chatbot-ui`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/chatbot-ui)
- **Python (FastAPI):** [`examples/python/chatbot-ui`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/chatbot-ui)

## Running an Example

<SdkTabs>
<TabItem value="typescript">

```bash
cd examples/typescript/<example-name>
pnpm install
cp .env.example .env   # Then edit .env with your keys
pnpm start
```

</TabItem>
<TabItem value="python">

```bash
cd examples/python/<example-name>
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env   # Then edit .env with your keys
python main.py
```

</TabItem>
</SdkTabs>

## Environment Variables

| Variable            | Required For                | Description                                                        |
| ------------------- | --------------------------- | ------------------------------------------------------------------ |
| `MENTIORA_API_KEY`  | All examples                | Your Mentiora API key — see [Authentication](./authentication)     |
| `MENTIORA_BASE_URL` | All examples                | Mentiora platform URL (defaults to `https://platform.mentiora.ai`) |
| `OPENAI_API_KEY`    | OpenAI & LangChain examples | Your OpenAI API key                                                |
