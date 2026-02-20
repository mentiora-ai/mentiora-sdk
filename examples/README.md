# Mentiora SDK Examples

Production-ready example applications demonstrating how to use the Mentiora SDK for AI observability and tracing.

## Prerequisites

- **Node.js** >= 20.0.0 (for TypeScript examples)
- **Python** >= 3.11 (for Python examples)
- A **Mentiora account** with an API key — see the [Authentication guide](https://docs.mentiora.ai/authentication)
- An **OpenAI API key** (for OpenAI and LangChain integration examples)

> **Note:** The Chatbot UI examples only require `MENTIORA_API_KEY` — no additional API keys needed.

## Examples

| Pattern | TypeScript | Python | Description |
|---------|-----------|--------|-------------|
| **Basic Tracing** | [`typescript/basic-tracing`](./typescript/basic-tracing/) | [`python/basic-tracing`](./python/basic-tracing/) | Manual trace instrumentation with full control over trace events |
| **OpenAI Integration** | [`typescript/openai-integration`](./typescript/openai-integration/) | [`python/openai-integration`](./python/openai-integration/) | Automatic tracing of OpenAI API calls via `trackOpenAI`/`track_openai` |
| **LangChain Integration** | [`typescript/langchain-integration`](./typescript/langchain-integration/) | [`python/langchain-integration`](./python/langchain-integration/) | Automatic tracing of LangChain operations via callback handler |
| **Agent Run** | [`typescript/agent-run`](./typescript/agent-run/) | [`python/agent-run`](./python/agent-run/) | Run custom agents synchronously and with real-time streaming |
| **Chatbot UI** | [`typescript/chatbot-ui`](./typescript/chatbot-ui/) | [`python/chatbot-ui`](./python/chatbot-ui/) | React chat app (Next.js / FastAPI+Vite) with streaming toggle and multi-turn conversations |

## Environment Setup

Each example includes a `.env.example` file. Copy it to `.env` and fill in your keys:

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Required For | Description |
|----------|-------------|-------------|
| `MENTIORA_API_KEY` | All examples | Your Mentiora API key — see [Authentication](https://docs.mentiora.ai/authentication) |
| `MENTIORA_BASE_URL` | All examples | Mentiora platform URL (defaults to `https://platform.mentiora.ai`) |
| `OPENAI_API_KEY` | OpenAI & LangChain examples | Your OpenAI API key |

## Running an Example

### TypeScript

```bash
cd examples/typescript/<example-name>
pnpm install
cp .env.example .env   # Then edit .env with your keys
pnpm start
```

### Python

```bash
cd examples/python/<example-name>
uv venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
cp .env.example .env   # Then edit .env with your keys
python main.py
```

## Documentation

For full SDK documentation, visit the [Mentiora SDK docs](https://docs.mentiora.ai).
