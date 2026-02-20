/**
 * Streaming helpers — convert AgentStreamEvent async iterables into SSE Responses.
 */

import type { AgentStreamEvent } from './agents';

/** Standard SSE headers for streaming responses. */
export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export interface CreateStreamResponseOptions {
  /** Custom transform function. Return an object to emit it as an SSE event, or null to skip. */
  transform?: (event: AgentStreamEvent) => object | null;
  /** Additional headers merged with SSE_HEADERS. */
  headers?: Record<string, string>;
}

/**
 * Default transform: maps output_text_delta, chat_completed, and error events
 * to simplified SSE payloads. All other event types are skipped.
 */
function defaultTransform(event: AgentStreamEvent): object | null {
  switch (event.type) {
    case 'output_text_delta':
      return { type: 'delta', delta: event.delta };
    case 'chat_completed':
      return {
        type: 'done',
        threadId: event.threadId,
        output: event.output,
        status: event.status,
      };
    case 'error':
      return { type: 'error', message: event.message };
    default:
      return null;
  }
}

/**
 * Create a web-standard `Response` that streams SSE events from an
 * `AsyncIterable<AgentStreamEvent>`.
 *
 * Uses `TransformStream` + background `pipeTo` so back-pressure is handled
 * automatically and the response can be returned immediately.
 */
export function createStreamResponse(
  events: AsyncIterable<AgentStreamEvent>,
  options?: CreateStreamResponseOptions
): Response {
  const transform = options?.transform ?? defaultTransform;
  const encoder = new TextEncoder();

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  const writer = writable.getWriter();

  (async () => {
    try {
      for await (const event of events) {
        const payload = transform(event);
        if (payload !== null) {
          await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`));
    } finally {
      await writer.close();
    }
  })();

  const headers = { ...SSE_HEADERS, ...options?.headers };

  return new Response(readable, { headers });
}
