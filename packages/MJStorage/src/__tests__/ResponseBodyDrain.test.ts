/**
 * Regression tests for the "unconsumed fetch response body on an error path" leak found by
 * the 2026-08-29 memory-leak audit (Round 12, Subagent H): several drivers threw immediately
 * after checking `response.ok` without ever reading or cancelling `response.body`. Under
 * Node's native `fetch` (undici), that pins the underlying connection out of the keep-alive
 * pool until GC finalizes the abandoned stream — a leak whose rate scales with the error rate
 * (token failures) or the file size (chunked uploads/downloads), not with any bug in the
 * driver's own state.
 *
 * These tests assert the fix: every early-throw branch after a `fetch()`/`SafeFetch()` call
 * now drains the body via `@memberjunction/network-utils`'s `DrainResponseBody` before
 * throwing, verified here by spying on the mocked response's `body.cancel()`.
 */
import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';

/** A fetch-response-shaped stub whose body is a real WHATWG stream with a spy-able `cancel`. */
function StubResponse(opts: { ok: boolean; status: number; statusText?: string; headers?: Record<string, string> }) {
  const cancel = vi.fn(async () => {});
  const body = Readable.toWeb(Readable.from(Buffer.from('irrelevant body content'))) as ReadableStream;
  const originalCancel = body.cancel.bind(body);
  body.cancel = ((...args: unknown[]) => {
    cancel(...args);
    return originalCancel(...args);
  }) as typeof body.cancel;

  return {
    cancel,
    response: {
      ok: opts.ok,
      status: opts.status,
      statusText: opts.statusText ?? 'Error',
      headers: new Headers(opts.headers ?? {}),
      body,
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response,
  };
}

describe('SharePointFileStorage — drains response body on error paths', () => {
  it('GetObject drains the download-url response body before throwing on a non-2xx', async () => {
    const { SharePointFileStorage } = await import('../drivers/SharePointFileStorage');
    const driver = new SharePointFileStorage();

    const mockClient = {
      api: (_path: string) => ({
        get: async () => ({ '@microsoft.graph.downloadUrl': 'https://sp.example/download/f.bin' }),
      }),
    };
    (driver as unknown as { _client: typeof mockClient; _driveId: string })._client = mockClient;
    (driver as unknown as { _driveId: string })._driveId = 'drive-1';

    const { cancel, response } = StubResponse({ ok: false, status: 500, statusText: 'Server Error' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => response) as unknown as typeof fetch;

    try {
      await expect(driver.GetObject({ objectId: 'item-1' })).rejects.toThrow('Failed to get object');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('GetObjectStream drains the download-url response body before throwing on a non-2xx/non-206', async () => {
    const { SharePointFileStorage } = await import('../drivers/SharePointFileStorage');
    const driver = new SharePointFileStorage();

    const mockClient = {
      api: (_path: string) => ({
        get: async () => ({ '@microsoft.graph.downloadUrl': 'https://sp.example/download/f.bin', size: 4, name: 'f.bin' }),
      }),
    };
    (driver as unknown as { _client: typeof mockClient; _driveId: string })._client = mockClient;
    (driver as unknown as { _driveId: string })._driveId = 'drive-1';

    const { cancel, response } = StubResponse({ ok: false, status: 403, statusText: 'Forbidden' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => response) as unknown as typeof fetch;

    try {
      await expect(driver.GetObjectStream({ objectId: 'item-1' })).rejects.toThrow('Failed to stream object');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('DropboxFileStorage — drains response body on error paths', () => {
  it('GetObjectStream drains the temporary-link response body before throwing on a non-2xx/non-206', async () => {
    const { DropboxFileStorage } = await import('../drivers/DropboxFileStorage');
    const driver = new DropboxFileStorage();

    const mockClient = {
      filesGetTemporaryLink: async () => ({
        result: { link: 'https://dl.dropboxusercontent.com/f.bin', metadata: { size: 4, name: 'f.bin' } },
      }),
    };
    (driver as unknown as { _client: typeof mockClient })._client = mockClient;

    const { cancel, response } = StubResponse({ ok: false, status: 429, statusText: 'Too Many Requests' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => response) as unknown as typeof fetch;

    try {
      await expect(driver.GetObjectStream({ objectId: 'a4ayc_80' })).rejects.toThrow('Failed to stream object');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('BoxFileStorage — drains response body on error paths', () => {
  it('_getAccessToken drains the token-endpoint response body before throwing', async () => {
    const { BoxFileStorage } = await import('../drivers/BoxFileStorage');
    const driver = new BoxFileStorage();
    (driver as unknown as { _clientId: string; _clientSecret: string; _enterpriseId: string })._clientId = 'client-id';
    (driver as unknown as { _clientId: string; _clientSecret: string; _enterpriseId: string })._clientSecret = 'client-secret';
    (driver as unknown as { _clientId: string; _clientSecret: string; _enterpriseId: string })._enterpriseId = 'enterprise-id';

    const { cancel, response } = StubResponse({ ok: false, status: 400, statusText: 'Bad Request' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => response) as unknown as typeof fetch;

    try {
      await expect(
        (driver as unknown as { _getAccessToken: () => Promise<string> })._getAccessToken()
      ).rejects.toThrow('Failed to authenticate with Box');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('_refreshAccessToken drains the token-endpoint response body before throwing', async () => {
    const { BoxFileStorage } = await import('../drivers/BoxFileStorage');
    const driver = new BoxFileStorage();
    (driver as unknown as { _refreshToken: string; _clientId: string; _clientSecret: string })._refreshToken = 'refresh-token';
    (driver as unknown as { _refreshToken: string; _clientId: string; _clientSecret: string })._clientId = 'client-id';
    (driver as unknown as { _refreshToken: string; _clientId: string; _clientSecret: string })._clientSecret = 'client-secret';

    const { cancel, response } = StubResponse({ ok: false, status: 401, statusText: 'Unauthorized' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => response) as unknown as typeof fetch;

    try {
      await expect(
        (driver as unknown as { _refreshAccessToken: () => Promise<unknown> })._refreshAccessToken()
      ).rejects.toThrow('Failed to refresh token');
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
