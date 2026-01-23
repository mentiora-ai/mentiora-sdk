/**
 * OpenAI tracing plugin for Mentiora SDK.
 * Wraps OpenAI client to automatically trace API calls.
 */

import type OpenAI from 'openai';
import type { TraceEvent } from '../types';
import type { TrackOpenAIOptions } from './types';

/**
 * Generate a random hex string for trace ID (32 hex chars = 16 bytes).
 * OpenTelemetry spec requires trace_id to be 16 bytes (32 hex characters).
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random hex string for span ID (16 hex chars = 8 bytes).
 * OpenTelemetry spec requires span_id to be 8 bytes (16 hex characters).
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract token usage from OpenAI response.
 */
function extractTokenUsage(
  response: unknown,
): { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const obj = response as Record<string, unknown>;
  const usage = obj.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;

  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

/**
 * Extract model name from OpenAI request or response.
 */
function extractModel(request: unknown, response: unknown): string | undefined {
  // Try response first
  if (response && typeof response === 'object') {
    const responseObj = response as Record<string, unknown>;
    if (typeof responseObj.model === 'string') {
      return responseObj.model;
    }
  }

  // Try request
  if (request && typeof request === 'object') {
    const requestObj = request as Record<string, unknown>;
    if (typeof requestObj.model === 'string') {
      return requestObj.model;
    }
  }

  return undefined;
}

/**
 * Convert OpenAI chat completion messages to string format.
 */
function formatMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((msg) => {
    if (typeof msg === 'object' && msg !== null) {
      const msgObj = msg as Record<string, unknown>;
      return {
        role: msgObj.role,
        content: msgObj.content,
      };
    }
    return msg;
  });
}

/**
 * Send trace event (non-blocking, errors are logged but don't throw).
 */
async function sendTraceSafely(
  mentioraClient: TrackOpenAIOptions['mentioraClient'],
  event: TraceEvent,
): Promise<void> {
  try {
    await mentioraClient.tracing.sendTrace(event);
  } catch (error) {
    // Log error but don't break user's application
    console.error('[MentioraTracingOpenAI] Failed to send trace:', error);
  }
}

/**
 * Wrap OpenAI client method to add tracing.
 */
function wrapMethod<T extends (...args: unknown[]) => Promise<unknown>>(
  originalMethod: T,
  methodName: string,
  options: TrackOpenAIOptions,
  traceId?: string,
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = new Date();
    const spanId = generateSpanId();
    const currentTraceId = traceId ?? generateTraceId();

    // Extract request data
    const request = args[0] as Record<string, unknown> | undefined;
    const model = extractModel(request, undefined);

    // Build trace event input
    let input: unknown = request;
    if (methodName === 'chat.completions.create' && request?.messages) {
      input = {
        messages: formatMessages(request.messages),
        model: request.model,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: request.stream,
      };
    } else if (methodName === 'embeddings.create' && request) {
      input = {
        input: request.input,
        model: request.model,
      };
    } else if (methodName === 'images.generate' && request) {
      input = {
        prompt: request.prompt,
        model: request.model,
        n: request.n,
        size: request.size,
      };
    }

    let response: unknown;
    let error: TraceEvent['error'] | undefined;

    try {
      // Call original method
      response = await originalMethod(...args);

      // Handle streaming responses
      if (response && typeof response === 'object' && 'asyncIterator' in response) {
        // For streaming, we'll trace the initial call and completion
        // The actual streaming data is handled separately
        const endTime = new Date();
        const durationMs = endTime.getTime() - startTime.getTime();

        const traceEvent: TraceEvent = {
          traceId: currentTraceId,
          spanId,
          name: `openai.${methodName}`,
          type: 'llm',
          input,
          output: { streaming: true },
          startTime,
          endTime,
          durationMs,
          metadata: {
            provider: 'openai',
            model,
            method: methodName,
            ...options.metadata,
          },
          tags: options.tags,
        };

        await sendTraceSafely(options.mentioraClient, traceEvent);
        return response;
      }

      // Extract output
      let output: unknown = response;
      if (methodName === 'chat.completions.create' && response) {
        const responseObj = response as Record<string, unknown>;
        output = {
          choices: responseObj.choices,
          model: responseObj.model,
        };
      } else if (methodName === 'embeddings.create' && response) {
        const responseObj = response as Record<string, unknown>;
        output = {
          data: responseObj.data,
          model: responseObj.model,
        };
      } else if (methodName === 'images.generate' && response) {
        const responseObj = response as Record<string, unknown>;
        output = {
          data: responseObj.data,
        };
      }

      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const tokenUsage = extractTokenUsage(response);

      const traceEvent: TraceEvent = {
        traceId: currentTraceId,
        spanId,
        name: `openai.${methodName}`,
        type: 'llm',
        input,
        output,
        startTime,
        endTime,
        durationMs,
        metadata: {
          provider: 'openai',
          model,
          method: methodName,
          ...(tokenUsage && {
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
          }),
          ...options.metadata,
        },
        tags: options.tags,
      };

      await sendTraceSafely(options.mentioraClient, traceEvent);
      return response;
    } catch (err) {
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      error = {
        message: err instanceof Error ? err.message : String(err),
        type: err instanceof Error ? err.constructor.name : 'Error',
        stack: err instanceof Error ? err.stack : undefined,
      };

      const traceEvent: TraceEvent = {
        traceId: currentTraceId,
        spanId,
        name: `openai.${methodName}`,
        type: 'error',
        input,
        startTime,
        endTime,
        durationMs,
        error,
        metadata: {
          provider: 'openai',
          model,
          method: methodName,
          ...options.metadata,
        },
        tags: options.tags,
      };

      await sendTraceSafely(options.mentioraClient, traceEvent);

      // Re-throw the original error
      throw err;
    }
  }) as T;
}

