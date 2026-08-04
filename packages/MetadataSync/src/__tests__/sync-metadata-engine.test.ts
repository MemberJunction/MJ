/**
 * Unit tests for `SyncMetadataEngine` public helpers.
 *
 * These tests cover the pure helpers (PK serialization, dedup, filter
 * building) and the cache wrappers in isolation. They intentionally do NOT
 * cover the BaseEngine event-bus integration — that path exercises the
 * real `applyImmediateMutation` flow and is best covered by an integration
 * test against a live MJ provider rather than mocked here. See module
 * docstring on `SyncMetadataEngine` for the broader contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncMetadataEngine } from '../lib/sync-metadata-engine';
import { BaseEntity, BaseEngineRegistry } from '@memberjunction/core';
import type { BaseEnginePropertyConfig, CachedEntityMatch, EntityFieldInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    // Replace BaseEngine with a no-op shim so we can construct
    // SyncMetadataEngine without invoking the global object store /
    // metadata-loading machinery. The tests below never call `Load()`.
    BaseEngine: class {
      protected ProviderToUse: IMetadataProvider | null = null;
      public Configs: unknown[] = [];
      protected async Load(): Promise<void> {}
      protected SetupGlobalEventListener(): void {}
      protected canUseImmediateMutation(): boolean {
        return true;
      }
    }
  };
});

// Type the field-info shape we actually exercise in tests. The real
// EntityFieldInfo has many more properties; this typed alias keeps mock
// objects strict without re-declaring the whole class.
type TestField = Pick<EntityFieldInfo, 'Name' | 'Type' | 'NeedsQuotes'>;
type TestEntityInfo = Pick<EntityInfo, 'Name'> & {
  PrimaryKeys: TestField[];
  Fields?: TestField[];
};

/** Minimal stub matching the surface SyncMetadataEngine reads off SyncEngine in these tests. */
interface SyncEngineStub {
  getEntityInfo: (name: string) => EntityInfo | null;
  serializePrimaryKey: (entityInfo: EntityInfo, pk: Record<string, unknown>) => string;
}

/**
 * Builds a `BaseEntity`-shaped fake that satisfies just enough of the
 * surface the tests touch (`Get`, `GetAll`, `PrimaryKey.Equals`). Cast at
 * the call site so the production code path sees the right structural type
 * without us depending on the framework's full BaseEntity initialization.
 */
function makeFakeEntity(fields: Record<string, unknown>): BaseEntity {
  // PrimaryKey carries the field bag explicitly so Equals can compare by value.
  // Production BaseEntity wires this up via CompositeKey; we just need shape
  // parity for the dedup paths the tests exercise.
  const primaryKey = {
    fields,
    Equals(other: unknown) {
      if (!other || typeof other !== 'object') return false;
      const otherFields = (other as { fields?: Record<string, unknown> }).fields;
      if (!otherFields) return false;
      return JSON.stringify(otherFields) === JSON.stringify(fields);
    }
  };
  return {
    Get(name: string) {
      return fields[name];
    },
    GetAll() {
      return { ...fields };
    },
    PrimaryKey: primaryKey
  } as unknown as BaseEntity;
}

/**
 * Like {@link makeFakeEntity}, but the result genuinely passes
 * `instanceof BaseEntity` — required for rows held by a fake DONOR engine,
 * since `delegateEntityIfCached` type-checks `records[0]` before accepting
 * a delegation. Built via `Object.create(BaseEntity.prototype)` so we get
 * the prototype chain without running the real constructor (which needs a
 * live provider). Own-property defines shadow the prototype's accessors.
 */
function makeDonorEntity(fields: Record<string, unknown>): BaseEntity {
  const entity = Object.create(BaseEntity.prototype) as BaseEntity;
  const primaryKey = {
    fields,
    Equals(other: unknown) {
      if (!other || typeof other !== 'object') return false;
      const otherFields = (other as { fields?: Record<string, unknown> }).fields;
      if (!otherFields) return false;
      return JSON.stringify(otherFields) === JSON.stringify(fields);
    }
  };
  Object.defineProperty(entity, 'Get', { value: (name: string) => fields[name] });
  Object.defineProperty(entity, 'GetAll', { value: () => ({ ...fields }) });
  Object.defineProperty(entity, 'PrimaryKey', { value: primaryKey });
  return entity;
}

/** Options for shaping a fake registry match in delegation tests. */
interface MatchOptions {
  propertyName?: string;
  resultType?: 'simple' | 'entity_object';
  orderBy?: string;
  engineClassName?: string;
  entityName?: string;
}

