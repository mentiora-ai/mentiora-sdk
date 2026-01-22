/**
 * Mentiora SDK client.
 *
 * Main entry point for the Mentiora SDK. Provides access to all SDK features
 * through namespaced properties (e.g., client.tracing, client.vectordb).
 */

import { ConfigurationError } from './errors';
import { HttpClient } from './http';
import { TracingClient } from './tracing/client';
import type { Environment, MentioraConfig } from './types';

const ENVIRONMENT_URLS: Record<Environment, string> = {
  staging: 'https://staging.mentiora.ai',
  production: 'https://platform.mentiora.ai',
};

/**
 * Main Mentiora SDK client.
 *
 * Provides access to all SDK features through namespaced properties:
 * - `client.tracing` - Send agent traces
 * - `client.vectordb` - Vector database operations (coming soon)
 */
export class MentioraClient {
  public readonly tracing: TracingClient;
  // Future: public readonly vectordb: VectorDBClient;

  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  constructor(config: MentioraConfig) {
    this.validateConfig(config);
    this.baseUrl = config.baseUrl ?? ENVIRONMENT_URLS[config.environment];
    this.httpClient = new HttpClient({
      baseUrl: this.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
    });

    // Initialize feature clients
    this.tracing = new TracingClient(this.httpClient, this.baseUrl);
    // Future: this.vectordb = new VectorDBClient(this.httpClient, this.baseUrl);
  }

  /**
   * Validate configuration.
   */
  private validateConfig(config: MentioraConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new ConfigurationError('apiKey is required and must be a string');
    }

    if (!config.environment || !['staging', 'production'].includes(config.environment)) {
      throw new ConfigurationError(
        'environment must be either "staging" or "production"',
      );
    }
  }
}
