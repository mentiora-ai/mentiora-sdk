import { NextResponse } from 'next/server';
import { client, AGENT_TAG } from '@/lib/mentiora';

export async function POST(req: Request) {
  const { message, threadId } = (await req.json()) as {
    message: string;
    threadId?: string | null;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const result = await client.agents.run({
    tag: AGENT_TAG,
    message,
    ...(threadId ? { threadId } : {}),
  });

  return NextResponse.json({
    output: result.output,
    threadId: result.threadId,
    status: result.status,
  });
}
