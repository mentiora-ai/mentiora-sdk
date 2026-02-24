"""
Mentiora SDK — OpenAI Integration Example

Demonstrates automatic tracing of OpenAI API calls using the Mentiora SDK.
Every call to `chat.completions.create` and `embeddings.create` is
automatically captured as a trace event, including input messages, model
responses, token usage, latency, and errors.

Usage:
    cp .env.example .env   # fill in your API keys
    pip install -r requirements.txt
    python main.py
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from mentiora import MentioraClient, MentioraConfig, TrackOpenAIOptions, track_openai
from mentiora.utils import uuid7
from openai import AsyncOpenAI

load_dotenv(override=False)

# ---------------------------------------------------------------------------
# 1. Validate environment variables
# ---------------------------------------------------------------------------

MENTIORA_API_KEY = os.getenv("MENTIORA_API_KEY")
MENTIORA_BASE_URL = os.getenv("MENTIORA_BASE_URL", "https://platform.mentiora.ai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not MENTIORA_API_KEY or MENTIORA_API_KEY == "your-api-key-here":
    print("Missing MENTIORA_API_KEY. Copy .env.example to .env and add your key.")
    sys.exit(1)

if not OPENAI_API_KEY or OPENAI_API_KEY == "your-openai-api-key-here":
    print("Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# 2. Create clients
# ---------------------------------------------------------------------------

# The MentioraClient sends trace data to the Mentiora platform.
mentiora_client = MentioraClient(
    MentioraConfig(
        api_key=MENTIORA_API_KEY,
        base_url=MENTIORA_BASE_URL,
    )
)

# A standard AsyncOpenAI client — nothing special here.
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# ---------------------------------------------------------------------------
# 3. Chat completion — single call
# ---------------------------------------------------------------------------


async def chat_completion() -> None:
    print("\n--- Chat Completion ---\n")

    # `track_openai` wraps the OpenAI client so that every API call is
    # automatically traced. It monkey-patches `chat.completions.create`
    # (and `embeddings.create`) in place, then returns the same client
    # reference. The original request/response flow is unchanged — your
    # code works exactly as before, but each call also sends a trace event
    # to Mentiora in the background.
    tracked_client = track_openai(
        openai_client,
        TrackOpenAIOptions(
            mentiora_client=mentiora_client,
            tags=["example", "openai-integration", "chat"],
            metadata={"environment": "example", "feature": "single-completion"},
        ),
    )

    response = await tracked_client.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant. Keep answers concise.",
            },
            {
                "role": "user",
                "content": "What are three benefits of observability in AI applications?",
            },
        ],
    )

    message = response.choices[0].message.content
    print(f"Assistant: {message}")
    print(f"Tokens: {response.usage.total_tokens if response.usage else 'N/A'}")


# ---------------------------------------------------------------------------
# 4. Multi-turn conversation
# ---------------------------------------------------------------------------


async def multi_turn_conversation() -> None:
    print("\n--- Multi-Turn Conversation ---\n")

    # Generate a shared thread_id so Mentiora groups all turns of this
    # conversation together. This makes it easy to view the full dialogue
    # in the Mentiora dashboard.
    thread_id = str(uuid7())
    print(f"Thread ID: {thread_id}\n")

    tracked_client = track_openai(
        openai_client,
        TrackOpenAIOptions(
            mentiora_client=mentiora_client,
            thread_id=thread_id,
            tags=["example", "openai-integration", "conversation"],
            metadata={"environment": "example", "conversation_type": "multi-turn"},
        ),
    )

    # Turn 1
    messages: list[dict[str, str]] = [
        {"role": "system", "content": "You are a knowledgeable AI assistant."},
        {"role": "user", "content": "What is distributed tracing?"},
    ]

    turn1 = await tracked_client.chat.completions.create(
        model="gpt-5-mini",
        messages=messages,
    )

    reply1 = turn1.choices[0].message.content or ""
    print("Turn 1 — User:     What is distributed tracing?")
    print(f"Turn 1 — Assistant: {reply1[:120]}...")

    # Turn 2 — build on the conversation context
    messages.append({"role": "assistant", "content": reply1})
    messages.append(
        {"role": "user", "content": "How does it apply to LLM-powered applications?"}
    )

    turn2 = await tracked_client.chat.completions.create(
        model="gpt-5-mini",
        messages=messages,
    )

    reply2 = turn2.choices[0].message.content or ""
    print("\nTurn 2 — User:     How does it apply to LLM-powered applications?")
    print(f"Turn 2 — Assistant: {reply2[:120]}...")

    # Turn 3 — follow-up question
    messages.append({"role": "assistant", "content": reply2})
    messages.append({"role": "user", "content": "Can you summarize in one sentence?"})

    turn3 = await tracked_client.chat.completions.create(
        model="gpt-5-mini",
        messages=messages,
    )

    reply3 = turn3.choices[0].message.content or ""
    print("\nTurn 3 — User:     Can you summarize in one sentence?")
    print(f"Turn 3 — Assistant: {reply3}")


# ---------------------------------------------------------------------------
# 5. Embeddings
# ---------------------------------------------------------------------------


async def embeddings() -> None:
    print("\n--- Embeddings ---\n")

    tracked_client = track_openai(
        openai_client,
        TrackOpenAIOptions(
            mentiora_client=mentiora_client,
            tags=["example", "openai-integration", "embeddings"],
            metadata={"environment": "example", "feature": "embeddings"},
        ),
    )

    # Single embedding
    single = await tracked_client.embeddings.create(
        model="text-embedding-3-small",
        input="Observability helps teams understand AI system behavior in production.",
    )

    print(f"Single embedding: {len(single.data[0].embedding)} dimensions")
    print(f"Tokens used: {single.usage.total_tokens if single.usage else 'N/A'}")

    # Batch embeddings — multiple inputs in one call
    batch = await tracked_client.embeddings.create(
        model="text-embedding-3-small",
        input=[
            "Tracing captures the full lifecycle of an AI request.",
            "Metrics reveal latency, token usage, and error rates.",
            "Logs provide detailed debugging information.",
        ],
    )

    print(
        f"\nBatch embeddings: {len(batch.data)} vectors, "
        f"{len(batch.data[0].embedding)} dimensions each"
    )
    print(f"Tokens used: {batch.usage.total_tokens if batch.usage else 'N/A'}")


# ---------------------------------------------------------------------------
# 6. Run all demos
# ---------------------------------------------------------------------------


async def main() -> None:
    print("Mentiora SDK — OpenAI Integration Example")
    print("==========================================")

    try:
        await chat_completion()
        await multi_turn_conversation()
        await embeddings()

        # Flush any pending traces before exiting so nothing is lost.
        await mentiora_client.tracing.flush_async()

        print("\n==========================================")
        print("Done! Check the Mentiora dashboard to view your traces.")
    except Exception as e:
        print(f"\nError running example: {e}")
        print("Make sure your API keys are valid and you have sufficient quota.")
        sys.exit(1)
    finally:
        await mentiora_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
