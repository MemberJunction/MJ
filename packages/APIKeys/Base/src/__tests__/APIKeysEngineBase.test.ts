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
    async Load() { this._loaded = true; }
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
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  APIScopeEntity: class {},
  APIApplicationEntity: class {},
  APIApplicationScopeEntity: class {},
  APIKeyApplicationEntity: class {},
  APIKeyScopeEntity: class {},
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

    (engine as Record<string, unknown>)['_scopes'] = scopes;
    (engine as Record<string, unknown>)['_applications'] = apps;
    (engine as Record<string, unknown>)['_applicationScopes'] = appScopes;
    (engine as Record<string, unknown>)['_keyApplications'] = keyApps;
    (engine as Record<string, unknown>)['_keyScopes'] = keyScopes;

    // Build lookup maps
    const scopesByPath = new Map<string, unknown>();
    const scopesById = new Map<string, unknown>();
    for (const s of scopes) {
      if (s.IsActive) scopesByPath.set(s.FullPath, s);
      scopesById.set(s.ID, s);
    }
    (engine as Record<string, unknown>)['_scopesByPath'] = scopesByPath;
    (engine as Record<string, unknown>)['_scopesById'] = scopesById;

    const appsByName = new Map<string, unknown>();
    const appsById = new Map<string, unknown>();
    for (const a of apps) {
      appsByName.set(a.Name.toLowerCase(), a);
      appsById.set(a.ID, a);
    }
    (engine as Record<string, unknown>)['_applicationsByName'] = appsByName;
    (engine as Record<string, unknown>)['_applicationsById'] = appsById;
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
      expect((scope as Record<string, unknown>).ID).toBe('scope-1');
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
