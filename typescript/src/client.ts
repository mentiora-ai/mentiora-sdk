/**
 * Mentiora SDK client.
 *
 * Main entry point for the Mentiora SDK. Provides access to all SDK features
 * through namespaced properties (e.g., client.tracing).
 */

import { AgentsClient } from './agents';
import { ConfigurationError } from './errors';
import { FilesClient } from './files';
import { HttpClient } from './http';
import { KnowledgeClient } from './knowledge';
import { TracingClient } from './tracing/client';
import type { MentioraBrowserConfig, MentioraConfig, MentioraServerConfig } from './types';

const DEFAULT_BASE_URL = 'https://platform.mentiora.ai';

export type SdkMode = 'server' | 'browser';

/** Type guard: config has apiKey → server mode. */
function isServerConfig(config: MentioraConfig): config is MentioraServerConfig {
  return 'apiKey' in config && typeof (config as MentioraServerConfig).apiKey === 'string';
}

/** Type guard: config has publishableKey → browser mode. */
function isBrowserConfig(config: MentioraConfig): config is MentioraBrowserConfig {
  return (
    'publishableKey' in config &&
    typeof (config as MentioraBrowserConfig).publishableKey === 'string'
  );
}

/**
 * Main Mentiora SDK client.
 *
 * Supports two modes:
 * - **Server** (`apiKey`): Full access. For Node.js backends, API routes, scripts.
 * - **Browser** (`publishableKey`): Widget-safe. For React components, browser widgets.
 *
 * Provides access to all SDK features through namespaced properties:
 * - `client.tracing` - Send agent traces (server mode only)
 * - `client.agents` - Run agents and manage threads
 */
export class MentioraClient {
  public readonly agents: AgentsClient;
  public readonly files: FilesClient;
  public readonly knowledge: KnowledgeClient;
  public readonly debug: boolean;
  public readonly mode: SdkMode;

  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;
  private _tracing: TracingClient | undefined;

  /**
   * @param config - SDK configuration. Provide `apiKey` for server mode or `publishableKey` for browser mode.
   */
  constructor(config: MentioraConfig) {
    this.validateConfig(config);
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.debug = config.debug ?? false;

    if (isServerConfig(config)) {
      this.mode = 'server';

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

      this._tracing = new TracingClient(this.httpClient);
    } else {
      // Browser mode
      this.mode = 'browser';
      const browserConfig = config as MentioraBrowserConfig;

      this.httpClient = new HttpClient({
        baseUrl: this.baseUrl,
        publishableKey: browserConfig.publishableKey,
        identityToken: browserConfig.identityToken,
        getIdentityToken: browserConfig.getIdentityToken,
        timeout: config.timeout ?? 30000,
        retries: config.retries ?? 3,
        debug: this.debug,
      });
    }

    this.agents = new AgentsClient(this.httpClient);
    this.files = new FilesClient(this.httpClient);
    this.knowledge = new KnowledgeClient(this.httpClient);
  }

  /**
   * Tracing client (server mode only).
   * @throws {@link ConfigurationError} in browser mode.
   */
  get tracing(): TracingClient {
    if (!this._tracing) {
      throw new ConfigurationError(
        'tracing is only available in server mode (initialized with apiKey). ' +
          'Browser mode (publishableKey) does not support sending traces.'
      );
    }
    return this._tracing;
  }

  /**
   * Validate configuration.
   * Exactly one of `apiKey` or `publishableKey` must be provided.
   */
  private validateConfig(config: MentioraConfig): void {
    const hasApiKey = isServerConfig(config);
    const hasPublishableKey = isBrowserConfig(config);

    if (hasApiKey && hasPublishableKey) {
      throw new ConfigurationError(
        'Provide either apiKey (server mode) or publishableKey (browser mode), not both'
      );
    }

    if (!hasApiKey && !hasPublishableKey) {
      throw new ConfigurationError('Either apiKey or publishableKey is required');
    }

    if (hasApiKey && !config.apiKey) {
      throw new ConfigurationError('apiKey must be a non-empty string');
    }

    if (hasPublishableKey) {
      const bc = config as MentioraBrowserConfig;
      if (!bc.publishableKey) {
        throw new ConfigurationError('publishableKey must be a non-empty string');
      }
      if (bc.identityToken && bc.getIdentityToken) {
        // Both are allowed — identityToken is used initially, getIdentityToken refreshes on 401
      }
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
