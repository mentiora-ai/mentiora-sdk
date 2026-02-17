/**
 * Mentiora SDK client.
 *
 * Main entry point for the Mentiora SDK. Provides access to all SDK features
 * through namespaced properties (e.g., client.tracing).
 */

import { AgentsClient } from './agents';
import { ConfigurationError } from './errors';
import { HttpClient } from './http';
import { TracingClient } from './tracing/client';
import type { MentioraConfig } from './types';

const DEFAULT_BASE_URL = 'https://platform.mentiora.ai';

/**
 * Main Mentiora SDK client.
 *
 * Provides access to all SDK features through namespaced properties:
 * - `client.tracing` - Send agent traces
 */
export class MentioraClient {
  public readonly tracing: TracingClient;
  public readonly agents: AgentsClient;
  public readonly debug: boolean;

  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  /**
   * @param config - SDK configuration (API key, optional baseUrl).
   */
  constructor(config: MentioraConfig) {
    this.validateConfig(config);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.debug = config.debug ?? false;

    if (this.baseUrl.startsWith('http://') && !this.baseUrl.startsWith('http://localhost')) {
      console.warn(
        '[Mentiora] Warning: base URL uses HTTP. API key will be sent in cleartext. Use HTTPS in production.'
      );
    }
    this.httpClient = new HttpClient({
      baseUrl: this.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      debug: this.debug,
    });

    // Initialize feature clients
    this.tracing = new TracingClient(this.httpClient);
    this.agents = new AgentsClient(this.httpClient);
  }

  /**
   * Validate configuration.
   *
   * @param config - SDK configuration to validate.
   * @throws {@link ConfigurationError} if `apiKey` is invalid.
   */
  private validateConfig(config: MentioraConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new ConfigurationError('apiKey is required and must be a string');
    }
  }

  /**
   * Close the client and release resources.
   *
   * No-op in TypeScript (uses stateless fetch). Python's close() releases
   * httpx connection pools. Provided for API parity across SDKs.
   */
  close(): void {
    // No-op: fetch() is stateless, no resources to release
  }
}
