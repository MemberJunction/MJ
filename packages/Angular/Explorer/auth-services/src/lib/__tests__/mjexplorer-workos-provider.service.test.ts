/**
 * Tests for MJWorkOSProvider (the browser-side WorkOS AuthKit provider).
 *
 * The provider wraps the vanilla-JS `@workos-inc/authkit-js` SDK behind MJAuthBase. These tests
 * mock that SDK (createClient → a fake client, getClaims, and the typed error classes) plus the
 * Angular decorators and MJ class factory, then drive the provider through its lifecycle and
 * abstract-method implementations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { AuthErrorType } from '../auth-types';

// Shared SDK mock surface — hoisted so it's available inside vi.mock factories.
const sdk = vi.hoisted(() => {
  class LoginRequiredError extends Error {}
  class NoSessionError extends Error {}
  class RefreshTimeoutError extends Error {}
  const mockClient = {
    getUser: vi.fn(),
    getAccessToken: vi.fn(),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    LoginRequiredError,
    NoSessionError,
    RefreshTimeoutError,
    mockClient,
    createClient: vi.fn().mockResolvedValue(mockClient),
    getClaims: vi.fn(),
  };
});

vi.mock('@workos-inc/authkit-js', () => ({
  createClient: sdk.createClient,
  getClaims: sdk.getClaims,
  LoginRequiredError: sdk.LoginRequiredError,
  NoSessionError: sdk.NoSessionError,
  RefreshTimeoutError: sdk.RefreshTimeoutError,
}));

vi.mock('@angular/core', () => ({
  Injectable: () => (target: unknown) => target,
  Inject: () => () => {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  AuthProviderConfig: class {},
}));

type WorkOSUser = {
  object: 'user';
  id: string;
  email: string;
  emailVerified: boolean;
  profilePictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: string | null;
  externalId: string | undefined;
  createdAt: string;
  updatedAt: string;
};

function makeUser(overrides: Partial<WorkOSUser> = {}): WorkOSUser {
  return {
    object: 'user',
    id: 'user_01HXYZ',
    email: 'ada@example.com',
    emailVerified: true,
    profilePictureUrl: 'https://img.example.com/ada.png',
    firstName: 'Ada',
    lastName: 'Lovelace',
    lastSignInAt: null,
    externalId: undefined,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    ...overrides,
  };
}

async function importProvider() {
  const mod = await import('../providers/mjexplorer-workos-provider.service');
  return mod.MJWorkOSProvider;
}

function newProvider(Provider: Awaited<ReturnType<typeof importProvider>>) {
  return new Provider({ clientId: 'client_01HABCDEF', redirectUri: 'http://localhost' });
}

describe('MJWorkOSProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.createClient.mockResolvedValue(sdk.mockClient);
    (global as Record<string, unknown>).window = {
      location: { pathname: '/', search: '', origin: 'http://localhost' },
    };
  });

  describe('static configuration', () => {
    it('declares the workos type and required config', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      expect(provider.type).toBe('workos');
      expect(provider.getRequiredConfig()).toEqual(['clientId']);
    });

    it('validateConfig requires a clientId (from config token or argument)', async () => {
      const Provider = await importProvider();
      // clientId supplied via the injected token
      expect(newProvider(Provider).validateConfig({})).toBe(true);
      // no token clientId, but provided in the argument
      const noTokenProvider = new Provider({ clientId: '' });
      expect(noTokenProvider.validateConfig({ clientId: 'client_x' })).toBe(true);
      expect(noTokenProvider.validateConfig({})).toBe(false);
    });

    it('angularProviderFactory maps environment keys to the workosConfig token', async () => {
      const Provider = await importProvider();
      const services = Provider.angularProviderFactory({
        WORKOS_CLIENTID: 'client_env',
        WORKOS_API_HOSTNAME: 'auth.example.com',
        WORKOS_DEV_MODE: true,
      });
      expect(services[0].provide).toBe('workosConfig');
      expect(services[0].useValue).toMatchObject({
        clientId: 'client_env',
        apiHostname: 'auth.example.com',
        devMode: true,
        redirectUri: 'http://localhost', // falls back to window.location.origin
      });
    });
  });

  describe('initialize', () => {
    it('creates the AuthKit client and publishes the authenticated user', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(makeUser());

      await provider.initialize();

      expect(sdk.createClient).toHaveBeenCalledWith(
        'client_01HABCDEF',
        expect.objectContaining({ redirectUri: 'http://localhost' }),
      );
      expect(await firstValueFrom(provider.isAuthenticated())).toBe(true);
      const info = await firstValueFrom(provider.getUserInfo());
      expect(info).toMatchObject({
        id: 'user_01HXYZ',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        givenName: 'Ada',
        familyName: 'Lovelace',
        pictureUrl: 'https://img.example.com/ada.png',
        emailVerified: true,
      });
      expect(await firstValueFrom(provider.getUserEmail())).toBe('ada@example.com');
    });

    it('publishes unauthenticated state when there is no session', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(null);

      await provider.initialize();

      expect(await firstValueFrom(provider.isAuthenticated())).toBe(false);
      expect(await firstValueFrom(provider.getUserInfo())).toBeNull();
    });

    it('is idempotent — a second initialize does not recreate the client', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(null);

      await provider.initialize();
      await provider.initialize();

      expect(sdk.createClient).toHaveBeenCalledTimes(1);
    });

    it('falls back to email for the display name when first/last are null', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(
        makeUser({ firstName: null, lastName: null, email: 'noname@example.com' }),
      );

      await provider.initialize();

      const info = await firstValueFrom(provider.getUserInfo());
      expect(info?.name).toBe('noname@example.com');
      expect(info?.givenName).toBeUndefined();
      expect(info?.familyName).toBeUndefined();
    });
  });

  describe('token extraction', () => {
    it('getIdToken returns the AuthKit access token', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(makeUser());
      sdk.mockClient.getAccessToken.mockResolvedValue('jwt.access.token');

      await provider.initialize();

      expect(await provider.getIdToken()).toBe('jwt.access.token');
    });

    it('getIdToken returns null when AuthKit reports no session (LoginRequiredError)', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(null);
      sdk.mockClient.getAccessToken.mockRejectedValue(new sdk.LoginRequiredError('login required'));

      await provider.initialize();

      expect(await provider.getIdToken()).toBeNull();
    });

    it('getTokenInfo decodes the exp claim (seconds → ms)', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(makeUser());
      sdk.mockClient.getAccessToken.mockResolvedValue('jwt.access.token');
      sdk.getClaims.mockReturnValue({ exp: 1_000 });

      await provider.initialize();
      const info = await provider.getTokenInfo();

      expect(info).toEqual({
        idToken: 'jwt.access.token',
        accessToken: 'jwt.access.token',
        expiresAt: 1_000_000,
      });
    });
  });

  describe('refreshToken', () => {
    it('forces a refresh and returns the new token', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(makeUser());
      sdk.mockClient.getAccessToken.mockResolvedValue('fresh.jwt');
      sdk.getClaims.mockReturnValue({ exp: 2_000 });

      await provider.initialize();
      const token = await provider.refreshToken();

      expect(sdk.mockClient.getAccessToken).toHaveBeenCalledWith({ forceRefresh: true });
      expect(token).toEqual({ idToken: 'fresh.jwt', accessToken: 'fresh.jwt', expiresAt: 2_000_000 });
    });
  });

  describe('classifyError', () => {
    let provider: InstanceType<Awaited<ReturnType<typeof importProvider>>>;

    beforeEach(async () => {
      const Provider = await importProvider();
      provider = newProvider(Provider);
    });

    it('maps LoginRequiredError → NO_ACTIVE_SESSION', () => {
      expect(provider.classifyError(new sdk.LoginRequiredError('x')).type).toBe(AuthErrorType.NO_ACTIVE_SESSION);
    });

    it('maps NoSessionError → NO_ACTIVE_SESSION', () => {
      expect(provider.classifyError(new sdk.NoSessionError('x')).type).toBe(AuthErrorType.NO_ACTIVE_SESSION);
    });

    it('maps RefreshTimeoutError → TOKEN_EXPIRED', () => {
      expect(provider.classifyError(new sdk.RefreshTimeoutError('x')).type).toBe(AuthErrorType.TOKEN_EXPIRED);
    });

    it('maps a RefreshError (by name) → TOKEN_EXPIRED', () => {
      const err = new Error('refresh failed');
      err.name = 'RefreshError';
      expect(provider.classifyError(err).type).toBe(AuthErrorType.TOKEN_EXPIRED);
    });

    it('maps a network failure → NETWORK_ERROR', () => {
      expect(provider.classifyError(new Error('Failed to fetch')).type).toBe(AuthErrorType.NETWORK_ERROR);
    });

    it('maps anything else → UNKNOWN_ERROR', () => {
      expect(provider.classifyError(new Error('boom')).type).toBe(AuthErrorType.UNKNOWN_ERROR);
    });
  });

  describe('login / logout / profile picture', () => {
    it('login delegates to the AuthKit signIn redirect with caller options', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(null);

      await firstValueFrom(provider.login({ organizationId: 'org_1' }));

      expect(sdk.mockClient.signIn).toHaveBeenCalledWith({ organizationId: 'org_1' });
    });

    it('getProfilePictureUrl returns the WorkOS profile picture', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(makeUser());

      await provider.initialize();

      expect(await provider.getProfilePictureUrl()).toBe('https://img.example.com/ada.png');
    });

    it('ngOnDestroy disposes the AuthKit client', async () => {
      const Provider = await importProvider();
      const provider = newProvider(Provider);
      sdk.mockClient.getUser.mockReturnValue(null);

      await provider.initialize();
      provider.ngOnDestroy();

      expect(sdk.mockClient.dispose).toHaveBeenCalledOnce();
    });
  });
});
