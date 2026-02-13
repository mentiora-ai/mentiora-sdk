/**
 * HTTP client with retry logic.
 */

import { NetworkError } from './errors';
import type { TraceEvent } from './types';
import { SDK_VERSION } from './version';

export interface HttpClientConfig {
  /** Base URL of the Mentiora platform API. */
  baseUrl: string;
  /** Project API key used for Bearer authentication. */
  apiKey: string;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Maximum number of retry attempts for failed requests. */
  retries: number;
  /** Enable verbose SDK logging. */
  debug: boolean;
}

export interface HttpResponse {
  /** HTTP status code. */
  status: number;
  /** Parsed JSON response body. */
  body: unknown;
}

/**
 * Mapping from TraceEvent camelCase keys to API snake_case keys.
 */
const FIELD_MAP: Record<string, string> = {
  traceId: 'trace_id',
  spanId: 'span_id',
  parentSpanId: 'parent_span_id',
  threadId: 'thread_id',
  startTime: 'start_time',
  endTime: 'end_time',
  durationMs: 'duration_ms',
};

/**
 * All TraceEvent fields that should appear in the API payload (with null defaults).
 * threadId is handled separately (only included when non-empty).
 */
const ALL_FIELDS: readonly string[] = [
  'traceId',
  'spanId',
  'parentSpanId',
  'name',
  'type',
  'input',
  'output',
  'startTime',
  'endTime',
  'durationMs',
  'metadata',
  'tags',
  'error',
  'usage',
  'model',
  'provider',
];

/**
 * Normalize trace event for API (camelCase→snake_case, Date→ISO string, undefined→null).
 */
function normalizeTraceEvent(event: TraceEvent): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const eventRecord = event as unknown as Record<string, unknown>;

  for (const key of ALL_FIELDS) {
    const value = eventRecord[key];
    const snakeKey = FIELD_MAP[key] ?? key;

    // For usage, filter out null/undefined sub-values
    if (key === 'usage' && value != null && typeof value === 'object') {
      result[snakeKey] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null)
      );
    } else if (value === undefined || value === null) {
      result[snakeKey] = key === 'tags' ? [] : null;
    } else if (value instanceof Date) {
      result[snakeKey] = value.toISOString();
    } else {
      result[snakeKey] = value;
    }
  }

  // threadId: only include if non-empty string
  if (typeof event.threadId === 'string' && event.threadId.trim() !== '') {
    result.thread_id = event.threadId;
  }

  return result;
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
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Calculate exponential backoff delay with full jitter.
 */
function getBackoffDelay(attempt: number): number {
  const maxDelay = Math.min(10000, 1000 * Math.pow(2, attempt));
  return Math.random() * maxDelay;
}

/**
 * HTTP client with retry logic and exponential backoff.
 */
export class HttpClient {
  /**
   * @param config - HTTP client configuration (base URL, API key, timeout, retries, debug).
   */
  constructor(private readonly config: HttpClientConfig) {}

  /**
   * Send trace event to the API with retry logic.
   *
   * @param event - The trace event to send.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  async sendTrace(event: TraceEvent): Promise<HttpResponse> {
    const url = `${this.config.baseUrl}/api/v1/traces`;
    const body = normalizeTraceEvent(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'User-Agent': `mentiora-sdk-ts/${SDK_VERSION}`,
    };

    if (this.config.debug) {
      console.log('[Mentiora SDK] Sending trace:', {
        url,
        traceId: event.traceId,
        spanId: event.spanId,
        type: event.type,
        name: event.name,
      });
    }

    let lastError: Error | undefined;
    const maxAttempts = this.config.retries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        if (this.config.debug) {
          console.log(`[Mentiora SDK] Retry attempt ${attempt + 1}/${maxAttempts}`);
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const responseBody = await response.json().catch(() => ({}));

        if (this.config.debug) {
          console.log('[Mentiora SDK] Response:', {
            status: response.status,
            statusText: response.statusText,
            traceId: event.traceId,
          });
        }

        // Retry on 429 rate limiting
        if (response.status === 429) {
          if (this.config.debug) {
            console.warn('[Mentiora SDK] Rate limited (429), retrying:', {
              attempt: attempt + 1,
              traceId: event.traceId,
            });
          }
          if (attempt < maxAttempts - 1) {
            const retryAfter = response.headers.get('retry-after');
            const delay = retryAfter ? parseFloat(retryAfter) * 1000 : getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
          throw new NetworkError('Rate limited: too many requests', 429);
        }

        // Don't retry on 4xx errors (client error)
        if (response.status >= 400 && response.status < 500) {
          throw new NetworkError(`Client error: ${response.statusText}`, response.status);
        }

        // Retry on 5xx errors
        if (isRetryableError(response.status)) {
          if (this.config.debug) {
            console.warn('[Mentiora SDK] Server error (retryable):', {
              status: response.status,
              statusText: response.statusText,
              attempt: attempt + 1,
              traceId: event.traceId,
            });
          }
          if (attempt < maxAttempts - 1) {
            const delay = getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
          throw new NetworkError(`Server error: ${response.statusText}`, response.status);
        }

        if (this.config.debug) {
          console.log('[Mentiora SDK] Trace sent successfully:', {
            traceId: event.traceId,
            spanId: event.spanId,
          });
        }

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
            throw new NetworkError(`Request timeout after ${this.config.timeout}ms`);
          }

          lastError = error;
          if (this.config.debug) {
            console.error('[Mentiora SDK] Network error:', {
              error: error.message,
              attempt: attempt + 1,
              traceId: event.traceId,
            });
          }

          // Retry on network errors (except on last attempt)
          if (attempt < maxAttempts - 1) {
            const delay = getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new NetworkError(
      `Failed after ${maxAttempts} attempts: ${lastError?.message ?? 'Unknown error'}`
    );
  }
}
