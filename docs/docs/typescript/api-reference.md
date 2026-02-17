---
sidebar_position: 3
---

# TypeScript SDK API Reference

Complete API reference for the Mentiora TypeScript SDK.

## MentioraClient

Main client class for interacting with the Mentiora platform.

### Constructor

```typescript
new MentioraClient(config: MentioraConfig)
```

#### MentioraConfig

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | Project API key — see [Authentication](/authentication) |
| `baseUrl` | string | No | Base URL (defaults to https://platform.mentiora.ai) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |
| `debug` | boolean | No | Enable verbose SDK logging (default: false) |

### Properties

#### `tracing`

Access to tracing functionality.

```typescript
client.tracing: TracingClient
```

#### `agents`

Access to agent execution functionality.

```typescript
client.agents: AgentsClient
```

#### `debug`

Whether debug mode is enabled (read-only).

```typescript
client.debug: boolean
```

## TracingClient

Client for sending traces to the Mentiora platform.

### Methods

#### `sendTrace(event: TraceEvent): Promise<SendTraceResult>`

Send a trace event to the platform (async only).

**Parameters:**

- `event: TraceEvent` - The trace event to send

**Returns:** `Promise<SendTraceResult>`

**Example:**

```typescript
const result = await client.tracing.sendTrace({
  traceId: '019505a0-b7c2-7000-8000-000000000001', // UUID v7
  spanId: '019505a0-b7c2-7000-8000-000000000002',  // UUID v7
  name: 'llm.call',
  type: 'llm',
  startTime: new Date(),
  endTime: new Date(),
});
```

#### `flush(): Promise<void>`

Flush any pending traces in the queue (async only). Call before process exit if you use batching.

**Returns:** `Promise<void>`

**Example:**

```typescript
await client.tracing.flush();
```

## Types

### TraceEvent

```typescript
interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface TraceEvent {
  traceId: string;           // Unique trace ID (UUID v7 format)
  spanId: string;            // Unique span ID (UUID v7 format)
  parentSpanId?: string;     // Parent span for nesting (UUID v7 format)
  threadId?: string;         // Optional. If omitted, the SDK sets it to a new UUID v7 before sending.
  name: string;               // Span name, e.g., 'llm.call', 'tool.execute'
  type: 'llm' | 'tool' | 'chat' | 'error' | 'custom';
  input?: unknown;           // Prompt, tool input, etc.
  output?: unknown;          // Response, tool result
  startTime: Date | string;  // ISO 8601 timestamp
  endTime?: Date | string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  error?: TraceError;        // Error details (when type === 'error')
  usage?: UsageInfo;         // Token usage (LLM-specific)
  model?: string;            // Model name (e.g., 'gpt-4', 'claude-3')
  provider?: string;         // Provider name (e.g., 'openai', 'anthropic')
}
```

**Note:** `traceId` and `spanId` must be in UUID v7 format. The plugins automatically generate UUID v7 IDs.

### TraceError

Error details for trace events (e.g. when `type === 'error'`).

```typescript
interface TraceError {
  message: string;
  type?: string;
  stack?: string;
}
```

### SendTraceResult

```typescript
interface SendTraceResult {
  success: boolean;
  traceId: string;
  spanId: string;
  error?: string;
}
```

## Errors

### MentioraError

Base exception for all Mentiora SDK errors. All specific error classes extend this.

```typescript
class MentioraError extends Error {
  readonly code: string;
  constructor(message: string, code: string);
}
```

You can catch `MentioraError` to handle any SDK error, or use the `code` property for programmatic error handling.

### ConfigurationError

Thrown when the client configuration is invalid.

```typescript
class ConfigurationError extends MentioraError {
  // code: 'CONFIGURATION_ERROR'
  constructor(message: string);
}
```

### ValidationError

Thrown when trace event data is invalid.

```typescript
class ValidationError extends MentioraError {
  // code: 'VALIDATION_ERROR'
  constructor(message: string);
}
```

### NetworkError

Thrown when a network or HTTP error occurs.

```typescript
class NetworkError extends MentioraError {
  // code: 'NETWORK_ERROR'
  readonly statusCode?: number;
  constructor(message: string, statusCode?: number);
}
```

## AgentsClient

Client for running agents via the Mentiora API.

**Note:** Unlike tracing methods (which return `SendTraceResult` and never throw), agent methods **throw exceptions** on errors (`ValidationError`, `NetworkError`).

### Methods

#### `run(params: AgentRunParams): Promise<AgentRunResult>`

Run an agent and return the complete result.

**Parameters:**

- `params: AgentRunParams` - Agent run parameters

**Returns:** `Promise<AgentRunResult>`

**Throws:** `ValidationError`, `NetworkError`

**Example:**

```typescript
const result = await client.agents.run({
  tag: 'production',
  message: 'What is the weather today?',
});
console.log(result.output);
```

#### `stream(params: AgentRunParams): AsyncGenerator<AgentStreamEvent>`

Run an agent with streaming. Returns an async iterable of events.

**Parameters:**

- `params: AgentRunParams` - Agent run parameters

**Yields:** `AgentStreamEvent` objects

**Throws:** `ValidationError`, `NetworkError`

**Example:**

```typescript
for await (const event of client.agents.stream({
  tag: 'production',
  message: 'Write a poem about TypeScript.',
})) {
  if (event.type === 'output_text_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'error') {
    console.error(`Error: ${event.message}`);
  }
}
```

## Agent Types

### AgentRunParams

```typescript
interface AgentRunParams {
  tag?: string;              // Tag name to resolve agent (e.g. 'production')
  agentId?: string;          // Explicit agent ID (alternative to tag)
  revision?: number;         // Explicit revision number (used with agentId)
  message: string;           // User message to send (required)
  threadId?: string;         // Thread ID for multi-turn conversations
  modelId?: string;          // Override the agent's default model
  modelParams?: {            // Override model parameters
    temperature?: number;
    maxTokens?: number;
    seed?: number;
  };
  endUserId?: string;        // End-user identifier for tracking
  metadata?: Record<string, unknown>;  // Arbitrary metadata
}
```

**Validation rules:**
- `message` is required and cannot be empty
- Either `tag` or `agentId` must be provided, but not both

### AgentRunResult

```typescript
interface AgentRunResult {
  threadId: string;           // Thread ID for the conversation
  traceId?: string;           // Trace ID for observability
  agentId: string;            // Resolved agent ID
  agentRevision: number;      // Resolved agent revision
  agentTag?: string;          // Resolved agent tag (if applicable)
  output: string;             // Agent output text
  toolCalls: AgentToolCall[]; // Tool calls made during execution
  status: 'completed' | 'failed';  // Execution status
  usage?: {                   // Token usage stats
    promptTokens?: number;
    completionTokens?: number;
  };
}
```

### AgentToolCall

```typescript
interface AgentToolCall {
  toolCallId: string;
  name: string;
  arguments: unknown;
  result?: unknown;
}
```

### AgentStreamEvent

Union type of all possible streaming events:

```typescript
type AgentStreamEvent =
  | AgentResolvedEvent
  | OutputTextDeltaEvent
  | ToolCallDeltaEvent
  | ToolCallResultEvent
  | ChatCompletedEvent
  | AgentErrorEvent;
```

### AgentResolvedEvent

Emitted once at stream start with resolved agent metadata.

```typescript
interface AgentResolvedEvent {
  type: 'agent_resolved';
  agentId: string;
  agentRevision: number;
  agentTag?: string;
  threadId: string;
}
```

### OutputTextDeltaEvent

Streaming text chunk from the agent.

```typescript
interface OutputTextDeltaEvent {
  type: 'output_text_delta';
  delta: string;
}
```

### ToolCallDeltaEvent

Streaming tool call argument chunk.

```typescript
interface ToolCallDeltaEvent {
  type: 'tool_call_delta';
  toolCallId: string;
  name: string;
  argumentsDelta: string;
}
```

### ToolCallResultEvent

Completed tool call with result.

```typescript
interface ToolCallResultEvent {
  type: 'tool_call_result';
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: unknown;
}
```

### ChatCompletedEvent

Emitted when agent execution completes.

```typescript
interface ChatCompletedEvent {
  type: 'chat_completed';
  threadId: string;
  status: 'completed' | 'failed';
  output: string;
}
```

### AgentErrorEvent

Error event from the agent backend. Streaming stops after this event.

```typescript
interface AgentErrorEvent {
  type: 'error';
  code: string;
  message: string;
}
```

## Plugins

### trackOpenAI

Wraps an OpenAI client to automatically trace API calls.

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
import { trackOpenAI } from '@mentiora/sdk';
import OpenAI from 'openai';

const trackedClient = trackOpenAI(openaiClient, {
  mentioraClient,
  tags: ['production'],
});
```

**Captured trace data:**

Each traced call produces a `TraceEvent` with:
- **input**: All parameters passed to `chat.completions.create` (model, messages, temperature, tools, etc.), plus a `prompt` field extracted from the last user message. Multimodal content arrays (text + images) are supported.
- **output**: Full response data including `id`, `created`, `system_fingerprint`, `service_tier`, `usage`, and per-choice `logprobs` and `refusal` fields.
- **metadata**: Includes `openai_id` (the OpenAI response ID, e.g. `chatcmpl-...`) and `created` timestamp for correlation with OpenAI's logs.

For streaming requests, the plugin automatically injects `stream_options: { include_usage: true }` to capture token usage statistics. Refusal content is accumulated across stream chunks.

### MentioraTracingLangChain

Callback handler for automatically tracing LangChain executions.

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
import { MentioraTracingLangChain } from '@mentiora/sdk';

const callback = new MentioraTracingLangChain({
  mentioraClient,
  tags: ['production'],
});

await chain.invoke({ input: '...' }, { callbacks: [callback] });
```

**Note:** This class extends LangChain's `BaseCallbackHandler` and implements all required callback methods for tracing LLM calls, chain executions, tool calls, and agent operations.
