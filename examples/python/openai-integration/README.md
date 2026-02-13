# OpenAI Integration — Python

Automatic tracing of OpenAI API calls using the Mentiora SDK.

## What this example demonstrates

- Setting up `MentioraClient` and `AsyncOpenAI` clients from environment variables
- Wrapping the OpenAI client with `track_openai` for automatic tracing
- Single chat completion with tracing
- Multi-turn conversations linked by a shared `thread_id`
- Single and batch embedding calls
- Flushing pending traces and closing the client on exit

## How `track_openai` works

`track_openai(openai_client, options)` monkey-patches the OpenAI client's `chat.completions.create` and `embeddings.create` methods so that every call is automatically intercepted. Before and after each API call, the plugin captures the request, response, token usage, latency, and any errors, then sends a trace event to the Mentiora platform in the background. The original request/response flow is completely unchanged — your code works exactly as before.

## Prerequisites

- **Python** >= 3.11
- A **Mentiora account** with an API key — see the [Authentication guide](https://docs.mentiora.ai/authentication)
- An **OpenAI API key** with access to `gpt-4o-mini` and `text-embedding-3-small`

## Setup

```bash
# Create a virtual environment
uv venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate

# Install dependencies
uv pip install -r requirements.txt

# Copy and fill in your API keys
cp .env.example .env
```

Edit `.env` with your real keys:

```env
MENTIORA_API_KEY=mk_...
MENTIORA_BASE_URL=https://platform.mentiora.ai
OPENAI_API_KEY=sk-...
```

## Run

```bash
python main.py
```

## What gets traced automatically

Each OpenAI API call generates a trace event containing:

- **Input messages** — the full prompt sent to the model
- **Output response** — the assistant's reply (or tool calls)
- **Token usage** — prompt, completion, and total tokens
- **Model** — the model used (e.g. `gpt-4o-mini`)
- **Latency** — start time, end time, and duration in milliseconds
- **Errors** — full error details if the API call fails
- **Timestamps** — ISO 8601 start/end times for each call

## Expected output

```text
Mentiora SDK — OpenAI Integration Example
==========================================

--- Chat Completion ---

Assistant: 1. **Performance monitoring** — Track latency, token usage, ...
Tokens: 142

--- Multi-Turn Conversation ---

Thread ID: 019563a1-...

Turn 1 — User:     What is distributed tracing?
Turn 1 — Assistant: Distributed tracing is a method for tracking requests...

Turn 2 — User:     How does it apply to LLM-powered applications?
Turn 2 — Assistant: In LLM-powered applications, distributed tracing...

Turn 3 — User:     Can you summarize in one sentence?
Turn 3 — Assistant: Distributed tracing tracks the full lifecycle of AI...

--- Embeddings ---

Single embedding: 1536 dimensions
Tokens used: 12

Batch embeddings: 3 vectors, 1536 dimensions each
Tokens used: 24

==========================================
Done! Check the Mentiora dashboard to view your traces.
```

## Sync vs async clients

`track_openai` supports both the synchronous `OpenAI` client and the asynchronous `AsyncOpenAI` client. This example uses `AsyncOpenAI` (the recommended approach for production applications), but the tracing wrapper works identically with the sync client:

```python
from openai import OpenAI

sync_client = OpenAI(api_key=OPENAI_API_KEY)
tracked = track_openai(sync_client, TrackOpenAIOptions(mentiora_client=mentiora_client))
response = tracked.chat.completions.create(model='gpt-4o-mini', messages=[...])
```

## Documentation

For full SDK documentation, visit the [Mentiora SDK docs](https://docs.mentiora.ai).
