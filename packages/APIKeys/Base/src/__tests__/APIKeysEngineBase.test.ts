/**
 * Unit tests for the APIKeys/Base package.
 * Tests: parseAPIScopeUIConfig, lookup methods, application bindings.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/core', () => {
  class FakeBaseEngine {
    _loaded = false;
    LoadCalls: Array<{ Configs: Array<Record<string, unknown>>; ForceRefresh?: boolean; ContextUser?: unknown }> = [];
    async Load(configs: Array<Record<string, unknown>>, _provider?: unknown, forceRefresh?: boolean, contextUser?: unknown) {
      this.LoadCalls.push({ Configs: configs, ForceRefresh: forceRefresh, ContextUser: contextUser });
      this._loaded = true;
    }
    get Loaded() { return this._loaded; }
    get ContextUser() { return { ID: 'system-user' }; }
    async RefreshItem(_propertyName: string) { /* the real one re-reads the table */ }
    TryThrowIfNotLoaded() {}
    static getInstance<T>(): T {
      return new (this as unknown as { new(): T })();
    }
  }
  return {
    BaseEngine: FakeBaseEngine,
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    UserInfo: class { ID = 'user-1'; },
    RegisterForStartup: () => (target: unknown) => target,
    LogError: vi.fn(),
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJAPIScopeEntity: class {},
  MJAPIApplicationEntity: class {},
  MJAPIApplicationScopeEntity: class {},
  MJAPIKeyApplicationEntity: class {},
  MJAPIKeyScopeEntity: class {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { APIKeysEngineBase, parseAPIScopeUIConfig } from '../APIKeysEngineBase';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseAPIScopeUIConfig', () => {
  it('should return defaults for null UIConfig', () => {
    const scope = { UIConfig: null } as { UIConfig: string | null };
    const config = parseAPIScopeUIConfig(scope as Parameters<typeof parseAPIScopeUIConfig>[0]);
    expect(config.icon).toBe('fa-solid fa-ellipsis');
    expect(config.color).toBe('#6b7280');
  });

  it('should return defaults for empty string UIConfig', () => {
    const scope = { UIConfig: '' } as { UIConfig: string };
    const config = parseAPIScopeUIConfig(scope as Parameters<typeof parseAPIScopeUIConfig>[0]);
    expect(config.icon).toBe('fa-solid fa-ellipsis');
    expect(config.color).toBe('#6b7280');
  });

  it('should parse valid JSON UIConfig', () => {
    const scope = {
      UIConfig: JSON.stringify({ icon: 'fa-solid fa-database', color: '#6366f1' }),
    };
    const config = parseAPIScopeUIConfig(scope as Parameters<typeof parseAPIScopeUIConfig>[0]);
    expect(config.icon).toBe('fa-solid fa-database');
    expect(config.color).toBe('#6366f1');
  });

  it('should return defaults for invalid JSON', () => {
    const scope = { UIConfig: 'not json' };
    const config = parseAPIScopeUIConfig(scope as Parameters<typeof parseAPIScopeUIConfig>[0]);
    expect(config.icon).toBe('fa-solid fa-ellipsis');
    expect(config.color).toBe('#6b7280');
  });

  it('should fill missing fields with defaults', () => {
    const scope = { UIConfig: JSON.stringify({ icon: 'fa-solid fa-key' }) };
    const config = parseAPIScopeUIConfig(scope as Parameters<typeof parseAPIScopeUIConfig>[0]);
    expect(config.icon).toBe('fa-solid fa-key');
    expect(config.color).toBe('#6b7280');
  });
});

