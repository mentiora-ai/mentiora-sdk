/**
 * SDK error types.
 */

export class MentioraError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MentioraError';
  }
}

export class NetworkError extends MentioraError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class ValidationError extends MentioraError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends MentioraError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}
