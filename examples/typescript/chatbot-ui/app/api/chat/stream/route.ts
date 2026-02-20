import { SSE_HEADERS } from '@mentiora.ai/sdk';
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

  const encoder = new TextEncoder();
  const eventIterator = client.agents.stream({
    tag: AGENT_TAG,
    message,
    ...(threadId ? { threadId } : {}),
  });

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value: event, done } = await eventIterator.next();
        if (done) {
          controller.close();
          return;
        }

        let payload: object | null = null;

        switch (event.type) {
          case 'output_text_delta':
            payload = { type: 'delta', delta: event.delta };
            break;
          case 'chat_completed':
            payload = {
              type: 'done',
              threadId: event.threadId,
              output: event.output,
              status: event.status,
            };
            break;
          case 'error':
            payload = { type: 'error', message: event.message };
            break;
        }

        if (payload !== null) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
