# Mentiora Chatbot UI — Python

A browser-based chatbot powered by the Mentiora agent SDK.
Demonstrates both synchronous and streaming agent execution using FastAPI and React.

## Features

- Toggle between **streaming** and **non-streaming** mode at runtime
- Multi-turn conversations (thread ID preserved across messages)
- Modern React UI with Tailwind CSS
- Built with [FastAPI](https://fastapi.tiangolo.com) + [Vite](https://vite.dev) + React 19

## Quick Start

```bash
cd examples/python/chatbot-ui

# 1. Build the frontend
cd frontend
npm install
npm run build
cd ..

# 2. Create virtual environment and install dependencies
uv venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — set MENTIORA_API_KEY and MENTIORA_AGENT_TAG

# 4. Start the server
python app.py
```

Open http://localhost:8000 in your browser.

### Development Mode

For frontend development with hot reload:

```bash
# Terminal 1 — backend
python app.py

# Terminal 2 — frontend dev server (proxies /chat to backend)
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MENTIORA_API_KEY` | Yes | — | Mentiora API key |
| `MENTIORA_AGENT_TAG` | No | `production` | Agent tag to invoke |
| `MENTIORA_BASE_URL` | No | platform.mentiora.ai | Override platform URL |
| `PORT` | No | `8000` | HTTP server port |

## How It Works

### Non-streaming (`POST /chat`)

```python
result = await client.agents.run_async(tag=tag, message=message, thread_id=thread_id)
# Returns: { output, threadId, status }
```

The server awaits the full response and returns it as JSON.

### Streaming (`POST /chat/stream`)

```python
async for event in client.agents.stream_async(tag=tag, message=message):
    if event.type == 'output_text_delta':  # stream chunk to browser
        ...
    if event.type == 'chat_completed':     # final threadId + status
        ...
```

The server proxies SDK stream events as SSE. The browser reads them via `fetch`
and renders each text delta immediately as it arrives.

## Project Structure

```
app.py              — FastAPI server: /chat + /chat/stream + serves frontend
frontend/
├── src/
│   ├── App.tsx     — Chat UI (React component)
│   ├── index.css   — Tailwind imports + keyframes
│   └── main.tsx    — React entry point
├── index.html      — HTML entry point
├── vite.config.ts  — Vite config with proxy
└── package.json    — Frontend dependencies
```
