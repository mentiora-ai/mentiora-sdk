/**
 * AgentsClient — run agents via the Mentiora API.
 */

import { NetworkError, ValidationError } from '../errors';
import type { HttpClient } from '../http';
import { parseSSEStream } from '../sse';
import type { AgentRunAPIRequest, AgentRunParams, AgentRunResult, AgentStreamEvent } from './types';

const AGENTS_RUN_PATH = '/api/v1/agents/run';

export class AgentsClient {
  constructor(private readonly httpClient: HttpClient) {}

  private get debug(): boolean {
    return (this.httpClient as unknown as { config?: { debug?: boolean } }).config?.debug ?? false;
  }

  /**
   * Run an agent synchronously and return the complete result.
   *
   * @param params - Agent run parameters (tag/agentId, message, etc.).
   * @returns The complete agent run result with output and tool calls.
   * @throws {@link ValidationError} if params are invalid.
   * @throws {@link NetworkError} on HTTP errors or connection failures.
   */
  async run(params: AgentRunParams): Promise<AgentRunResult> {
    this.validateParams(params);
    if (this.debug) {
      console.log('[Mentiora SDK] agents.run:', { tag: params.tag, agentId: params.agentId });
    }

    const body = this.buildAPIRequest(params, false);
    const response = await this.httpClient.post(AGENTS_RUN_PATH, body);

    return this.parseRunResult(response.body);
  }

  /**
   * Run an agent with streaming. Returns an async iterable of events.
   * Use with `for await (const event of client.agents.stream({...}))`.
   *
   * @param params - Agent run parameters (tag/agentId, message, etc.).
   * @yields Typed AgentStreamEvent objects as they arrive from the server.
   * @throws {@link ValidationError} if params are invalid.
   * @throws {@link NetworkError} on HTTP errors or connection failures.
   */
  async *stream(params: AgentRunParams): AsyncGenerator<AgentStreamEvent> {
    this.validateParams(params);
    if (this.debug) {
      console.log('[Mentiora SDK] agents.stream:', { tag: params.tag, agentId: params.agentId });
    }

    const body = this.buildAPIRequest(params, true);
    const rawStream = await this.httpClient.postStream(AGENTS_RUN_PATH, body);

    try {
      for await (const sseEvent of parseSSEStream(rawStream)) {
        const parsed = this.parseStreamEvent(sseEvent);
        if (parsed) {
          yield parsed;
          if (parsed.type === 'error') break;
        }
      }
    } finally {
      // Cancel the underlying stream to release HTTP connection
      try {
        await rawStream.cancel();
      } catch {
        /* stream may already be closed */
      }
    }
  }

  private validateParams(params: AgentRunParams): void {
    if (!params.message || params.message.trim() === '') {
      throw new ValidationError('message is required and cannot be empty');
    }
    if (!params.tag && !params.agentId) {
      throw new ValidationError('Either tag or agentId must be provided');
    }
    if (params.tag && params.agentId) {
      throw new ValidationError('Provide either tag or agentId, not both');
    }
  }

  private buildAPIRequest(params: AgentRunParams, stream: boolean): AgentRunAPIRequest {
    const req: AgentRunAPIRequest = {
      message: params.message,
      stream,
    };
    if (params.tag !== undefined) req.tag = params.tag;
    if (params.agentId !== undefined) req.agent_id = params.agentId;
    if (params.revision !== undefined) req.revision = params.revision;
    if (params.threadId !== undefined) req.thread_id = params.threadId;
    if (params.modelId !== undefined) req.model_id = params.modelId;
    if (params.modelParams !== undefined) {
      req.model_params = {
        temperature: params.modelParams.temperature,
        max_tokens: params.modelParams.maxTokens,
        seed: params.modelParams.seed,
      };
    }
    if (params.endUserId !== undefined) req.end_user_id = params.endUserId;
    if (params.metadata !== undefined) req.metadata = params.metadata;
    return req;
  }

