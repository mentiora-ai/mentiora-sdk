/**
 * Tracing client for sending trace events to the Mentiora platform.
 */

import { v7 as uuidv7 } from 'uuid';
import { NetworkError, ValidationError } from '../errors';
import type { HttpClient } from '../http';
import type { SendTraceResult, TraceEvent } from '../types';

/**
 * Tracing client for the Mentiora SDK.
 */
export class TracingClient {
  /**
   * @param httpClient - Configured HTTP client used for API communication.
   */
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Validate trace event.
   */
  private validateTraceEvent(event: TraceEvent): void {
    if (!event.traceId || typeof event.traceId !== 'string') {
      throw new ValidationError('traceId is required and must be a string');
    }

    if (!event.spanId || typeof event.spanId !== 'string') {
      throw new ValidationError('spanId is required and must be a string');
    }

    if (!event.name || typeof event.name !== 'string') {
      throw new ValidationError('name is required and must be a string');
    }

    if (!event.type || !['llm', 'tool', 'chat', 'error', 'custom'].includes(event.type)) {
      throw new ValidationError('type must be one of: llm, tool, chat, error, custom');
    }

    if (!event.startTime) {
      throw new ValidationError('startTime is required');
    }
  }

  /**
   * Send a trace event to the Mentiora platform.
   *
   * @param event - The trace event to send. A `threadId` is auto-generated if not provided.
   * @returns Result indicating success or failure, including the trace and span IDs.
   */
  async sendTrace(event: TraceEvent): Promise<SendTraceResult> {
    const eventWithThreadId: TraceEvent =
      typeof event.threadId === 'string' && event.threadId.trim() !== ''
        ? event
        : {
            ...event,
            threadId: uuidv7(),
          };

    this.validateTraceEvent(eventWithThreadId);

    try {
      await this.httpClient.sendTrace(eventWithThreadId);
      return {
        success: true,
        traceId: eventWithThreadId.traceId,
        spanId: eventWithThreadId.spanId,
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        return {
          success: false,
          traceId: eventWithThreadId.traceId,
          spanId: eventWithThreadId.spanId,
          error: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Flush pending traces (no-op for now, reserved for future batching).
   *
   * @returns Resolves when all pending traces have been flushed.
   */
  async flush(): Promise<void> {
    // No-op for MVP - reserved for future batching/buffering
  }
}
