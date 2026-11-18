/**
 * Metadata loading through the storage MJAPI uses when `REDIS_URL` is set: the two-tier cache
 * ({@link WrapSharedCacheWithL1}) over a Redis provider. The two-tier cache deep-freezes what it
 * stores and hands back the same objects, so a metadata load that writes to rows it has cached
 * throws there and the server starts with no entities. The second half covers the startup check
 * that turns such a start into a failed one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    DeleteSQLResult,
    ILocalStorageProvider,
    LocalCacheManager,
    ProviderConfigDataBase,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import { WrapSharedCacheWithL1 } from '../sharedCache.js';
import { AssertEntityMetadataLoaded, NoEntityMetadataError } from '../metadataReadiness.js';

/**
 * A Redis provider that never connects: values live in a map shared by every instance, stored as JSON
 * strings and parsed on read, as Redis returns them. Locks and leases are always granted.
 */
class InMemoryRedisStorage extends RedisLocalStorageProvider {
    public constructor(private readonly store: Map<string, string>) {
        super({ enableLogging: false, options: { lazyConnect: true, enableOfflineQueue: false } });
    }

    private slot(key: string, category?: string): string {
        return `${category || 'default'}|${key}`;
    }

    override async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const raw = this.store.get(this.slot(key, category));
        return raw === undefined ? null : (JSON.parse(raw) as T);
    }
    override async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of keys) {
            out.set(key, await this.GetItem<T>(key, category));
        }
        return out;
    }
    override async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this.store.set(this.slot(key, category), JSON.stringify(value));
    }
    override async Remove(key: string, category?: string): Promise<void> {
        this.store.delete(this.slot(key, category));
    }
    override async ClearCategory(category: string): Promise<void> {
        for (const key of await this.GetCategoryKeys(category)) {
            this.store.delete(this.slot(key, category));
        }
    }
    override async GetCategoryKeys(category: string): Promise<string[]> {
        const prefix = `${category || 'default'}|`;
        return [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    }
    override async WithKeyLock<T>(_key: string, _category: string, work: () => Promise<T>): Promise<T> {
        return work();
    }
    override async TryAcquireLease(): Promise<boolean> {
        return true;
    }
    override async ReleaseLease(): Promise<void> {
        /* nothing held */
    }
}

/** The MJ_Metadata items the metadata assembly reads, each served from `vw<Code>`. */
const METADATA_ITEM_CODES = [
    'Entities', 'EntityFields', 'EntityFieldValues', 'EntityPermissions', 'EntityRelationships',
    'EntitySettings', 'EntityOrganicKeys', 'EntityOrganicKeyRelatedEntities', 'EntityFieldPermissions',
    'EntityAlternateBaseViews', 'EntityUniqueKeys', 'Applications', 'ApplicationEntities', 'ApplicationSettings',
] as const;

const ENTITY_ID = '6F1A0C2E-0000-4000-8000-000000000001';
const APPLICATION_ID = '6F1A0C2E-0000-4000-8000-000000000002';

/** Fresh rows per read, as a database returns them. */
function metadataRows(code: string, withEntities: boolean): Record<string, unknown>[] {
    const updatedAt = '2026-01-01T00:00:00.000Z';
    switch (code) {
        case 'Entities':
            return withEntities
                ? [{ ID: ENTITY_ID, Name: 'Widgets', SchemaName: 'dbo', BaseView: 'vwWidgets', BaseTable: 'Widget', __mj_UpdatedAt: updatedAt }]
                : [];
        case 'EntityFields':
            return [{ ID: '6F1A0C2E-0000-4000-8000-000000000003', EntityID: ENTITY_ID, Name: 'ID', Sequence: 1, Type: 'uniqueidentifier', IsPrimaryKey: true, __mj_UpdatedAt: updatedAt }];
        case 'Applications':
            return [{ ID: APPLICATION_ID, Name: 'Widget App', __mj_UpdatedAt: updatedAt }];
        case 'ApplicationEntities':
            return [{ ID: '6F1A0C2E-0000-4000-8000-000000000004', ApplicationID: APPLICATION_ID, EntityID: ENTITY_ID, __mj_UpdatedAt: updatedAt }];
        default:
            return [];
    }
}