  private parseRunResult(body: unknown): AgentRunResult {
    const data = body as Record<string, unknown>;

    // Validate required fields
    if (typeof data.thread_id !== 'string') {
      throw new NetworkError('Invalid agent response: missing thread_id');
    }
    if (typeof data.agent_id !== 'string') {
      throw new NetworkError('Invalid agent response: missing agent_id');
    }
    if (typeof data.output !== 'string') {
      throw new NetworkError('Invalid agent response: missing output');
    }
    if (data.status !== 'completed' && data.status !== 'failed') {
      throw new NetworkError('Invalid agent response: invalid status');
    }

    return {
      threadId: data.thread_id,
      traceId: data.trace_id as string | undefined,
      agentId: data.agent_id,
      agentRevision: data.agent_revision as number,
      agentTag: data.agent_tag as string | undefined,
      output: data.output,
      toolCalls: ((data.tool_calls as Array<Record<string, unknown>>) || []).map((tc) => ({
        toolCallId: tc.tool_call_id as string,
        name: tc.name as string,
        arguments: tc.arguments,
        result: tc.result,
      })),
      status: data.status,
      usage: this.parseUsage(data.usage),
    };
  }

  private parseUsage(raw: unknown): AgentRunResult['usage'] {
    if (raw == null || typeof raw !== 'object') return undefined;
    const usage = raw as Record<string, unknown>;
    return {
      promptTokens: usage.prompt_tokens as number | undefined,
      completionTokens: usage.completion_tokens as number | undefined,
    };
  }

  private parseStreamEvent(sse: { event: string; data: string }): AgentStreamEvent | null {
    // Backend sends `data: [DONE]` as a stream termination signal — skip it
    if (sse.data === '[DONE]') {
      return null;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(sse.data);
    } catch {
      throw new NetworkError(`Failed to parse SSE event data: ${sse.data}`);
    }

    // Map wire-format SSE event names (dot-separated) to SDK event types (underscore-separated)
    switch (sse.event) {
      case 'agent.resolved': {
        if (typeof data.agent_id !== 'string' || typeof data.thread_id !== 'string') {
          throw new NetworkError(`Malformed agent.resolved event: ${sse.data}`);
        }
        return {
          type: 'agent_resolved',
          agentId: data.agent_id,
          agentRevision: data.agent_revision as number,
          agentTag: data.agent_tag as string | undefined,
          threadId: data.thread_id,
        };
      }
      case 'chat.output_text.delta': {
        if (typeof data.delta !== 'string') {
          throw new NetworkError(`Malformed chat.output_text.delta event: ${sse.data}`);
        }
        return { type: 'output_text_delta', delta: data.delta };
      }
      case 'chat.tool_call.delta':
        return {
          type: 'tool_call_delta',
          toolCallId: data.tool_call_id as string,
          name: data.name as string,
          argumentsDelta: data.arguments_delta as string,
        };
      case 'chat.tool_call.result':
        return {
          type: 'tool_call_result',
          toolCallId: data.tool_call_id as string,
          name: data.name as string,
          arguments: data.arguments,
          result: data.result,
        };
      case 'chat.completed': {
        const chat = (data.chat as Record<string, unknown>) ?? data;
        let output = chat.output ?? data.output ?? '';
        // Backend sends output as a list of message objects — extract assistant text
        if (Array.isArray(output)) {
          const assistantMsg = output.find(
            (o: Record<string, unknown>) => o && typeof o === 'object' && o.type === 'message'
          ) as { content?: Array<{ text?: string }> } | undefined;
          output = assistantMsg?.content?.[0]?.text ?? '';
        }
        return {
          type: 'chat_completed',
          threadId: String(chat.thread_id ?? data.thread_id ?? ''),
          status: ((chat.status ?? data.status) as 'completed' | 'failed') || 'completed',
          output: typeof output === 'string' ? output : String(output),
        };
      }
      case 'error':
        return { type: 'error', code: data.code as string, message: data.message as string };
      default:
        // Unknown events are silently skipped (forward compatibility)
        return null;
    }
  }
}
