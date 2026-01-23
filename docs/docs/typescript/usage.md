---
sidebar_position: 2
---

# TypeScript SDK Usage

Learn how to use the Mentiora TypeScript SDK to send traces and interact with the platform.

## Basic Setup

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production',
});
```

## Tracing

### Send a Trace

Send agent traces to the Mentiora platform for observability and debugging:

```typescript
const result = await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-456',
  parentSpanId: 'span-parent', // optional
  name: 'llm.call',
  type: 'llm', // 'llm' | 'tool' | 'chat' | 'error' | 'custom'
  input: { messages: [{ role: 'user', content: 'Hello' }] },
  output: { response: 'Hello from Mentiora' },
  startTime: new Date(),
  endTime: new Date(),
  durationMs: 1000,
  metadata: {
    model: 'gpt-4o-mini',
    provider: 'openai',
  },
  tags: ['production', 'support-agent'],
});

if (result.success) {
  console.log(`Trace sent: ${result.traceId}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

### Flush Pending Traces

Flush any pending traces in the queue:

```typescript
await client.tracing.flush();
```

### Trace Types

The SDK supports several trace types:

- `llm` - LLM API calls
- `tool` - Tool/function executions
- `chat` - Chat interactions
- `error` - Error events
- `custom` - Custom trace types

### Nested Traces

Create nested traces using `parentSpanId`:

```typescript
// Parent trace
await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-parent',
  name: 'agent.run',
  type: 'custom',
  startTime: new Date(),
});

// Child trace
await client.tracing.sendTrace({
  traceId: 'trace-123',
  spanId: 'span-child',
  parentSpanId: 'span-parent',
  name: 'llm.call',
  type: 'llm',
  startTime: new Date(),
  endTime: new Date(),
});
```

## Error Handling

The SDK returns typed results instead of throwing errors:

```typescript
const result = await client.tracing.sendTrace(event);

if (!result.success) {
  // Handle error
  console.error(result.error);
}
```

For configuration or validation errors, the SDK throws:

- `ConfigurationError` - Invalid configuration
- `ValidationError` - Invalid trace event data
- `NetworkError` - Network/HTTP errors (with status code)

## Vector DB (Coming Soon)

Vector database operations will be available through `client.vectordb`:

```typescript
// Future API
await client.vectordb.uploadFile(...);
await client.vectordb.deleteFile(...);
await client.vectordb.query(...);
```

## Plugins

The SDK provides plugins for automatic tracing of popular frameworks.

### OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
npm install openai
```

```typescript
import { trackOpenAI } from '@mentiora/sdk';
import OpenAI from 'openai';
import { MentioraClient } from '@mentiora/sdk';

// Initialize Mentiora client
const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production',
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

// Use trackedClient instead of openaiClient - all calls are automatically traced
const response = await trackedClient.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});

// Embeddings are also traced
const embeddings = await trackedClient.embeddings.create({
  model: 'text-embedding-3-small',
  input: 'Hello world',
});
```

The plugin automatically captures:
- Model name and provider
- Request messages/prompts
- Response content
- Token usage (prompt, completion, total)
- Errors and stack traces
- Duration and timestamps

### LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
npm install @langchain/core
```

```typescript
import { MentioraTracingLangChain } from '@mentiora/sdk';
import { MentioraClient } from '@mentiora/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { LLMChain } from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';

// Initialize Mentiora client
const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  environment: 'production',
});

// Create callback handler
const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['production', 'langchain-integration'],
  metadata: { environment: 'prod' },
});

// Use with LangChain chains
const llm = new ChatOpenAI({ temperature: 0 });
const prompt = PromptTemplate.fromTemplate('Say hello to {name}');
const chain = new LLMChain({ llm, prompt });

// Invoke with callback - all operations are automatically traced
await chain.invoke({ name: 'World' }, { callbacks: [callback] });

// Works with agents, tools, retrievers, and other LangChain components
```

The callback handler automatically traces:
- LLM calls (with token usage)
- Chain executions
- Tool calls
- Agent operations
- Retriever operations
- Parent-child span relationships
- Errors and failures

## Next Steps

- Check out the [API reference](./api-reference) for detailed method documentation
