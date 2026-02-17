# Basic Tracing — TypeScript

A copy-paste-ready example demonstrating manual trace instrumentation with the [Mentiora SDK](https://github.com/mentiora-ai/mentiora-sdk).

## What this example demonstrates

- Initializing `MentioraClient` from environment variables
- Sending an **LLM trace** with all available fields (input, output, usage, model, provider, metadata, tags)
- Creating **parent-child span relationships** (an LLM span with a nested tool span)
- Grouping multiple traces into a **multi-turn conversation** using a shared `threadId`
- Inspecting `SendTraceResult` for success/error handling
- **Flushing** pending traces before the process exits

## Prerequisites

- **Node.js** >= 20
- A **Mentiora API key** (get one from the [Mentiora dashboard](https://platform.mentiora.ai))

## Setup

1. **Install dependencies**

   ```bash
   cd examples/typescript/basic-tracing
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
Mentiora SDK — Basic Tracing Example

--- Sending LLM Trace ---
  LLM trace sent successfully (traceId: 019…)

--- Sending Child Tool Trace ---
  Tool trace sent successfully (spanId: 019…)

--- Multi-Turn Conversation ---
  Turn 1: sent (traceId: 019…)
  Turn 2: sent (traceId: 019…)
  Both turns share threadId: 019…

--- Done ---
All traces have been sent and flushed.
Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai
```

## Key concepts

### TraceEvent fields

| Field | Description |
|---|---|
| `traceId` | Groups all spans that belong to a single logical request |
| `spanId` | Uniquely identifies one span (step) within a trace |
| `parentSpanId` | Links a child span to its parent, forming a tree |
| `threadId` | Groups traces belonging to the same conversation |
| `name` | Human-readable span name (e.g. `llm.chat_completion`) |
| `type` | One of `llm`, `tool`, `chat`, `error`, `custom` |
| `input` / `output` | Arbitrary data — prompts, completions, tool args/results |
| `startTime` / `endTime` | Timestamps (`Date` or ISO 8601 string) |
| `durationMs` | Duration in milliseconds |
| `usage` | Token counts: `prompt_tokens`, `completion_tokens`, `total_tokens` |
| `model` / `provider` | Model name and provider (e.g. `gpt-4o` / `openai`) |
| `metadata` | Free-form key-value pairs for custom data |
| `tags` | String array for filtering and grouping |

### UUID v7

All IDs (`traceId`, `spanId`, `threadId`) use [UUID v7](https://www.ietf.org/rfc/rfc9562.html), which encodes a millisecond timestamp. This means IDs are naturally time-ordered — useful for sorting and debugging.

### threadId — Conversation grouping

A `threadId` ties multiple independent requests (each with its own `traceId`) into a single conversation. In the Mentiora UI you can view the entire conversation history by filtering on `threadId`.

### Parent-child spans

Set `parentSpanId` on a child span to the `spanId` of its parent. The Mentiora UI renders these as a nested tree so you can trace the full execution flow of a request — e.g. an LLM call that triggers a tool invocation.

## Next steps

- Explore the **OpenAI plugin** (`trackOpenAI`) for automatic tracing of OpenAI API calls
- Check the **LangChain plugin** (`MentioraTracingLangChain`) for callback-based tracing
- Read the full [SDK documentation](https://github.com/mentiora-ai/mentiora-sdk)
