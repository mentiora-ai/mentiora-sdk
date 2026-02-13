/**
 * Tests for MentioraClient.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentioraClient } from '../client';
import { ConfigurationError } from '../errors';
import { TracingClient } from '../tracing/client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MentioraClient', () => {
  const validConfig = {
    apiKey: 'test-api-key',
  };

  describe('valid configuration', () => {
    it('creates client with minimal config', () => {
      const client = new MentioraClient({ apiKey: 'key' });
      expect(client).toBeInstanceOf(MentioraClient);
    });

    it('creates client with custom baseUrl', () => {
      const client = new MentioraClient({ apiKey: 'key', baseUrl: 'https://custom.example.com' });
      expect(client).toBeInstanceOf(MentioraClient);
    });

    it('exposes tracing property as TracingClient', () => {
      const client = new MentioraClient(validConfig);
      expect(client.tracing).toBeInstanceOf(TracingClient);
    });

    it('defaults debug to false', () => {
      const client = new MentioraClient(validConfig);
      expect(client.debug).toBe(false);
    });

    it('sets debug to true when configured', () => {
      const client = new MentioraClient({ ...validConfig, debug: true });
      expect(client.debug).toBe(true);
    });
  });

  describe('invalid configuration', () => {
    it('throws ConfigurationError when apiKey is missing', () => {
      expect(() => new MentioraClient({ apiKey: '' })).toThrow(ConfigurationError);
    });

    it('throws ConfigurationError when apiKey is not a string', () => {
      expect(
        () =>
          new MentioraClient({
            apiKey: 123 as unknown as string,
          })
      ).toThrow(ConfigurationError);
    });

    it('error message mentions apiKey for missing apiKey', () => {
      expect(() => new MentioraClient({ apiKey: '' })).toThrow(/apiKey/);
    });
  });

  describe('optional config', () => {
    it('accepts custom baseUrl', () => {
      const client = new MentioraClient({
        ...validConfig,
        baseUrl: 'https://custom.example.com',
      });
      expect(client).toBeInstanceOf(MentioraClient);
    });

    it('accepts custom timeout and retries', () => {
      const client = new MentioraClient({
        ...validConfig,
        timeout: 5000,
        retries: 1,
      });
      expect(client).toBeInstanceOf(MentioraClient);
    });
  });

  describe('HTTP base URL warning', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('warns when base URL uses HTTP (non-localhost)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      new MentioraClient({ apiKey: 'key', baseUrl: 'http://example.com' });
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP'));
    });

    it('does not warn for http://localhost', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      new MentioraClient({ apiKey: 'key', baseUrl: 'http://localhost:3000' });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for HTTPS URLs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      new MentioraClient({ apiKey: 'key', baseUrl: 'https://example.com' });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('trailing slash stripping', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('strips trailing slashes from baseUrl', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({}),
      });
      const client = new MentioraClient({ apiKey: 'key', baseUrl: 'https://example.com/' });
      await client.tracing.sendTrace({
        traceId: '01936b43-e000-7000-8000-000000000001',
        spanId: '01936b43-e000-7000-8000-000000000002',
        name: 'test',
        type: 'llm',
        startTime: new Date(),
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/api/v1/traces');
    });

    it('strips multiple trailing slashes', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({}),
      });
      const client = new MentioraClient({ apiKey: 'key', baseUrl: 'https://example.com///' });
      await client.tracing.sendTrace({
        traceId: '01936b43-e000-7000-8000-000000000001',
        spanId: '01936b43-e000-7000-8000-000000000002',
        name: 'test',
        type: 'llm',
        startTime: new Date(),
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/api/v1/traces');
    });
  });

  describe('close', () => {
    it('close() does not throw', () => {
      const client = new MentioraClient(validConfig);
      expect(() => client.close()).not.toThrow();
    });

    it('close() returns undefined (no-op)', () => {
      const client = new MentioraClient(validConfig);
      expect(client.close()).toBeUndefined();
    });
  });
});
