# @mentiora/sdk

TypeScript/JavaScript SDK for the Mentiora platform. Provides AI observability and tracing.

## Installation

```bash
npm install @mentiora/sdk
```

## Usage

### Basic Setup

```typescript
import { MentioraClient } from '@mentiora/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
  // Optional: baseUrl defaults to https://platform.mentiora.ai
});
```

### Authentication

To obtain an API key:

1. Sign in to the [Mentiora dashboard](https://platform.mentiora.ai)
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"** and copy the key immediately (it's only shown once)
4. Set it as an environment variable:

```bash
export MENTIORA_API_KEY=your-api-key-here
```

See the [Authentication guide](https://docs.mentiora.ai/authentication) for details on key management and security best practices.

### Async-Only API

The TypeScript SDK uses an **async-only API**. All methods return Promises and must be awaited:

```typescript
// All tracing methods are async
const result = await client.tracing.sendTrace(event);
await client.tracing.flush();
```

#### Why async-only?

- **Native `fetch()` is async-only**: There is no synchronous equivalent in modern JavaScript/TypeScript
- **Node.js ecosystem is async-first**: Most Node.js libraries and frameworks use async patterns
- **Prevents blocking the event loop**: Keeps your application responsive and performant

#### Comparison with Python SDK

Unlike the Python SDK (which offers both sync and async APIs), the TypeScript SDK only provides async methods. This design choice reflects the JavaScript ecosystem's preference for asynchronous operations.

```typescript
// ✅ Always use await with TypeScript SDK
async function myHandler() {
  const result = await client.tracing.sendTrace(event);
  return result;
}

// ❌ No sync API available
function myHandler() {
  const result = client.tracing.sendTrace(event); // This won't work as expected!
  return result;
}
```

### Resource Cleanup

While the TypeScript SDK doesn't require explicit cleanup (it uses stateless `fetch()`), a `close()` method is provided for API parity with the Python SDK:

```typescript
// Optional cleanup (no-op but available for consistency)
client.close();
```

### Tracing

Send agent traces to the Mentiora platform:

```typescript
// Send a trace
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7 format
  spanId: '019505a0-b7c2-7000-8000-000000000002', // UUID v7 format
  parentSpanId: '019505a0-b7c2-7000-8000-000000000003', // optional, UUID v7 format
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

// Flush pending traces
await client.tracing.flush();
```

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

The OpenAI plugin traces chat completions (via `chat.completions.create`); embeddings and image calls are not currently traced.

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

> **Note:** For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage. This does not affect your application behavior.

### LangChain Integration

Automatically trace LangChain executions using the callback handler:

```bash
npm install @langchain/core
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

The callback handler automatically traces:

- LLM calls (with token usage)
- Chain executions
- Tool calls
- Agent operations
- Retriever operations
- Parent-child span relationships
- Errors and failures

## Configuration

| Option    | Type    | Required | Description                                                                     |
| --------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `apiKey`  | string  | Yes      | Project API key — see [Authentication](https://docs.mentiora.ai/authentication) |
| `baseUrl` | string  | No       | Override base URL (default: https://platform.mentiora.ai)                       |
| `timeout` | number  | No       | Request timeout in ms (default: 30000)                                          |
| `retries` | number  | No       | Max retry attempts (default: 3)                                                 |
| `debug`   | boolean | No       | Enable verbose SDK logging (default: false)                                     |

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

## TraceEvent Schema

```typescript
interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface TraceEvent {
  traceId: string; // Unique trace ID (UUID v7 format)
  spanId: string; // Unique span ID (UUID v7 format)
  parentSpanId?: string; // Parent span for nesting (UUID v7 format)
  threadId?: string; // Optional. If omitted, the SDK sets it to a new UUID v7 before sending.
  name: string; // Span name, e.g., 'llm.call', 'tool.execute'
  type: 'llm' | 'tool' | 'chat' | 'error' | 'custom';
  input?: unknown; // Prompt, tool input, etc.
  output?: unknown; // Response, tool result
  startTime: Date | string; // ISO 8601 timestamp
  endTime?: Date | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: {
    message: string;
    type?: string;
    stack?: string;
  };
  usage?: UsageInfo; // Token usage (LLM-specific)
  model?: string; // Model name (e.g., 'gpt-4', 'claude-3')
  provider?: string; // Provider name (e.g., 'openai', 'anthropic')
}
```

**Note:** `traceId` and `spanId` must be in UUID v7 format (e.g., `019505a0-b7c2-7000-8000-000000000001`). The plugins automatically generate UUID v7 IDs.

## Requirements

- Node.js >= 20.0.0
