/**
 * HTTP client with retry logic.
 */

import { NetworkError } from './errors';
import type { TraceEvent } from './types';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  retries: number;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

/**
 * Normalize trace event for API (convert Date to ISO string).
 */
function normalizeTraceEvent(event: TraceEvent): Record<string, unknown> {
  return {
    trace_id: event.traceId,
    span_id: event.spanId,
    parent_span_id: event.parentSpanId ?? null,
    name: event.name,
    type: event.type,
    input: event.input ?? null,
    output: event.output ?? null,
    start_time:
      event.startTime instanceof Date
        ? event.startTime.toISOString()
        : event.startTime,
    end_time:
      event.endTime instanceof Date
        ? event.endTime.toISOString()
        : (event.endTime ?? null),
    duration_ms: event.durationMs ?? null,
    metadata: event.metadata ?? null,
    tags: event.tags ?? [],
    error: event.error ?? null,
    usage: event.usage ?? null,
    model: event.model ?? null,
    provider: event.provider ?? null,
  };
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if status code indicates a retryable error (5xx).
 */
function isRetryableError(status: number): boolean {
  return status >= 500 && status < 600;
}

/**
 * Calculate exponential backoff delay.
 */
function getBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}

/**
 * HTTP client with retry logic and exponential backoff.
 */
export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  /**
   * Send trace event to the API with retry logic.
   */
  async sendTrace(event: TraceEvent): Promise<HttpResponse> {
    const url = `${this.config.baseUrl}/api/v1/traces`;
    const body = normalizeTraceEvent(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    console.log('[Mentiora SDK] Sending trace:', {
      url,
      traceId: event.traceId,
      spanId: event.spanId,
      type: event.type,
      name: event.name,
    });

    let lastError: Error | undefined;
    const maxAttempts = this.config.retries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `[Mentiora SDK] Retry attempt ${attempt + 1}/${maxAttempts}`,
          );
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout,
        );

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseBody = await response.json().catch(() => ({}));

        console.log('[Mentiora SDK] Response:', {
          status: response.status,
          statusText: response.statusText,
          traceId: event.traceId,
        });

        // Don't retry on 4xx errors (client error)
        if (response.status >= 400 && response.status < 500) {
          console.error('[Mentiora SDK] Client error:', {
            status: response.status,
            statusText: response.statusText,
            body: responseBody,
            traceId: event.traceId,
          });
          throw new NetworkError(
            `Client error: ${response.statusText}`,
            response.status,
          );
        }

        // Retry on 5xx errors
        if (isRetryableError(response.status)) {
          console.warn('[Mentiora SDK] Server error (retryable):', {
            status: response.status,
            statusText: response.statusText,
            attempt: attempt + 1,
            traceId: event.traceId,
          });
          if (attempt < maxAttempts - 1) {
            const delay = getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
          throw new NetworkError(
            `Server error: ${response.statusText}`,
            response.status,
          );
        }

        console.log('[Mentiora SDK] Trace sent successfully:', {
          traceId: event.traceId,
          spanId: event.spanId,
        });

        return {
          status: response.status,
          body: responseBody,
        };
      } catch (error) {
        if (error instanceof NetworkError) {
          throw error;
        }

        // Handle abort (timeout) or network errors
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            console.error('[Mentiora SDK] Request timeout:', {
              timeout: this.config.timeout,
              traceId: event.traceId,
            });
            throw new NetworkError(
              `Request timeout after ${this.config.timeout}ms`,
            );
          }

          lastError = error;
          console.error('[Mentiora SDK] Network error:', {
            error: error.message,
            attempt: attempt + 1,
            traceId: event.traceId,
          });

          // Retry on network errors (except on last attempt)
          if (attempt < maxAttempts - 1) {
            const delay = getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
        }
      }
    }

    console.error('[Mentiora SDK] Failed after all retries:', {
      attempts: maxAttempts,
      error: lastError?.message ?? 'Unknown error',
      traceId: event.traceId,
    });

    throw new NetworkError(
      `Failed after ${maxAttempts} attempts: ${lastError?.message ?? 'Unknown error'}`,
    );
  }
}
