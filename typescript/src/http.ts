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
 * Extract structured error details from a JSON response body.
 * Expects shape `{ error: { code?: string, message?: string } }`.
 */
function extractErrorDetail(responseBody: unknown): {
  serverCode?: string;
  serverMessage?: string;
  detail: string;
} {
  try {
    const body = responseBody as Record<string, unknown> | undefined;
    const errObj = body?.error as Record<string, unknown> | undefined;
    if (errObj) {
      const serverCode = typeof errObj.code === 'string' ? errObj.code : undefined;
      const serverMessage = typeof errObj.message === 'string' ? errObj.message : undefined;
      if (serverCode && serverMessage) {
        return {
          serverCode,
          serverMessage,
          detail: `: [${serverCode}] ${serverMessage}`,
        };
      }
      if (serverMessage) {
        return { serverCode, serverMessage, detail: `: ${serverMessage}` };
      }
    }
  } catch {
    // Non-JSON or unexpected shape — fall through
  }
  return { detail: '' };
}

/**
 * HTTP client with retry logic and exponential backoff.
 */
export class HttpClient {
  /**
   * @param config - HTTP client configuration (base URL, API key, timeout, retries, debug).
   */
  constructor(private readonly config: HttpClientConfig) {}

  get isDebugEnabled(): boolean {
    return this.config.debug;
  }

