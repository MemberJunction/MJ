/**
 * Regression tests for Box access-token renewal on a long-lived driver.
 *
 * Box access tokens live about an hour (client-credentials lifetimes vary, observed 62-71 min).
 * A driver authenticated with client credentials only (client ID + secret + enterprise ID, no
 * refresh token) had no renewal path: once its token entered the driver's stale window
 * (expires_in - 60s - 5 min, so roughly 55-65 minutes after initialize), every read threw
 * `Cannot refresh Box token: missing credentials` until the server restarted. Code that builds
 * a fresh driver per request never noticed; code that reuses one driver (media streaming)
 * broke about an hour after startup.
 *
 * The Box token endpoint and SDK are faked here so a token that has really expired is rejected
 * the way Box rejects it — the tests assert on what a caller sees, not on driver internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';

/** Token lifetime Box reports in `expires_in`. */
const BOX_TOKEN_LIFETIME_SECONDS = 3600;
/** Past the driver's renewal window (expiry - 60s - 5min ≈ 54 min) but before Box's real 60-minute expiry. */
const FIFTY_SIX_MINUTES_MS = 56 * 60 * 1000;

const fakeBox = vi.hoisted(() => ({
  /** access token → epoch ms at which Box stops accepting it */
  tokenExpiry: new Map<string, number>(),
  /** grant_type of every token-endpoint request, in order */
  grants: [] as string[],
  /** access token presented on each download */
  downloadTokens: [] as string[],
  issued: 0,
}));

vi.mock('box-node-sdk', () => {
  class BoxDeveloperTokenAuth {
    constructor(public readonly config: { token: string }) {}
  }

  /** Rejects a token the way Box does once it is past its expiry. */
  function assertTokenAccepted(token: string): void {
    const expiresAt = fakeBox.tokenExpiry.get(token);
    if (expiresAt === undefined || Date.now() >= expiresAt) {
      throw new Error('401 Unauthorized: access token expired');
    }
  }

  class BoxClient {
    public readonly files: { getFileById: (id: string) => Promise<Record<string, string | number>> };
    public readonly folders: { getFolderById: (id: string) => Promise<never> };
    public readonly downloads: { downloadFile: (id: string) => Promise<Readable> };

    constructor({ auth }: { auth: BoxDeveloperTokenAuth }) {
      const token = auth.config.token;
      this.files = {
        getFileById: async (id: string) => {
          assertTokenAccepted(token);
          return { id, type: 'file', name: 'recording.wav', size: 5, content_type: 'audio/wav' };
        },
      };
      this.folders = {
        getFolderById: async () => {
          throw new Error('not a folder');
        },
      };
      this.downloads = {
        downloadFile: async () => {
          assertTokenAccepted(token);
          fakeBox.downloadTokens.push(token);
          return Readable.from(Buffer.from('audio'));
        },
      };
    }
  }

  return { BoxDeveloperTokenAuth, BoxClient };
});

// Keep any real Box settings in a developer's mj.config out of the driver's constructor.
vi.mock('../config', () => ({ GetProviderConfig: () => undefined }));

