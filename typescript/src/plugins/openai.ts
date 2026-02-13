/**
 * OpenAI tracing plugin for Mentiora SDK.
 * Wraps OpenAI client to automatically trace API calls.
 * Supports streaming and non-streaming responses.
 */

import type OpenAI from 'openai';
import { v7 as uuidv7 } from 'uuid';
import { ConfigurationError } from '../errors';
import type { TraceEvent, UsageInfo } from '../types';
import type { TrackOpenAIOptions } from './types';
import { sendTraceSafely } from './utils';

/**
 * Extract token usage from OpenAI response in API format (snake_case).
 */
function extractTokenUsage(response: unknown): UsageInfo | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const obj = response as Record<string, unknown>;
  const usage = obj.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;

  if (!usage) {
    return undefined;
  }

  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
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
 * Extract the last user message content as a prompt string.
 */
function extractUserPrompt(messages: unknown[] | undefined): string | undefined {
  if (!Array.isArray(messages) || messages.length === 0) {
    return undefined;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | undefined;
    if (msg && typeof msg === 'object' && msg.role === 'user') {
      const content = msg.content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        const textParts = content
          .filter(
            (part) =>
              part && typeof part === 'object' && (part as Record<string, unknown>).type === 'text'
          )
          .map((part) => (part as Record<string, unknown>).text as string)
          .filter((text) => typeof text === 'string');
        if (textParts.length > 0) {
          return textParts.join('\n');
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract the assistant's response content from OpenAI response.
 */
function extractAssistantResponse(responseObj: Record<string, unknown>): string | undefined {
  const choices = responseObj.choices as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const firstChoice = choices[0];
  if (firstChoice && typeof firstChoice === 'object') {
    const message = firstChoice.message as Record<string, unknown> | undefined;
    if (message && typeof message === 'object') {
      if (typeof message.content === 'string') {
        return message.content;
      }
      if (typeof message.refusal === 'string') {
        return `[REFUSED] ${message.refusal}`;
      }
      // If content is null but tool_calls exist, describe them
      const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const descriptions = toolCalls
          .map((tc) => {
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn && typeof fn === 'object') {
              return `${fn.name ?? 'unknown'}(${fn.arguments ?? ''})`;
            }
            return 'unknown()';
          })
          .join('; ');
        return descriptions;
      }
    }
  }

  return undefined;
}

/**
 * Convert OpenAI chat completion messages to structured format.
 */
function formatMessages(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map((msg) => {
    if (typeof msg === 'object' && msg !== null) {
      const msgObj = msg as Record<string, unknown>;
      const entry: Record<string, unknown> = {
        role: msgObj.role,
        content: msgObj.content,
      };
      if (msgObj.tool_calls !== undefined) {
        entry.tool_calls = msgObj.tool_calls;
      }
      if (msgObj.tool_call_id !== undefined) {
        entry.tool_call_id = msgObj.tool_call_id;
      }
      if (msgObj.name !== undefined) {
        entry.name = msgObj.name;
      }
      if (msgObj.refusal !== undefined) {
        entry.refusal = msgObj.refusal;
      }
      if (msgObj.function_call !== undefined) {
        entry.function_call = msgObj.function_call;
      }
      return entry;
    }
    return msg;
  });
}

/**
 * Build input data from chat.completions.create args, capturing all params dynamically.
 */
function buildInputData(request: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...request };
  result.prompt = extractUserPrompt(request.messages as unknown[] | undefined);
  result.messages = formatMessages(request.messages);
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
}

/**
 * Build output data from a non-streaming OpenAI response.
 */
function buildOutputData(response: unknown): Record<string, unknown> | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const responseObj = response as Record<string, unknown>;
  const assistantContent = extractAssistantResponse(responseObj);
  const choices = responseObj.choices as Array<Record<string, unknown>> | undefined;

  const usage = responseObj.usage as Record<string, unknown> | undefined;

  return {
    id: responseObj.id,
    content: assistantContent,
    choices: Array.isArray(choices)
      ? choices.map((choice) => {
          const message = (choice.message ?? {}) as Record<string, unknown>;
          const entry: Record<string, unknown> = {
            index: choice.index,
            message: {
              role: message.role,
              content: message.content,
              tool_calls: message.tool_calls,
              ...(message.refusal !== undefined ? { refusal: message.refusal } : {}),
            },
            finish_reason: choice.finish_reason,
          };
          if (choice.logprobs !== undefined) {
            entry.logprobs = choice.logprobs;
          }
          return entry;
        })
      : [],
    model: responseObj.model,
    created: responseObj.created,
    system_fingerprint: responseObj.system_fingerprint,
    service_tier: responseObj.service_tier,
    ...(usage ? { usage } : {}),
  };
}

