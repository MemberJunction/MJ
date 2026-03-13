/**
 * Tests for auth-services package:
 * - AngularAuthProviderFactory
 * - Auth types
 * - MJAuthBase (via dynamic import)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthErrorType } from '../auth-types';

// Mock Angular
vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
  Injector: class {},
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      ClassFactory: {
        CreateInstance: vi.fn(),
        GetRegistrationsByRootClass: vi.fn(() => []),
        GetRegistration: vi.fn(),
      },
    }
  },
}));

vi.mock('@memberjunction/core', () => ({
  AuthProviderConfig: class {},
}));

vi.mock('rxjs', async () => {
  const actual = await vi.importActual<typeof import('rxjs')>('rxjs');
  return actual;
});

// ======================= Auth types =======================
describe('AuthErrorType enum', () => {
  it('should have expected error types', async () => {
    const { AuthErrorType } = await import('../auth-types');
    expect(AuthErrorType.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
    expect(AuthErrorType.NO_ACTIVE_SESSION).toBe('NO_ACTIVE_SESSION');
    expect(AuthErrorType.INTERACTION_REQUIRED).toBe('INTERACTION_REQUIRED');
    expect(AuthErrorType.USER_CANCELLED).toBe('USER_CANCELLED');
    expect(AuthErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(AuthErrorType.CONFIGURATION_ERROR).toBe('CONFIGURATION_ERROR');
    expect(AuthErrorType.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
  });
});

// ======================= IAuthProvider interface =======================
describe('IAuthProvider interface', () => {
  it('should export the interface module', async () => {
    const mod = await import('../IAuthProvider');
    expect(mod).toBeDefined();
  });
});

// ======================= MJAuthBase =======================
describe('MJAuthBase', () => {
  let MJAuthBase: typeof import('../mjexplorer-auth-base.service').MJAuthBase;

  beforeEach(async () => {
    // Mock window before importing
    (global as Record<string, unknown>).window = { location: { pathname: '/test', search: '?q=1' } };

    const mod = await import('../mjexplorer-auth-base.service');
    MJAuthBase = mod.MJAuthBase;
  });

  it('should be importable', () => {
    expect(MJAuthBase).toBeDefined();
  });

  it('should capture initial window location in constructor', () => {
    // Create a concrete test subclass inline
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    expect(provider.initialPath).toBe('/test');
    expect(provider.initialSearch).toBe('?q=1');
  });

  it('should validate config with clientId', () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    expect(provider.validateConfig({ clientId: 'my-client' })).toBe(true);
    expect(provider.validateConfig({})).toBe(false);
    expect(provider.validateConfig({ clientId: '' })).toBe(false);
  });

  it('should return clientId as required config', () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    expect(provider.getRequiredConfig()).toEqual(['clientId']);
  });

  it('should emit false for isAuthenticated initially', () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    let value: boolean | undefined;
    provider.isAuthenticated().subscribe(v => value = v);
    expect(value).toBe(false);
  });

  it('should emit null for getUserInfo initially', () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    let value: unknown = 'not-null';
    provider.getUserInfo().subscribe(v => value = v);
    expect(value).toBeNull();
  });

  it('should delegate classifyError to classifyErrorInternal', () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'Custom error msg' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    const result = provider.classifyError(new Error('test'));
    expect(result.type).toBe('UNKNOWN_ERROR');
    expect(result.message).toBe('Custom error msg');
  });

  it('should return token from getIdToken', async () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'my-test-token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    const token = await provider.getIdToken();
    expect(token).toBe('my-test-token');
  });

  it('should return an observable from login', () => {
    class TestProvider extends MJAuthBase {
      readonly type = 'test';
      async initialize(): Promise<void> {}
      protected async loginInternal(): Promise<void> {}
      async logout(): Promise<void> {}
      async handleCallback(): Promise<void> {}
      protected async extractIdTokenInternal() { return 'token'; }
      protected async extractTokenInfoInternal() { return { idToken: 'token', expiresAt: 0 }; }
      protected async extractUserInfoInternal() { return { id: '1', email: 'a@b.c', name: 'Test' }; }
      protected async refreshTokenInternal() { return { success: true, token: { idToken: 'token', expiresAt: 0 } }; }
      protected classifyErrorInternal() { return { type: 'UNKNOWN_ERROR' as AuthErrorType, message: 'err' }; }
      protected async getProfilePictureUrlInternal() { return null; }
      protected async handleSessionExpiryInternal() {}
    }

    const provider = new TestProvider({ name: 'test', type: 'test', clientId: 'test-client' });
    const result = provider.login();
    expect(result).toBeDefined();
    expect(typeof result.subscribe).toBe('function');
  });
});

// ======================= AngularAuthProviderFactory =======================
describe('AngularAuthProviderFactory', () => {
  let Factory: typeof import('../AngularAuthProviderFactory').AngularAuthProviderFactory;

  beforeEach(async () => {
    const mod = await import('../AngularAuthProviderFactory');
    Factory = mod.AngularAuthProviderFactory;
  });

  it('should create a new factory instance', () => {
    const factory = new Factory({ get: vi.fn() } as never);
    expect(factory).toBeDefined();
  });

  it('should return undefined for unregistered provider', () => {
    const factory = new Factory({ get: vi.fn() } as never);
    expect(factory.getProvider('nonexistent')).toBeUndefined();
  });

  it('should clear providers', () => {
    const factory = new Factory({ get: vi.fn() } as never);
    factory.clearProviders();
    expect(factory.getProvider('test')).toBeUndefined();
  });
});
