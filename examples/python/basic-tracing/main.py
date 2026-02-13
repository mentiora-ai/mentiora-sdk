"""Basic Tracing — Python

Demonstrates manual trace instrumentation with the Mentiora SDK.

This example covers:
  - Initializing MentioraClient from environment variables
  - Sending LLM and tool traces (sync and async)
  - Linking parent-child spans within a trace
  - Grouping traces into a multi-turn conversation with thread_id
  - Inspecting SendTraceResult for success/error handling
  - Cleaning up resources on exit
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from uuid_utils import uuid7

from mentiora import MentioraClient, MentioraConfig, TraceEvent, UsageInfo

# ---------------------------------------------------------------------------
# Load .env from the same directory as this script
# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)


def _now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def create_client() -> MentioraClient:
    """Create and return a configured MentioraClient.

    Reads MENTIORA_API_KEY and MENTIORA_BASE_URL from environment variables.
    Exits with an error message if the API key is not set.
    """
    api_key = os.getenv("MENTIORA_API_KEY")
    if not api_key:
        print(
            "Error: MENTIORA_API_KEY is not set.\n"
            "Copy .env.example to .env and add your API key."
        )
        sys.exit(1)

    config = MentioraConfig(
        api_key=api_key,
        base_url=os.getenv("MENTIORA_BASE_URL"),
    )
    return MentioraClient(config)


# ---------------------------------------------------------------------------
# 1. Synchronous tracing
# ---------------------------------------------------------------------------
def send_sync_traces(client: MentioraClient) -> None:
    """Send an LLM trace and a child tool trace using the synchronous API."""

    print("\n--- Sending LLM Trace (sync) ---")

    # trace_id groups all spans that belong to a single logical request.
    # thread_id groups traces that belong to the same conversation.
    # Both must be UUID v7 — which embeds a timestamp for natural ordering.
    trace_id = str(uuid7())
    thread_id = str(uuid7())

    # Create a fully populated LLM trace event.
    llm_trace = TraceEvent(
        trace_id=trace_id,
        span_id=str(uuid7()),
        thread_id=thread_id,
        name="llm.chat_completion",
        type="llm",
        input={
            "prompt": "What is the capital of France?",
            "messages": [
                {"role": "user", "content": "What is the capital of France?"}
            ],
            "model": "gpt-4o",
        },
        output={
            "content": "The capital of France is Paris.",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "The capital of France is Paris.",
                    }
                }
            ],
        },
        start_time=_now_iso(),
        end_time=_now_iso(),
        duration_ms=1250,
        usage=UsageInfo(prompt_tokens=15, completion_tokens=8, total_tokens=23),
        model="gpt-4o",
        provider="openai",
        metadata={"environment": "example"},
        tags=["example", "basic-tracing"],
    )

    result = client.tracing.send_trace(llm_trace)
    print(f"  LLM trace sent: success={result.success}  traceId={result.trace_id}")

    # --- Child tool span ---
    # Setting parent_span_id links this span to the LLM span above,
    # forming a parent-child tree visible in the Mentiora dashboard.

    print("\n--- Sending Child Tool Trace (sync) ---")

    tool_trace = TraceEvent(
        trace_id=trace_id,
        span_id=str(uuid7()),
        parent_span_id=llm_trace.span_id,
        thread_id=thread_id,
        name="tool.search",
        type="tool",
        input={"tool": "search", "query": "France capital"},
        output={"result": "Paris"},
        start_time=_now_iso(),
        end_time=_now_iso(),
        duration_ms=450,
        metadata={"toolName": "search"},
        tags=["example", "basic-tracing"],
    )

    result = client.tracing.send_trace(tool_trace)
    print(f"  Tool trace sent: success={result.success}  spanId={result.span_id}")


# ---------------------------------------------------------------------------
# 2. Asynchronous tracing
# ---------------------------------------------------------------------------
async def send_async_traces(client: MentioraClient) -> None:
    """Send traces using the async API — ideal for async applications."""

    print("\n--- Sending Trace (async) ---")

    trace_id = str(uuid7())
    thread_id = str(uuid7())

    trace = TraceEvent(
        trace_id=trace_id,
        span_id=str(uuid7()),
        thread_id=thread_id,
        name="llm.chat_completion",
        type="llm",
        input={
            "prompt": "Explain quantum computing in one sentence.",
            "messages": [
                {
                    "role": "user",
                    "content": "Explain quantum computing in one sentence.",
                }
            ],
            "model": "gpt-4o",
        },
        output={
            "content": "Quantum computing uses qubits that can exist in superposition to solve certain problems exponentially faster than classical computers.",
        },
        start_time=_now_iso(),
        end_time=_now_iso(),
        duration_ms=980,
        usage=UsageInfo(prompt_tokens=12, completion_tokens=22, total_tokens=34),
        model="gpt-4o",
        provider="openai",
        metadata={},
        tags=["example", "basic-tracing"],
    )

    result = await client.tracing.send_trace_async(trace)
    print(f"  Async trace sent: success={result.success}  traceId={result.trace_id}")


# ---------------------------------------------------------------------------
# 3. Multi-turn conversation
# ---------------------------------------------------------------------------
async def send_multi_turn_conversation(client: MentioraClient) -> None:
    """Demonstrate a multi-turn conversation sharing a single thread_id.

    Each turn gets its own trace_id (it's a separate request), but the same
    thread_id ties them together into one conversation in the Mentiora UI.
    """

    print("\n--- Multi-Turn Conversation ---")

    # One thread_id for the entire conversation.
    thread_id = str(uuid7())

    # Turn 1
    turn1 = TraceEvent(
        trace_id=str(uuid7()),
        span_id=str(uuid7()),
        thread_id=thread_id,
        name="chat.turn",
        type="chat",
        input={
            "messages": [{"role": "user", "content": "Hello, how are you?"}],
        },
        output={
            "content": "I'm doing well, thank you! How can I help you today?",
        },
        start_time=_now_iso(),
        end_time=_now_iso(),
        duration_ms=1200,
        metadata={"turn": 1},
        tags=["example", "basic-tracing", "multi-turn"],
    )

    result1 = await client.tracing.send_trace_async(turn1)
    print(f"  Turn 1: success={result1.success}  traceId={result1.trace_id}")

    # Turn 2
    turn2 = TraceEvent(
        trace_id=str(uuid7()),
        span_id=str(uuid7()),
        thread_id=thread_id,
        name="chat.turn",
        type="chat",
        input={
            "messages": [
                {"role": "user", "content": "Hello, how are you?"},
                {
                    "role": "assistant",
                    "content": "I'm doing well, thank you! How can I help you today?",
                },
                {"role": "user", "content": "What's the weather like in Paris?"},
            ],
        },
        output={
            "content": "I don't have real-time weather data, but Paris typically enjoys mild weather in spring.",
        },
        start_time=_now_iso(),
        end_time=_now_iso(),
        duration_ms=1500,
        metadata={"turn": 2},
        tags=["example", "basic-tracing", "multi-turn"],
    )

    result2 = await client.tracing.send_trace_async(turn2)
    print(f"  Turn 2: success={result2.success}  traceId={result2.trace_id}")
    print(f"  Both turns share threadId: {thread_id}")


# ---------------------------------------------------------------------------
# 4. Error handling
# ---------------------------------------------------------------------------
def demonstrate_error_handling(client: MentioraClient) -> None:
    """Show how to inspect SendTraceResult for success and errors.

    send_trace never throws — it returns a result object with a `success`
    flag and an optional `error` message.
    """

    print("\n--- Error Handling ---")

    result = client.tracing.send_trace(
        TraceEvent(
            trace_id=str(uuid7()),
            span_id=str(uuid7()),
            name="llm.call",
            type="llm",
            start_time=_now_iso(),
            tags=["example", "basic-tracing"],
        )
    )

    if result.success:
        print(f"  Trace sent successfully (traceId: {result.trace_id})")
    else:
        print(f"  Trace failed: {result.error}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
async def main() -> None:
    print("Mentiora SDK — Basic Tracing Example (Python)")
    print("=" * 50)

    client = create_client()
    try:
        # Synchronous tracing
        send_sync_traces(client)

        # Asynchronous tracing
        await send_async_traces(client)

        # Multi-turn conversation
        await send_multi_turn_conversation(client)

        # Error handling pattern
        demonstrate_error_handling(client)

        # Flush any pending traces before exiting
        await client.tracing.flush_async()

        print("\n--- Done ---")
        print(
            "All traces have been sent and flushed.\n"
            "Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai"
        )
    finally:
        # Always close the client to release HTTP connections.
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
