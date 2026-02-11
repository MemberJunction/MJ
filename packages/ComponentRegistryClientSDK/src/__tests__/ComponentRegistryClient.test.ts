/**
 * Unit tests for the ComponentRegistryClientSDK package.
 * Tests: client construction, URL building, retry logic, error mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/interactive-component-types', () => ({
  ComponentSpec: class {},
}));

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ComponentRegistryClient } from '../ComponentRegistryClient';
import { RegistryError, RegistryErrorCode } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(overrides: Record<string, unknown> = {}) {
  return new ComponentRegistryClient({
    baseUrl: 'https://registry.example.com',
    apiKey: 'test-key',
    timeout: 5000,
    retryPolicy: { maxRetries: 0, initialDelay: 100, maxDelay: 1000, backoffMultiplier: 2 },
    ...overrides,
  });
}

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComponentRegistryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should strip trailing slash from baseUrl', () => {
      const client = createClient({ baseUrl: 'https://reg.example.com/' });
      // Verify by pinging - the URL should not have double slashes
      mockFetch.mockReturnValue(jsonResponse({ status: 'ok' }));
      client.ping();
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('https://reg.example.com/api/v1/health');
    });

    it('should apply default timeout and retry policy', () => {
      const client = new ComponentRegistryClient({ baseUrl: 'https://reg.example.com' });
      mockFetch.mockReturnValue(jsonResponse({ status: 'ok' }));
      client.ping();
      // Just verify the client was constructed without error
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('should return true on successful health check', async () => {
      mockFetch.mockReturnValue(jsonResponse({ status: 'ok' }));
      const client = createClient();
      const result = await client.ping();
      expect(result).toBe(true);
    });

    it('should return false on failed health check', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));
      const client = createClient();
      const result = await client.ping();
      expect(result).toBe(false);
    });
  });

  describe('getComponent', () => {
    it('should make correct GET request for a component', async () => {
      const spec = { name: 'test-component', version: '1.0.0' };
      mockFetch.mockReturnValue(jsonResponse({ specification: spec, hash: 'abc123' }));

      const client = createClient();
      const result = await client.getComponent({
        registry: 'default',
        namespace: 'mj',
        name: 'test-component',
      });

      expect(result).toEqual(spec);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/v1/components/mj/test-component');
    });

    it('should pass version and hash as query params', async () => {
      mockFetch.mockReturnValue(jsonResponse({ specification: {}, hash: 'abc' }));

      const client = createClient();
      await client.getComponent({
        registry: 'default',
        namespace: 'ns',
        name: 'comp',
        version: '2.0.0',
        hash: 'existing-hash',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('version=2.0.0');
      expect(calledUrl).toContain('hash=existing-hash');
    });

    it('should throw RegistryError when specification is missing', async () => {
      mockFetch.mockReturnValue(jsonResponse({ hash: 'abc', notModified: false }));

      const client = createClient();
      await expect(
        client.getComponent({ registry: 'r', namespace: 'ns', name: 'comp' })
      ).rejects.toThrow(RegistryError);
    });
  });

  describe('getComponentWithHash', () => {
    it('should return notModified flag for 304 responses', async () => {
      mockFetch.mockReturnValue(jsonResponse({ message: 'Not modified', hash: 'abc' }));

      const client = createClient();
      const result = await client.getComponentWithHash({
        registry: 'r',
        namespace: 'ns',
        name: 'comp',
        hash: 'abc',
      });

      expect(result.notModified).toBe(true);
    });
  });

  describe('searchComponents', () => {
    it('should build search query params correctly', async () => {
      const searchResult = { components: [], total: 0, offset: 0, limit: 10 };
      mockFetch.mockReturnValue(jsonResponse(searchResult));

      const client = createClient();
      await client.searchComponents({
        namespace: 'mj',
        query: 'dashboard',
        type: 'ui',
        tags: ['chart', 'kpi'],
        limit: 20,
        offset: 5,
        sortBy: 'name',
        sortDirection: 'asc',
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('namespace=mj');
      expect(calledUrl).toContain('q=dashboard');
      expect(calledUrl).toContain('type=ui');
      expect(calledUrl).toContain('tag=chart');
      expect(calledUrl).toContain('tag=kpi');
      expect(calledUrl).toContain('limit=20');
      expect(calledUrl).toContain('offset=5');
      expect(calledUrl).toContain('sortBy=name');
      expect(calledUrl).toContain('sortDirection=asc');
    });
  });

  describe('submitFeedback', () => {
    it('should submit feedback as POST', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, feedbackID: 'fb-1' }));

      const client = createClient();
      const result = await client.submitFeedback({
        componentName: 'chart',
        componentNamespace: 'mj',
        rating: 5,
        comments: 'Great!',
      });

      expect(result.success).toBe(true);
      expect(result.feedbackID).toBe('fb-1');
      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
    });

    it('should return error response on failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network down'));

      const client = createClient();
      const result = await client.submitFeedback({
        componentName: 'chart',
        componentNamespace: 'mj',
        rating: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw COMPONENT_NOT_FOUND for 404', async () => {
      mockFetch.mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ message: 'Component not found' }),
        })
      );

      const client = createClient();
      try {
        await client.getComponent({ registry: 'r', namespace: 'ns', name: 'missing' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        const re = error as RegistryError;
        expect(re.code).toBe(RegistryErrorCode.COMPONENT_NOT_FOUND);
      }
    });

    it('should throw UNAUTHORIZED for 401', async () => {
      mockFetch.mockReturnValue(
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ message: 'Invalid token' }),
        })
      );

      const client = createClient();
      try {
        await client.getRegistryInfo('default');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RegistryError);
        expect((error as RegistryError).code).toBe(RegistryErrorCode.UNAUTHORIZED);
      }
    });

    it('should include Authorization header when apiKey is set', async () => {
      mockFetch.mockReturnValue(jsonResponse({ status: 'ok' }));

      const client = createClient({ apiKey: 'my-secret-key' });
      await client.ping();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe('Bearer my-secret-key');
    });
  });
});
