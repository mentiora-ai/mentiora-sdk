---
sidebar_position: 4
---

# Examples

Complete, runnable example applications demonstrating how to use the Mentiora SDK.

## Basic Tracing

Manual trace instrumentation with full control over trace events, parent-child spans, and conversation threading.

### TypeScript

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

### Python

```python
import os
from mentiora import MentioraClient, MentioraConfig, TraceEvent, UsageInfo
from uuid_utils import uuid7

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

## OpenAI Integration {#openai-integration}

Automatic tracing of OpenAI API calls with zero code changes to your existing OpenAI usage.

### TypeScript {#openai-integration-typescript}

```typescript
import { MentioraClient, trackOpenAI } from '@mentiora.ai/sdk';
import OpenAI from 'openai';

const mentioraClient = new MentioraClient({ apiKey: process.env.MENTIORA_API_KEY });
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  tags: ['my-app'],
});

// Use trackedClient exactly like your regular OpenAI client
const response = await trackedClient.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

[Full source: `examples/typescript/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/openai-integration)

### Python {#openai-integration-python}

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
    model='gpt-4o-mini',
    messages=[{'role': 'user', 'content': 'Hello!'}],
)
```

[Full source: `examples/python/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/openai-integration)

## LangChain Integration {#langchain-integration}

Automatic tracing of LangChain operations using a callback handler.

### TypeScript {#langchain-integration-typescript}

```typescript
import { MentioraClient, MentioraTracingLangChain } from '@mentiora.ai/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const mentioraClient = new MentioraClient({ apiKey: process.env.MENTIORA_API_KEY });
const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['my-app'],
});

const llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
const prompt = ChatPromptTemplate.fromTemplate('Tell me about {topic}');
const chain = prompt.pipe(llm);

const result = await chain.invoke({ topic: 'AI' }, { callbacks: [callback] });
```

[Full source: `examples/typescript/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/langchain-integration)

### Python {#langchain-integration-python}

```python
import os
from mentiora import MentioraClient, MentioraConfig, MentioraTracingLangChain, MentioraTracingLangChainOptions
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

mentiora_client = MentioraClient(MentioraConfig(api_key=os.getenv('MENTIORA_API_KEY')))
callback = MentioraTracingLangChain(
    MentioraTracingLangChainOptions(mentiora_client=mentiora_client, tags=['my-app']),
)

llm = ChatOpenAI(model='gpt-4o-mini')
prompt = ChatPromptTemplate.from_template('Tell me about {topic}')
chain = prompt | llm

result = await chain.ainvoke({'topic': 'AI'}, {'callbacks': [callback]})
```

[Full source: `examples/python/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/python/langchain-integration)

## Running an Example

### TypeScript

```bash
cd examples/typescript/<example-name>
pnpm install
cp .env.example .env   # Then edit .env with your keys
pnpm start
```

### Python

```bash
cd examples/python/<example-name>
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env   # Then edit .env with your keys
python main.py
```

## Environment Variables

| Variable | Required For | Description |
|----------|-------------|-------------|
| `MENTIORA_API_KEY` | All examples | Your Mentiora API key — see [Authentication](./authentication) |
| `MENTIORA_BASE_URL` | All examples | Mentiora platform URL (defaults to `https://platform.mentiora.ai`) |
| `OPENAI_API_KEY` | OpenAI & LangChain examples | Your OpenAI API key |
