# OpenAI Integration — TypeScript

Automatic tracing of OpenAI API calls using the Mentiora SDK.

## What this example demonstrates

- Setting up `MentioraClient` and `OpenAI` clients from environment variables
- Wrapping the OpenAI client with `trackOpenAI` for automatic tracing
- Single chat completion with tracing
- Multi-turn conversations linked by a shared `threadId`
- Single and batch embedding calls
- Flushing pending traces before exit

## How `trackOpenAI` works

`trackOpenAI(openaiClient, options)` monkey-patches the OpenAI client's `chat.completions.create` method so that every call is automatically intercepted. Before and after each API call, the plugin captures the request, response, token usage, latency, and any errors, then sends a trace event to the Mentiora platform in the background. The original request/response flow is completely unchanged — your code works exactly as before.

## Prerequisites

- **Node.js** >= 20.0.0
- A **Mentiora account** with an API key — see the [Authentication guide](https://docs.mentiora.ai/authentication)
- An **OpenAI API key** with access to `gpt-5-mini` and `text-embedding-3-small`

## Setup

1.  Install dependencies:

        pnpm install

2.  Copy and fill in your API keys:

        cp .env.example .env

3.  Edit `.env` with your real keys:

        MENTIORA_API_KEY=mk_...
        MENTIORA_BASE_URL=https://platform.mentiora.ai
        OPENAI_API_KEY=sk-...

## Run

    pnpm start

## What gets traced automatically

Each OpenAI API call generates a trace event containing:

- **Input messages** -- the full prompt sent to the model
- **Output response** -- the assistant's reply (or tool calls)
- **Token usage** -- prompt, completion, and total tokens
- **Model** -- the model used (e.g. `gpt-5-mini`)
- **Latency** -- start time, end time, and duration in milliseconds
- **Errors** -- full error details if the API call fails
- **Timestamps** -- ISO 8601 start/end times for each call

## Expected output

    Mentiora SDK -- OpenAI Integration Example
    ==========================================

    --- Chat Completion ---

    Assistant: 1. Better debugging... 2. Cost optimization... 3. Quality monitoring...
    Tokens: 150

    --- Multi-Turn Conversation ---

    Thread ID: 01936f2a-...
    Turn 1 -- User:     What is distributed tracing?
    Turn 1 -- Assistant: Distributed tracing is a method...
    Turn 2 -- User:     How does it apply to LLM-powered applications?
    Turn 2 -- Assistant: In LLM-powered applications...
    Turn 3 -- User:     Can you summarize in one sentence?
    Turn 3 -- Assistant: Distributed tracing tracks...

    --- Embeddings ---

    Single embedding: 1536 dimensions
    Tokens used: 11
    Batch embeddings: 3 vectors, 1536 dimensions each
    Tokens used: 27

    ==========================================
    Done! Check the Mentiora dashboard to view your traces.

## Multi-turn conversation tracking

When you pass a `threadId` to `trackOpenAI`, all API calls made through that wrapped client share the same thread identifier. In the Mentiora dashboard, you can filter by thread ID to see the complete conversation flow, including each turn's messages, responses, token usage, and timing. This is useful for debugging multi-step agent workflows or chatbot interactions.

## Documentation

For full SDK documentation, visit the [Mentiora SDK docs](https://docs.mentiora.ai).
