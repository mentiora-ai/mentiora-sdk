# Agent Run — Python

A copy-paste-ready example demonstrating how to run custom agents via the
[Mentiora SDK](https://github.com/periscoop/mentiora-sdk).

## What this example demonstrates

- Initializing `MentioraClient` from environment variables
- Running an agent **synchronously** (`client.agents.run()`) and **asynchronously**
  (`client.agents.run_async()`)
- **Streaming** agent responses in real-time — both sync (`stream()`) and async
  (`stream_async()`)
- **Multi-turn conversations** by reusing `thread_id` across calls
- **Model overrides** (custom `model_id` and `model_params`)
- **Error handling** with `ValidationError`, `NetworkError`, and streaming `AgentErrorEvent`

## Prerequisites

- **Python** >= 3.11
- A **Mentiora API key** (get one from the [Mentiora dashboard](https://platform.mentiora.ai))
- A **configured agent** with a tag (e.g. `production`) on the Mentiora platform

## Setup

1. **Create a virtual environment**

   ```bash
   cd examples/python/agent-run
   uv venv
   source .venv/bin/activate   # macOS / Linux
   # .venv\Scripts\activate    # Windows
   ```

2. **Install dependencies**

   ```bash
   uv pip install -r requirements.txt
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and replace `your-api-key-here` with your actual API key.

## Run

```bash
python main.py
```

## Expected output

```
Mentiora SDK — Agent Run Example (Python)
==================================================

--- Basic Agent Run (sync) ---

Status:   completed
Output:   Our refund policy allows returns within 30 days...
Thread:   thread_01abc...
Agent:    agent_xyz (rev 3)

--- Streaming Agent Run (sync) ---

Agent resolved: agent_xyz (rev 3)
Thread: thread_02def...

Step 1: Initiate a return request...
Step 2: Ship the item back...

Completed: status=completed

--- Error Handling ---

ValidationError caught: message is required and cannot be empty
ValidationError caught: Either tag or agent_id must be provided
NetworkError handling: wrap agent calls in try/except for HTTP failures
Streaming errors: check event.type == "error" or isinstance(event, AgentErrorEvent)

--- Basic Agent Run (async) ---

Status:   completed
Output:   We offer standard (5-7 days) and express (1-2 days) shipping...

--- Streaming Agent Run (async) ---

Our store hours are Monday through Friday, 9 AM to 6 PM...

Completed: status=completed
Full output length: 87 chars

--- Multi-Turn Conversation ---

Turn 1 — Agent: I'm sorry to hear about the dead pixel...
Thread: thread_03ghi...
Turn 2 — Agent: I've initiated the return process...
Thread: thread_03ghi... (same as turn 1)
Turn 3 — Agent: Refunds are typically processed within 5-7 business days...

--- Model Overrides ---

Output: We offer free standard shipping on orders over $50...
Model override applied — response generated with custom parameters

==================================================
Done! Check the Mentiora dashboard to view agent traces.
```

## Key concepts

### Agent resolution: tag vs agent_id

| Parameter               | Description                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `tag`                   | Resolves to the latest agent revision for that tag (e.g. `production`). **Recommended.** |
| `agent_id` + `revision` | Pins to a specific agent version. Useful for testing.                                    |

You must provide either `tag` or `agent_id`, but not both.

### Sync vs Async

The SDK provides both synchronous and asynchronous methods:

| Sync                     | Async                          | Use case                      |
| ------------------------ | ------------------------------ | ----------------------------- |
| `client.agents.run()`    | `client.agents.run_async()`    | Full result before proceeding |
| `client.agents.stream()` | `client.agents.stream_async()` | Real-time streaming output    |

Use sync methods in synchronous applications (scripts, CLI tools). Use async methods in
async applications (FastAPI, aiohttp, etc.).

### Streaming events

| Event type          | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `agent_resolved`    | Emitted once with resolved agent metadata and thread_id |
| `output_text_delta` | Incremental text chunk from the agent                   |
| `tool_call_delta`   | Incremental tool call argument chunk                    |
| `tool_call_result`  | Completed tool call with result                         |
| `chat_completed`    | Final event with status and complete output             |
| `error`             | Backend error event (stops the stream)                  |

### Multi-turn conversations (thread_id)

Pass `thread_id` from a previous response to continue the conversation:

```python
turn1 = client.agents.run(AgentRunParams(tag='production', message='Hello'))
turn2 = client.agents.run(AgentRunParams(
    tag='production',
    message='Tell me more',
    thread_id=turn1.thread_id,  # continues the conversation
))
```

### Error handling

Agent calls **raise exceptions** (unlike `client.tracing.send_trace()` which returns a result
object). Always wrap agent calls in try/except:

- `ValidationError` — invalid params (empty message, missing tag/agent_id)
- `NetworkError` — HTTP failures (401, 404, 500, timeout)
- `AgentErrorEvent` (streaming only) — backend error mid-stream

## Next steps

- Try the [Basic Tracing](../basic-tracing/) example for manual trace instrumentation
- Explore the [OpenAI Integration](../openai-integration/) for automatic OpenAI tracing
- Read the full [SDK documentation](https://docs.mentiora.ai)