/** Fake `https://api.box.com/oauth2/token` that issues tokens with a real expiry. */
async function FakeTokenEndpoint(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const body = new URLSearchParams(String(init?.body));
  const grant = body.get('grant_type') ?? '';
  fakeBox.grants.push(grant);

  fakeBox.issued += 1;
  const accessToken = `${grant}-access-${fakeBox.issued}`;
  fakeBox.tokenExpiry.set(accessToken, Date.now() + BOX_TOKEN_LIFETIME_SECONDS * 1000);

  const payload: { access_token: string; expires_in: number; refresh_token?: string } = {
    access_token: accessToken,
    expires_in: BOX_TOKEN_LIFETIME_SECONDS,
  };
  if (grant === 'refresh_token') payload.refresh_token = `refresh-${fakeBox.issued}`;

  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const BOX_ENV_VARS = [
  'STORAGE_BOX_ACCESS_TOKEN',
  'STORAGE_BOX_REFRESH_TOKEN',
  'STORAGE_BOX_CLIENT_ID',
  'STORAGE_BOX_CLIENT_SECRET',
  'STORAGE_BOX_ENTERPRISE_ID',
];

describe('BoxFileStorage — access-token renewal on a long-lived driver', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fakeBox.tokenExpiry.clear();
    fakeBox.grants.length = 0;
    fakeBox.downloadTokens.length = 0;
    fakeBox.issued = 0;
    for (const name of BOX_ENV_VARS) vi.stubEnv(name, undefined);
    globalThis.fetch = FakeTokenEndpoint as typeof fetch;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('renews a client-credentials token instead of throwing once it nears expiry', async () => {
    const { BoxFileStorage } = await import('../drivers/BoxFileStorage');
    const driver = new BoxFileStorage();
    await driver.initialize({ clientID: 'client-id', clientSecret: 'client-secret', enterpriseID: 'enterprise-id' });

    vi.advanceTimersByTime(FIFTY_SIX_MINUTES_MS);
    const result = await driver.GetObjectStream({ objectId: 'file-1' });

    expect(result.ContentLength).toBe(5);
    expect(fakeBox.grants).toEqual(['client_credentials', 'client_credentials']);
    expect(fakeBox.downloadTokens).toEqual(['client_credentials-access-2']);
  });

  it('keeps renewing a client-credentials token across several token lifetimes', async () => {
    const { BoxFileStorage } = await import('../drivers/BoxFileStorage');
    const driver = new BoxFileStorage();
    await driver.initialize({ clientID: 'client-id', clientSecret: 'client-secret', enterpriseID: 'enterprise-id' });

    for (let hour = 0; hour < 3; hour++) {
      vi.advanceTimersByTime(FIFTY_SIX_MINUTES_MS);
      await expect(driver.GetObject({ objectId: 'file-1' })).resolves.toEqual(Buffer.from('audio'));
    }

    expect(fakeBox.grants).toEqual(Array(4).fill('client_credentials'));
  });

  it('still renews a refresh-token driver with the refresh_token grant and persists the new refresh token', async () => {
    const { BoxFileStorage } = await import('../drivers/BoxFileStorage');
    const driver = new BoxFileStorage();
    const onTokenRefresh = vi.fn(async () => {});
    await driver.initialize({
      clientID: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-0',
      // An enterprise ID alongside a refresh token must not switch the driver to client credentials.
      enterpriseID: 'enterprise-id',
      onTokenRefresh,
    });

    vi.advanceTimersByTime(FIFTY_SIX_MINUTES_MS);
    await driver.GetObjectStream({ objectId: 'file-1' });

    expect(fakeBox.grants).toEqual(['refresh_token', 'refresh_token']);
    expect(fakeBox.downloadTokens).toEqual(['refresh_token-access-2']);
    expect(onTokenRefresh).toHaveBeenLastCalledWith('refresh-2', 'refresh_token-access-2');
  });

  it('throws a descriptive error when there is nothing to renew the token with', async () => {
    const { BoxFileStorage } = await import('../drivers/BoxFileStorage');
    const driver = new BoxFileStorage();
    // A bare access token cannot be renewed; give it a known expiry so the driver notices.
    await driver.initialize({ accessToken: 'static-token' });
    (driver as unknown as { _tokenExpiresAt: number })._tokenExpiresAt = Date.now() + 10 * 60 * 1000;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.advanceTimersByTime(FIFTY_SIX_MINUTES_MS);

    await expect(driver.GetObject({ objectId: 'file-1' })).rejects.toThrow('Failed to get object: file-1');
    const loggedErrors = consoleError.mock.calls.map((call) => String((call[1] as { error?: unknown })?.error));
    expect(loggedErrors.join('\n')).toMatch(/Cannot refresh Box token: missing credentials/);
    consoleError.mockRestore();
  });
});