function datasetItemRows(): Record<string, unknown>[] {
    return METADATA_ITEM_CODES.map((code, i) => ({
        DatasetID: '6F1A0C2E-0000-4000-8000-0000000000FF',
        Code: code,
        Entity: `MJ: ${code}`,
        EntityID: `6F1A0C2E-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
        EntitySchemaName: '__mj',
        EntityBaseView: `vw${code}`,
        WhereClause: null,
        DateFieldToCheck: '__mj_UpdatedAt',
        DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z',
        DatasetUpdatedAt: '2026-01-01T00:00:00.000Z',
        Columns: null,
    }));
}

/** A database provider whose SQL answers come from {@link metadataRows}; everything else is inert. */
class FakeSQLMetadataProvider extends GenericDatabaseProvider {
    public constructor(private readonly withEntities: boolean) {
        super();
    }

    override async ExecuteSQL<T>(sql?: string): Promise<Array<T>> {
        const text = sql ?? '';
        if (text.includes('vwDatasetItems')) {
            return datasetItemRows() as unknown as Array<T>;
        }
        const code = METADATA_ITEM_CODES.find((c) => text.includes(`"vw${c}"`));
        return (code ? metadataRows(code, this.withEntities) : []) as unknown as Array<T>;
    }

    override get TrustLocalCacheCompletely(): boolean { return true; }
    protected get AllowRefresh(): boolean { return true; }
    protected override async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(this, { ID: 'user-1', Name: 'Test' }); }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected get UUIDFunctionPattern(): RegExp { return /^\s*newid\s*\(\s*\)\s*$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^\s*getdate\s*\(\s*\)\s*$/i; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    protected override get HasPhysicalTransaction(): boolean { return false; }
    protected override async BeginPhysicalTransaction(): Promise<void> { /* no transaction */ }
    protected override async CommitPhysicalTransaction(): Promise<void> { /* no transaction */ }
    protected override async RollbackPhysicalTransaction(): Promise<void> { /* no transaction */ }
}

/** What the fake Redis holds; shared by every server a test starts, as a real one would be. */
let redisContents = new Map<string, string>();

/** The storage MJAPI builds from `REDIS_URL`: the two-tier cache over a Redis provider. */
function sharedCacheStorage(): ILocalStorageProvider {
    return WrapSharedCacheWithL1(new InMemoryRedisStorage(redisContents));
}

/** Loads metadata the way MJAPI's bootstrap does, through the shared-cache storage. */
async function loadMetadata(withEntities: boolean): Promise<FakeSQLMetadataProvider> {
    const storage = sharedCacheStorage();
    await LocalCacheManager.Instance.Initialize(storage);
    const provider = new FakeSQLMetadataProvider(withEntities);
    provider.SetLocalStorageProvider(storage);
    const config = new ProviderConfigDataBase({}, '__mj', undefined, undefined, true);
    config.LocalStorageProvider = storage;
    await provider.Config(config);
    return provider;
}

describe('metadata loading through the two-tier shared cache', () => {
    beforeEach(async () => {
        await LocalCacheManager.Instance.ClearAll();
        redisContents = new Map<string, string>();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('wraps the Redis provider in a reference-sharing two-tier cache', () => {
        expect(sharedCacheStorage().SharesReferences).toBe(true);
    });

    it('loads the entities, with their fields, without error', async () => {
        const provider = await loadMetadata(true);

        expect(provider.LastMetadataLoadError).toBeNull();
        expect(provider.Entities.map((e) => e.Name)).toEqual(['Widgets']);
        expect(provider.Entities[0].Fields.map((f) => f.Name)).toEqual(['ID']);
        expect(AssertEntityMetadataLoaded(provider, 'the test database')).toBe(1);
    });

    it('loads on a second server that shares the populated cache, without error', async () => {
        await loadMetadata(true);
        expect(redisContents.size).toBeGreaterThan(0);
        const second = await loadMetadata(true);

        expect(second.LastMetadataLoadError).toBeNull();
        expect(second.Entities).toHaveLength(1);
    });
});

describe('AssertEntityMetadataLoaded', () => {
    beforeEach(async () => {
        await LocalCacheManager.Instance.ClearAll();
        redisContents = new Map<string, string>();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fails a start whose metadata load found no entities, and names the cause', async () => {
        const provider = await loadMetadata(false);

        expect(provider.Entities).toHaveLength(0);
        expect(() => AssertEntityMetadataLoaded(provider, 'SQL Server db:1433/test')).toThrow(NoEntityMetadataError);
        expect(() => AssertEntityMetadataLoaded(provider, 'SQL Server db:1433/test')).toThrow(
            /No entity metadata was loaded from SQL Server db:1433\/test.*dataset returned no entities/
        );
    });
});
