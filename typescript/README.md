# @mentiora/sdk

TypeScript/JavaScript SDK for the Mentiora platform. Provides access to tracing, vector database operations, and other platform features.

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
  environment: 'production', // or 'staging'
});
```

### Tracing

Send agent traces to the Mentiora platform:

```typescript
// Send a trace
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

### Vector DB (Coming Soon)

Vector database operations will be available through `client.vectordb`:

```typescript
// Future API
await client.vectordb.uploadFile(...);
await client.vectordb.deleteFile(...);
await client.vectordb.query(...);
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `projectId` | string | No | Project UUID (optional) |
| `baseUrl` | string | No | Override base URL (for testing) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |

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
interface TraceEvent {
  traceId: string;           // Unique trace ID
  spanId: string;            // Unique span ID
  parentSpanId?: string;     // Parent span for nesting
  name: string;              // Span name, e.g., 'llm.call', 'tool.execute'
  type: 'llm' | 'tool' | 'chat' | 'error' | 'custom';
  input?: unknown;           // Prompt, tool input, etc.
  output?: unknown;          // Response, tool result
  startTime: Date | string;  // ISO 8601 timestamp
  endTime?: Date | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: {
    message: string;
    type?: string;
    stack?: string;
  };
}
```

## Requirements

- Node.js >= 18.0.0
