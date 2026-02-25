# @mentiora.ai/sdk

TypeScript/JavaScript SDK for the [Mentiora](https://mentiora.ai) observability platform. Provides AI observability, tracing, and agent execution.

## Installation

```bash
npm install @mentiora.ai/sdk
```

## Quick Start

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

// Send a trace
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001',
  spanId: '019505a0-b7c2-7000-8000-000000000002',
  name: 'llm.call',
  type: 'llm',
  input: { messages: [{ role: 'user', content: 'Hello' }] },
  output: { response: 'Hi there!' },
  startTime: new Date(),
  model: 'gpt-5-mini',
  provider: 'openai',
});

if (result.success) {
  console.log(`Trace sent: ${result.traceId}`);
}
```

## Authentication

To obtain an API key:

1. Sign in to the [Mentiora dashboard](https://platform.mentiora.ai)
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"** and copy the key immediately (it's only shown once)
4. Set it as an environment variable:

```bash
export MENTIORA_API_KEY=your-api-key-here
```

See the [Authentication guide](https://docs.mentiora.ai/authentication) for details on key management and security best practices.

## Async-Only API

The TypeScript SDK uses an **async-only API**. All methods return Promises and must be awaited:

```typescript
const result = await client.tracing.sendTrace(event);
await client.tracing.flush();

const agentResult = await client.agents.run(params);
for await (const event of client.agents.stream(params)) {
  /* ... */
}
```

This reflects the JavaScript ecosystem's preference for asynchronous operations. The Python SDK offers both sync and async APIs — see the [Python README](../python/) for details.

## Configuration

| Option    | Type      | Required | Default                        | Description                                                                 |
| --------- | --------- | :------: | ------------------------------ | --------------------------------------------------------------------------- |
| `apiKey`  | `string`  |   Yes    | —                              | Project API key ([Authentication](https://docs.mentiora.ai/authentication)) |
| `baseUrl` | `string`  |    No    | `https://platform.mentiora.ai` | Override base URL                                                           |
| `timeout` | `number`  |    No    | `30000`                        | Request timeout in milliseconds                                             |
| `retries` | `number`  |    No    | `3`                            | Max retry attempts                                                          |
| `debug`   | `boolean` |    No    | `false`                        | Enable verbose SDK logging                                                  |

## Core Tracing

### sendTrace

Send a trace event to the Mentiora platform:

```typescript
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7
  spanId: '019505a0-b7c2-7000-8000-000000000002', // UUID v7
  parentSpanId: '019505a0-b7c2-7000-8000-000000000003', // optional
  threadId: '019505a0-b7c2-7000-8000-000000000004', // optional, auto-generated if omitted
  name: 'llm.call',
  type: 'llm', // 'llm' | 'tool' | 'chat' | 'error' | 'custom'
  input: { messages: [{ role: 'user', content: 'Hello' }] },
  output: { response: 'Hello from Mentiora' },
  startTime: new Date(),
  endTime: new Date(),
  durationMs: 1000,
  usage: { prompt_tokens: 10, completion_tokens: 25, total_tokens: 35 },
  model: 'gpt-5-mini',
  provider: 'openai',
  metadata: { environment: 'prod' },
  tags: ['production', 'support-agent'],
});

if (result.success) {
  console.log(`Trace sent: ${result.traceId}`);
} else {
  console.error(`Failed: ${result.error}`);
}
```

The result is a `SendTraceResult` with `success`, `traceId`, `spanId`, and an optional `error` field. Tracing is non-throwing — failures are returned in the result object, never thrown.

### flush

Flush pending traces (reserved for future batching):

```typescript
await client.tracing.flush();
```

### TraceEvent Schema

```typescript
interface TraceEvent {
  traceId: string; // UUID v7 (required)
  spanId: string; // UUID v7 (required)
  parentSpanId?: string; // UUID v7
  threadId?: string; // UUID v7, auto-generated if omitted
  name: string; // e.g., 'llm.call', 'tool.execute'
  type: TraceType; // 'llm' | 'tool' | 'chat' | 'error' | 'custom'
  input?: unknown;
  output?: unknown;
  startTime: Date | string; // ISO 8601 or Date (required)
  endTime?: Date | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: TraceError; // { message, type?, stack? }
  usage?: UsageInfo; // { prompt_tokens?, completion_tokens?, total_tokens? }
  model?: string;
  provider?: string;
}
```