/**
 * Wrap OpenAI client namespace (e.g., chat.completions).
 */
function wrapNamespace(
  namespace: Record<string, unknown>,
  namespaceName: string,
  options: TrackOpenAIOptions,
  traceId?: string,
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(namespace)) {
    if (typeof value === 'function') {
      wrapped[key] = wrapMethod(
        value as (...args: unknown[]) => Promise<unknown>,
        `${namespaceName}.${key}`,
        options,
        traceId,
      );
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively wrap nested namespaces
      wrapped[key] = wrapNamespace(
        value as Record<string, unknown>,
        `${namespaceName}.${key}`,
        options,
        traceId,
      );
    } else {
      wrapped[key] = value;
    }
  }

  return wrapped;
}

/**
 * Track OpenAI client to automatically send traces to Mentiora.
 *
 * @param openaiClient - OpenAI client instance to wrap
 * @param options - Plugin configuration options
 * @returns Wrapped OpenAI client with tracing enabled
 *
 * @example
 * ```typescript
 * import { trackOpenAI, MentioraClient } from '@mentiora/sdk';
 * import OpenAI from 'openai';
 *
 * const mentioraClient = new MentioraClient({ ... });
 * const openaiClient = new OpenAI({ apiKey: '...' });
 * const trackedClient = trackOpenAI(openaiClient, { mentioraClient });
 *
 * // Use trackedClient instead of openaiClient
 * const response = await trackedClient.chat.completions.create({ ... });
 * ```
 */
export function trackOpenAI(
  openaiClient: OpenAI,
  options: TrackOpenAIOptions,
): OpenAI {
  if (!options.mentioraClient) {
    throw new Error('mentioraClient is required');
  }

  // Create a proxy to intercept method calls
  const wrappedClient = new Proxy(openaiClient, {
    get(target, prop) {
      const value = target[prop as keyof typeof target];

      // Wrap main API namespaces
      if (prop === 'chat' && value && typeof value === 'object') {
        return wrapNamespace(value as Record<string, unknown>, 'chat', options);
      }

      if (prop === 'embeddings' && value && typeof value === 'object') {
        return wrapNamespace(value as Record<string, unknown>, 'embeddings', options);
      }

      if (prop === 'images' && value && typeof value === 'object') {
        return wrapNamespace(value as Record<string, unknown>, 'images', options);
      }

      // Return original value for other properties
      return value;
    },
  });

  return wrappedClient as OpenAI;
}
