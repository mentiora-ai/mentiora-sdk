/**
 * Mentiora Tracing SDK client.
 */

import { ConfigurationError, NetworkError, ValidationError } from './errors';
import { HttpClient } from './http';
import type {
  Environment,
  MentioraTracingConfig,
  SendTraceResult,
  TraceEvent,
} from './types';

const ENVIRONMENT_URLS: Record<Environment, string> = {
  staging: 'https://staging.mentiora.ai',
  production: 'https://platform.mentiora.ai',
};

/**
 * Mentiora Tracing SDK client.
 */
export class MentioraTracing {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  constructor(config: MentioraTracingConfig) {
    this.validateConfig(config);
    this.baseUrl = config.baseUrl ?? ENVIRONMENT_URLS[config.environment];
    this.httpClient = new HttpClient({
      baseUrl: this.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
    });
  }

  /**
   * Validate configuration.
   */
  private validateConfig(config: MentioraTracingConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new ConfigurationError('apiKey is required and must be a string');
    }

    if (!config.environment || !['staging', 'production'].includes(config.environment)) {
      throw new ConfigurationError(
        'environment must be either "staging" or "production"',
      );
    }
  }

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
