# Basic Tracing — Python

A copy-paste-ready example demonstrating manual trace instrumentation with the [Mentiora SDK](https://github.com/mentiora-ai/mentiora-sdk).

## What this example demonstrates

- Initializing `MentioraClient` from environment variables
- Sending an **LLM trace** with all available fields (input, output, usage, model, provider, metadata, tags)
- Creating **parent-child span relationships** (an LLM span with a nested tool span)
- Sending traces **synchronously** (`send_trace`) and **asynchronously** (`send_trace_async`)
- Grouping multiple traces into a **multi-turn conversation** using a shared `thread_id`
- Inspecting `SendTraceResult` for success/error handling
- **Flushing** pending traces and closing the client before the process exits

## Prerequisites

- **Python** >= 3.11
- A **Mentiora API key** (get one from the [Mentiora dashboard](https://platform.mentiora.ai))

## Setup

1. **Create a virtual environment**

   ```bash
   cd examples/python/basic-tracing
   uv venv
   source .venv/bin/activate   # macOS / Linux
   # .venv\Scripts\activate    # Windows
   ```

2. **Install dependencies**

   ```bash
   uv pip install -r requirements.txt
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and replace `your-api-key-here` with your actual API key.

## Run

```bash
python main.py
```

## Expected output

```
Mentiora SDK — Basic Tracing Example (Python)
==================================================

--- Sending LLM Trace (sync) ---
  LLM trace sent: success=True  traceId=019…

--- Sending Child Tool Trace (sync) ---
  Tool trace sent: success=True  spanId=019…

--- Sending Trace (async) ---
  Async trace sent: success=True  traceId=019…

--- Multi-Turn Conversation ---
  Turn 1: success=True  traceId=019…
  Turn 2: success=True  traceId=019…
  Both turns share threadId: 019…

--- Error Handling ---
  Trace sent successfully (traceId: 019…)

--- Done ---
All traces have been sent and flushed.
Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai
```

## Key concepts

### TraceEvent fields

| Field | Description |
|---|---|
| `trace_id` | Groups all spans that belong to a single logical request |
| `span_id` | Uniquely identifies one span (step) within a trace |
| `parent_span_id` | Links a child span to its parent, forming a tree |
| `thread_id` | Groups traces belonging to the same conversation |
| `name` | Human-readable span name (e.g. `llm.chat_completion`) |
| `type` | One of `llm`, `tool`, `chat`, `error`, `custom` |
| `input` / `output` | Arbitrary data — prompts, completions, tool args/results |
| `start_time` / `end_time` | Timestamps (`datetime` or ISO 8601 string) |
| `duration_ms` | Duration in milliseconds |
| `usage` | Token counts: `prompt_tokens`, `completion_tokens`, `total_tokens` |
| `model` / `provider` | Model name and provider (e.g. `gpt-4o` / `openai`) |
| `metadata` | Free-form key-value pairs for custom data |
| `tags` | String list for filtering and grouping |

### UUID v7

All IDs (`trace_id`, `span_id`, `thread_id`) use [UUID v7](https://www.ietf.org/rfc/rfc9562.html), which encodes a millisecond timestamp. This means IDs are naturally time-ordered — useful for sorting and debugging.

### thread_id — Conversation grouping

A `thread_id` ties multiple independent requests (each with its own `trace_id`) into a single conversation. In the Mentiora UI you can view the entire conversation history by filtering on `thread_id`.

### Parent-child spans

Set `parent_span_id` on a child span to the `span_id` of its parent. The Mentiora UI renders these as a nested tree so you can trace the full execution flow of a request — e.g. an LLM call that triggers a tool invocation.

### Sync vs Async

The SDK provides both synchronous and asynchronous methods for sending traces:

- **`send_trace()`** — Blocking call. Use this in synchronous code or when you want to ensure the trace is sent before continuing.
- **`send_trace_async()`** — Non-blocking coroutine. Use this in `async` applications (FastAPI, aiohttp, etc.) to avoid blocking the event loop.

Both methods return a `SendTraceResult` with the same fields. Choose based on whether your application is sync or async — the traced data is identical either way.

## Next steps

- Explore the **OpenAI plugin** (`track_openai`) for automatic tracing of OpenAI API calls
- Check the **LangChain plugin** (`MentioraTracingLangChain`) for callback-based tracing
- Read the full [SDK documentation](https://github.com/mentiora-ai/mentiora-sdk)
