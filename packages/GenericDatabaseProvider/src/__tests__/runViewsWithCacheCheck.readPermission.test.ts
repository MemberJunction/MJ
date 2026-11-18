/**
 * `RunViewsWithCacheCheck` checks the caller's entity Read permission on every item, before any
 * leg can answer from the server cache. An item sent without a cache status ("the client has
 * nothing cached") is answered from the server cache with no database read when a slot matches,
 * so a check that ran only for items carrying a status let a user without Read receive rows
 * another user had warmed into that slot.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { EntityInfo, InMemoryLocalStorageProvider, LocalCacheManager, RunViewParams, RunViewResult, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

const READER_ROLE = 'a0000000-0000-0000-0000-000000000001';
const OUTSIDER_ROLE = 'a0000000-0000-0000-0000-000000000002';
const ENTITY_ID = 'e0000000-0000-0000-0000-000000000009';
const STAMP = '2026-01-01T00:00:00.000Z';

function projects(): EntityInfo {
    const f = (seq: number, name: string) => ({
        ID: `f-${name}`, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Projects', Type: 'nvarchar', Length: 100, IsPrimaryKey: name === 'ID',
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Projects', SchemaName: 'dbo', BaseTable: 'Project', BaseView: 'vwProjects', IncludeInAPI: true, AllowCaching: true,
        Permissions: [
            { EntityID: ENTITY_ID, RoleID: READER_ROLE, CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false },
            { EntityID: ENTITY_ID, RoleID: OUTSIDER_ROLE, CanCreate: false, CanRead: false, CanUpdate: false, CanDelete: false },
        ],
        Fields: [f(1, 'ID'), f(2, 'Name')],
    });
}

function buildUser(roleId: string, id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })];
    return u;
}

const READER = buildUser(READER_ROLE, 'reader');
const OUTSIDER = buildUser(OUTSIDER_ROLE, 'outsider');

class PermissionProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    private readonly _entities: EntityInfo[] = [projects()];
    public DatabaseReads: string[] = [];

    protected get UUIDFunctionPattern(): RegExp { return PermissionProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return PermissionProvider._defaultPattern; }
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
    public override get CurrentUser(): UserInfo { return READER; }
    public override get InstanceConnectionString(): string { return 'perm://test/'; }

    protected override async InternalRunView<T = unknown>(_params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        this.DatabaseReads.push((contextUser ?? this.CurrentUser).ID);
        const rows = [{ ID: 'p1', Name: 'Secret project', __mj_UpdatedAt: STAMP }] as T[];
        return { Success: true, Results: rows, UserViewRunID: '', RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }
}

const view = (): RunViewParams => ({ EntityName: 'Projects', CacheLocal: true });
const rowsOf = (item: unknown): unknown[] => ((item as { results?: unknown[] }).results ?? []);

describe('RunViewsWithCacheCheck — entity Read is checked before the server cache answers', () => {
    let provider: PermissionProvider;

    beforeEach(async () => {
        provider = new PermissionProvider();
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
        await LocalCacheManager.Instance.ClearAll();
    });

    it('CONTROL: a reader\'s fill answers the next reader from the cache, with no database read', async () => {
        await provider.RunViewsWithCacheCheck([{ params: view() }], READER);
        const result = await provider.RunViewsWithCacheCheck([{ params: view() }], READER);

        expect(provider.DatabaseReads).toEqual(['reader']);
        expect(rowsOf(result.results[0])).toHaveLength(1);
    });

    it('a user without Read, sending no cache status, gets no rows from a slot a reader warmed', async () => {
        await provider.RunViewsWithCacheCheck([{ params: view() }], READER);
        const result = await provider.RunViewsWithCacheCheck([{ params: view() }], OUTSIDER);

        expect(result.results[0].status).toBe('error');
        expect(rowsOf(result.results[0])).toHaveLength(0);
        expect(provider.DatabaseReads).toEqual(['reader']);
    });

    it('a user without Read, sending a cache status, is refused as before', async () => {
        await provider.RunViewsWithCacheCheck([{ params: view() }], READER);
        const result = await provider.RunViewsWithCacheCheck([{ params: view(), cacheStatus: { maxUpdatedAt: '2025-01-01T00:00:00.000Z', rowCount: 0 } }], OUTSIDER);

        expect(result.results[0].status).toBe('error');
        expect(rowsOf(result.results[0])).toHaveLength(0);
    });

    it('a saved-view request with no entity name is never answered from the server cache', async () => {
        const params: RunViewParams = { ViewID: 'v0000000-0000-0000-0000-000000000001', CacheLocal: true };
        await LocalCacheManager.Instance.SetRunViewResult(
            provider.ComputeRunViewCacheFingerprint(params, OUTSIDER), params, [{ ID: 'p1', Name: 'Secret project' }], STAMP, undefined, 1, provider,
        );

        await provider.RunViewsWithCacheCheck([{ params }], OUTSIDER);

        expect(provider.DatabaseReads).toEqual(['outsider']);
    });
});