All IDs must be UUID v7 format. The plugins generate these automatically.

## Agent Execution

The `AgentsClient` (accessed via `client.agents`) lets you run AI agents and stream their responses.

### run

Execute an agent and get the complete result:

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

const result = await client.agents.run({
  tag: 'support-agent', // resolve agent by tag
  message: 'How do I reset my password?',
  endUserId: 'user-123', // optional end-user tracking
});

console.log(result.output); // assistant's text response
console.log(result.threadId); // conversation thread ID
console.log(result.toolCalls); // tool invocations made
console.log(result.status); // 'completed' | 'failed'
```

### stream

Stream agent responses as they arrive:

```typescript
for await (const event of client.agents.stream({
  tag: 'support-agent',
  message: 'How do I reset my password?',
})) {
  switch (event.type) {
    case 'agent_resolved':
      console.log(`Agent: ${event.agentId} (thread: ${event.threadId})`);
      break;
    case 'output_text_delta':
      process.stdout.write(event.delta);
      break;
    case 'tool_call_result':
      console.log(`Tool ${event.name}: ${JSON.stringify(event.result)}`);
      break;
    case 'chat_completed':
      console.log(`\nDone (${event.status})`);
      break;
    case 'error':
      console.error(`Error [${event.code}]: ${event.message}`);
      break;
  }
}
```

### Multi-turn Conversations

Reuse `threadId` to continue a conversation:

```typescript
const first = await client.agents.run({
  tag: 'support-agent',
  message: 'How do I reset my password?',
});

const followUp = await client.agents.run({
  tag: 'support-agent',
  message: 'What if I forgot my email too?',
  threadId: first.threadId, // continue the conversation
});
```

### AgentRunParams

```typescript
interface AgentRunParams {
  tag?: string; // resolve agent by tag (use tag or agentId)
  agentId?: string; // explicit agent ID
  revision?: number; // agent revision (with agentId)
  message: string; // user message (required)
  threadId?: string; // thread ID for multi-turn conversations
  modelId?: string; // override default model
  modelParams?: ModelParams; // override model parameters
  endUserId?: string; // end-user identifier for tracking
  metadata?: Record<string, unknown>; // arbitrary metadata
}

interface ModelParams {
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}
```

### AgentStreamEvent

Streaming events are a discriminated union with six types:

| Event Type          | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `agent_resolved`    | Emitted once at stream start with agent metadata and `threadId` |
| `output_text_delta` | Text chunk from the agent (`delta`)                             |
| `tool_call_delta`   | Tool call argument chunk (`argumentsDelta`)                     |
| `tool_call_result`  | Completed tool call with `arguments` and `result`               |
| `chat_completed`    | Agent execution finished with `output` and `status`             |
| `error`             | Error with `code` and `message`                                 |

## Streaming Helpers

Bridge agent streaming events to Server-Sent Events (SSE) for web frameworks.

### createStreamResponse

Convert an async iterable of agent events into a web-standard `Response` with SSE headers:

```typescript
import { MentioraClient, createStreamResponse } from '@mentiora.ai/sdk';

const client = new MentioraClient({ apiKey: process.env.MENTIORA_API_KEY });

// Example: HTTP handler returning an SSE stream
function handleRequest(request: Request): Response {
  const events = client.agents.stream({
    tag: 'support-agent',
    message: 'Hello',
  });

  return createStreamResponse(events);
}
```

With a custom transform:

```typescript
return createStreamResponse(events, {
  transform: (event) => {
    if (event.type === 'output_text_delta') {
      return { type: 'text', content: event.delta };
    }
    return null; // skip event
  },
  headers: { 'X-Custom': 'value' },
});
```

Default transform behavior:

- `output_text_delta` → `{ type: 'delta', delta }`
- `chat_completed` → `{ type: 'done', threadId, output, status }`
- `error` → `{ type: 'error', message }`
- Other events are dropped

### SSE_HEADERS

Pre-configured headers for SSE responses:

```typescript
import { SSE_HEADERS } from '@mentiora.ai/sdk';

