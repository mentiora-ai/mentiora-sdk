/**
 * Mentiora SDK — OpenAI Integration Example
 *
 * Demonstrates automatic tracing of OpenAI API calls using the Mentiora SDK.
 * Every call to `chat.completions.create` and `embeddings.create` is
 * automatically captured as a trace event, including input messages, model
 * responses, token usage, latency, and errors.
 *
 * Usage:
 *   cp .env.example .env   # fill in your API keys
 *   npm install
 *   npm start
 */

import { MentioraClient, trackOpenAI } from '@mentiora.ai/sdk';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { v7 as uuidv7 } from 'uuid';

dotenv.config();

// ---------------------------------------------------------------------------
// 1. Validate environment variables
// ---------------------------------------------------------------------------

const MENTIORA_API_KEY = process.env.MENTIORA_API_KEY;
const MENTIORA_BASE_URL =
  process.env.MENTIORA_BASE_URL || 'https://platform.mentiora.ai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MENTIORA_API_KEY || MENTIORA_API_KEY === 'your-api-key-here') {
  console.error(
    'Missing MENTIORA_API_KEY. Copy .env.example to .env and add your key.',
  );
  process.exit(1);
}

if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
  console.error(
    'Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Create clients
// ---------------------------------------------------------------------------

// The MentioraClient sends trace data to the Mentiora platform.
const mentioraClient = new MentioraClient({
  apiKey: MENTIORA_API_KEY,
  baseUrl: MENTIORA_BASE_URL,
});

// A standard OpenAI client — nothing special here.
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// 3. Chat completion — single call
// ---------------------------------------------------------------------------

async function chatCompletion() {
  console.log('\n--- Chat Completion ---\n');

  // `trackOpenAI` wraps the OpenAI client so that every API call is
  // automatically traced. It monkey-patches `chat.completions.create`
  // (and `embeddings.create`) in place, then returns the same client
  // reference. The original request/response flow is unchanged — your
  // code works exactly as before, but each call also sends a trace event
  // to Mentiora in the background.
  const trackedClient = trackOpenAI(openai, {
    mentioraClient,
    tags: ['example', 'openai-integration', 'chat'],
    metadata: { environment: 'example', feature: 'single-completion' },
  });

  const response = await trackedClient.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. Keep answers concise.',
      },
      {
        role: 'user',
        content: 'What are three benefits of observability in AI applications?',
      },
    ],
  });

  const message = response.choices[0]?.message?.content;
  console.log('Assistant:', message);
  console.log(`Tokens: ${response.usage?.total_tokens ?? 'N/A'}`);
}

// ---------------------------------------------------------------------------
// 4. Multi-turn conversation
// ---------------------------------------------------------------------------

async function multiTurnConversation() {
  console.log('\n--- Multi-Turn Conversation ---\n');

  // Generate a shared threadId so Mentiora groups all turns of this
  // conversation together. This makes it easy to view the full dialogue
  // in the Mentiora dashboard.
  const threadId = uuidv7();
  console.log(`Thread ID: ${threadId}\n`);

  const trackedClient = trackOpenAI(openai, {
    mentioraClient,
    threadId,
    tags: ['example', 'openai-integration', 'conversation'],
    metadata: { environment: 'example', conversation_type: 'multi-turn' },
  });

  // Turn 1
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: 'You are a knowledgeable AI assistant.' },
    { role: 'user', content: 'What is distributed tracing?' },
  ];

  const turn1 = await trackedClient.chat.completions.create({
    model: 'gpt-5-mini',
    messages,
  });

  const reply1 = turn1.choices[0]?.message?.content ?? '';
  console.log('Turn 1 — User:     What is distributed tracing?');
  console.log(`Turn 1 — Assistant: ${reply1.slice(0, 120)}...`);

  // Turn 2 — build on the conversation context
  messages.push({ role: 'assistant', content: reply1 });
  messages.push({
    role: 'user',
    content: 'How does it apply to LLM-powered applications?',
  });

  const turn2 = await trackedClient.chat.completions.create({
    model: 'gpt-5-mini',
    messages,
  });

  const reply2 = turn2.choices[0]?.message?.content ?? '';
  console.log(
    '\nTurn 2 — User:     How does it apply to LLM-powered applications?',
  );
  console.log(`Turn 2 — Assistant: ${reply2.slice(0, 120)}...`);

  // Turn 3 — follow-up question
  messages.push({ role: 'assistant', content: reply2 });
  messages.push({
    role: 'user',
    content: 'Can you summarize in one sentence?',
  });

  const turn3 = await trackedClient.chat.completions.create({
    model: 'gpt-5-mini',
    messages,
  });

  const reply3 = turn3.choices[0]?.message?.content ?? '';
  console.log('\nTurn 3 — User:     Can you summarize in one sentence?');
  console.log(`Turn 3 — Assistant: ${reply3}`);
}

// ---------------------------------------------------------------------------
// 5. Embeddings
// ---------------------------------------------------------------------------

async function embeddings() {
  console.log('\n--- Embeddings ---\n');

  const trackedClient = trackOpenAI(openai, {
    mentioraClient,
    tags: ['example', 'openai-integration', 'embeddings'],
    metadata: { environment: 'example', feature: 'embeddings' },
  });

  // Single embedding
  const single = await trackedClient.embeddings.create({
    model: 'text-embedding-3-small',
    input:
      'Observability helps teams understand AI system behavior in production.',
  });

  console.log(
    `Single embedding: ${single.data[0].embedding.length} dimensions`,
  );
  console.log(`Tokens used: ${single.usage?.total_tokens ?? 'N/A'}`);

  // Batch embeddings — multiple inputs in one call
  const batch = await trackedClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: [
      'Tracing captures the full lifecycle of an AI request.',
      'Metrics reveal latency, token usage, and error rates.',
      'Logs provide detailed debugging information.',
    ],
  });

  console.log(
    `\nBatch embeddings: ${batch.data.length} vectors, ${batch.data[0].embedding.length} dimensions each`,
  );
  console.log(`Tokens used: ${batch.usage?.total_tokens ?? 'N/A'}`);
}

// ---------------------------------------------------------------------------
// 6. Run all demos
// ---------------------------------------------------------------------------

async function main() {
  console.log('Mentiora SDK — OpenAI Integration Example');
  console.log('==========================================');

  try {
    await chatCompletion();
    await multiTurnConversation();
    await embeddings();

    // Flush any pending traces before exiting so nothing is lost.
    await mentioraClient.tracing.flush();

    console.log('\n==========================================');
    console.log('Done! Check the Mentiora dashboard to view your traces.');
  } catch (error) {
    console.error('\nError running example:', (error as Error).message);
    console.error(
      'Make sure your API keys are valid and you have sufficient quota.',
    );
    process.exit(1);
  }
}

main();
