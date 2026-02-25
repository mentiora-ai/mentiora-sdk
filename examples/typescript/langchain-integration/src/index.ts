/**
 * Mentiora SDK — LangChain Integration Example
 *
 * Demonstrates automatic tracing of LangChain operations using the
 * MentioraTracingLangChain callback handler. This example covers:
 *   1. Client and ChatOpenAI initialization from environment variables
 *   2. Creating a callback handler for automatic trace capture
 *   3. Simple chain — ChatPromptTemplate | ChatOpenAI (LCEL syntax)
 *   4. Sequential chains — piping the output of one chain into another
 *   5. Multi-turn conversation — grouping traces with a shared threadId
 *   6. Flushing pending traces before exit
 *
 * The callback handler automatically captures:
 *   - LLM/chat model start, end, and error events
 *   - Chain start, end, and error events
 *   - Tool start, end, and error events
 *   - Token usage and timing information
 *   - Parent-child span relationships
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { MentioraClient } from '@mentiora.ai/sdk';
import { MentioraTracingLangChain } from '@mentiora.ai/sdk/langchain';
import * as dotenv from 'dotenv';
import { v7 as uuidv7 } from 'uuid';

// Load .env file (will not override existing environment variables)
dotenv.config({ override: false });

// ---------------------------------------------------------------------------
// 1. Client & Model Initialization
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

  return new MentioraClient({
    apiKey,
    baseUrl: process.env.MENTIORA_BASE_URL,
  });
}

function createModel(): ChatOpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      'ERROR: OPENAI_API_KEY is not set.\n' +
        'Add your OpenAI API key to .env:\n' +
        '  OPENAI_API_KEY=sk-...\n',
    );
    process.exit(1);
  }

  return new ChatOpenAI({
    modelName: 'gpt-5-mini',
    apiKey,
  });
}

// ---------------------------------------------------------------------------
// 2. Create Callback Handler
// ---------------------------------------------------------------------------
//
// MentioraTracingLangChain is a LangChain BaseCallbackHandler. When you pass
// it in the `callbacks` array of any LangChain `.invoke()` call, it
// automatically intercepts lifecycle events — LLM start/end, chain start/end,
// tool start/end — and sends structured traces to the Mentiora platform.
//
// The handler takes care of:
//   - Generating UUID v7 trace/span IDs
//   - Tracking parent-child relationships between spans
//   - Extracting token usage from LLM responses
//   - Capturing input/output data
//   - Timing each operation
//
// You can attach tags and metadata that will be included on every trace.

// ---------------------------------------------------------------------------
// 3. Simple Chain — ChatPromptTemplate | ChatOpenAI
// ---------------------------------------------------------------------------

async function runSimpleChain(client: MentioraClient, llm: ChatOpenAI) {
  console.log('\n--- Simple Chain (LCEL) ---');

  // Create a fresh callback handler for this example section.
  // Each handler instance manages its own set of trace/span IDs.
  const callback = new MentioraTracingLangChain({
    mentioraClient: client,
    tags: ['example', 'langchain', 'simple-chain'],
    metadata: { example: 'simple-chain' },
  });

  // Build a chain using LangChain Expression Language (LCEL).
  // The pipe operator connects a prompt template to a chat model.
  const prompt = ChatPromptTemplate.fromTemplate(
    'You are a helpful assistant. Explain {topic} in one sentence.',
  );
  const chain = prompt.pipe(llm);

  // Invoke the chain. The callback handler will automatically trace:
  //   1. The chain start (with the input variables)
  //   2. The ChatOpenAI LLM call (with messages, model, and token usage)
  //   3. The chain end (with the final output)
  const result = await chain.invoke(
    { topic: 'what observability means for AI applications' },
    { callbacks: [callback] },
  );

  // result is an AIMessage — access the text via .content
  console.log(`  Response: ${result.content}`);
}

// ---------------------------------------------------------------------------
// 4. Sequential Chains — Output of one feeds into the next
// ---------------------------------------------------------------------------

async function runSequentialChains(client: MentioraClient, llm: ChatOpenAI) {
  console.log('\n--- Sequential Chains ---');

  const callback = new MentioraTracingLangChain({
    mentioraClient: client,
    tags: ['example', 'langchain', 'sequential'],
    metadata: { example: 'sequential-chains' },
  });

  // Chain 1: Generate a question about a topic
  const questionPrompt = ChatPromptTemplate.fromTemplate(
    'Generate a single interesting trivia question about {topic}. ' +
      'Only output the question, nothing else.',
  );
  const questionChain = questionPrompt.pipe(llm);

  console.log('  Generating question about TypeScript...');
  const questionResult = await questionChain.invoke(
    { topic: 'TypeScript programming' },
    { callbacks: [callback] },
  );
  console.log(`  Question: ${questionResult.content}`);

  // Chain 2: Answer the generated question
  // The output of chain 1 (the question) becomes the input to chain 2.
  const answerPrompt = ChatPromptTemplate.fromTemplate(
    'Answer the following question concisely:\n\n{question}',
  );
  const answerChain = answerPrompt.pipe(llm);

  console.log('  Answering the question...');
  const answerResult = await answerChain.invoke(
    { question: questionResult.content as string },
    { callbacks: [callback] },
  );
  console.log(`  Answer: ${answerResult.content}`);
}

// ---------------------------------------------------------------------------
// 5. Multi-Turn Conversation — Shared threadId
// ---------------------------------------------------------------------------

async function runMultiTurnConversation(
  client: MentioraClient,
  llm: ChatOpenAI,
) {
  console.log('\n--- Multi-Turn Conversation ---');

  // Generate a threadId to group all turns of this conversation.
  // UUID v7 is timestamp-ordered, so turns are naturally sorted.
  const threadId = uuidv7();
  console.log(`  Thread ID: ${threadId}`);

  // Pass threadId to the callback handler so every trace in this
  // conversation is linked together in the Mentiora dashboard.
  const callback = new MentioraTracingLangChain({
    mentioraClient: client,
    threadId,
    tags: ['example', 'langchain', 'conversation'],
    metadata: { conversationType: 'multi-turn' },
  });

  const conversationPrompt = ChatPromptTemplate.fromTemplate('{message}');
  const chain = conversationPrompt.pipe(llm);

  // Turn 1
  console.log('\n  Turn 1: Asking about Python...');
  const turn1 = await chain.invoke(
    {
      message:
        'What are the three most popular Python web frameworks? Just list them.',
    },
    { callbacks: [callback] },
  );
  console.log(`  Response: ${turn1.content}`);

  // Turn 2 — follow-up referencing the first answer
  console.log('\n  Turn 2: Follow-up question...');
  const turn2 = await chain.invoke(
    {
      message:
        `You previously said the top Python web frameworks are: ${turn1.content}\n\n` +
        'Which one would you recommend for a beginner and why? Answer in one sentence.',
    },
    { callbacks: [callback] },
  );
  console.log(`  Response: ${turn2.content}`);

  // Turn 3 — another follow-up
  console.log('\n  Turn 3: Final follow-up...');
  const turn3 = await chain.invoke(
    {
      message:
        `You recommended: ${turn2.content}\n\n` +
        'What is the first thing a beginner should build with it? Answer in one sentence.',
    },
    { callbacks: [callback] },
  );
  console.log(`  Response: ${turn3.content}`);

  console.log(`\n  All 3 turns share threadId: ${threadId}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Mentiora SDK — LangChain Integration Example\n');

  const client = createClient();
  const llm = createModel();

  // 3. Simple chain with LCEL
  await runSimpleChain(client, llm);

  // 4. Sequential chains
  await runSequentialChains(client, llm);

  // 5. Multi-turn conversation with threadId
  await runMultiTurnConversation(client, llm);

  // 6. Flush any buffered traces before exiting.
  // This ensures all traces are delivered even if the process exits immediately.
  await client.tracing.flush();

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
