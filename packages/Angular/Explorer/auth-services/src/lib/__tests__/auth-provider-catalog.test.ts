/**
 * Tests for the pre-authentication provider catalog:
 * - fetch degradation (an older/unreachable server must never block the login screen)
 * - resolution precedence (persisted choice → IsDefault → first)
 * - selection persistence + the reload contract
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn()
}));

import type { PublicAuthProviderInfo } from '@memberjunction/core';
import { AuthProviderCatalog } from '../auth-provider-catalog';

/** In-memory localStorage stand-in; the catalog reads/writes through `window.localStorage`. */
function installStorage(impl?: Partial<Storage>): Record<string, string> {
  const store: Record<string, string> = {};
  const storage: Partial<Storage> = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    ...impl
  };
  vi.stubGlobal('window', { localStorage: storage });
  return store;
}

function provider(overrides: Partial<PublicAuthProviderInfo> & { name: string }): PublicAuthProviderInfo {
  return {
    driverClass: overrides.name,
    displayName: overrides.name,
    sequence: 0,
    isDefault: false,
    ...overrides
  };
}

describe('AuthProviderCatalog.Fetch', () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the published providers on success', async () => {
    const providers = [provider({ name: 'okta' })];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ providers }) }))
    );

    await expect(AuthProviderCatalog.Fetch('http://localhost:4000/')).resolves.toEqual(providers);
  });

  it('returns an empty catalog on 404 so an older server still reaches its login screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));

    await expect(AuthProviderCatalog.Fetch('http://localhost:4000/')).resolves.toEqual([]);
  });

  it('never rejects when the network fails — the app must fall back, not crash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      })
    );

    await expect(AuthProviderCatalog.Fetch('http://localhost:4000/')).resolves.toEqual([]);
  });

  it('tolerates a malformed body rather than propagating a parse error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ providers: 'nope' }) })));

    await expect(AuthProviderCatalog.Fetch('http://localhost:4000/')).resolves.toEqual([]);
  });

  it('derives the catalog URL from the GraphQL origin', () => {
    expect(AuthProviderCatalog.BuildCatalogUrl('http://localhost:4000/')).toBe('http://localhost:4000/auth/providers');
    expect(AuthProviderCatalog.BuildCatalogUrl('https://api.example.com/graphql')).toBe('https://api.example.com/auth/providers');
  });
});

describe('AuthProviderCatalog.Resolve', () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports no picker and no active provider for an empty catalog', () => {
    const result = AuthProviderCatalog.Resolve([]);
    expect(result).toEqual({ active: null, choices: [], showPicker: false, autoLogin: false });
  });

  it('does not show a picker for a single provider — one option is not a choice', () => {
    const result = AuthProviderCatalog.Resolve([provider({ name: 'okta' })]);
    expect(result.showPicker).toBe(false);
    expect(result.active?.name).toBe('okta');
  });

  it('orders choices by sequence, then display name', () => {
    const result = AuthProviderCatalog.Resolve([
      provider({ name: 'c', sequence: 2 }),
      provider({ name: 'b', sequence: 1, displayName: 'Beta' }),
      provider({ name: 'a', sequence: 1, displayName: 'Alpha' })
    ]);
    expect(result.choices.map((p) => p.name)).toEqual(['a', 'b', 'c']);
    expect(result.showPicker).toBe(true);
  });

  it('prefers the IsDefault provider over sequence order', () => {
    const result = AuthProviderCatalog.Resolve([provider({ name: 'first' }), provider({ name: 'flagged', sequence: 5, isDefault: true })]);
    expect(result.active?.name).toBe('flagged');
  });

  it('honours a persisted selection over the default', () => {
    AuthProviderCatalog.Select(provider({ name: 'okta' }), 'auth0');
    const result = AuthProviderCatalog.Resolve([provider({ name: 'auth0', isDefault: true }), provider({ name: 'okta' })]);
    expect(result.active?.name).toBe('okta');
  });

  it('discards a persisted selection that is no longer published, instead of stranding the user', () => {
    AuthProviderCatalog.Select(provider({ name: 'retired' }), 'auth0');

    const result = AuthProviderCatalog.Resolve([provider({ name: 'auth0', isDefault: true }), provider({ name: 'okta' })]);

    expect(result.active?.name).toBe('auth0');
    expect(AuthProviderCatalog.GetSelectedProviderName()).toBeNull();
  });

  it('auto-logs-in once after a selection that required a reload, then never again', () => {
    AuthProviderCatalog.Select(provider({ name: 'okta' }), 'auth0');
    const catalog = [provider({ name: 'auth0' }), provider({ name: 'okta' })];

    expect(AuthProviderCatalog.Resolve(catalog).autoLogin).toBe(true);
    expect(AuthProviderCatalog.Resolve(catalog).autoLogin).toBe(false);
  });
});

describe('AuthProviderCatalog.Select', () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires a reload when switching to a different provider', () => {
    expect(AuthProviderCatalog.Select(provider({ name: 'okta' }), 'auth0')).toEqual({ requiresReload: true });
  });

  it('does not reload when the chosen provider is already the active one', () => {
    expect(AuthProviderCatalog.Select(provider({ name: 'auth0' }), 'auth0')).toEqual({ requiresReload: false });
  });

  it('persists the choice either way', () => {
    AuthProviderCatalog.Select(provider({ name: 'workos' }), 'workos');
    expect(AuthProviderCatalog.GetSelectedProviderName()).toBe('workos');
  });

  it('survives storage being unavailable (private mode / sandboxed iframe)', () => {
    installStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    });

    expect(() => AuthProviderCatalog.Select(provider({ name: 'okta' }), 'auth0')).not.toThrow();
    expect(AuthProviderCatalog.GetSelectedProviderName()).toBeNull();
    expect(AuthProviderCatalog.Resolve([provider({ name: 'okta' })]).active?.name).toBe('okta');
  });
});
