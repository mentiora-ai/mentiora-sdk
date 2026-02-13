/**
 * Mentiora SDK — Basic Tracing Example
 *
 * Demonstrates manual trace instrumentation with the Mentiora SDK.
 * This example covers:
 *   1. Client initialization from environment variables
 *   2. Sending an LLM trace with all available fields
 *   3. Creating parent-child span relationships (tool trace)
 *   4. Grouping traces into a multi-turn conversation via threadId
 *   5. Inspecting the SendTraceResult for success/error
 *   6. Flushing pending traces before exit
 */

import { MentioraClient } from '@mentiora/sdk';
import * as dotenv from 'dotenv';
import { v7 as uuidv7 } from 'uuid';

// Load .env file (will not override existing environment variables)
dotenv.config({ override: false });

// ---------------------------------------------------------------------------
// 1. Client Initialization
// ---------------------------------------------------------------------------

function createClient(): MentioraClient {
  const apiKey = process.env.MENTIORA_API_KEY;
  if (!apiKey) {
    console.error(
      'ERROR: MENTIORA_API_KEY is not set.\n' +
        'Copy .env.example to .env and add your API key:\n' +
        '  cp .env.example .env\n',
    );
    process.exit(1);
  }

  // Create the client. The baseUrl defaults to https://platform.mentiora.ai
  // when not provided. You can override it via MENTIORA_BASE_URL.
  return new MentioraClient({
    apiKey,
    baseUrl: process.env.MENTIORA_BASE_URL,
  });
}

// ---------------------------------------------------------------------------
// 2. Send an LLM Trace (all fields)
// ---------------------------------------------------------------------------

async function sendLlmTrace(client: MentioraClient) {
  console.log('\n--- Sending LLM Trace ---');

  // UUID v7 IDs are timestamp-ordered, making them ideal for tracing.
  // traceId groups all spans that belong to a single logical request.
  // spanId uniquely identifies this individual span.
  // threadId groups traces that belong to the same conversation.
  const traceId = uuidv7();
  const spanId = uuidv7();
  const threadId = uuidv7();

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 1250);

  const result = await client.tracing.sendTrace({
    // --- Required identifiers ---
    traceId,
    spanId,
    threadId,

    // --- Span metadata ---
    name: 'llm.chat_completion',
    type: 'llm',

    // --- Input / Output ---
    // Store the full prompt and completion so you can inspect them in the UI.
    input: {
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      model: 'gpt-4o',
    },
    output: {
      content: 'The capital of France is Paris.',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'The capital of France is Paris.',
          },
        },
      ],
    },

    // --- Timing ---
    startTime,
    endTime,
    durationMs: 1250,

    // --- Token usage (LLM-specific) ---
    usage: {
      prompt_tokens: 15,
      completion_tokens: 8,
      total_tokens: 23,
    },

    // --- Model info ---
    model: 'gpt-4o',
    provider: 'openai',

    // --- Optional extras ---
    metadata: { environment: 'example', userId: 'user-42' },
    tags: ['example', 'basic-tracing'],
  });

  // --- 5. Inspect the result ---
  if (result.success) {
    console.log(`  LLM trace sent successfully (traceId: ${result.traceId})`);
  } else {
    console.error(`  Failed to send LLM trace: ${result.error}`);
  }

  // Return IDs so the next step can create a child span.
  return { traceId, spanId, threadId };
}

// ---------------------------------------------------------------------------
// 3. Send a Child Tool Trace (parent-child relationship)
// ---------------------------------------------------------------------------

