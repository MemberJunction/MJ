/**
 * Tests for MJAuth0Provider (browser-side Auth0 authentication provider).
 *
 * Specifically pins fast token-expiry detection and bounded silent refresh behavior:
 * - No 60-second hidden-iframe hang (`useRefreshTokensFallback: false`, `authorizeTimeoutInSeconds: 5`)
 * - Cached localStorage ID tokens past their `exp` claim are rejected locally before hitting GraphQL
 * - Expired cached tokens trigger an immediate bounded silent refresh during `initialize()`, and
 *   evict stale `@@auth0spajs@@*` localStorage entries + flip `isAuthenticated$` to `false` on failure
 *   so the login screen renders immediately.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BehaviorSubject, of, throwError, firstValueFrom } from 'rxjs';
import { AuthErrorType } from '../auth-types';

const auth0Mock = vi.hoisted(() => {
  class AuthService {}
  class AuthGuard {}
  class AuthConfigService {}
  class Auth0ClientService {}
  class AuthClientConfig {}
  const Auth0ClientFactory = { createClient: vi.fn() };
  return {
    AuthService,
    AuthGuard,
    AuthConfigService,
    Auth0ClientService,
    AuthClientConfig,
    Auth0ClientFactory,
  };
});

vi.mock('@auth0/auth0-angular', () => ({
  AuthService: auth0Mock.AuthService,
  AuthGuard: auth0Mock.AuthGuard,
  AuthConfigService: auth0Mock.AuthConfigService,
  Auth0ClientService: auth0Mock.Auth0ClientService,
  Auth0ClientFactory: auth0Mock.Auth0ClientFactory,
  AuthClientConfig: auth0Mock.AuthClientConfig,
}));

vi.mock('@angular/core', () => ({
  Injectable: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  AuthProviderConfig: class {},
  Metadata: { Provider: {} },
}));

vi.mock('@memberjunction/realtime-runtime', () => ({
  ReleaseRecordingShardsAtLogout: async () => ({ Delivered: 0, TimedOut: false }),
}));

interface MockIdTokenClaims {
  __raw: string;
  exp?: number;
  scope?: string;
}

interface MockAuth0User {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  picture?: string;
}

function createMockAuthService(options?: {
  isAuthenticated?: boolean;
  claims?: MockIdTokenClaims | null;
  user?: MockAuth0User | null;
}) {
  const isLoading$ = new BehaviorSubject<boolean>(false);
  const isAuthenticated$ = new BehaviorSubject<boolean>(options?.isAuthenticated ?? false);
  const idTokenClaims$ = new BehaviorSubject<MockIdTokenClaims | null>(options?.claims ?? null);
  const user$ = new BehaviorSubject<MockAuth0User | null>(options?.user ?? null);

  return {
    isLoading$,
    isAuthenticated$,
    idTokenClaims$,
    user$,
    getAccessTokenSilently: vi.fn(() => of('fresh-access-token')),
    loginWithRedirect: vi.fn(),
    logout: vi.fn(() => of(undefined)),
  };
}

function createMockLocalStorage(initialEntries: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialEntries));
  return {
    get length(): number {
      return store.size;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}

async function importProvider() {
  const mod = await import('../providers/mjexplorer-auth0-provider.service');
  return mod.MJAuth0Provider;
}

describe('MJAuth0Provider', () => {
  let mockStorage: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = createMockLocalStorage({
      '@@auth0spajs@@::client-1::default::openid profile email offline_access': '{"body":{}}',
      '@@auth0spajs@@::client-1::@@user@@': '{"user":{}}',
      'mj-theme': 'dark',
    });
    (global as Record<string, unknown>).localStorage = mockStorage;
    (global as Record<string, unknown>).window = {
      location: { pathname: '/', search: '', origin: 'http://localhost:4202' },
    };
    (global as Record<string, unknown>).document = {
      location: { origin: 'http://localhost:4202' },
    };
  });

  describe('AngularProviderFactory configuration', () => {
    it('disables iframe fallback and bounds authorizeTimeoutInSeconds to 5s to prevent 60s login hangs', async () => {
      const MJAuth0Provider = await importProvider();
      const providers = MJAuth0Provider.AngularProviderFactory({
        AUTH0_DOMAIN: 'dev-example.us.auth0.com',
        AUTH0_CLIENTID: 'client-123',
      }) as Array<{ provide?: unknown; useValue?: Record<string, unknown> }>;

      const configProvider = providers.find((p) => p.provide === auth0Mock.AuthConfigService);
      expect(configProvider).toBeDefined();
      expect(configProvider?.useValue).toMatchObject({
        domain: 'dev-example.us.auth0.com',
        clientId: 'client-123',
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
        useRefreshTokensFallback: false,
        authorizeTimeoutInSeconds: 5,
        skipRedirectCallback: false,
      });
    });

    it('sets skipRedirectCallback=true when pathname starts with /oauth/callback', async () => {
      (global as Record<string, unknown>).window = {
        location: { pathname: '/oauth/callback', search: '?code=abc', origin: 'http://localhost:4202' },
      };
      const MJAuth0Provider = await importProvider();
      const providers = MJAuth0Provider.AngularProviderFactory({
        AUTH0_DOMAIN: 'dev-example.us.auth0.com',
        AUTH0_CLIENTID: 'client-123',
      }) as Array<{ provide?: unknown; useValue?: Record<string, unknown> }>;

      const configProvider = providers.find((p) => p.provide === auth0Mock.AuthConfigService);
      expect(configProvider?.useValue?.['skipRedirectCallback']).toBe(true);
    });
  });

  describe('proactive token expiry detection in getIdToken and getTokenInfo', () => {
    it('returns the raw JWT when claims.exp is in the future', async () => {
      const MJAuth0Provider = await importProvider();
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const mockAuth = createMockAuthService({
        isAuthenticated: true,
        claims: { __raw: 'valid.jwt.token', exp: futureExp, scope: 'openid profile email' },
      });
      const provider = new MJAuth0Provider(mockAuth as unknown as InstanceType<typeof auth0Mock.AuthService>);

      expect(await provider.getIdToken()).toBe('valid.jwt.token');
      const tokenInfo = await provider.getTokenInfo();
      expect(tokenInfo).toEqual({
        idToken: 'valid.jwt.token',
        expiresAt: futureExp * 1000,
        scopes: ['openid', 'profile', 'email'],
      });
    });

    it('returns null when cached claims.exp is already in the past so expired tokens are never sent to GraphQL', async () => {
      const MJAuth0Provider = await importProvider();
      const expiredExp = Math.floor(Date.now() / 1000) - 60;
      const mockAuth = createMockAuthService({
        isAuthenticated: true,
        claims: { __raw: 'expired.jwt.token', exp: expiredExp },
      });
      const provider = new MJAuth0Provider(mockAuth as unknown as InstanceType<typeof auth0Mock.AuthService>);

      expect(await provider.getIdToken()).toBeNull();
      expect(await provider.getTokenInfo()).toBeNull();
    });
  });

  describe('initialize() with expired localStorage session', () => {
    it('silently refreshes during initialize() when cached ID token is expired and keeps session when refresh succeeds', async () => {
      const MJAuth0Provider = await importProvider();
      const expiredExp = Math.floor(Date.now() / 1000) - 120;
      const freshExp = Math.floor(Date.now() / 1000) + 3600;
      const mockAuth = createMockAuthService({
        isAuthenticated: true,
        claims: { __raw: 'expired.jwt.token', exp: expiredExp },
        user: { sub: 'auth0|123', email: 'test@example.com', name: 'Test User' },
      });

      mockAuth.getAccessTokenSilently.mockImplementation(() => {
        mockAuth.idTokenClaims$.next({ __raw: 'refreshed.jwt.token', exp: freshExp });
        return of('fresh-access-token');
      });

      const provider = new MJAuth0Provider(mockAuth as unknown as InstanceType<typeof auth0Mock.AuthService>);
      await provider.initialize();

      expect(mockAuth.getAccessTokenSilently).toHaveBeenCalledWith({
        cacheMode: 'off',
        timeoutInSeconds: 5,
      });
      expect(await firstValueFrom(provider.isAuthenticated())).toBe(true);
      expect(await provider.getIdToken()).toBe('refreshed.jwt.token');
    });

    it('immediately evicts stale @@auth0spajs@@ localStorage keys and marks unauthenticated when silent refresh fails', async () => {
      const MJAuth0Provider = await importProvider();
      const expiredExp = Math.floor(Date.now() / 1000) - 300;
      const mockAuth = createMockAuthService({
        isAuthenticated: true,
        claims: { __raw: 'expired.jwt.token', exp: expiredExp },
        user: { sub: 'auth0|123', email: 'test@example.com', name: 'Test User' },
      });

      mockAuth.getAccessTokenSilently.mockReturnValue(
        throwError(() => ({ error: 'missing_refresh_token', message: 'Missing Refresh Token' }))
      );

      const provider = new MJAuth0Provider(mockAuth as unknown as InstanceType<typeof auth0Mock.AuthService>);
      await provider.initialize();

      // Provider must report unauthenticated and null userInfo so login screen shows immediately
      expect(await firstValueFrom(provider.isAuthenticated())).toBe(false);
      expect(await firstValueFrom(provider.getUserInfo())).toBeNull();

      // Stale Auth0 keys are removed, while non-Auth0 keys (like mj-theme) remain intact
      expect(mockStorage.getItem('@@auth0spajs@@::client-1::default::openid profile email offline_access')).toBeNull();
      expect(mockStorage.getItem('@@auth0spajs@@::client-1::@@user@@')).toBeNull();
      expect(mockStorage.getItem('mj-theme')).toBe('dark');
    });
  });

  describe('classifyError', () => {
    it('classifies missing_refresh_token, invalid_grant, and timeout errors as TOKEN_EXPIRED', async () => {
      const MJAuth0Provider = await importProvider();
      const mockAuth = createMockAuthService();
      const provider = new MJAuth0Provider(mockAuth as unknown as InstanceType<typeof auth0Mock.AuthService>);

      expect(provider.classifyError({ error: 'missing_refresh_token', message: 'Missing Refresh Token' }).type)
        .toBe(AuthErrorType.TOKEN_EXPIRED);
      expect(provider.classifyError({ error: 'invalid_grant', message: 'Unknown or invalid refresh token.' }).type)
        .toBe(AuthErrorType.TOKEN_EXPIRED);
      expect(provider.classifyError({ error: 'timeout', message: 'Timeout' }).type)
        .toBe(AuthErrorType.TOKEN_EXPIRED);
      expect(provider.classifyError({ error: 'login_required', message: 'Login required' }).type)
        .toBe(AuthErrorType.NO_ACTIVE_SESSION);
    });
  });
});
