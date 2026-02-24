/**
 * Mentiora SDK — Agent Run Example
 *
 * Demonstrates running custom agents via the Mentiora SDK.
 * This example covers:
 *   1. Client initialization from environment variables
 *   2. Running an agent with await (full response)
 *   3. Streaming an agent response (real-time output)
 *   4. Multi-turn conversations (reusing threadId)
 *   5. Model overrides (custom model and parameters)
 *   6. Error handling (ValidationError, NetworkError, streaming errors)
 */

import {
  MentioraClient,
  NetworkError,
  ValidationError,
} from '@mentiora.ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config({ override: false });

// ---------------------------------------------------------------------------
// 1. Client Initialization
// ---------------------------------------------------------------------------

function createClient(): MentioraClient {
  const apiKey = process.env.MENTIORA_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
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
    timeout: 120000, // Agent runs can take longer than the default 30s
  });
}

// ---------------------------------------------------------------------------
// 2. Basic Agent Run
// ---------------------------------------------------------------------------

async function basicRun(client: MentioraClient) {
  console.log('\n--- Basic Agent Run ---\n');

  // Run an agent by tag. The platform resolves the tag to a specific agent
  // revision, executes it, and returns the full result.
  const result = await client.agents.run({
    tag: 'production',
    message: 'What is our refund policy?',
  });

  console.log(`Status:   ${result.status}`);
  console.log(`Output:   ${result.output}`);
  console.log(`Thread:   ${result.threadId}`);
  console.log(`Agent:    ${result.agentId} (rev ${result.agentRevision})`);

  if (result.toolCalls.length > 0) {
    console.log(
      `Tools used: ${result.toolCalls.map((tc) => tc.name).join(', ')}`,
    );
  }

  if (result.usage) {
    console.log(
      `Tokens:   ${result.usage.promptTokens ?? 0} prompt + ${result.usage.completionTokens ?? 0} completion`,
    );
  }

  return result.threadId;
}

// ---------------------------------------------------------------------------
// 3. Agent Streaming
// ---------------------------------------------------------------------------

async function streamingRun(client: MentioraClient) {
  console.log('\n--- Streaming Agent Run ---\n');

  // Stream an agent response. Events arrive in real-time as the agent
  // generates output. This is ideal for chat UIs that need to show
  // incremental text updates.
  let fullOutput = '';

  for await (const event of client.agents.stream({
    tag: 'production',
    message: 'Explain our return process step by step.',
  })) {
    switch (event.type) {
      case 'agent_resolved':
        console.log(
          `Agent resolved: ${event.agentId} (rev ${event.agentRevision})`,
        );
        console.log(`Thread: ${event.threadId}\n`);
        console.log('Output: ', '');
        break;

      case 'output_text_delta':
        // Print each text chunk as it arrives (no newline — builds up in place)
        process.stdout.write(event.delta);
        fullOutput += event.delta;
        break;

      case 'tool_call_delta':
        // Tool call arguments streaming in (useful for showing tool progress)
        break;

      case 'tool_call_result':
        console.log(
          `\n[Tool: ${event.name} -> ${JSON.stringify(event.result)}]`,
        );
        break;

      case 'chat_completed':
        console.log(`\n\nCompleted: status=${event.status}`);
        break;

      case 'error':
        console.error(`\nAgent error: [${event.code}] ${event.message}`);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Multi-Turn Conversation
// ---------------------------------------------------------------------------

async function multiTurnConversation(client: MentioraClient) {
  console.log('\n--- Multi-Turn Conversation ---\n');

  // Turn 1 — ask a question
  const turn1 = await client.agents.run({
    tag: 'production',
    message: 'Hi, I bought a laptop last week and it has a dead pixel.',
  });

  console.log(`Turn 1 — Agent: ${turn1.output}`);
  console.log(`Thread: ${turn1.threadId}`);

  // Turn 2 — continue the conversation by passing the threadId back.
  // The agent will have access to the full conversation history.
  const turn2 = await client.agents.run({
    tag: 'production',
    message: 'Yes, I would like to proceed with the return.',
    threadId: turn1.threadId,
  });

  console.log(`\nTurn 2 — Agent: ${turn2.output}`);
  console.log(`Thread: ${turn2.threadId} (same as turn 1)`);

  // Turn 3 — another follow-up
  const turn3 = await client.agents.run({
    tag: 'production',
    message: 'How long will the refund take?',
    threadId: turn1.threadId,
  });

  console.log(`\nTurn 3 — Agent: ${turn3.output}`);
}

// ---------------------------------------------------------------------------
// 5. Model Overrides
// ---------------------------------------------------------------------------

async function modelOverrides(client: MentioraClient) {
  console.log('\n--- Model Overrides ---\n');

  // Override the agent's default model and parameters.
  // This is useful for testing different models or tuning behavior
  // without changing the agent configuration on the platform.
  const result = await client.agents.run({
    tag: 'production',
    message: 'Write a one-sentence summary of our shipping policy.',
    modelId: 'gpt-5-mini',
    modelParams: {
      temperature: 0.2,
      maxTokens: 200,
    },
    metadata: { source: 'example-app', feature: 'model-overrides' },
  });

  console.log(`Output: ${result.output}`);
  console.log(
    `Model override applied — response generated with custom parameters`,
  );
}

// ---------------------------------------------------------------------------
// 6. Error Handling
// ---------------------------------------------------------------------------

async function errorHandling(client: MentioraClient) {
  console.log('\n--- Error Handling ---\n');

  // Agent calls throw exceptions (unlike tracing which returns result objects).
  // This means you should always wrap agent calls in try/catch.

  // Example 1: ValidationError (empty message)
  try {
    await client.agents.run({ tag: 'production', message: '' });
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`ValidationError caught: ${error.message}`);
    }
  }

  // Example 2: ValidationError (missing tag and agentId)
  try {
    await client.agents.run({ message: 'Hello' } as any);
  } catch (error) {
    if (error instanceof ValidationError) {
      console.log(`ValidationError caught: ${error.message}`);
    }
  }

  // Example 3: NetworkError (e.g., invalid API key or server error)
  // In a real app, this would happen if the server is unreachable
  // or the API key is invalid:
  //   try {
  //     const badClient = new MentioraClient({ apiKey: 'invalid' });
  //     await badClient.agents.run({ tag: 'production', message: 'Hello' });
  //   } catch (error) {
  //     if (error instanceof NetworkError) {
  //       console.log(`NetworkError: ${error.message} (status: ${error.statusCode})`);
  //     }
  //   }
  console.log(
    'NetworkError handling: wrap agent calls in try/catch for HTTP failures',
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Mentiora SDK — Agent Run Example');
  console.log('================================\n');

  const client = createClient();

  try {
    await basicRun(client);
    await streamingRun(client);
    await multiTurnConversation(client);
    await modelOverrides(client);
    await errorHandling(client);

    console.log('\n================================');
    console.log('Done! Check the Mentiora dashboard to view agent traces.');
  } catch (error) {
    if (error instanceof NetworkError) {
      console.error(`\nNetwork error: ${error.message}`);
      console.error(
        'Make sure your API key is valid and the agent tag exists.',
      );
    } else {
      console.error('\nUnexpected error:', (error as Error).message);
    }
    process.exit(1);
  }
}

main();