/**
 * Builds a `CachedEntityMatch` the way `BaseEngineRegistry.FindCachedEntity`
 * would return one for a loaded donor engine holding `engineObj[propertyName]`.
 */
function makeMatch(engineObj: Record<string, unknown>, options?: MatchOptions): CachedEntityMatch {
  const propertyName = options?.propertyName ?? '_rows';
  return {
    engineClassName: options?.engineClassName ?? 'FakeDonorEngine',
    engine: engineObj,
    config: {
      EntityName: options?.entityName ?? 'TestEntity',
      PropertyName: propertyName,
      Type: 'entity',
      ResultType: options?.resultType,
      OrderBy: options?.orderBy
    } as unknown as BaseEnginePropertyConfig,
    records: (engineObj[propertyName] ?? []) as BaseEntity[],
    unfiltered: true
  };
}

describe('SyncMetadataEngine', () => {
  let engine: SyncMetadataEngine;
  let mockSyncEngine: SyncEngineStub;

  beforeEach(() => {
    mockSyncEngine = {
      getEntityInfo: vi.fn().mockImplementation((name: string): EntityInfo => {
        if (name === 'CompositeEntity') {
          return {
            Name: name,
            PrimaryKeys: [
              { Name: 'KeyA', Type: 'nvarchar', NeedsQuotes: true },
              { Name: 'KeyB', Type: 'uniqueidentifier', NeedsQuotes: true }
            ],
            Fields: [
              { Name: 'KeyA', NeedsQuotes: true, Type: 'nvarchar' },
              { Name: 'KeyB', NeedsQuotes: true, Type: 'uniqueidentifier' }
            ]
          } as unknown as EntityInfo;
        }
        return {
          Name: name,
          PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier', NeedsQuotes: true }],
          Fields: [{ Name: 'ID', NeedsQuotes: true, Type: 'uniqueidentifier' }]
        } as unknown as EntityInfo;
      }),
      serializePrimaryKey: vi.fn()
    };

    engine = new SyncMetadataEngine();
    // Cast through unknown because SyncEngine here is a partial stub — we
    // only call the two methods we depend on.
    engine.initializeEngine(mockSyncEngine as unknown as import('../lib/sync-engine').SyncEngine);
  });

  describe('serializePrimaryKey', () => {
    it('serializes a single UUID primary key and lowercases the value', () => {
      const entityInfo: TestEntityInfo = {
        Name: 'X',
        PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier', NeedsQuotes: true }]
      };
      const serialized = engine.serializePrimaryKey(entityInfo as unknown as EntityInfo, { ID: 'ABC-123-XYZ' });
      expect(serialized).toBe('id=abc-123-xyz');
    });

    it('orders composite keys deterministically regardless of input order', () => {
      const entityInfo: TestEntityInfo = {
        Name: 'X',
        PrimaryKeys: [
          { Name: 'KeyB', Type: 'uniqueidentifier', NeedsQuotes: true },
          { Name: 'KeyA', Type: 'nvarchar', NeedsQuotes: true }
        ]
      };
      const s1 = engine.serializePrimaryKey(entityInfo as unknown as EntityInfo, { KeyB: 'ABC-123-XYZ', KeyA: 'ValueA' });
      const s2 = engine.serializePrimaryKey(entityInfo as unknown as EntityInfo, { KeyA: 'ValueA', KeyB: 'ABC-123-XYZ' });
      expect(s1).toBe('keya=ValueA|keyb=abc-123-xyz');
      expect(s2).toBe(s1);
    });

    it('does not throw when a PrimaryKey definition has no Type', () => {
      // Defensive: real EntityInfo always carries a Type, but historically the
      // engine threw `cannot read trim of undefined` if a caller passed an
      // ad-hoc PK descriptor. Keep that guard exercised here.
      const entityInfo = {
        Name: 'X',
        PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true } as unknown as EntityFieldInfo]
      } as unknown as EntityInfo;
      expect(() => engine.serializePrimaryKey(entityInfo, { ID: 'abc' })).not.toThrow();
    });
  });

  describe('lookup cache', () => {
    it('stores, retrieves, and clears lookups', () => {
      engine.setCachedLookup('my-key', 'my-id');
      expect(engine.getCachedLookup('my-key')).toBe('my-id');
      expect(engine.getCachedLookup('missing')).toBeUndefined();

      engine.clearLookupCache();
      expect(engine.getCachedLookup('my-key')).toBeUndefined();
    });

    it('serves legitimately-falsy PK values (empty string, "0") from cache', () => {
      // Regression guard: an earlier bug used `if (cachedId)` which would
      // miss on empty-string / '0' PKs and force a re-query.
      engine.setCachedLookup('empty', '');
      engine.setCachedLookup('zero', '0');
      expect(engine.getCachedLookup('empty')).toBe('');
      expect(engine.getCachedLookup('zero')).toBe('0');
    });

    it('invalidateLookupsForEntity drops only that entity\'s entries', () => {
      engine.setCachedLookup('users-key', 'user-id-1', 'Users');
      engine.setCachedLookup('roles-key', 'role-id-1', 'Roles');

      engine.invalidateLookupsForEntity('Users');

      expect(engine.getCachedLookup('users-key')).toBeUndefined();
      expect(engine.getCachedLookup('roles-key')).toBe('role-id-1');
    });
  });

  describe('file cache', () => {
    it('stores and invalidates parsed file contents', () => {
      engine.cacheFile('/tmp/a.json', { raw: 1 }, { resolved: 1 });
      expect(engine.getCachedFile('/tmp/a.json')).toEqual({ rawData: { raw: 1 }, fileData: { resolved: 1 } });

      engine.invalidateCachedFile('/tmp/a.json');
      expect(engine.getCachedFile('/tmp/a.json')).toBeUndefined();
    });
  });

  describe('entity cache operations', () => {
    it('adds and retrieves entities under the dynamic per-entity slot', () => {
      const entity = makeFakeEntity({ ID: 'id-1' });
      engine.addEntityToCache('TestEntity', entity);

      const cached = engine.getCachedEntities('TestEntity');
      expect(cached).toHaveLength(1);
      expect(cached[0]).toBe(entity);
    });

    it('removes entities by primary key and scopes lookup invalidation to that entity', () => {
      const entity = makeFakeEntity({ ID: 'id-1' });
      engine.addEntityToCache('TestEntity', entity);

      // Two cached lookups — only TestEntity's should drop on removal.
      engine.setCachedLookup('test-lookup', 'id-1', 'TestEntity');
      engine.setCachedLookup('other-lookup', 'other-id', 'OtherEntity');

      // serializePrimaryKey on the entity (`GetAll()` -> { ID: 'id-1' }) must
      // match what we pass to removeEntityFromCache for the splice to find it.
      engine.removeEntityFromCache('TestEntity', { ID: 'id-1' });

      expect(engine.getCachedEntities('TestEntity')).toHaveLength(0);
      expect(engine.getCachedLookup('test-lookup')).toBeUndefined();
      expect(engine.getCachedLookup('other-lookup')).toBe('other-id');
    });

    it('deduplicates on re-add via PrimaryKey.Equals', () => {
      // Our fake Equals compares the whole field bag (the test fake doesn't
      // know which fields are PK), so we use identical fields here — the
      // realistic BaseEntity.PrimaryKey.Equals would do the same when the
      // PK is the only shared field.
      const e1 = makeFakeEntity({ ID: 'id-1' });
      const e2 = makeFakeEntity({ ID: 'id-1' });
      engine.addEntityToCache('TestEntity', e1);
      engine.addEntityToCache('TestEntity', e2);

      const cached = engine.getCachedEntities('TestEntity');
      expect(cached).toHaveLength(1);
      // The second add should replace the first by-key.
      expect(cached[0]).toBe(e2);
    });

    it('does not throw when an entity has no PrimaryKey populated', () => {
      // Simulates an in-flight, not-yet-saved entity. We can't dedup it but
      // we shouldn't blow up either.
      const halfBuilt = { Get: () => undefined, GetAll: () => ({}), PrimaryKey: undefined } as unknown as BaseEntity;
      expect(() => engine.addEntityToCache('TestEntity', halfBuilt)).not.toThrow();
    });
  });

  describe('delegation to already-loaded engines', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Stubs the registry to return the given matches for any entity lookup. */
    function stubRegistry(matches: CachedEntityMatch[]): void {
      vi.spyOn(BaseEngineRegistry.Instance, 'FindCachedEntity').mockReturnValue(matches);
    }

    it('proxies getCachedEntities to the donor engine\'s live array', () => {
      const donorRow = makeDonorEntity({ ID: 'id-1', Name: 'Row One' });
      const donor: Record<string, unknown> = { _rows: [donorRow] };
      stubRegistry([makeMatch(donor)]);

      expect(engine.delegateEntityIfCached('TestEntity')).toBe(true);
      expect(engine.getCachedEntities('TestEntity')).toEqual([donorRow]);

      // Live resolution: a donor-side full refresh that REASSIGNS the array
      // property must be picked up on the next access — we hold engine +
      // property name, not a captured array reference.
      const replacementRow = makeDonorEntity({ ID: 'id-2', Name: 'Row Two' });
      donor._rows = [replacementRow];
      expect(engine.getCachedEntities('TestEntity')).toEqual([replacementRow]);
    });

    it('addEntityToCache writes into the donor array with PK dedup', () => {
      const donorRow = makeDonorEntity({ ID: 'id-1' });
      const donor: Record<string, unknown> = { _rows: [donorRow] };
      stubRegistry([makeMatch(donor)]);
      engine.delegateEntityIfCached('TestEntity');

      const fresh = makeFakeEntity({ ID: 'id-2' });
      engine.addEntityToCache('TestEntity', fresh);
      expect(donor._rows).toHaveLength(2);

      // Re-adding the same PK replaces in place rather than duplicating.
      const replacement = makeFakeEntity({ ID: 'id-2' });
      engine.addEntityToCache('TestEntity', replacement);
      expect(donor._rows).toHaveLength(2);
      expect((donor._rows as BaseEntity[])[1]).toBe(replacement);
    });

    it('removeEntityFromCache splices the donor array', () => {
      const donorRow = makeDonorEntity({ ID: 'id-1' });
      const donor: Record<string, unknown> = { _rows: [donorRow] };
      stubRegistry([makeMatch(donor)]);
      engine.delegateEntityIfCached('TestEntity');

      engine.removeEntityFromCache('TestEntity', { ID: 'id-1' });
      expect(donor._rows).toHaveLength(0);
    });

    it('findCachedByPrimaryKey resolves delegated rows (case-insensitive UUID, scan fallback)', () => {
      const donorRow = makeDonorEntity({ ID: 'abc-123' });
      const donor: Record<string, unknown> = { _rows: [donorRow] };
      stubRegistry([makeMatch(donor)]);
      engine.delegateEntityIfCached('TestEntity');
      engine.markEntityAsPreloaded('TestEntity');

      // No PK index was built (Config() wasn't run) — exercises the
      // array-scan fallback over the delegated array, including the
      // uppercase-vs-lowercase UUID bridge.
      const hit = engine.findCachedByPrimaryKey('TestEntity', { ID: 'ABC-123' });
      expect(hit).toBe(donorRow);
    });

    it('rejects donors whose rows are not BaseEntity instances', () => {
      const donor: Record<string, unknown> = { _rows: [{ ID: 'plain-object' }] };
      stubRegistry([makeMatch(donor)]);
      expect(engine.delegateEntityIfCached('TestEntity')).toBe(false);
    });

    it('rejects ResultType=simple and OrderBy configs, but accepts an empty entity_object cache', () => {
      const donor: Record<string, unknown> = { _rows: [] };

      stubRegistry([makeMatch(donor, { resultType: 'simple' })]);
      expect(engine.delegateEntityIfCached('TestEntity')).toBe(false);

      // OrderBy configs fail canUseImmediateMutation donor-side: entity
      // events trigger a full refresh that reassigns the array.
      stubRegistry([makeMatch(donor, { orderBy: 'Name ASC' })]);
      expect(engine.delegateEntityIfCached('TestEntity')).toBe(false);

      stubRegistry([makeMatch(donor, { resultType: 'entity_object' })]);
      expect(engine.delegateEntityIfCached('TestEntity')).toBe(true);
      expect(engine.getCachedEntities('TestEntity')).toEqual([]);
    });

    it('never self-delegates to its own slots from a prior run', () => {
      const selfMatch = makeMatch(engine as unknown as Record<string, unknown>, {
        propertyName: 'cached_TestEntity',
        engineClassName: 'SyncMetadataEngine'
      });
      stubRegistry([selfMatch]);
      expect(engine.delegateEntityIfCached('TestEntity')).toBe(false);
    });

    it('falls back past a rejected match to the next acceptable donor', () => {
      const simpleDonor: Record<string, unknown> = { _rows: [{ ID: 'plain' }] };
      const goodRow = makeDonorEntity({ ID: 'id-1' });
      const goodDonor: Record<string, unknown> = { _rows: [goodRow] };
      stubRegistry([
        makeMatch(simpleDonor, { resultType: 'simple', engineClassName: 'SimpleDonor' }),
        makeMatch(goodDonor, { engineClassName: 'GoodDonor' })
      ]);

      expect(engine.delegateEntityIfCached('TestEntity')).toBe(true);
      expect(engine.getCachedEntities('TestEntity')).toEqual([goodRow]);
      expect(engine.getDelegationSummary()).toEqual([
        { entityName: 'TestEntity', engineClassName: 'GoodDonor' }
      ]);
    });

    it('getDelegationSummary is empty when nothing was delegated', () => {
      expect(engine.getDelegationSummary()).toEqual([]);
    });
  });
});