  /**
   * Returns common HTTP headers for all requests.
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'User-Agent': `mentiora-sdk-ts/${SDK_VERSION}`,
    };
  }

  /**
   * Send a POST request with retry logic and exponential backoff.
   *
   * @param path - API path (e.g. '/api/v1/traces').
   * @param body - JSON-serializable request body.
   * @param debugContext - Optional context object logged in debug mode.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  private async request(
    path: string,
    body: unknown,
    debugContext?: Record<string, unknown>,
    options?: { method?: string; params?: Record<string, string> }
  ): Promise<HttpResponse> {
    let url = `${this.config.baseUrl}${path}`;
    const method = options?.method ?? 'POST';
    const headers = this.getHeaders();
    const debugLabel = debugContext ?? { path };

    if (options?.params) {
      const searchParams = new URLSearchParams(
        Object.entries(options.params).filter(([, v]) => v != null)
      );
      const qs = searchParams.toString();
      if (qs) url = `${url}?${qs}`;
    }

    if (this.config.debug) {
      console.log(`[Mentiora SDK] ${method} request:`, { url, ...debugLabel });
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
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };
        if (method !== 'GET' && method !== 'DELETE' && body != null) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        const responseBody = await response.json().catch(() => ({}));

        if (this.config.debug) {
          console.log('[Mentiora SDK] Response:', {
            status: response.status,
            statusText: response.statusText,
            ...debugLabel,
          });
        }

        // Retry on 429 rate limiting
        if (response.status === 429) {
          if (this.config.debug) {
            console.warn('[Mentiora SDK] Rate limited (429), retrying:', {
              attempt: attempt + 1,
              ...debugLabel,
            });
          }
          if (attempt < maxAttempts - 1) {
            const retryAfter = response.headers.get('retry-after');
            const parsed = retryAfter ? parseFloat(retryAfter) : NaN;
            const delay =
              Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
          throw new NetworkError('Rate limited: too many requests', 429);
        }

        // Treat 404 on DELETE retry as success (resource already deleted)
        if (response.status === 404 && method === 'DELETE' && attempt > 0) {
          if (this.config.debug) {
            console.log(
              '[Mentiora SDK] DELETE retry got 404 — treating as success (already deleted):',
              debugLabel
            );
          }
          return { status: response.status, body: responseBody };
        }

        // Don't retry on 4xx errors (client error)
        if (response.status >= 400 && response.status < 500) {
          const { serverCode, serverMessage, detail } = extractErrorDetail(responseBody);
          throw new NetworkError(
            `Client error: ${response.statusText}${detail}`,
            response.status,
            serverCode,
            serverMessage
          );
        }

        // Retry on 5xx errors
        if (isRetryableError(response.status)) {
          if (this.config.debug) {
            console.warn('[Mentiora SDK] Server error (retryable):', {
              status: response.status,
              statusText: response.statusText,
              attempt: attempt + 1,
              ...debugLabel,
            });
          }
          if (attempt < maxAttempts - 1) {
            const delay = getBackoffDelay(attempt);
            await sleep(delay);
            continue;
          }
          const { serverCode, serverMessage, detail } = extractErrorDetail(responseBody);
          throw new NetworkError(
            `Server error: ${response.statusText}${detail}`,
            response.status,
            serverCode,
            serverMessage
          );
        }

        if (this.config.debug) {
          console.log('[Mentiora SDK] Request successful:', debugLabel);
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
          lastError = error;

          if (error.name === 'AbortError') {
            // Retry timeouts like other network errors (except on last attempt)
            if (attempt < maxAttempts - 1) {
              if (this.config.debug) {
                console.warn('[Mentiora SDK] Request timed out, retrying:', {
                  timeout: this.config.timeout,
                  attempt: attempt + 1,
                  ...debugLabel,
                });
              }
              const delay = getBackoffDelay(attempt);
              await sleep(delay);
              continue;
            }
            throw new NetworkError(`Request timeout after ${this.config.timeout}ms`);
          }
          if (this.config.debug) {
            console.error('[Mentiora SDK] Network error:', {
              error: error.message,
              attempt: attempt + 1,
              ...debugLabel,
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

  /**
   * Send trace event to the API with retry logic.
   *
   * @param event - The trace event to send.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  async sendTrace(event: TraceEvent): Promise<HttpResponse> {
    const body = normalizeTraceEvent(event);
    return this.request('/api/v1/traces', body, {
      traceId: event.traceId,
      spanId: event.spanId,
      type: event.type,
      name: event.name,
    });
  }

  /**
   * Send a POST request to the given API path with retry logic.
   *
   * @param path - API path (e.g. '/api/v1/agents').
   * @param body - JSON-serializable request body.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  async post(path: string, body: unknown): Promise<HttpResponse> {
    return this.request(path, body);
  }

  /**
   * Send a GET request with retry logic.
   *
   * @param path - API path (e.g. '/api/v1/files').
   * @param params - Optional query parameters.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  async get(path: string, params?: Record<string, string>): Promise<HttpResponse> {
    return this.request(path, null, undefined, { method: 'GET', params });
  }

  /**
   * Send a GET request and return the raw response bytes.
   *
   * Unlike {@link get}, this does **not** parse the response as JSON.
   * Useful for downloading binary content such as files.
   *
   * @param path - API path (e.g. '/api/v1/files/<id>/content').
   * @returns Raw response body as a Uint8Array.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure.
   */
  async getRaw(path: string): Promise<Uint8Array> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'User-Agent': `mentiora-sdk-ts/${SDK_VERSION}`,
    };

    if (this.config.debug) {
      console.log('[Mentiora SDK] GET (raw) request:', { url, path });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (response.status >= 400 && response.status < 500) {
        const body = await response.json().catch(() => ({}));
        const { serverCode, serverMessage, detail } = extractErrorDetail(body);
        throw new NetworkError(
          `Client error: ${response.statusText}${detail}`,
          response.status,
          serverCode,
          serverMessage
        );
      }

      if (response.status >= 500) {
        const body = await response.json().catch(() => ({}));
        const { serverCode, serverMessage, detail } = extractErrorDetail(body);
        throw new NetworkError(
          `Server error: ${response.statusText}${detail}`,
          response.status,
          serverCode,
          serverMessage
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof NetworkError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.config.timeout}ms`);
      }
      throw new NetworkError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send a PUT request with retry logic.
   *
   * @param path - API path.
   * @param body - JSON-serializable request body.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  async put(path: string, body: unknown): Promise<HttpResponse> {
    return this.request(path, body, undefined, { method: 'PUT' });
  }

  /**
   * Send a DELETE request with retry logic.
   *
   * @param path - API path.
   * @param params - Optional query parameters.
   * @returns The HTTP response with status and parsed body.
   * @throws {@link NetworkError} on timeout, HTTP 4xx/5xx, or network failure after retries.
   */
  async delete(path: string, params?: Record<string, string>): Promise<HttpResponse> {
    return this.request(path, null, undefined, { method: 'DELETE', params });
  }

  /**
   * Send a POST request for streaming (SSE) responses. No retry logic — streaming is stateful.
   *
   * @param path - API path (e.g. '/api/v1/agents/stream').
   * @param body - JSON-serializable request body.
   * @returns A ReadableStream of raw bytes from the response.
   * @throws {@link NetworkError} on timeout, non-2xx status, missing body, or network failure.
   */
  async postStream(path: string, body: unknown): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.config.baseUrl}${path}`;
    const headers = {
      ...this.getHeaders(),
      Accept: 'text/event-stream',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const { serverCode, serverMessage, detail } = extractErrorDetail(errorBody);
        throw new NetworkError(
          `Stream request failed: ${response.statusText}${detail}`,
          response.status,
          serverCode,
          serverMessage
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        throw new NetworkError(
          `Expected text/event-stream but received: ${contentType || '(none)'}`,
          response.status
        );
      }

      if (!response.body) {
        throw new NetworkError('Stream response has no body');
      }

      return response.body;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.config.timeout}ms`);
      }
      throw new NetworkError(
        `Stream request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
