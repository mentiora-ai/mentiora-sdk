---
title: Agents
description: 'API reference for AgentsClient — run and stream agents, including AgentRunParams, AgentRunResult, AgentToolCall, and all stream event types.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Agents

> For usage examples, see [Usage - Agents](/usage/agents).

## AgentsClient

Client for running agents via the Mentiora API.

**Note:** Unlike tracing methods (which return `SendTraceResult` and never throw), agent methods **throw exceptions** on errors (`ValidationError`, `NetworkError`).

### Methods

<SdkTabs>
<TabItem value="typescript">

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

</TabItem>
<TabItem value="python">

#### `run(params: AgentRunParams) -> AgentRunResult`

Run an agent synchronously and return the complete result.

**Parameters:**

- `params: AgentRunParams` - Agent run parameters

**Returns:** `AgentRunResult`

**Raises:** `ValidationError`, `NetworkError`

**Example:**

```python
from mentiora import AgentRunParams

result = client.agents.run(AgentRunParams(
    tag='production',
    message='What is the weather today?',
))
print(result.output)
```

#### `run_async(params: AgentRunParams) -> AgentRunResult`

Run an agent asynchronously and return the complete result.

**Parameters:**

- `params: AgentRunParams` - Agent run parameters

**Returns:** `AgentRunResult`

**Raises:** `ValidationError`, `NetworkError`

**Example:**

```python
result = await client.agents.run_async(AgentRunParams(
    tag='production',
    message='What is the weather today?',
))
print(result.output)
```

#### `stream(params: AgentRunParams) -> Iterator[AgentStreamEvent]`

Run an agent with streaming (synchronous). Yields typed events as they arrive.

**Parameters:**

- `params: AgentRunParams` - Agent run parameters

**Yields:** `AgentStreamEvent` objects

**Raises:** `ValidationError`, `NetworkError`

**Example:**

```python
for event in client.agents.stream(AgentRunParams(
    tag='production',
    message='Write a poem about Python.',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
    elif event.type == 'error':
        print(f'Error: {event.message}')
```

#### `stream_async(params: AgentRunParams) -> AsyncIterator[AgentStreamEvent]`

Run an agent with streaming (asynchronous). Yields typed events as they arrive.

**Parameters:**

- `params: AgentRunParams` - Agent run parameters

**Yields:** `AgentStreamEvent` objects

**Raises:** `ValidationError`, `NetworkError`

**Example:**

```python
async for event in client.agents.stream_async(AgentRunParams(
    tag='production',
    message='Write a poem about Python.',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
    elif event.type == 'error':
        print(f'Error: {event.message}')
```

</TabItem>
</SdkTabs>

## Types

### AgentRunParams

<SdkTabs>
<TabItem value="typescript">

```typescript
interface AgentRunParams {
  tag?: string; // Tag name to resolve agent (e.g. 'production')
  agentId?: string; // Explicit agent ID (alternative to tag)
  revision?: number; // Explicit revision number (used with agentId)
  message: string; // User message to send (required)
  threadId?: string; // Thread ID for multi-turn conversations
  modelId?: string; // Override the agent's default model
  modelParams?: {
    // Override model parameters
    temperature?: number;
    maxTokens?: number;
    seed?: number;
  };
  endUserId?: string; // End-user identifier for tracking
  metadata?: Record<string, unknown>; // Arbitrary metadata
}
```

</TabItem>
<TabItem value="python">

```python
class AgentRunParams:
    tag: str | None             # Tag name to resolve agent (e.g. 'production')
    agent_id: str | None        # Explicit agent ID (alternative to tag)
    revision: int | None        # Explicit revision number (used with agent_id)
    message: str                # User message to send (required)
    thread_id: str | None       # Thread ID for multi-turn conversations
    model_id: str | None        # Override the agent's default model
    model_params: ModelParams | None  # Override model parameters
    end_user_id: str | None     # End-user identifier for tracking
    metadata: dict[str, Any] | None   # Arbitrary metadata
```

</TabItem>
</SdkTabs>

**Validation rules:**

- `message` is required and cannot be empty
- Either `tag` or `agentId`/`agent_id` must be provided, but not both
- `tag` must match `^[a-z0-9][a-z0-9\-_]*$` (lowercase alphanumeric, hyphens, underscores; must start with a letter or digit)

### ModelParams

<SdkTabs>
<TabItem value="typescript">

```typescript
interface ModelParams {
  temperature?: number; // 0–2 (inclusive)
  maxTokens?: number; // Must be > 0
  seed?: number;
}
```

</TabItem>
<TabItem value="python">

```python
class ModelParams:
    temperature: float | None  # 0–2 (inclusive)
    max_tokens: int | None     # Must be > 0
    seed: int | None
```

</TabItem>
</SdkTabs>

**Validation rules:**

- `temperature` must be between 0 and 2 (inclusive)
- `maxTokens`/`max_tokens` must be a positive integer

### AgentRunResult

<SdkTabs>
<TabItem value="typescript">

```typescript
interface AgentRunResult {
  threadId: string; // Thread ID for the conversation
  traceId?: string; // Trace ID for observability
  agentId: string; // Resolved agent ID
  agentRevision: number; // Resolved agent revision
  agentTag?: string; // Resolved agent tag (if applicable)
  output: string; // Agent output text
  toolCalls: AgentToolCall[]; // Tool calls made during execution
  status: 'completed' | 'failed'; // Execution status
  usage?: {
    // Token usage stats
    promptTokens?: number;
    completionTokens?: number;
  };
}
```

