import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: unknown) => target,
  Inject: () => () => {},
  Optional: () => () => {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  AuthProviderConfig: class {},
  Metadata: { Provider: null },
}));

vi.mock('@memberjunction/realtime-runtime', () => ({
  ReleaseRecordingShardsAtLogout: async () => ({ Delivered: 0, TimedOut: false }),
}));

function buildMockJwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payload}.sig`;
}

describe('MJLocalDevProvider', () => {
  let storageMap: Map<string, string>;

  beforeEach(() => {
    storageMap = new Map();
    (global as Record<string, unknown>).window = {
      location: { pathname: '/', search: '', origin: 'http://localhost:4202' },
    };
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, val),
      removeItem: (key: string) => storageMap.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires no config keys and validates empty config', async () => {
    const { MJLocalDevProvider } = await import('../providers/mjexplorer-local-dev-provider.service');
    const provider = new MJLocalDevProvider({ graphqlUri: 'http://localhost:4000/' });
    expect(provider.type).toBe('local');
    expect(provider.getRequiredConfig()).toEqual([]);
    expect(provider.validateConfig({})).toBe(true);
  });

  it('automatically acquires a dev JWT from /auth/dev-login on initialize()', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const mockToken = buildMockJwt({
      sub: 'local-dev|u-1',
      email: 'admin@memberjunction.org',
      given_name: 'Admin',
      family_name: 'User',
      name: 'Admin User',
      exp,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: mockToken,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { MJLocalDevProvider } = await import('../providers/mjexplorer-local-dev-provider.service');
    const provider = new MJLocalDevProvider({ graphqlUri: 'http://localhost:4000/' });
    await provider.initialize();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/auth/dev-login',
      expect.objectContaining({ method: 'POST' })
    );
    expect(await firstValueFrom(provider.isAuthenticated())).toBe(true);
    expect(await provider.getIdToken()).toBe(mockToken);
    const userInfo = await firstValueFrom(provider.getUserInfo());
    expect(userInfo?.email).toBe('admin@memberjunction.org');
    expect(userInfo?.name).toBe('Admin User');
  });
});
