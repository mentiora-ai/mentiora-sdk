"""Mentiora Chatbot UI — Python / FastAPI backend."""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from mentiora import AgentRunParams, SSE_HEADERS, MentioraClient, MentioraConfig, stream_events
from pydantic import BaseModel

# Load .env from the same directory as this script
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

# ── SDK client ────────────────────────────────────────────────────────────────

api_key = os.environ.get("MENTIORA_API_KEY")
if not api_key:
    raise SystemExit(
        "Error: MENTIORA_API_KEY is required. Copy .env.example to .env and fill it in."
    )

config = MentioraConfig(
    api_key=api_key,
    base_url=os.environ.get("MENTIORA_BASE_URL"),
)
client = MentioraClient(config)

AGENT_TAG: str = os.environ.get("MENTIORA_AGENT_TAG", "production")
PORT: int = int(os.environ.get("PORT", "8000"))
DIST_DIR = Path(__file__).parent / "frontend" / "dist"

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Mentiora Chatbot")


class ChatRequest(BaseModel):
    message: str
    threadId: str | None = None  # noqa: N815 — matches JS camelCase field


# ── Routes ────────────────────────────────────────────────────────────────────


@app.post("/chat")
async def chat(req: ChatRequest) -> dict[str, object]:
    """
    Non-streaming agent run.
    Calls client.agents.run_async() and returns the full result at once.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    params = AgentRunParams(
        tag=AGENT_TAG,
        message=req.message,
        thread_id=req.threadId,
    )
    result = await client.agents.run_async(params)
    return {
        "output": result.output,
        "threadId": result.thread_id,
        "status": result.status,
    }


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """
    Streaming agent run.
    Proxies SDK stream events as Server-Sent Events.

    SSE event shapes:
      {"type":"delta",  "delta":"<text chunk>"}
      {"type":"done",   "threadId":"<id>","output":"<full>","status":"completed"}
      {"type":"error",  "message":"<reason>"}
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    params = AgentRunParams(
        tag=AGENT_TAG,
        message=req.message,
        thread_id=req.threadId,
    )
    events = client.agents.stream_async(params)
    return StreamingResponse(
        stream_events(events),
        media_type=SSE_HEADERS["Content-Type"],
        headers=SSE_HEADERS,
    )


# ── Static files (must be registered last — catch-all) ───────────────────────

if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Mentiora Chatbot (Python) — http://localhost:{PORT}")
    print(f"Agent tag : {AGENT_TAG}")
    print("Streaming : client.agents.stream_async() enabled via toggle")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