describe('APIKeysEngineBase', () => {
  let engine: APIKeysEngineBase;

  beforeEach(() => {
    engine = APIKeysEngineBase.Instance;

    // Populate internal caches via bracket notation
    const scopes = [
      { ID: 'scope-1', Name: 'entity', FullPath: 'entity:read', IsActive: true },
      { ID: 'scope-2', Name: 'agent', FullPath: 'agent:execute', IsActive: true },
      { ID: 'scope-3', Name: 'disabled', FullPath: 'disabled:read', IsActive: false },
    ];
    const apps = [
      { ID: 'app-1', Name: 'WebApp' },
      { ID: 'app-2', Name: 'MobileApp' },
    ];
    const appScopes = [
      { ApplicationID: 'app-1', ScopeID: 'scope-1' },
      { ApplicationID: 'app-1', ScopeID: 'scope-2' },
    ];
    const keyApps = [
      { APIKeyID: 'key-1', ApplicationID: 'app-1' },
    ];
    const keyScopes = [
      { APIKeyID: 'key-1', ScopeID: 'scope-1' },
      { APIKeyID: 'key-1', ScopeID: 'scope-2' },
      { APIKeyID: 'key-2', ScopeID: 'scope-1' },
    ];

    (engine as unknown as Record<string, unknown>)['_scopes'] = scopes;
    (engine as unknown as Record<string, unknown>)['_applications'] = apps;
    (engine as unknown as Record<string, unknown>)['_applicationScopes'] = appScopes;
    (engine as unknown as Record<string, unknown>)['_keyApplications'] = keyApps;
    (engine as unknown as Record<string, unknown>)['_keyScopes'] = keyScopes;

    // Build lookup maps
    const scopesByPath = new Map<string, unknown>();
    const scopesById = new Map<string, unknown>();
    for (const s of scopes) {
      if (s.IsActive) scopesByPath.set(s.FullPath, s);
      scopesById.set(s.ID, s);
    }
    (engine as unknown as Record<string, unknown>)['_scopesByPath'] = scopesByPath;
    (engine as unknown as Record<string, unknown>)['_scopesById'] = scopesById;

    const appsByName = new Map<string, unknown>();
    const appsById = new Map<string, unknown>();
    for (const a of apps) {
      appsByName.set(a.Name.toLowerCase(), a);
      appsById.set(a.ID, a);
    }
    (engine as unknown as Record<string, unknown>)['_applicationsByName'] = appsByName;
    (engine as unknown as Record<string, unknown>)['_applicationsById'] = appsById;
  });

  describe('Scopes', () => {
    it('should return all scopes', () => {
      expect(engine.Scopes).toHaveLength(3);
    });

    it('should return only active scopes', () => {
      expect(engine.ActiveScopes).toHaveLength(2);
    });
  });

  describe('GetScopeByPath', () => {
    it('should find scope by path', () => {
      const scope = engine.GetScopeByPath('entity:read');
      expect(scope).toBeDefined();
      expect((scope as unknown as Record<string, unknown>).ID).toBe('scope-1');
    });

    it('should return undefined for inactive scope path', () => {
      const scope = engine.GetScopeByPath('disabled:read');
      expect(scope).toBeUndefined();
    });

    it('should return undefined for unknown path', () => {
      expect(engine.GetScopeByPath('nonexistent:path')).toBeUndefined();
    });
  });

  describe('GetScopeById', () => {
    it('should find scope by ID', () => {
      const scope = engine.GetScopeById('scope-1');
      expect(scope).toBeDefined();
    });

    it('should find inactive scopes by ID', () => {
      const scope = engine.GetScopeById('scope-3');
      expect(scope).toBeDefined();
    });
  });

  describe('GetApplicationByName', () => {
    it('should find by name (case-insensitive)', () => {
      expect(engine.GetApplicationByName('webapp')).toBeDefined();
      expect(engine.GetApplicationByName('WEBAPP')).toBeDefined();
    });

    it('should return undefined for unknown name', () => {
      expect(engine.GetApplicationByName('Unknown')).toBeUndefined();
    });
  });

  describe('GetApplicationById', () => {
    it('should find by ID', () => {
      expect(engine.GetApplicationById('app-1')).toBeDefined();
    });
  });

  describe('GetApplicationScopesByApplicationId', () => {
    it('should return scopes for an application', () => {
      const scopes = engine.GetApplicationScopesByApplicationId('app-1');
      expect(scopes).toHaveLength(2);
    });

    it('should return empty for unknown application', () => {
      expect(engine.GetApplicationScopesByApplicationId('nonexistent')).toHaveLength(0);
    });
  });

  describe('GetApplicationScopeRules', () => {
    it('should filter by both application and scope', () => {
      const rules = engine.GetApplicationScopeRules('app-1', 'scope-1');
      expect(rules).toHaveLength(1);
    });
  });

  describe('GetKeyApplicationsByKeyId', () => {
    it('should return application bindings for a key', () => {
      expect(engine.GetKeyApplicationsByKeyId('key-1')).toHaveLength(1);
    });

    it('should return empty for key without bindings', () => {
      expect(engine.GetKeyApplicationsByKeyId('key-2')).toHaveLength(0);
    });
  });

  describe('GetKeyScopesByKeyId', () => {
    it('should return scopes for a key', () => {
      expect(engine.GetKeyScopesByKeyId('key-1')).toHaveLength(2);
    });
  });

  describe('GetKeyScopeRules', () => {
    it('should filter by key and scope', () => {
      const rules = engine.GetKeyScopeRules('key-1', 'scope-1');
      expect(rules).toHaveLength(1);
    });
  });

  describe('KeyHasApplicationBindings', () => {
    it('should return true when key has bindings', () => {
      expect(engine.KeyHasApplicationBindings('key-1')).toBe(true);
    });

    it('should return false when key has no bindings', () => {
      expect(engine.KeyHasApplicationBindings('key-2')).toBe(false);
    });
  });

  describe('IsKeyAuthorizedForApplication', () => {
    it('should return true when key is bound to the app', () => {
      expect(engine.IsKeyAuthorizedForApplication('key-1', 'app-1')).toBe(true);
    });

    it('should return false when key is bound to different app', () => {
      expect(engine.IsKeyAuthorizedForApplication('key-1', 'app-2')).toBe(false);
    });

    it('should return true when key has no bindings (works with all)', () => {
      expect(engine.IsKeyAuthorizedForApplication('key-2', 'app-1')).toBe(true);
      expect(engine.IsKeyAuthorizedForApplication('key-2', 'app-2')).toBe(true);
    });
  });
});

