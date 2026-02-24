# Mentiora Chatbot UI — TypeScript

A browser-based chatbot powered by the Mentiora agent SDK.
Demonstrates both synchronous and streaming agent execution using Next.js and React.

## Features

- Toggle between **streaming** and **non-streaming** mode at runtime
- Multi-turn conversations (thread ID preserved across messages)
- Modern React UI with Tailwind CSS
- Built with [Next.js 15](https://nextjs.org) (App Router) + React 19

## Quick Start

```bash
cd examples/typescript/chatbot-ui

# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MENTIORA_API_KEY and MENTIORA_AGENT_TAG

# 3. Start the dev server
pnpm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable             | Required | Default              | Description           |
| -------------------- | -------- | -------------------- | --------------------- |
| `MENTIORA_API_KEY`   | Yes      | —                    | Mentiora API key      |
| `MENTIORA_AGENT_TAG` | No       | `production`         | Agent tag to invoke   |
| `MENTIORA_BASE_URL`  | No       | platform.mentiora.ai | Override platform URL |

## How It Works

### Non-streaming (`POST /api/chat`)

```typescript
const result = await client.agents.run({ tag, message, threadId });
// Returns: { output, threadId, status }
```

The server waits for the full response and returns it in one JSON payload.

### Streaming (`POST /api/chat/stream`)

```typescript
for await (const event of client.agents.stream({ tag, message, threadId })) {
  if (event.type === 'output_text_delta') {
    /* stream chunk to browser */
  }
  if (event.type === 'chat_completed') {
    /* final threadId + status  */
  }
}
```

The server proxies SDK stream events as SSE. The browser reads them via `fetch`
and renders each text delta immediately as it arrives.

## Project Structure

```
app/
├── layout.tsx            — Root layout with metadata
├── globals.css           — Tailwind imports + keyframes
├── page.tsx              — Chat UI (React client component)
└── api/chat/
    ├── route.ts          — POST /api/chat (non-streaming)
    └── stream/
        └── route.ts      — POST /api/chat/stream (SSE)
lib/
└── mentiora.ts           — SDK client singleton
```
