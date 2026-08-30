import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for `refreshAuthProviders` — the runtime rebuild of the provider registry.
 *
 * The scenario that matters: the factory caches issuer→provider resolutions, so a catalog edit
 * requires a full clear — but a clear also drops everything the CONFIG path registered
 * (mj.config.cjs providers, magic-link). A refresh that re-registered only the metadata rows
 * would silently lock those users out. These tests pin the two-source rebuild order:
 * clear → config-declared providers → metadata rows layered on top.
 */

const { registerMock, createProviderMock, clearMock, discoverMock } = vi.hoisted(() => ({
  registerMock: vi.fn(),
  createProviderMock: vi.fn(),
  clearMock: vi.fn(),
  discoverMock: vi.fn(() => [])
}));

vi.mock('@memberjunction/auth-providers', () => ({
  AuthProviderFactory: {
    Instance: {
      register: registerMock,
      clear: clearMock
    },
    createProvider: createProviderMock,
    DiscoverFromEnvironment: discoverMock
  }
}));

vi.mock('../config.js', () => ({
  configInfo: {
    authProviders: [
      {
        name: 'config-okta',
        type: 'okta',
        issuer: 'https://config.okta.com',
        audience: 'api://default',
        jwksUri: 'https://config.okta.com/keys'
      }
    ]
  }
}));

vi.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: vi.fn(async () => undefined),
      getCredential: vi.fn()
    }
  }
}));

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/core', () => {
  const instances = new Map<unknown, unknown>();
  return {
    BaseEngine: class {
      protected async Load(): Promise<void> {
        /* no-op: tests inject rows directly */
      }
      protected GetConfigData<T>(propertyName: string): T[] {
        return (this as unknown as Record<string, T[]>)[propertyName] ?? [];
      }
      public static getInstance<T>(this: new () => T): T {
        if (!instances.has(this)) {
          instances.set(this, new this());
        }
        return instances.get(this) as T;
      }
    },
    RegisterForStartup: () => (target: unknown) => target,
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn()
  };
});

import { AuthProviderEngine } from '../auth/AuthProviderEngine.js';
import { refreshAuthProviders } from '../auth/initializeProviders.js';

/** Minimal stand-in for a generated MJAuthenticationProviderEntity row. */
function metadataRow(name: string, driverClass: string) {
  return {
    Name: name,
    DriverClass: driverClass,
    Issuer: null,
    Audience: null,
    JWKSUri: null,
    ClientID: null,
    Domain: null,
    Scopes: null,
    AdditionalConfiguration: null,
    ClientConfiguration: null,
    CredentialID: null,
    Credential: null
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createProviderMock.mockImplementation((config: unknown) => ({ config }));
  (AuthProviderEngine.Instance as unknown as { _providers: unknown[] })._providers = [];
});

describe('refreshAuthProviders', () => {
  it('re-registers the config-declared providers after clearing, so a refresh cannot lock config-path users out', async () => {
    await refreshAuthProviders();

    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(createProviderMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'config-okta' }));
    expect(registerMock).toHaveBeenCalled();
    // The config provider must land AFTER the clear, not survive from before it.
    expect(Math.min(...registerMock.mock.invocationCallOrder)).toBeGreaterThan(clearMock.mock.invocationCallOrder[0]);
  });

  it('aborts BEFORE touching the registry when reading the catalog is permission-denied', async () => {
    // GetConfigData throws PermissionConstrainedError when the load was skipped for permission
    // reasons. That failure must surface while the registry still serves the previous provider
    // set — throwing after the clear would deregister every metadata IdP until process restart.
    const providersSpy = vi.spyOn(AuthProviderEngine.Instance, 'Providers', 'get').mockImplementation(() => {
      throw new Error('PermissionConstrainedError: AuthProviderEngine load skipped');
    });

    try {
      await expect(refreshAuthProviders()).rejects.toThrow('PermissionConstrainedError');
      expect(clearMock).not.toHaveBeenCalled();
      expect(registerMock).not.toHaveBeenCalled();
    } finally {
      providersSpy.mockRestore();
    }
  });

  it('layers the metadata rows on top of the config-declared providers, in that order', async () => {
    (AuthProviderEngine.Instance as unknown as { _providers: unknown[] })._providers = [metadataRow('Catalog WorkOS', 'workos')];

    const count = await refreshAuthProviders();

    expect(count).toBe(1);
    expect(registerMock).toHaveBeenCalledTimes(2);
    const registeredNames = createProviderMock.mock.calls.map((call) => (call[0] as { name: string }).name);
    // Config first, metadata second — a name collision must resolve to the metadata row.
    expect(registeredNames).toEqual(['config-okta', 'Catalog WorkOS']);
  });
});