/**
 * Wrap an async iterable stream to accumulate chunks and send trace on completion.
 */
function wrapAsyncStream(
  stream: AsyncIterable<unknown>,
  opts: {
    traceId: string;
    spanId: string;
    threadId: string;
    inputData: Record<string, unknown>;
    startTime: Date;
    model: string | undefined;
    options: TrackOpenAIOptions;
  }
): AsyncIterable<unknown> {
  const accumulatedContent: string[] = [];
  const accumulatedRefusal: string[] = [];
  const accumulatedToolCalls = new Map<
    number,
    { id: string; type: string; function: { name: string; arguments: string } }
  >();
  let finalModel = opts.model;
  let finishReason: string | undefined;
  let usageInfo: UsageInfo | undefined;
  let streamId: string | undefined;
  let systemFingerprint: string | undefined;
  let streamCreated: number | undefined;

  async function* generator(): AsyncGenerator<unknown> {
    let streamError: Error | undefined;
    try {
      for await (const chunk of stream) {
        yield chunk;

        if (!chunk || typeof chunk !== 'object') continue;
        const chunkObj = chunk as Record<string, unknown>;

        if (typeof chunkObj.id === 'string') {
          streamId = chunkObj.id;
        }
        if (typeof chunkObj.model === 'string') {
          finalModel = chunkObj.model;
        }
        if (typeof chunkObj.system_fingerprint === 'string') {
          systemFingerprint = chunkObj.system_fingerprint;
        }
        if (typeof chunkObj.created === 'number') {
          streamCreated = chunkObj.created;
        }

        if (chunkObj.usage) {
          usageInfo = extractTokenUsage(chunk);
        }

        const choices = chunkObj.choices as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(choices) || choices.length === 0) continue;

        const firstChoice = choices[0];
        if (!firstChoice || typeof firstChoice !== 'object') continue;

        if (typeof firstChoice.finish_reason === 'string') {
          finishReason = firstChoice.finish_reason;
        }

        const delta = firstChoice.delta as Record<string, unknown> | undefined;
        if (!delta || typeof delta !== 'object') continue;

        if (typeof delta.content === 'string') {
          accumulatedContent.push(delta.content);
        }

        if (typeof delta.refusal === 'string') {
          accumulatedRefusal.push(delta.refusal);
        }

        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            if (!tc || typeof tc !== 'object') continue;
            const idx = (tc.index as number) ?? 0;
            if (!accumulatedToolCalls.has(idx)) {
              accumulatedToolCalls.set(idx, {
                id: (tc.id as string) ?? '',
                type: (tc.type as string) ?? 'function',
                function: { name: '', arguments: '' },
              });
            }
            const existing = accumulatedToolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id as string;
            const fn = tc.function as Record<string, unknown> | undefined;
            if (fn && typeof fn === 'object') {
              if (typeof fn.name === 'string') existing.function.name = fn.name;
              if (typeof fn.arguments === 'string') existing.function.arguments += fn.arguments;
            }
          }
        }
      }
    } catch (error) {
      streamError = error instanceof Error ? error : new Error(String(error));

      const endTime = new Date();
      const durationMs = endTime.getTime() - opts.startTime.getTime();
      const content = accumulatedContent.length > 0 ? accumulatedContent.join('') : undefined;

      const metadata: Record<string, unknown> = {
        method: 'chat.completions.create',
        ...opts.options.metadata,
      };
      if (streamId) {
        metadata.openai_id = streamId;
      }
      if (streamCreated !== undefined) {
        metadata.created = streamCreated;
      }

      const traceEvent: TraceEvent = {
        traceId: opts.traceId,
        spanId: opts.spanId,
        threadId: opts.threadId,
        name: 'openai.chat.completions.create',
        type: 'error',
        ...(opts.options.captureContent !== false && { input: opts.inputData }),
        ...(opts.options.captureContent !== false && { output: content ? { content } : undefined }),
        startTime: opts.startTime,
        endTime,
        durationMs,
        error: {
          message: streamError.message,
          type: streamError.name,
          stack: streamError.stack,
        },
        metadata,
        tags: opts.options.tags,
        usage: usageInfo,
        model: finalModel,
        provider: 'openai',
      };

      await sendTraceSafely(opts.options.mentioraClient, traceEvent, 'OpenAI');
      throw streamError;
    } finally {
      if (!streamError) {
        const endTime = new Date();
        const durationMs = endTime.getTime() - opts.startTime.getTime();

        const metadata: Record<string, unknown> = {
          method: 'chat.completions.create',
          ...opts.options.metadata,
        };
        if (streamId) {
          metadata.openai_id = streamId;
        }
        if (streamCreated !== undefined) {
          metadata.created = streamCreated;
        }

        const content = accumulatedContent.length > 0 ? accumulatedContent.join('') : undefined;
        const toolCallsList =
          accumulatedToolCalls.size > 0
            ? Array.from(accumulatedToolCalls.entries())
                .sort(([a], [b]) => a - b)
                .map(([, v]) => v)
            : undefined;

        const refusal = accumulatedRefusal.length > 0 ? accumulatedRefusal.join('') : undefined;

        let assistantContent = content;
        if (!assistantContent && refusal) {
          assistantContent = `[REFUSED] ${refusal}`;
        }
        if (!assistantContent && toolCallsList) {
          assistantContent = toolCallsList
            .map((tc) => `${tc.function.name || 'unknown'}(${tc.function.arguments || ''})`)
            .join('; ');
        }

        const messageEntry: Record<string, unknown> = {
          role: 'assistant',
          content,
          tool_calls: toolCallsList,
        };
        if (refusal !== undefined) {
          messageEntry.refusal = refusal;
        }

        const outputData: Record<string, unknown> = {
          id: streamId,
          content: assistantContent,
          choices: [
            {
              index: 0,
              message: messageEntry,
              finish_reason: finishReason,
            },
          ],
          model: finalModel,
          created: streamCreated,
          system_fingerprint: systemFingerprint,
          ...(usageInfo
            ? {
                usage: {
                  prompt_tokens: usageInfo.prompt_tokens,
                  completion_tokens: usageInfo.completion_tokens,
                  total_tokens: usageInfo.total_tokens,
                },
              }
            : {}),
        };

        const traceEvent: TraceEvent = {
          traceId: opts.traceId,
          spanId: opts.spanId,
          threadId: opts.threadId,
          name: 'openai.chat.completions.create',
          type: 'llm',
          ...(opts.options.captureContent !== false && { input: opts.inputData }),
          ...(opts.options.captureContent !== false && { output: outputData }),
          startTime: opts.startTime,
          endTime,
          durationMs,
          metadata,
          tags: opts.options.tags,
          usage: usageInfo,
          model: finalModel,
          provider: 'openai',
        };

        await sendTraceSafely(opts.options.mentioraClient, traceEvent, 'OpenAI');
      }
    }
  }

  return generator();
}

