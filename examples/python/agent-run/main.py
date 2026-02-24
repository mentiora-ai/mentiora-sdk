"""Mentiora SDK — Agent Run Example

Demonstrates running custom agents via the Mentiora SDK.

This example covers:
  - Running an agent synchronously and asynchronously
  - Streaming agent responses in real-time (sync and async)
  - Multi-turn conversations using thread_id
  - Model overrides (custom model_id and model_params)
  - Error handling (ValidationError, NetworkError, AgentErrorEvent)
"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from mentiora import (
    AgentRunParams,
    MentioraClient,
    MentioraConfig,
    ModelParams,
    NetworkError,
    ValidationError,
)
from mentiora.agents.types import AgentErrorEvent

# ---------------------------------------------------------------------------
# Load .env from the same directory as this script
# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)


def create_client() -> MentioraClient:
    """Create and return a configured MentioraClient."""
    api_key = os.getenv("MENTIORA_API_KEY")
    if not api_key or api_key == "your-api-key-here":
        print(
            "Error: MENTIORA_API_KEY is not set.\n"
            "Copy .env.example to .env and add your API key."
        )
        sys.exit(1)

    return MentioraClient(
        MentioraConfig(
            api_key=api_key,
            base_url=os.getenv("MENTIORA_BASE_URL"),
        )
    )


# ---------------------------------------------------------------------------
# 1. Basic Agent Run (sync)
# ---------------------------------------------------------------------------
def basic_run_sync(client: MentioraClient) -> str:
    """Run an agent synchronously and return the threadId for multi-turn."""
    print("\n--- Basic Agent Run (sync) ---\n")

    result = client.agents.run(
        AgentRunParams(tag="production-3", message="What is our refund policy?")
    )

    print(f"Status:   {result.status}")
    print(f"Output:   {result.output}")
    print(f"Thread:   {result.thread_id}")
    print(f"Agent:    {result.agent_id} (rev {result.agent_revision})")

    if result.tool_calls:
        names = ", ".join(tc.name for tc in result.tool_calls)
        print(f"Tools:    {names}")

    if result.usage:
        print(f"Tokens:   {result.usage}")

    return result.thread_id


# ---------------------------------------------------------------------------
# 2. Basic Agent Run (async)
# ---------------------------------------------------------------------------
async def basic_run_async(client: MentioraClient) -> None:
    """Run an agent asynchronously."""
    print("\n--- Basic Agent Run (async) ---\n")

    result = await client.agents.run_async(
        AgentRunParams(tag="production-3", message="Summarize our shipping options.")
    )

    print(f"Status:   {result.status}")
    print(f"Output:   {result.output}")


# ---------------------------------------------------------------------------
# 3. Streaming — sync
# ---------------------------------------------------------------------------
def streaming_sync(client: MentioraClient) -> None:
    """Stream an agent response synchronously."""
    print("\n--- Streaming Agent Run (sync) ---\n")

    for event in client.agents.stream(
        AgentRunParams(
            tag="production-3",
            message="Explain our return process step by step.",
        )
    ):
        if event.type == "agent_resolved":
            print(f"Agent resolved: {event.agent_id} (rev {event.agent_revision})")
            print(f"Thread: {event.thread_id}\n")
        elif event.type == "output_text_delta":
            print(event.delta, end="", flush=True)
        elif event.type == "tool_call_result":
            print(f"\n[Tool: {event.name}]")
        elif event.type == "chat_completed":
            print(f"\n\nCompleted: status={event.status}")
        elif event.type == "error":
            print(f"\nAgent error: [{event.code}] {event.message}")


# ---------------------------------------------------------------------------
# 4. Streaming — async
# ---------------------------------------------------------------------------
async def streaming_async(client: MentioraClient) -> None:
    """Stream an agent response asynchronously."""
    print("\n--- Streaming Agent Run (async) ---\n")

    full_output = ""
    async for event in client.agents.stream_async(
        AgentRunParams(
            tag="production-3",
            message="What are your store hours?",
        )
    ):
        if event.type == "output_text_delta":
            print(event.delta, end="", flush=True)
            full_output += event.delta
        elif event.type == "chat_completed":
            print(f"\n\nCompleted: status={event.status}")
        elif event.type == "error":
            print(f"\nError: [{event.code}] {event.message}")

    print(f"Full output length: {len(full_output)} chars")


# ---------------------------------------------------------------------------
# 5. Multi-Turn Conversation
# ---------------------------------------------------------------------------
async def multi_turn_conversation(client: MentioraClient) -> None:
    """Demonstrate multi-turn conversations using thread_id."""
    print("\n--- Multi-Turn Conversation ---\n")

    # Turn 1
    turn1 = await client.agents.run_async(
        AgentRunParams(
            tag="production-3",
            message="Hi, I bought a laptop last week and it has a dead pixel.",
        )
    )
    print(f"Turn 1 — Agent: {turn1.output}")
    print(f"Thread: {turn1.thread_id}")

    # Turn 2 — pass thread_id to continue the conversation
    turn2 = await client.agents.run_async(
        AgentRunParams(
            tag="production-3",
            message="Yes, I would like to proceed with the return.",
            thread_id=turn1.thread_id,
        )
    )
    print(f"\nTurn 2 — Agent: {turn2.output}")
    print(f"Thread: {turn2.thread_id} (same as turn 1)")

    # Turn 3
    turn3 = await client.agents.run_async(
        AgentRunParams(
            tag="production-3",
            message="How long will the refund take?",
            thread_id=turn1.thread_id,
        )
    )
    print(f"\nTurn 3 — Agent: {turn3.output}")


# ---------------------------------------------------------------------------
# 6. Model Overrides
# ---------------------------------------------------------------------------
async def model_overrides(client: MentioraClient) -> None:
    """Override the agent's default model and parameters."""
    print("\n--- Model Overrides ---\n")

    result = await client.agents.run_async(
        AgentRunParams(
            tag="production-3",
            message="Write a one-sentence summary of our shipping policy.",
            model_id="gpt-5-mini",
            model_params=ModelParams(temperature=0.2, max_tokens=200),
            metadata={"source": "example-app", "feature": "model-overrides"},
        )
    )

    print(f"Output: {result.output}")
    print("Model override applied — response generated with custom parameters")


