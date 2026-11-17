/**
 * Verifies that `GenericDatabaseProvider.RunViewsWithCacheCheck` server-cache hits preserve
 * frozen row identity on full-coverage `Fields` and memoize frozen projected row references on
 * subset `Fields` so `FrozenRowSerializationCache` in `MJServer` continues to hit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    EntityInfo,
    InMemoryLocalStorageProvider,
    LocalCacheManager,
    RunViewParams,
    RunViewResult,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

const ROLE_ID = 'b0000000-0000-0000-0000-000000000001';
const ENTITY_ID = 'e0000000-0000-0000-0000-000000000042';
const STAMP = '2026-06-01T00:00:00.000Z';

function buildEntity(): EntityInfo {
    const field = (seq: number, name: string) => ({
        ID: `f-${name}`,
        EntityID: ENTITY_ID,
        Sequence: seq,
        Name: name,
        Entity: 'Widgets',
        Type: 'nvarchar',
        Length: 100,
        IsPrimaryKey: name === 'ID',
    });
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Widgets',
        SchemaName: 'dbo',
        BaseTable: 'Widget',
        BaseView: 'vwWidgets',
        IncludeInAPI: true,
        AllowCaching: true,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false },
        ],
        Fields: [field(1, 'ID'), field(2, 'Name'), field(3, 'Category'), field(4, '__mj_UpdatedAt')],
    });
}

function buildUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'user-1';
    u.Name = 'Reader';
    u.Email = 'reader@test.com';
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: 'user-1', RoleID: ROLE_ID, Role: 'Reader' })];
    return u;
}

const USER = buildUser();

class CacheCheckProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    private readonly _entities: EntityInfo[] = [buildEntity()];
    public DbReadCount = 0;

    protected get UUIDFunctionPattern(): RegExp { return CacheCheckProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return CacheCheckProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    public async ExecuteSQL<T>(): Promise<Array<T>> { return []; }

    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.toLowerCase() === name?.toLowerCase());
    }
    public override get CurrentUser(): UserInfo { return USER; }
    public override get InstanceConnectionString(): string { return 'cache://test/'; }

    protected override async InternalRunView<T = unknown>(_params: RunViewParams): Promise<RunViewResult<T>> {
        this.DbReadCount++;
        const rows = [
            { ID: 'w-1', Name: 'Alpha', Category: 'Tools', __mj_UpdatedAt: STAMP },
            { ID: 'w-2', Name: 'Beta', Category: 'Parts', __mj_UpdatedAt: STAMP },
        ] as T[];
        return {
            Success: true,
            Results: rows,
            UserViewRunID: '',
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 0,
            ErrorMessage: '',
        } as RunViewResult<T>;
    }
}

describe('RunViewsWithCacheCheck — frozen row preservation with Fields', () => {
    let provider: CacheCheckProvider;

    beforeEach(async () => {
        provider = new CacheCheckProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
        await LocalCacheManager.Instance.ClearAll();
    });

    it('preserves frozen rows on full-coverage Fields and memoizes frozen projected rows on subset Fields', async () => {
        // Warm server cache slot without Fields
        await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'Widgets', CacheLocal: true } }], USER);
        expect(provider.DbReadCount).toBe(1);

        // Full-coverage Fields cache hit returns frozen cached rows untouched
        const fullHit = await provider.RunViewsWithCacheCheck(
            [{ params: { EntityName: 'Widgets', CacheLocal: true, Fields: ['ID', 'Name', 'Category', '__mj_UpdatedAt'] } }],
            USER,
        );
        expect(provider.DbReadCount).toBe(1);
        const fullRows = (fullHit.results[0] as { results: Array<Record<string, unknown>> }).results;
        expect(fullRows).toHaveLength(2);
        expect(Object.isFrozen(fullRows[0])).toBe(true);

        // Subset Fields cache hit returns frozen projected rows and reuses exact references across equivalent calls
        const narrowHit1 = await provider.RunViewsWithCacheCheck(
            [{ params: { EntityName: 'Widgets', CacheLocal: true, Fields: ['Name'] } }],
            USER,
        );
        const narrowHit2 = await provider.RunViewsWithCacheCheck(
            [{ params: { EntityName: 'Widgets', CacheLocal: true, Fields: ['name', 'ID'] } }],
            USER,
        );
        expect(provider.DbReadCount).toBe(1);
        const subRows1 = (narrowHit1.results[0] as { results: Array<Record<string, unknown>> }).results;
        const subRows2 = (narrowHit2.results[0] as { results: Array<Record<string, unknown>> }).results;
        expect(subRows1).toEqual([
            { ID: 'w-1', Name: 'Alpha' },
            { ID: 'w-2', Name: 'Beta' },
        ]);
        expect(Object.isFrozen(subRows1[0])).toBe(true);
        expect(subRows2[0]).toBe(subRows1[0]);
        expect(subRows2[1]).toBe(subRows1[1]);
    });
});
