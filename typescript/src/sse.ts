/**
 * Server-Sent Events (SSE) stream parser.
 */

export interface SSEEvent {
  /** Event type (defaults to 'message' per SSE spec). */
  event: string;
  /** Event data (may contain newlines from multiple data: lines). */
  data: string;
  /** Optional event ID. */
  id?: string;
}

/**
 * Parse a ReadableStream of bytes into SSE events.
 *
 * Follows the standard SSE protocol:
 * - Lines starting with `event:` set the event type
 * - Lines starting with `data:` append to the data buffer
 * - Lines starting with `id:` set the event ID
 * - Empty lines dispatch the buffered event
 * - Lines starting with `:` are comments (ignored)
 *
 * @param stream - A ReadableStream of Uint8Array chunks (e.g. from fetch response.body).
 * @yields Parsed SSE events.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';
  let eventType = '';
  let dataLines: string[] = [];
  let eventId: string | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, '');
        buffer = buffer.slice(newlineIdx + 1);

        if (line === '') {
          // Empty line = dispatch event if we have data
          if (dataLines.length > 0) {
            yield {
              event: eventType || 'message',
              data: dataLines.join('\n'),
              ...(eventId !== undefined && { id: eventId }),
            };
          }
          // Reset for next event
          eventType = '';
          dataLines = [];
          eventId = undefined;
        } else if (line.startsWith(':')) {
          // Comment — ignore
        } else if (line.startsWith('event:')) {
          const val = line.slice(6);
          eventType = val.startsWith(' ') ? val.slice(1) : val;
        } else if (line.startsWith('data:')) {
          const val = line.slice(5);
          dataLines.push(val.startsWith(' ') ? val.slice(1) : val);
        } else if (line.startsWith('id:')) {
          const val = line.slice(3);
          eventId = val.startsWith(' ') ? val.slice(1) : val;
        }
      }
    }

    // Process any remaining partial line in the buffer
    if (buffer.length > 0) {
      const line = buffer.replace(/\r$/, '');
      if (line.startsWith('event:')) {
        const val = line.slice(6);
        eventType = val.startsWith(' ') ? val.slice(1) : val;
      } else if (line.startsWith('data:')) {
        const val = line.slice(5);
        dataLines.push(val.startsWith(' ') ? val.slice(1) : val);
      } else if (line.startsWith('id:')) {
        const val = line.slice(3);
        eventId = val.startsWith(' ') ? val.slice(1) : val;
      }
    }

    // Flush any remaining data after stream ends
    if (dataLines.length > 0) {
      yield {
        event: eventType || 'message',
        data: dataLines.join('\n'),
        ...(eventId !== undefined && { id: eventId }),
      };
    }
  } finally {
    reader.releaseLock();
  }
}
