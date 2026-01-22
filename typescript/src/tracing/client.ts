/**
 * Tracing client for sending trace events to the Mentiora platform.
 */

import { NetworkError, ValidationError } from '../errors';
import type { HttpClient } from '../http';
import type { SendTraceResult, TraceEvent } from '../types';

/**
 * Tracing client for the Mentiora SDK.
 */
export class TracingClient {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly baseUrl: string,
  ) {}

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
      throw new ValidationError(
        'type must be one of: llm, tool, chat, error, custom',
      );
    }

    if (!event.startTime) {
      throw new ValidationError('startTime is required');
    }
  }

  /**
   * Send a trace event to the Mentiora platform.
   */
  async sendTrace(event: TraceEvent): Promise<SendTraceResult> {
    this.validateTraceEvent(event);

    try {
      await this.httpClient.sendTrace(event);
      return {
        success: true,
        traceId: event.traceId,
        spanId: event.spanId,
      };
    } catch (error) {
      if (error instanceof NetworkError) {
        return {
          success: false,
          traceId: event.traceId,
          spanId: event.spanId,
          error: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Flush pending traces (no-op for now, reserved for future batching).
   */
  async flush(): Promise<void> {
    // No-op for MVP - reserved for future batching/buffering
    return Promise.resolve();
  }
}