async function sendToolTrace(
  client: MentioraClient,
  parentTraceId: string,
  parentSpanId: string,
  threadId: string,
) {
  console.log('\n--- Sending Child Tool Trace ---');

  // By reusing the same traceId and setting parentSpanId, this span becomes
  // a child of the LLM span above. The Mentiora UI will render these as a
  // nested tree so you can see the full execution flow.
  const result = await client.tracing.sendTrace({
    traceId: parentTraceId,
    spanId: uuidv7(),
    parentSpanId, // links to the LLM span
    threadId,
    name: 'tool.web_search',
    type: 'tool',
    input: { tool: 'web_search', query: 'capital of France' },
    output: { result: 'Paris is the capital of France.' },
    startTime: new Date(),
    endTime: new Date(),
    durationMs: 450,
    metadata: { toolName: 'web_search' },
    tags: ['example', 'basic-tracing'],
  });

  if (result.success) {
    console.log(`  Tool trace sent successfully (spanId: ${result.spanId})`);
  } else {
    console.error(`  Failed to send tool trace: ${result.error}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Multi-Turn Conversation (shared threadId)
// ---------------------------------------------------------------------------

async function sendMultiTurnConversation(client: MentioraClient) {
  console.log('\n--- Multi-Turn Conversation ---');

  // A threadId groups traces that belong to the same conversation.
  // Each turn gets its own traceId (separate logical request), but they
  // share a threadId so you can view the full conversation in the UI.
  const threadId = uuidv7();

  // Turn 1 — user asks a question
  const turn1 = await client.tracing.sendTrace({
    traceId: uuidv7(),
    spanId: uuidv7(),
    threadId,
    name: 'llm.chat_completion',
    type: 'llm',
    input: {
      messages: [{ role: 'user', content: 'Hello, how are you?' }],
      model: 'gpt-4o',
    },
    output: {
      content: "I'm doing well, thank you! How can I help you today?",
    },
    startTime: new Date(),
    endTime: new Date(),
    durationMs: 800,
    usage: { prompt_tokens: 12, completion_tokens: 15, total_tokens: 27 },
    model: 'gpt-4o',
    provider: 'openai',
    tags: ['example', 'basic-tracing'],
  });

  console.log(
    `  Turn 1: ${turn1.success ? 'sent' : 'failed'} (traceId: ${turn1.traceId})`,
  );

  // Turn 2 — follow-up in the same conversation
  const turn2 = await client.tracing.sendTrace({
    traceId: uuidv7(),
    spanId: uuidv7(),
    threadId, // same threadId links both turns together
    name: 'llm.chat_completion',
    type: 'llm',
    input: {
      messages: [
        { role: 'user', content: 'Hello, how are you?' },
        {
          role: 'assistant',
          content: "I'm doing well, thank you! How can I help you today?",
        },
        { role: 'user', content: 'Tell me a fun fact about Paris.' },
      ],
      model: 'gpt-4o',
    },
    output: {
      content:
        'The Eiffel Tower was originally intended to be a temporary structure, built for the 1889 World\'s Fair!',
    },
    startTime: new Date(),
    endTime: new Date(),
    durationMs: 950,
    usage: { prompt_tokens: 45, completion_tokens: 22, total_tokens: 67 },
    model: 'gpt-4o',
    provider: 'openai',
    tags: ['example', 'basic-tracing'],
  });

  console.log(
    `  Turn 2: ${turn2.success ? 'sent' : 'failed'} (traceId: ${turn2.traceId})`,
  );
  console.log(`  Both turns share threadId: ${threadId}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Mentiora SDK — Basic Tracing Example\n');

  const client = createClient();

  // 2. Send a full LLM trace
  const { traceId, spanId, threadId } = await sendLlmTrace(client);

  // 3. Send a child tool trace linked to the LLM trace
  await sendToolTrace(client, traceId, spanId, threadId);

  // 4. Send a multi-turn conversation
  await sendMultiTurnConversation(client);

  // 6. Flush any buffered traces before exiting
  await client.tracing.flush();

  // Summary
  console.log('\n--- Done ---');
  console.log('All traces have been sent and flushed.');
  console.log(
    'Open the Mentiora dashboard to view your traces: https://platform.mentiora.ai',
  );
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
