/**
 * SDK error types.
 */

export class MentioraTracingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MentioraTracingError';
  }
}

export class NetworkError extends MentioraTracingError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class ValidationError extends MentioraTracingError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends MentioraTracingError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}
