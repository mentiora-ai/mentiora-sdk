# LangChain Integration — Python

Automatic tracing of LangChain operations using the Mentiora SDK callback handler.

## What this example demonstrates

- Setting up `MentioraClient` and `ChatOpenAI` from environment variables
- Creating a `MentioraTracingLangChain` callback handler for automatic tracing
- Running a simple **LCEL chain** (`prompt | llm`) with tracing
- **Sequential chains** — piping the output of one chain into another
- **Tool tracing** using the `@tool` decorator
- **Multi-turn conversations** linked by a shared `thread_id` (UUID v7)
- Flushing pending traces and closing the client on exit

## How the callback handler works

`MentioraTracingLangChain` is a LangChain `AsyncCallbackHandler` that you pass into any `ainvoke`, `abatch`, or `astream` call via the `callbacks` config. It hooks into LangChain's lifecycle events (`on_chain_start`, `on_llm_end`, `on_tool_start`, etc.) and automatically sends a trace event to the Mentiora platform for every operation. Your application code is completely unaffected — the handler runs in the background and never raises exceptions.

## Prerequisites

- **Python** >= 3.11
- A **Mentiora account** with an API key — see the [Authentication guide](https://docs.mentiora.ai/authentication)
- An **OpenAI API key** with access to `gpt-5-mini`

## Setup

1. **Create a virtual environment and install dependencies**

   ```bash
   cd examples/python/langchain-integration
   uv venv
   source .venv/bin/activate   # On Windows: .venv\Scripts\activate
   uv pip install -r requirements.txt
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and replace the placeholder values with your actual API keys:

   ```env
   MENTIORA_API_KEY=mk_...
   OPENAI_API_KEY=sk-...
   ```

## Run

```bash
python main.py
```

## What gets traced automatically

Each LangChain operation generates a trace event containing:

- **Input** — the prompt template variables and rendered messages
- **Output** — the model's response content
- **Token usage** — prompt, completion, and total tokens
- **Model** — the model used (e.g. `gpt-5-mini`)
- **Latency** — start time, end time, and duration in milliseconds
- **Errors** — full error details if any step fails
- **Parent-child spans** — LCEL chains automatically create nested spans (chain → LLM)

## Expected output

```
Mentiora SDK — LangChain Integration Example
==============================================

--- Simple Chain ---
  Result: Hello, World! It's great to meet you!

--- Sequential Chains ---
  Question: What year was Python first released?
  Answer:   Python was first released in 1991.

--- Tool Tracing ---
  Tool result: 9 words

--- Multi-Turn Conversation ---
  Turn 1: One interesting topic is how neural networks learn...
  Turn 2: A fascinating fact is that GPT-3 has 175 billion parameters...
  Turn 3: Neural networks like GPT-3 use billions of parameters to learn...
  All turns share thread_id: 019…

--- Flushing Traces ---
  All traces flushed successfully.

--- Done ---
Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai
```

## LCEL and the `@tool` decorator

This example uses **LangChain Expression Language (LCEL)** throughout. LCEL lets you compose chains with the pipe operator (`prompt | llm`), and each step in the chain is automatically traced when a callback handler is provided.

The `@tool` decorator from `langchain_core.tools` turns any Python function into a LangChain-compatible tool. When invoked with the callback handler, the tool's input, output, and execution time are captured as a trace event of type `tool`.

## Next steps

- Explore the **OpenAI plugin** (`track_openai`) for direct OpenAI API tracing
- Try the **basic tracing** example for full manual control over trace events
- Read the full [SDK documentation](https://docs.mentiora.ai)
