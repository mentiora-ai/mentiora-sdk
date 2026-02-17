# LangChain Integration — TypeScript

A copy-paste-ready example demonstrating automatic tracing of LangChain operations with the [Mentiora SDK](https://github.com/mentiora-ai/mentiora-sdk).

## What this example demonstrates

- Initializing `MentioraClient` and `ChatOpenAI` from environment variables
- Creating a `MentioraTracingLangChain` callback handler for automatic trace capture
- Running a **simple chain** using LCEL syntax (`ChatPromptTemplate | ChatOpenAI`)
- Running **sequential chains** where the output of one feeds into the next
- Grouping traces into a **multi-turn conversation** using a shared `threadId`
- **Flushing** pending traces before the process exits

## How the callback handler works

`MentioraTracingLangChain` is a LangChain `BaseCallbackHandler` that you pass in the `callbacks` array of any `.invoke()` call. It automatically intercepts lifecycle events — LLM start/end, chain start/end, tool start/end — and sends structured traces to the Mentiora platform. The handler manages UUID v7 trace/span IDs, tracks parent-child relationships, extracts token usage, and captures timing information. Tracing is non-intrusive: errors in the handler are caught and logged without affecting your application.

## Prerequisites

- **Node.js** >= 20
- A **Mentiora API key** (get one from the [Mentiora dashboard](https://platform.mentiora.ai))
- An **OpenAI API key** (used by LangChain's `ChatOpenAI`)

## Setup

1. **Install dependencies**

   ```bash
   cd examples/typescript/langchain-integration
   pnpm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and replace the placeholder values with your actual API keys.

## Run

```bash
pnpm start
```

Or in watch mode during development:

```bash
pnpm dev
```

## What gets traced automatically

When you pass the callback handler to a LangChain `.invoke()` call, the following events are captured as Mentiora traces:

| Event | Trace type | What's captured |
|---|---|---|
| LLM / Chat model call | `llm` | Messages, model name, token usage, duration |
| Chain execution | `custom` | Input variables, output, duration |
| Tool invocation | `tool` | Tool name, input args, output, duration |
| Retriever query | `custom` | Query text, retrieved documents |
| Errors (any level) | `error` | Error message, stack trace, original input |

All events include parent-child span relationships, so nested operations (e.g. a chain that calls an LLM that invokes a tool) appear as a tree in the Mentiora dashboard.

## Expected output

```
Mentiora SDK — LangChain Integration Example

--- Simple Chain (LCEL) ---
  Response: Observability for AI applications means ...

--- Sequential Chains ---
  Generating question about TypeScript...
  Question: What year was TypeScript first released ...?
  Answering the question...
  Answer: TypeScript was first released in ...

--- Multi-Turn Conversation ---
  Thread ID: 019...

  Turn 1: Asking about Python...
  Response: 1. Django  2. Flask  3. FastAPI

  Turn 2: Follow-up question...
  Response: I would recommend Flask for a beginner because ...

  Turn 3: Final follow-up...
  Response: A beginner should build a simple REST API ...

  All 3 turns share threadId: 019...

--- Done ---
All traces have been sent and flushed.
Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai
```

## Next steps

- Explore the **basic tracing** example for manual trace instrumentation
- Check the **OpenAI plugin** (`trackOpenAI`) for automatic tracing of direct OpenAI API calls
- Read the full [SDK documentation](https://github.com/mentiora-ai/mentiora-sdk)