</TabItem>
<TabItem value="python">

```python
class AgentRunResult:
    thread_id: str              # Thread ID for the conversation
    trace_id: str | None        # Trace ID for observability
    agent_id: str               # Resolved agent ID
    agent_revision: int         # Resolved agent revision
    agent_tag: str | None       # Resolved agent tag (if applicable)
    output: str                 # Agent output text
    tool_calls: list[AgentToolCall]  # Tool calls made during execution
    status: 'completed' | 'failed'   # Execution status
    usage: UsageInfo | None          # Token usage stats
```

#### UsageInfo

Token usage information for agent runs.

```python
class UsageInfo:
    prompt_tokens: int | None
    completion_tokens: int | None
```

</TabItem>
</SdkTabs>

### AgentToolCall

<SdkTabs>
<TabItem value="typescript">

```typescript
interface AgentToolCall {
  toolCallId: string;
  name: string;
  arguments: unknown;
  result?: unknown;
}
```

</TabItem>
<TabItem value="python">

```python
class AgentToolCall:
    tool_call_id: str
    name: str
    arguments: Any
    result: Any | None
```

</TabItem>
</SdkTabs>

### AgentStreamEvent

Union type of all possible streaming events:

<SdkTabs>
<TabItem value="typescript">

```typescript
type AgentStreamEvent =
  | AgentResolvedEvent
  | OutputTextDeltaEvent
  | ToolCallDeltaEvent
  | ToolCallResultEvent
  | SuggestionsEvent
  | ChatCompletedEvent
  | AgentErrorEvent;
```

</TabItem>
<TabItem value="python">

```python
AgentStreamEvent = (
    AgentResolvedEvent
    | OutputTextDeltaEvent
    | ToolCallDeltaEvent
    | ToolCallResultEvent
    | SuggestionsEvent
    | ChatCompletedEvent
    | AgentErrorEvent
)
```

</TabItem>
</SdkTabs>

### AgentResolvedEvent

Emitted once at stream start with resolved agent metadata.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface AgentResolvedEvent {
  type: 'agent_resolved';
  agentId: string;
  agentRevision: number;
  agentTag?: string;
  threadId: string;
}
```

</TabItem>
<TabItem value="python">

```python
class AgentResolvedEvent:
    type: 'agent_resolved'
    agent_id: str
    agent_revision: int
    agent_tag: str | None
    thread_id: str
```

</TabItem>
</SdkTabs>

### OutputTextDeltaEvent

Streaming text chunk from the agent.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface OutputTextDeltaEvent {
  type: 'output_text_delta';
  delta: string;
}
```

</TabItem>
<TabItem value="python">

```python
class OutputTextDeltaEvent:
    type: 'output_text_delta'
    delta: str
```

</TabItem>
</SdkTabs>

### ToolCallDeltaEvent

Streaming tool call argument chunk.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface ToolCallDeltaEvent {
  type: 'tool_call_delta';
  toolCallId: string;
  name: string;
  argumentsDelta: string;
}
```

</TabItem>
<TabItem value="python">

```python
class ToolCallDeltaEvent:
    type: 'tool_call_delta'
    tool_call_id: str
    name: str
    arguments_delta: str
```

</TabItem>
</SdkTabs>

### ToolCallResultEvent

Completed tool call with result.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface ToolCallResultEvent {
  type: 'tool_call_result';
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: unknown;
}
```

</TabItem>
<TabItem value="python">

```python
class ToolCallResultEvent:
    type: 'tool_call_result'
    tool_call_id: str
    name: str
    arguments: Any
    result: Any
```

</TabItem>
</SdkTabs>

### SuggestionsEvent

Emitted when the agent provides follow-up suggestion prompts. Typically sent after the agent's response is complete. The SDK validates suggestions (max 6 items, label ≤ 40 chars) and silently drops invalid entries.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface SuggestionsEvent {
  type: 'suggestions';
  suggestions: Array<{
    label: string;  // Display text (max 40 chars)
    message: string; // Message to send when clicked
  }>;
}
```

</TabItem>
<TabItem value="python">

```python
class SuggestionsEvent:
    type: 'suggestions'
    suggestions: list[SuggestionItem]

class SuggestionItem:
    label: str   # Display text (max 40 chars)
    message: str # Message to send when clicked
```

</TabItem>
</SdkTabs>

### ChatCompletedEvent

Emitted when agent execution completes.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface ChatCompletedEvent {
  type: 'chat_completed';
  threadId: string;
  status: 'completed' | 'failed';
  output: string;
}
```

</TabItem>
<TabItem value="python">

```python
class ChatCompletedEvent:
    type: 'chat_completed'
    thread_id: str
    status: 'completed' | 'failed'
    output: str
```

</TabItem>
</SdkTabs>

### AgentErrorEvent

Error event from the agent backend. Streaming stops after this event.

<SdkTabs>
<TabItem value="typescript">

```typescript
interface AgentErrorEvent {
  type: 'error';
  code: string;
  message: string;
}
```

</TabItem>
<TabItem value="python">

```python
class AgentErrorEvent:
    type: 'error'
    code: str
    message: str
```

</TabItem>
</SdkTabs>

---

**See also:** [Client](/api-reference/client) | [Streaming Helpers](/api-reference/streaming-helpers) | [Errors](/api-reference/errors)
