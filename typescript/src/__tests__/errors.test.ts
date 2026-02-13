/**
 * Tests for SDK error types.
 */

import { describe, expect, it } from 'vitest';
import { ConfigurationError, MentioraError, NetworkError, ValidationError } from '../errors';

describe('MentioraError', () => {
  it('is an instance of Error', () => {
    const err = new MentioraError('test', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    const err = new MentioraError('test', 'TEST_CODE');
    expect(err.name).toBe('MentioraError');
  });

  it('stores message and code', () => {
    const err = new MentioraError('something went wrong', 'MY_CODE');
    expect(err.message).toBe('something went wrong');
    expect(err.code).toBe('MY_CODE');
  });

  it('has a stack trace', () => {
    const err = new MentioraError('test', 'CODE');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('MentioraError');
  });
});

describe('NetworkError', () => {
  it('extends MentioraError', () => {
    const err = new NetworkError('network fail');
    expect(err).toBeInstanceOf(MentioraError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has NETWORK_ERROR code', () => {
    const err = new NetworkError('fail');
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('has correct name', () => {
    const err = new NetworkError('fail');
    expect(err.name).toBe('NetworkError');
  });

  it('stores optional statusCode', () => {
    const err = new NetworkError('server error', 500);
    expect(err.statusCode).toBe(500);
  });

  it('statusCode is undefined when not provided', () => {
    const err = new NetworkError('timeout');
    expect(err.statusCode).toBeUndefined();
  });
});

describe('ValidationError', () => {
  it('extends MentioraError', () => {
    const err = new ValidationError('invalid input');
    expect(err).toBeInstanceOf(MentioraError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has VALIDATION_ERROR code', () => {
    const err = new ValidationError('bad data');
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('has correct name', () => {
    const err = new ValidationError('bad');
    expect(err.name).toBe('ValidationError');
  });
});

describe('ConfigurationError', () => {
  it('extends MentioraError', () => {
    const err = new ConfigurationError('bad config');
    expect(err).toBeInstanceOf(MentioraError);
    expect(err).toBeInstanceOf(Error);
  });

  it('has CONFIGURATION_ERROR code', () => {
    const err = new ConfigurationError('missing key');
    expect(err.code).toBe('CONFIGURATION_ERROR');
  });

  it('has correct name', () => {
    const err = new ConfigurationError('bad');
    expect(err.name).toBe('ConfigurationError');
  });

  it('stores the error message', () => {
    const err = new ConfigurationError('apiKey is required');
    expect(err.message).toBe('apiKey is required');
  });
});

describe('error hierarchy', () => {
  it('all errors can be caught as MentioraError', () => {
    const errors = [
      new NetworkError('net'),
      new ValidationError('val'),
      new ConfigurationError('cfg'),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(MentioraError);
    }
  });

  it('all errors can be caught as Error', () => {
    const errors = [
      new MentioraError('base', 'CODE'),
      new NetworkError('net'),
      new ValidationError('val'),
      new ConfigurationError('cfg'),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(Error);
    }
  });
});