describe('APIKeysEngineBase refresh interval', () => {
  type LoadCall = { Configs: Array<Record<string, unknown>>; ForceRefresh?: boolean; ContextUser?: unknown };
  const loadCalls = (e: APIKeysEngineBase): LoadCall[] => (e as unknown as { LoadCalls: LoadCall[] }).LoadCalls;

  it('loads every table with the local cache and no expiry when no interval is set (browser default)', async () => {
    const engine = APIKeysEngineBase.Instance;
    await engine.Config(false, undefined);

    const configs = loadCalls(engine)[0].Configs;
    expect(configs).toHaveLength(5);
    for (const c of configs) {
      expect(c.CacheLocal).toBe(true);
      expect(c.Expiration).toBeUndefined();
    }
    expect(engine.RefreshIntervalMs).toBeUndefined();
  });

  it('gives every table an expiry equal to the interval and skips the local cache', async () => {
    const engine = APIKeysEngineBase.Instance;
    engine.SetRefreshInterval(15000);
    await engine.Config(false, undefined);

    const configs = loadCalls(engine)[0].Configs;
    expect(configs.map(c => c.EntityName)).toEqual([
      'MJ: API Scopes',
      'MJ: API Applications',
      'MJ: API Application Scopes',
      'MJ: API Key Applications',
      'MJ: API Key Scopes',
    ]);
    for (const c of configs) {
      expect(c.Expiration).toBe(15000);
      expect(c.CacheLocal).toBe(false);
    }
  });

  it('treats 0 or a negative interval as no timed refresh', async () => {
    const engine = APIKeysEngineBase.Instance;
    engine.SetRefreshInterval(0);
    expect(engine.RefreshIntervalMs).toBeUndefined();
    engine.SetRefreshInterval(-5);
    expect(engine.RefreshIntervalMs).toBeUndefined();
  });

  it('reloads once, as the engine context user, when the interval changes after load', async () => {
    const engine = APIKeysEngineBase.Instance;
    await engine.Config(false, undefined);
    engine.SetRefreshInterval(30000);
    await Promise.resolve();

    const calls = loadCalls(engine);
    expect(calls).toHaveLength(2);
    expect(calls[1].ForceRefresh).toBe(true);
    expect(calls[1].ContextUser).toEqual({ ID: 'system-user' });
    expect(calls[1].Configs[0].Expiration).toBe(30000);

    // Same interval again: no further reload.
    engine.SetRefreshInterval(30000);
    await Promise.resolve();
    expect(loadCalls(engine)).toHaveLength(2);
  });
});

describe('APIKeysEngineBase timed refresh rebuilds the lookup maps', () => {
  it('serves the re-read application row by ID and name after RefreshItem', async () => {
    const engine = APIKeysEngineBase.Instance;
    (engine as unknown as Record<string, unknown>)['_scopes'] = [];
    (engine as unknown as Record<string, unknown>)['_applications'] = [{ ID: 'app-1', Name: 'WebApp', IsActive: true }];
    await engine.RefreshItem('_applications');
    expect(engine.GetApplicationById('app-1')).toMatchObject({ IsActive: true });

    // Simulates the re-read returning the row after another process deactivated it.
    (engine as unknown as Record<string, unknown>)['_applications'] = [{ ID: 'app-1', Name: 'WebApp', IsActive: false }];
    await engine.RefreshItem('_applications');
    expect(engine.GetApplicationById('app-1')).toMatchObject({ IsActive: false });
    expect(engine.GetApplicationByName('webapp')).toMatchObject({ IsActive: false });
  });
});
