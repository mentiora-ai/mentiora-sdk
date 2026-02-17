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
});
```

## Async-Only API

The TypeScript SDK uses an **async-only API**. All methods return Promises and must be awaited:

```typescript
// All tracing methods are async
const result = await client.tracing.sendTrace(event);
await client.tracing.flush();
```

### Why async-only?

The TypeScript SDK is designed exclusively for asynchronous operations for several important reasons:

- **Native `fetch()` is async-only**: Modern JavaScript/TypeScript has no synchronous HTTP equivalent
- **Node.js ecosystem is async-first**: Most Node.js libraries and frameworks use async patterns
- **Prevents blocking the event loop**: Keeps your application responsive and performant
- **Consistency**: All SDK methods follow the same async pattern, making the API predictable

### Comparison with Python SDK

Unlike the Python SDK (which offers both sync and async APIs to support different Python ecosystems), the TypeScript SDK only provides async methods. This reflects the JavaScript/TypeScript ecosystem's strong preference for asynchronous operations.

```typescript
// ✅ Always use await with TypeScript SDK
async function myHandler() {
  const result = await client.tracing.sendTrace(event);
  return result;
}

// ❌ No sync API available - this won't work correctly
function myHandler() {
  const result = client.tracing.sendTrace(event); // Returns a Promise!
  return result; // You'd be returning a Promise, not the result
}
```

### Top-level await

In modern TypeScript/JavaScript environments (ES modules, Node.js 14.8+), you can use top-level await:

```typescript
// ✅ Top-level await in ES modules
const result = await client.tracing.sendTrace(event);
console.log(result);
```

## Resource Cleanup

While the TypeScript SDK doesn't require explicit cleanup (it uses stateless `fetch()`), a `close()` method is provided for API parity with the Python SDK:

```typescript
// Optional cleanup (no-op but available for consistency)
client.close();
```

**Note:** Unlike Python's `httpx` client which maintains connection pools, the TypeScript SDK uses the native `fetch()` API which is stateless. The `close()` method is a no-op but is provided to maintain a consistent API surface across languages.

## Tracing

### Send a Trace

Send agent traces to the Mentiora platform for observability and debugging:

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
  model: 'gpt-4o-mini',
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

### Thread ID for Conversations

Group multiple traces into conversational threads using `threadId`. This is useful for tracking multi-turn conversations where each turn is a separate trace. Use one stable UUID v7 per conversation (e.g. from the `uuid` package, which the SDK depends on). If you omit `threadId`, the SDK sets it to a new UUID v7 before sending.

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
  input: { messages: [{ role: 'user', content: 'What are its main benefits?' }] },
  output: { response: 'TypeScript provides static typing...' },
  startTime: new Date(),
  endTime: new Date(),
});

// All traces with the same threadId will be grouped together in the platform
```

**Important:** `threadId` must be a UUID v7 format. The platform will group all traces with the same `threadId` into a conversational thread for easier analysis and debugging of multi-turn interactions.

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

## Agents

Run AI agents hosted on the Mentiora platform. The agents API supports both complete (non-streaming) and streaming modes.

**Note:** Unlike tracing methods (which return `SendTraceResult` and never throw), agent methods **throw exceptions** on errors (`ValidationError`, `NetworkError`).

### Quick Start

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({ apiKey: process.env.MENTIORA_API_KEY });

const result = await client.agents.run({
  tag: 'production',
  message: 'What is the weather today?',
});
console.log(result.output);
```

### Streaming

Stream agent responses in real time using Server-Sent Events:

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

### Multi-turn Conversations

Use `threadId` to continue conversations across multiple agent calls:

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

### Agent Resolution

Identify which agent to run using either a **tag** or **agentId** (but not both):

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

### End-User Tracking

Pass `endUserId` to associate agent calls with specific end-users:

```typescript
const result = await client.agents.run({
  tag: 'production',
  message: 'Hello',
  endUserId: 'user-123',
});
```

### Retry Behavior

- **Non-streaming** (`run()`): Retries up to 3 times on 5xx errors and rate limits (429), with exponential backoff and jitter.
- **Streaming** (`stream()`): **No retry** — the stream is opened once. If the connection fails mid-stream, a `NetworkError` is raised. Implement your own retry logic around the stream call if needed.

### Error Handling

Agent methods throw exceptions instead of returning error results:

```typescript
import { ValidationError, NetworkError } from '@mentiora/sdk';

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

## Plugins

The SDK provides plugins for automatic tracing of popular frameworks.

### OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
pnpm add openai
```

```typescript
import { trackOpenAI, MentioraClient } from '@mentiora/sdk';
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
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

> For a complete runnable example, see [`examples/typescript/openai-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/openai-integration).

The OpenAI plugin traces chat completions (via `chat.completions.create`); embeddings and image calls are not currently traced.

**Multi-turn conversations with threadId:**

To group multiple OpenAI calls into a conversation, provide a `threadId` when wrapping the client:

```typescript
import { trackOpenAI, MentioraClient } from '@mentiora/sdk';
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
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'What is TypeScript?' }],
});

// Turn 2 - same trackedClient = same threadId
const response2 = await trackedClient.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'What is TypeScript?' },
    { role: 'assistant', content: response1.choices[0].message.content },
    { role: 'user', content: 'What are its main benefits?' },
  ],
});

// Both calls are grouped together in the platform by threadId
```

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

> **Note:** For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage. This does not affect your application behavior.

### LangChain Integration

Automatically trace LangChain executions using the callback handler. Install the LangChain packages you need (for this example: `@langchain/core`, `@langchain/openai`, and `langchain`):

```bash
pnpm add @langchain/core @langchain/openai langchain
```

```typescript
import { MentioraTracingLangChain, MentioraClient } from '@mentiora/sdk';
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
const llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
const prompt = ChatPromptTemplate.fromTemplate('Say hello to {name}');
const chain = prompt.pipe(llm);

// Invoke with callback - all operations are automatically traced
await chain.invoke({ name: 'World' }, { callbacks: [callback] });

// Works with agents, tools, retrievers, and other LangChain components
```

**Multi-turn conversations with threadId:**

To group multiple LangChain operations into a conversation, provide a `threadId` when creating the callback:

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
const chain1 = ChatPromptTemplate.fromTemplate('Generate a question about {topic}').pipe(llm);
const result1 = await chain1.invoke({ topic: 'TypeScript' }, { callbacks: [callback] });

// Turn 2 - same callback = same threadId
const chain2 = ChatPromptTemplate.fromTemplate('Answer this: {question}').pipe(llm);
const result2 = await chain2.invoke({ question: result1.content }, { callbacks: [callback] });

// Both operations are grouped together in the platform by threadId
```

> For a complete runnable example, see [`examples/typescript/langchain-integration`](https://github.com/mentiora-ai/mentiora-sdk/tree/main/examples/typescript/langchain-integration).

The callback handler automatically traces:
- LLM calls (with token usage)
- Chain executions
- Tool calls
- Agent operations
- Retriever operations
- Parent-child span relationships
- Errors and failures
- Thread ID for conversation grouping

## Next Steps

- Check out the [API reference](./api-reference) for detailed method documentation
