"""Mentiora SDK — LangChain Integration Example.

Demonstrates automatic tracing of LangChain operations using the
MentioraTracingLangChain callback handler. All LLM calls, chain executions,
and tool invocations are captured as trace events on the Mentiora platform.

Usage:
    cp .env.example .env   # fill in your API keys
    pip install -r requirements.txt
    python main.py
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from mentiora import (
    MentioraClient,
    MentioraConfig,
    MentioraTracingLangChain,
    MentioraTracingLangChainOptions,
)
from uuid_utils import uuid7

load_dotenv(override=False)


# ---------------------------------------------------------------------------
# 1. Client setup
# ---------------------------------------------------------------------------


def create_clients() -> tuple[MentioraClient, ChatOpenAI]:
    """Initialize the Mentiora and OpenAI clients from environment variables."""
    mentiora_api_key = os.getenv('MENTIORA_API_KEY')
    openai_api_key = os.getenv('OPENAI_API_KEY')

    if not mentiora_api_key or mentiora_api_key == 'your-api-key-here':
        print('Error: MENTIORA_API_KEY is not set. Copy .env.example to .env and add your key.')
        sys.exit(1)

    if not openai_api_key or openai_api_key == 'your-openai-api-key-here':
        print('Error: OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.')
        sys.exit(1)

    config = MentioraConfig(
        api_key=mentiora_api_key,
        base_url=os.getenv('MENTIORA_BASE_URL'),
    )
    mentiora_client = MentioraClient(config)

    llm = ChatOpenAI(
        model='gpt-4o-mini',
        openai_api_key=openai_api_key,
    )

    return mentiora_client, llm


# ---------------------------------------------------------------------------
# 2. Simple chain — LCEL prompt | llm
# ---------------------------------------------------------------------------


async def run_simple_chain(mentiora_client: MentioraClient, llm: ChatOpenAI) -> None:
    """Run a single LCEL chain with Mentiora tracing.

    LangChain Expression Language (LCEL) lets you compose chains with the pipe
    operator: ``prompt | llm``. Pass the callback handler in the invocation
    config to trace every step automatically.
    """
    print('\n--- Simple Chain ---')

    # Create a callback handler — this is the only Mentiora-specific step.
    # Every LangChain operation invoked with this callback is automatically
    # traced: chain start/end, LLM calls, token usage, latency, and errors.
    callback = MentioraTracingLangChain(
        MentioraTracingLangChainOptions(
            mentiora_client=mentiora_client,
            tags=['example', 'langchain-integration', 'simple-chain'],
            metadata={'environment': 'example'},
        )
    )

    prompt = ChatPromptTemplate.from_template('Say hello to {name} in one sentence.')
    chain = prompt | llm

    try:
        result = await chain.ainvoke({'name': 'World'}, {'callbacks': [callback]})
        print(f'  Result: {result.content}')
    except Exception as e:
        print(f'  Error: {type(e).__name__}: {e}')


# ---------------------------------------------------------------------------
# 3. Sequential chains — piping output from one chain into another
# ---------------------------------------------------------------------------


async def run_sequential_chains(mentiora_client: MentioraClient, llm: ChatOpenAI) -> None:
    """Demonstrate two LCEL chains executed in sequence.

    The output of the first chain (a generated question) is fed as input to
    the second chain (an answer). Both chains share the same callback handler
    so they appear as related traces in the Mentiora dashboard.
    """
    print('\n--- Sequential Chains ---')

    callback = MentioraTracingLangChain(
        MentioraTracingLangChainOptions(
            mentiora_client=mentiora_client,
            tags=['example', 'langchain-integration', 'sequential'],
        )
    )

    prompt1 = ChatPromptTemplate.from_template('Generate a short trivia question about {topic}.')
    chain1 = prompt1 | llm

    prompt2 = ChatPromptTemplate.from_template('Answer this question concisely: {question}')
    chain2 = prompt2 | llm

    try:
        result1 = await chain1.ainvoke(
            {'topic': 'Python programming'},
            {'callbacks': [callback]},
        )
        result2 = await chain2.ainvoke(
            {'question': result1.content},
            {'callbacks': [callback]},
        )
        print(f'  Question: {result1.content}')
        print(f'  Answer:   {result2.content[:120]}')
    except Exception as e:
        print(f'  Error: {type(e).__name__}: {e}')


# ---------------------------------------------------------------------------
# 4. Tool tracing — @tool decorator
# ---------------------------------------------------------------------------


@tool
def word_count(text: str) -> str:
    """Count the number of words in the given text."""
    count = len(text.split())
    return f'{count} words'


async def run_tool_tracing(mentiora_client: MentioraClient) -> None:
    """Trace a LangChain @tool invocation.

    LangChain tools decorated with ``@tool`` integrate natively with the
    callback system. The callback handler captures the tool name, input,
    output, and latency.
    """
    print('\n--- Tool Tracing ---')

    callback = MentioraTracingLangChain(
        MentioraTracingLangChainOptions(
            mentiora_client=mentiora_client,
            tags=['example', 'langchain-integration', 'tool'],
        )
    )

    try:
        result = await word_count.ainvoke(
            'The quick brown fox jumps over the lazy dog',
            {'callbacks': [callback]},
        )
        print(f'  Tool result: {result}')
    except Exception as e:
        print(f'  Error: {type(e).__name__}: {e}')


# ---------------------------------------------------------------------------
# 5. Multi-turn conversation — shared thread_id across invocations
# ---------------------------------------------------------------------------


async def run_multi_turn_conversation(
    mentiora_client: MentioraClient, llm: ChatOpenAI
) -> None:
    """Demonstrate multi-turn conversation tracing with a shared thread_id.

    A ``thread_id`` groups traces that belong to the same conversation. In the
    Mentiora dashboard you can filter by thread_id to see the full conversation
    history across multiple requests.
    """
    print('\n--- Multi-Turn Conversation ---')

    # Generate a UUID v7 thread_id to link all turns together.
    thread_id = str(uuid7())

    callback = MentioraTracingLangChain(
        MentioraTracingLangChainOptions(
            mentiora_client=mentiora_client,
            thread_id=thread_id,
            tags=['example', 'langchain-integration', 'conversation'],
            metadata={'conversation_type': 'multi-turn'},
        )
    )

    try:
        # Turn 1: suggest a topic
        prompt1 = ChatPromptTemplate.from_template(
            'Suggest one interesting topic about {subject} in a single sentence.'
        )
        chain1 = prompt1 | llm
        result1 = await chain1.ainvoke(
            {'subject': 'artificial intelligence'},
            {'callbacks': [callback]},
        )
        print(f'  Turn 1: {result1.content}')

        # Turn 2: expand on the topic
        prompt2 = ChatPromptTemplate.from_template(
            'Tell me one fascinating fact about: {topic}'
        )
        chain2 = prompt2 | llm
        result2 = await chain2.ainvoke(
            {'topic': result1.content},
            {'callbacks': [callback]},
        )
        print(f'  Turn 2: {result2.content[:120]}')

        # Turn 3: summarize
        prompt3 = ChatPromptTemplate.from_template(
            'Summarize this in one sentence: {text}'
        )
        chain3 = prompt3 | llm
        result3 = await chain3.ainvoke(
            {'text': result2.content},
            {'callbacks': [callback]},
        )
        print(f'  Turn 3: {result3.content}')

        print(f'  All turns share thread_id: {thread_id}')
    except Exception as e:
        print(f'  Error: {type(e).__name__}: {e}')


# ---------------------------------------------------------------------------
# 6. Main — run all examples, then flush and clean up
# ---------------------------------------------------------------------------


async def main() -> None:
    """Run all LangChain integration examples."""
    print('Mentiora SDK — LangChain Integration Example')
    print('=' * 46)

    mentiora_client, llm = create_clients()

    try:
        await run_simple_chain(mentiora_client, llm)
        await run_sequential_chains(mentiora_client, llm)
        await run_tool_tracing(mentiora_client)
        await run_multi_turn_conversation(mentiora_client, llm)

        # Flush ensures all buffered traces are sent before the process exits.
        print('\n--- Flushing Traces ---')
        await mentiora_client.tracing.flush_async()
        print('  All traces flushed successfully.')
    finally:
        # Always close the client to release resources (HTTP connections, etc.).
        await mentiora_client.aclose()

    print('\n--- Done ---')
    print('Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai')


if __name__ == '__main__':
    asyncio.run(main())
