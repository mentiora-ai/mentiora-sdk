import { MentioraClient } from '@mentiora.ai/sdk';

const apiKey = process.env.MENTIORA_API_KEY;
if (!apiKey) {
  throw new Error(
    'MENTIORA_API_KEY is required. Copy .env.example to .env and fill it in.'
  );
}

export const client = new MentioraClient({
  apiKey,
  ...(process.env.MENTIORA_BASE_URL && { baseUrl: process.env.MENTIORA_BASE_URL }),
});

export const AGENT_TAG = process.env.MENTIORA_AGENT_TAG ?? 'production';