/**
 * Wrap OpenAI client method to add tracing.
 * The `thisArg` is required to preserve OpenAI's internal context.
 */
function wrapMethod<T extends (...args: unknown[]) => Promise<unknown>>(
  originalMethod: T,
  options: TrackOpenAIOptions,
  thisArg: unknown
): T {
  return (async (...args: Parameters<T>) => {
    const startTime = new Date();
    const spanId = uuidv7();
    const currentTraceId = uuidv7();
    const threadId =
      typeof options.threadId === 'string' && options.threadId.trim() !== ''
        ? options.threadId
        : uuidv7();

    const request = (args[0] as Record<string, unknown>) ?? {};
    const isStream = request.stream === true;
    const inputData = buildInputData(request);
    let model = extractModel(request, undefined);

    // Inject stream_options.include_usage for streaming requests
    let callArgs = args;
    if (isStream) {
      const existing = (request.stream_options as Record<string, unknown>) ?? {};
      callArgs = [
        {
          ...request,
          stream_options: { ...existing, include_usage: true },
        },
        ...Array.from(args).slice(1),
      ] as Parameters<T>;
    }

    try {
      const response = await originalMethod.apply(thisArg as ThisParameterType<T>, callArgs);

      if (isStream) {
        return wrapAsyncStream(response as AsyncIterable<unknown>, {
          traceId: currentTraceId,
          spanId,
          threadId,
          inputData,
          startTime,
          model,
          options,
        });
      }

      // Non-streaming response
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const outputData = buildOutputData(response);
      const tokenUsage = extractTokenUsage(response);
      model = extractModel(request, response) ?? model;

      const responseObj = (response ?? {}) as Record<string, unknown>;
      const metadata: Record<string, unknown> = {
        method: 'chat.completions.create',
        ...options.metadata,
      };
      if (responseObj.created !== undefined) {
        metadata.created = responseObj.created;
      }
      if (typeof responseObj.id === 'string') {
        metadata.openai_id = responseObj.id;
      }

      const traceEvent: TraceEvent = {
        traceId: currentTraceId,
        spanId,
        threadId,
        name: 'openai.chat.completions.create',
        type: 'llm',
        ...(options.captureContent !== false && { input: inputData }),
        ...(options.captureContent !== false && { output: outputData }),
        startTime,
        endTime,
        durationMs,
        metadata,
        tags: options.tags,
        usage: tokenUsage,
        model,
        provider: 'openai',
      };

      await sendTraceSafely(options.mentioraClient, traceEvent, 'OpenAI');
      return response;
    } catch (err) {
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      const traceEvent: TraceEvent = {
        traceId: currentTraceId,
        spanId,
        threadId,
        name: 'openai.chat.completions.create',
        type: 'error',
        ...(options.captureContent !== false && { input: inputData }),
        startTime,
        endTime,
        durationMs,
        error: {
          message: err instanceof Error ? err.message : String(err),
          type: err instanceof Error ? err.constructor.name : 'Error',
          stack: err instanceof Error ? err.stack : undefined,
        },
        metadata: {
          method: 'chat.completions.create',
          ...options.metadata,
        },
        tags: options.tags,
        model,
        provider: 'openai',
      };

      await sendTraceSafely(options.mentioraClient, traceEvent, 'OpenAI');
      throw err;
    }
  }) as T;
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
const MENTIORA_PATCHED = Symbol.for('mentiora.patched');

export function trackOpenAI(openaiClient: OpenAI, options: TrackOpenAIOptions): OpenAI {
  if (!options.mentioraClient) {
    throw new ConfigurationError('mentioraClient is required');
  }

  if ((openaiClient as unknown as Record<symbol, unknown>)[MENTIORA_PATCHED]) {
    if (options.mentioraClient.debug) {
      console.log('[Mentiora] OpenAI client already patched, skipping.');
    }
    return openaiClient;
  }

  const client = openaiClient as unknown as {
    chat?: {
      completions?: {
        create?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  // Patch chat.completions.create in place
  if (
    client.chat &&
    client.chat.completions &&
    typeof client.chat.completions.create === 'function'
  ) {
    const originalCreate = client.chat.completions.create as (
      ...args: unknown[]
    ) => Promise<unknown>;
    client.chat.completions.create = wrapMethod(originalCreate, options, client.chat.completions);
  }

  (openaiClient as unknown as Record<symbol, unknown>)[MENTIORA_PATCHED] = true;
  return openaiClient;
}
