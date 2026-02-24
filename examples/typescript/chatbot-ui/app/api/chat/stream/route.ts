import { createStreamResponse } from '@mentiora.ai/sdk';
import { client, AGENT_TAG } from '@/lib/mentiora';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { message, threadId } = (await req.json()) as {
    message: string;
    threadId?: string | null;
  };

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const events = client.agents.stream({
    tag: AGENT_TAG,
    message,
    ...(threadId ? { threadId } : {}),
  });

  return createStreamResponse(events);
}