# ---------------------------------------------------------------------------
# 7. Error Handling
# ---------------------------------------------------------------------------
def error_handling(client: MentioraClient) -> None:
    """Demonstrate error handling patterns for agent calls."""
    print("\n--- Error Handling ---\n")

    # Agent calls raise exceptions (unlike tracing which returns result objects).

    # ValidationError: empty message
    try:
        client.agents.run(AgentRunParams(tag="production-3", message=""))
    except ValidationError as e:
        print(f"ValidationError caught: {e}")

    # ValidationError: missing tag and agent_id
    try:
        client.agents.run(AgentRunParams(message="Hello"))
    except ValidationError as e:
        print(f"ValidationError caught: {e}")

    # NetworkError: would be raised on HTTP failures
    print("NetworkError handling: wrap agent calls in try/except for HTTP failures")

    # Streaming error events: check isinstance(event, AgentErrorEvent)
    print(
        'Streaming errors: check event.type == "error" or isinstance(event, AgentErrorEvent)'
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
async def main() -> None:
    print("Mentiora SDK — Agent Run Example (Python)")
    print("=" * 50)

    client = create_client()
    try:
        # Sync operations
        basic_run_sync(client)
        streaming_sync(client)
        error_handling(client)

        # Async operations
        await basic_run_async(client)
        await streaming_async(client)
        await multi_turn_conversation(client)
        await model_overrides(client)

        print("\n" + "=" * 50)
        print("Done! Check the Mentiora dashboard to view agent traces.")
    except NetworkError as e:
        print(f"\nNetwork error: {e}")
        print("Make sure your API key is valid and the agent tag exists.")
        sys.exit(1)
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
