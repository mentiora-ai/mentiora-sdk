# Agent Run — TypeScript

A copy-paste-ready example demonstrating how to run custom agents via the [Mentiora SDK](https://github.com/mentiora-ai/mentiora-sdk).

## What this example demonstrates

- Initializing `MentioraClient` from environment variables
- Running an agent with **complete response** (full result in one call)
- **Streaming** an agent response in real-time (ideal for chat UIs)
- **Multi-turn conversations** by reusing `threadId`
- **Model overrides** (custom model and parameters)
- **Error handling** (`ValidationError`, `NetworkError`, streaming errors)

## Prerequisites

- **Node.js** >= 20
- A **Mentiora API key** (get one from the [Mentiora dashboard](https://platform.mentiora.ai))
- A **configured agent** with a `production` tag on the Mentiora platform

## Setup

1. **Install dependencies**

   ```bash
   cd examples/typescript/agent-run
   pnpm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and replace `your-api-key-here` with your actual API key.

## Run

```bash
pnpm start
```

Or in watch mode during development:

```bash
pnpm dev
```

## Expected output

```
Mentiora SDK — Agent Run Example
================================

--- Basic Agent Run ---

Status:   completed
Output:   Our refund policy allows returns within 30 days of purchase...
Thread:   019abc12-3456-7def-8901-234567890abc
Agent:    agent_abc123 (rev 7)
Tokens:   150 prompt + 85 completion

--- Streaming Agent Run ---

Agent resolved: agent_abc123 (rev 7)
Thread: 019abc12-3456-7def-8901-234567890abc

Output: Here is our return process step by step:
1. Log into your account...
2. Navigate to Order History...
3. Click "Request Return"...
[Tool: lookup_policy -> {"section":"returns","found":true}]

Completed: status=completed

--- Multi-Turn Conversation ---

Turn 1 — Agent: I'm sorry to hear about the dead pixel! I can help you with a return...
Thread: 019abc12-0000-7def-8901-234567890abc

Turn 2 — Agent: Great, I've initiated the return process. You'll receive a shipping label...
Thread: 019abc12-0000-7def-8901-234567890abc (same as turn 1)

Turn 3 — Agent: Refunds are typically processed within 5-7 business days...

--- Model Overrides ---

Output: We offer free standard shipping on all orders over $50...
Model override applied — response generated with custom parameters

--- Error Handling ---

ValidationError caught: message must be a non-empty string
ValidationError caught: either tag or agentId is required
NetworkError handling: wrap agent calls in try/catch for HTTP failures

================================
Done! Check the Mentiora dashboard to view agent traces.
```

## Key concepts

### Agent resolution — tag vs agentId

You can identify which agent to run in two ways:

| Parameter | Description                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `tag`     | A mutable label (e.g. `production`, `staging`). The platform resolves it to the latest agent revision with that tag. |
| `agentId` | An immutable reference to a specific agent revision. Use this for pinned, reproducible calls.                        |

You must provide either `tag` or `agentId`, but not both. Providing both will throw a `ValidationError`.

### Complete response vs Streaming

| Method                   | Use case                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `client.agents.run()`    | Returns the full `AgentRunResult` once the agent finishes. Simple and easy to use.                                           |
| `client.agents.stream()` | Returns an `AsyncIterable<AgentStreamEvent>`. Events arrive in real-time as the agent generates output — ideal for chat UIs. |

### Streaming events

| Event type          | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `agent_resolved`    | Emitted once at the start. Contains `agentId`, `agentRevision`, and `threadId`. |
| `output_text_delta` | A chunk of output text. Concatenate all deltas for the full response.           |
| `tool_call_delta`   | A chunk of tool-call arguments (streaming in as JSON).                          |
| `tool_call_result`  | Emitted when a tool call completes. Contains `name` and `result`.               |
| `chat_completed`    | Emitted once when the agent finishes. Contains final `status`.                  |
| `error`             | Emitted if the agent encounters an error. Contains `code` and `message`.        |

### Multi-turn conversations

Pass the `threadId` from a previous run back into the next call. The agent will have access to the full conversation history, enabling context-aware follow-ups.

```typescript
const turn1 = await client.agents.run({ tag: 'production', message: 'Hello' });
const turn2 = await client.agents.run({
  tag: 'production',
  message: 'Follow-up question',
  threadId: turn1.threadId,
});
```

### Error handling

Agent calls throw exceptions (unlike `sendTrace` which returns result objects):

| Error class       | When it's thrown                                                                    |
| ----------------- | ----------------------------------------------------------------------------------- |
| `ValidationError` | Invalid input (empty message, missing tag/agentId)                                  |
| `NetworkError`    | HTTP failure (invalid API key, server error, timeout). Has a `statusCode` property. |

Always wrap agent calls in `try/catch`.

## Next steps

- Try the **basic-tracing** example for manual trace instrumentation
- Explore the **OpenAI plugin** (`trackOpenAI`) for automatic tracing of OpenAI API calls
- Check the **LangChain plugin** (`MentioraTracingLangChain`) for callback-based tracing
- Read the full [SDK documentation](https://github.com/mentiora-ai/mentiora-sdk)
