/**
 * SDK error types.
 */

/**
 * Base exception for all Mentiora SDK errors.
 *
 * @param message - Human-readable error description.
 * @param code - Machine-readable error code (e.g., `'NETWORK_ERROR'`).
 */
export class MentioraError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'MentioraError';
  }
}

/**
 * Network or HTTP transport error.
 *
 * Thrown when an HTTP request fails due to connectivity issues, timeouts,
 * or non-successful status codes after all retries are exhausted.
 *
 * @param message - Human-readable error description.
 * @param statusCode - HTTP status code, if available.
 */
export class NetworkError extends MentioraError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly serverCode?: string,
    public readonly serverMessage?: string
  ) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Invalid input data error.
 *
 * Thrown when a trace event or other input fails validation
 * (e.g., missing required fields).
 *
 * @param message - Human-readable validation error description.
 */
export class ValidationError extends MentioraError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Invalid SDK configuration error.
 *
 * Thrown when the SDK is initialized with invalid configuration
 * (e.g., missing API key).
 *
 * @param message - Human-readable configuration error description.
 */
export class ConfigurationError extends MentioraError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}