// {
//   'Content-Type': 'text/event-stream; charset=utf-8',
//   'Cache-Control': 'no-cache, no-transform',
//   'Connection': 'keep-alive',
//   'X-Accel-Buffering': 'no',
// }
```

## OpenAI Integration

Automatically trace OpenAI API calls by wrapping your OpenAI client:

```bash
npm install openai
```

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';
import { trackOpenAI } from '@mentiora.ai/sdk/openai';
import OpenAI from 'openai';

const mentioraClient = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

const trackedClient = trackOpenAI(new OpenAI(), {
  mentioraClient,
  tags: ['production'],
  metadata: { environment: 'prod' },
});

// Use trackedClient normally — chat completions are automatically traced
const response = await trackedClient.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

The plugin traces `chat.completions.create` and automatically captures:

- Request parameters (model, messages, temperature, max_tokens, tools, response_format, etc.)
- Multimodal content (text + image arrays)
- Response content and metadata (id, created, system_fingerprint, service_tier)
- Token usage (prompt, completion, total) for streaming and non-streaming
- Refusal handling
- Tool/function calls and responses
- OpenAI response ID (`openai_id` in trace metadata)
- Errors, stack traces, duration, and timestamps

> **Note:** For streaming requests, the plugin injects `stream_options: { include_usage: true }` to capture token usage. This does not affect your application behavior.

### TrackOpenAIOptions

| Option           | Type                      | Required | Default        | Description                  |
| ---------------- | ------------------------- | :------: | -------------- | ---------------------------- |
| `mentioraClient` | `MentioraClient`          |   Yes    | —              | Initialized Mentiora client  |
| `threadId`       | `string`                  |    No    | auto-generated | UUID v7 thread ID            |
| `tags`           | `string[]`                |    No    | —              | Tags for all traces          |
| `metadata`       | `Record<string, unknown>` |    No    | —              | Metadata for all traces      |
| `captureContent` | `boolean`                 |    No    | `true`         | Capture input/output content |

## LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
npm install @langchain/core
```

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
  tags: ['production'],
  metadata: { environment: 'prod' },
});

const llm = new ChatOpenAI({ model: 'gpt-5-mini' });
const prompt = ChatPromptTemplate.fromTemplate('Say hello to {name}');
const chain = prompt.pipe(llm);

await chain.invoke({ name: 'World' }, { callbacks: [callback] });
```

The callback handler traces LLM calls (with token usage), chain executions, tool calls, agent operations, retriever operations, parent-child span relationships, and errors.

### MentioraTracingLangChainOptions

| Option           | Type                      | Required | Default        | Description                  |
| ---------------- | ------------------------- | :------: | -------------- | ---------------------------- |
| `mentioraClient` | `MentioraClient`          |   Yes    | —              | Initialized Mentiora client  |
| `threadId`       | `string`                  |    No    | auto-generated | UUID v7 thread ID            |
| `tags`           | `string[]`                |    No    | —              | Tags for all traces          |
| `metadata`       | `Record<string, unknown>` |    No    | —              | Metadata for all traces      |
| `captureContent` | `boolean`                 |    No    | `true`         | Capture input/output content |

## Resource Cleanup

The TypeScript SDK uses stateless `fetch()` and does not require explicit cleanup. A `close()` method is provided for API parity with the Python SDK:

```typescript
client.close(); // no-op, but available for consistency
```

## Error Handling

### Result Types

Tracing methods return typed results instead of throwing:

```typescript
const result = await client.tracing.sendTrace(event);

if (!result.success) {
  console.error(result.error); // string error message
}
```

### Error Classes

For configuration, validation, and network errors, the SDK throws typed exceptions:

| Error Class          | Code                  | Description                                        |
| -------------------- | --------------------- | -------------------------------------------------- |
| `MentioraError`      | varies                | Base error class                                   |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Invalid SDK configuration (e.g., missing API key)  |
| `ValidationError`    | `VALIDATION_ERROR`    | Invalid input data (e.g., missing required fields) |
| `NetworkError`       | `NETWORK_ERROR`       | HTTP or network failure (includes `statusCode`)    |

```typescript
import { ConfigurationError, ValidationError, NetworkError } from '@mentiora.ai/sdk';

try {
  await client.agents.run(params);
} catch (err) {
  if (err instanceof NetworkError) {
    console.error(`HTTP ${err.statusCode}: ${err.message}`);
  }
}
```

## Requirements

- Node.js >= 20.0.0
