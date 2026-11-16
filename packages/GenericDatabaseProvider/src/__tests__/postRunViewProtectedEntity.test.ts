import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    ClearAllDataHooks,
    ClearPostRunViewProtectedEntities,
    EntityInfo,
    EntityPermissionType,
    GetPostRunViewProtectedEntities,
    Metadata,
    PostRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { SQLServerDialect, PostgreSQLDialect } from '@memberjunction/sql-dialect';
import { ClientClauseScreen } from '../clientClauseScreen.js';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase.js';
import { SystemUserID } from '../systemUser.js';

class StubEntityInfo extends EntityInfo {
    private readonly _canRead: boolean;

    constructor(name: string, baseView: string, schemaName = '__mj', canRead = true) {
        super({
            Name: name,
            BaseView: baseView,
            BaseTable: name.replace(/^MJ:\s*/, '').replace(/\s+/g, ''),
            SchemaName: schemaName,
        });
        this._canRead = canRead;
    }

    public override GetUserPermisions(_user: UserInfo) {
        return {
            CanRead: this._canRead,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false,
        };
    }

    public override GetEffectiveRowFilterWhereClause(
        _user: UserInfo,
        _type: EntityPermissionType,
        _tableAlias?: string
    ): string {
        // Explicitly zero SQL RLS so only the PostRunView protection gate can stop direct SQL reads.
        return '';
    }

    public override GetDeniedReadFields(_user: UserInfo): Set<string> {
        // Explicitly zero FLS restrictions so only the PostRunView protection gate can stop direct SQL reads.
        return new Set<string>();
    }
}

function createTestUser(): UserInfo {
    return new UserInfo(null, {
        ID: 'u-test-1',
        Name: 'Test User',
        Email: 'test@example.com',
        IsActive: true,
    });
}

describe('ClientClauseScreen — PostRunView protected entities (P0-R1)', () => {
    const MSSQL = new SQLServerDialect();
    const PG = new PostgreSQLDialect();
    const USER = createTestUser();

    const ARTIFACT_VERSIONS = new StubEntityInfo('MJ: Artifact Versions', 'vwArtifactVersions');
    const ARTIFACTS = new StubEntityInfo('MJ: Artifacts', 'vwArtifacts');
    const ACCOUNTS = new StubEntityInfo('Accounts', 'vwAccounts');
    const ENTITIES: EntityInfo[] = [ARTIFACT_VERSIONS, ARTIFACTS, ACCOUNTS];
    const ALLOWED = ClientClauseScreen.BuildEntityBaseViewAllowList(ENTITIES);

    let savedProtected: string[];

    beforeEach(() => {
        savedProtected = Array.from(GetPostRunViewProtectedEntities());
        ClearPostRunViewProtectedEntities();
        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');
        RegisterPostRunViewProtectedEntity('MJ: Artifacts');
    });

    afterEach(() => {
        ClearPostRunViewProtectedEntities();
        for (const name of savedProtected) {
            RegisterPostRunViewProtectedEntity(name);
        }
    });

    it('rejects AssertUnscopedRead for a PostRunView-protected entity even with CanRead=true and zero SQL RLS/FLS', () => {
        expect(() => ClientClauseScreen.AssertUnscopedRead(ARTIFACT_VERSIONS, USER, 'ExtraFilter')).toThrow(
            /Invalid ExtraFilter: entity 'MJ: Artifact Versions' enforces row-level access via server RunView hooks — SQL that reads its base view directly cannot apply those hooks; read that entity with RunView/
        );
    });

    it('resolves via AssertTableRefReadable and rejects via AssertUnscopedRead for a registered PostRunView-protected entity', () => {
        const entity = ClientClauseScreen.AssertTableRefReadable(
            ALLOWED,
            '__mj',
            'vwArtifactVersions',
            'ExtraFilter',
            USER
        );
        expect(entity.Name).toBe('MJ: Artifact Versions');
        expect(() => ClientClauseScreen.AssertUnscopedRead(entity, USER, 'ExtraFilter')).toThrow(
            /enforces row-level access via server RunView hooks/
        );
    });

    it('rejects ExtraFilter subqueries reading a PostRunView-protected base view in MSSQL and PostgreSQL', () => {
        const clause = 'EXISTS (SELECT 1 FROM __mj.vwArtifactVersions v WHERE v.ArtifactID = ID)';

        expect(() =>
            ClientClauseScreen.AssertClauseUsesEntityBaseViews(clause, 'ExtraFilter', ENTITIES, MSSQL, USER)
        ).toThrow(/entity 'MJ: Artifact Versions' enforces row-level access via server RunView hooks/);

        expect(() =>
            ClientClauseScreen.AssertClauseUsesEntityBaseViews(clause, 'ExtraFilter', ENTITIES, PG, USER)
        ).toThrow(/entity 'MJ: Artifact Versions' enforces row-level access via server RunView hooks/);
    });

    it('rejects ExecuteAdhocQuery statements reading a PostRunView-protected base view in MSSQL and PostgreSQL', () => {
        const adhocSql = 'SELECT * FROM __mj.vwArtifactVersions';

        expect(() =>
            ClientClauseScreen.AssertStatementReadsUnscopedEntityViews(adhocSql, ENTITIES, MSSQL, USER, 'ExecuteAdhocQuery')
        ).toThrow(/Invalid ExecuteAdhocQuery: entity 'MJ: Artifact Versions' enforces row-level access via server RunView hooks/);

        expect(() =>
            ClientClauseScreen.AssertStatementReadsUnscopedEntityViews(adhocSql, ENTITIES, PG, USER, 'ExecuteAdhocQuery')
        ).toThrow(/Invalid ExecuteAdhocQuery: entity 'MJ: Artifact Versions' enforces row-level access via server RunView hooks/);
    });

    it('rejects AssertFullStatementUsesReadableEntityViews and ScreenAgentClause for PostRunView-protected views', () => {
        expect(() =>
            ClientClauseScreen.AssertFullStatementUsesReadableEntityViews(
                'SELECT ID FROM __mj.vwArtifacts',
                ENTITIES,
                MSSQL,
                USER,
                'SQL'
            )
        ).toThrow(/entity 'MJ: Artifacts' enforces row-level access via server RunView hooks/);

        expect(() =>
            ClientClauseScreen.ScreenAgentClause(
                'EXISTS (SELECT 1 FROM __mj.vwArtifactVersions)',
                'ExtraFilter',
                ENTITIES,
                MSSQL,
                USER
            )
        ).toThrow(/entity 'MJ: Artifact Versions' enforces row-level access via server RunView hooks/);
    });

    it('allows unprotected entities when CanRead=true and zero SQL RLS/FLS exist', () => {
        expect(() => ClientClauseScreen.AssertUnscopedRead(ACCOUNTS, USER, 'ExtraFilter')).not.toThrow();

        expect(() =>
            ClientClauseScreen.AssertTableRefReadable(
                ALLOWED,
                '__mj',
                'vwAccounts',
                'ExtraFilter',
                USER
            )
        ).not.toThrow();

        expect(() =>
            ClientClauseScreen.AssertClauseUsesEntityBaseViews(
                'EXISTS (SELECT 1 FROM __mj.vwAccounts a WHERE a.ID = AccountID)',
                'ExtraFilter',
                ENTITIES,
                MSSQL,
                USER
            )
        ).not.toThrow();

        expect(() =>
            ClientClauseScreen.AssertStatementReadsUnscopedEntityViews(
                'SELECT ID, Name FROM __mj.vwAccounts',
                ENTITIES,
                MSSQL,
                USER,
                'ExecuteAdhocQuery'
            )
        ).not.toThrow();

        expect(() =>
            ClientClauseScreen.ScreenAgentClause(
                'EXISTS (SELECT 1 FROM __mj.vwAccounts)',
                'ExtraFilter',
                ENTITIES,
                MSSQL,
                USER
            )
        ).not.toThrow();
    });

    it('allows reading the entity view once cleared from PostRunView protection', () => {
        ClearPostRunViewProtectedEntities();

        expect(() => ClientClauseScreen.AssertUnscopedRead(ARTIFACT_VERSIONS, USER, 'ExtraFilter')).not.toThrow();
        expect(() =>
            ClientClauseScreen.AssertStatementReadsUnscopedEntityViews(
                'SELECT * FROM __mj.vwArtifactVersions',
                ENTITIES,
                MSSQL,
                USER,
                'ExecuteAdhocQuery'
            )
        ).not.toThrow();
    });
});

class ProtectedProviderHarness extends GenericDatabaseProviderTestBase {
    private readonly _entities: EntityInfo[];
    public SqlCalls: string[] = [];
    public FullRows: Array<Record<string, string | number | boolean | null>> = [];

    constructor(entities: EntityInfo[]) {
        super();
        this._entities = entities;
    }

    public override get Entities(): EntityInfo[] {
        return this._entities;
    }

    public override EntityByName(entityName: string): EntityInfo | undefined {
        return this._entities.find((e) => e.Name === entityName);
    }

    public override EntityByID(entityID: string): EntityInfo | undefined {
        return this._entities.find((e) => e.ID === entityID);
    }

    public override get PlatformKey(): 'sqlserver' | 'postgresql' {
        return 'sqlserver';
    }

    public override QuoteIdentifier(identifier: string): string {
        return `[${identifier}]`;
    }

    public override QuoteSchemaAndView(schema: string, viewName: string): string {
        return `[${schema}].[${viewName}]`;
    }

    public override async ExecuteSQL<T = Record<string, string | number | boolean | null>>(
        sql: string,
    ): Promise<T[]> {
        this.SqlCalls.push(sql);
        return this.FullRows as unknown as T[];
    }

    protected override async ExecuteSQLBatch<T = Record<string, string | number | boolean | null>>(
        queries: Array<{ sql: string; key: string }>,
    ): Promise<Record<string, T[]>> {
        const out: Record<string, T[]> = {};
        for (const q of queries) {
            this.SqlCalls.push(q.sql);
            out[q.key] = (
                q.key === 'count' ? [{ TotalRowCount: this.FullRows.length }] : this.FullRows
            ) as unknown as T[];
        }
        return out;
    }

    protected override async getBatchedServerCacheStatus(): Promise<
        Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number }>
    > {
        const out = new Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number }>();
        out.set(0, { success: true, maxUpdatedAt: '2026-11-15T12:00:00.000Z', rowCount: 4 });
        return out;
    }
}

describe('GenericDatabaseProvider PostRunView-protected Aggregates & Differential Guards', () => {
    beforeEach(() => {
        ClearPostRunViewProtectedEntities();
        ClearAllDataHooks();
    });

    afterEach(() => {
        ClearPostRunViewProtectedEntities();
        ClearAllDataHooks();
    });

    it('rejects Aggregates on PostRunView-protected entities for non-system users in InternalRunView and RunViewsWithCacheCheck', async () => {
        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');
        const regularUser = new UserInfo(null, { ID: '22222222-2222-4222-8222-222222222222', Name: 'User', Email: 'u@example.com' });
        const ent = new EntityInfo({
            ID: 'ent-av-1',
            Name: 'MJ: Artifact Versions',
            SchemaName: '__mj',
            BaseTable: 'ArtifactVersion',
            BaseView: 'vwArtifactVersions',
            AllowAllRowsAPI: true,
            TrackRecordChanges: true,
            Fields: [
                { ID: 'f1', EntityID: 'ent-av-1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f2', EntityID: 'ent-av-1', Name: 'Content', Type: 'nvarchar', Sequence: 2 },
                { ID: 'f3', EntityID: 'ent-av-1', Name: '__mj_UpdatedAt', Type: 'datetimeoffset', Sequence: 3 },
            ],
        });
        Object.defineProperty(ent, 'GetUserPermisions', {
            value: () => ({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }),
        });
        const provider = new ProtectedProviderHarness([ent]);
        const prevProvider = Metadata.Provider;
        Metadata.Provider = provider;
        try {
            const aggRes = await provider.InternalRunView(
                {
                    EntityName: 'MJ: Artifact Versions',
                    Aggregates: [{ expression: 'MAX([Content])' }],
                    ResultType: 'simple',
                },
                regularUser,
            );
            expect(aggRes.Success).toBe(false);
            expect(aggRes.ErrorMessage).toMatch(/aggregate queries are not allowed/i);
            expect(provider.SqlCalls).toHaveLength(0);

            const batchRes = await provider.RunViewsWithCacheCheck(
                [
                    {
                        params: {
                            EntityName: 'MJ: Artifact Versions',
                            Aggregates: [{ expression: 'MAX([Content])' }],
                            ResultType: 'simple',
                        },
                    },
                ],
                regularUser,
            );
            expect(batchRes.success).toBe(true);
            expect(batchRes.results[0]?.status).toBe('error');
            expect(batchRes.results[0]?.errorMessage).toMatch(/aggregate queries are not allowed/i);
            expect(provider.SqlCalls).toHaveLength(0);
        } finally {
            Metadata.Provider = prevProvider;
        }
    });

    it('forces full query + PostRunView filtering instead of differential SQL in RunViewsWithCacheCheck for PostRunView-protected entities', async () => {
        RegisterPostRunViewProtectedEntity('MJ: Artifact Versions');
        const regularUser = new UserInfo(null, { ID: '22222222-2222-4222-8222-222222222222', Name: 'User', Email: 'u@example.com' });
        const ent = new EntityInfo({
            ID: 'ent-av-1',
            Name: 'MJ: Artifact Versions',
            SchemaName: '__mj',
            BaseTable: 'ArtifactVersion',
            BaseView: 'vwArtifactVersions',
            AllowAllRowsAPI: true,
            TrackRecordChanges: true,
            Fields: [
                { ID: 'f1', EntityID: 'ent-av-1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f2', EntityID: 'ent-av-1', Name: 'Content', Type: 'nvarchar', Sequence: 2 },
                { ID: 'f3', EntityID: 'ent-av-1', Name: '__mj_UpdatedAt', Type: 'datetimeoffset', Sequence: 3 },
            ],
        });
        Object.defineProperty(ent, 'GetUserPermisions', {
            value: () => ({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }),
        });

        const allowedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const deniedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const provider = new ProtectedProviderHarness([ent]);
        provider.FullRows = [
            { ID: allowedId, Content: 'visible' },
            { ID: deniedId, Content: 'hidden' },
        ];

        const hook: PostRunViewHook = async (_params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
            const kept = (results.Results as Array<{ ID?: string }>).filter((r) => r.ID === allowedId);
            return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
        };
        RegisterDataHook('PostRunView', hook);

        const prevProvider = Metadata.Provider;
        Metadata.Provider = provider;
        try {
            const res = await provider.RunViewsWithCacheCheck<{ ID: string; Content: string }>(
                [
                    {
                        params: { EntityName: 'MJ: Artifact Versions', ResultType: 'simple' },
                        cacheStatus: { maxUpdatedAt: '2026-11-14T00:00:00.000Z', rowCount: 1 },
                    },
                ],
                regularUser,
            );
            expect(res.success).toBe(true);
            expect(res.results[0]?.status).toBe('stale');
            expect(res.results[0]?.differentialData).toBeUndefined();
            expect(res.results[0]?.results).toEqual([{ ID: allowedId, Content: 'visible' }]);
            expect(res.results[0]?.rowCount).toBe(1);
            expect(provider.SqlCalls.some((s) => s.includes('RecordChanges'))).toBe(false);

            // SystemUser is not blocked from aggregates by the non-system guard
            const sysUser = new UserInfo(null, { ID: SystemUserID, Name: 'System', Email: 'sys@example.com' });
            const sysAgg = await provider.InternalRunView(
                {
                    EntityName: 'MJ: Artifact Versions',
                    Aggregates: [{ expression: 'COUNT(*)' }],
                    ResultType: 'simple',
                },
                sysUser,
            );
            expect(sysAgg.ErrorMessage ?? '').not.toMatch(/PostRunView-protected/i);
        } finally {
            Metadata.Provider = prevProvider;
        }
    });

    it('never returns smart-cache status=current and still enforces PostRunView after ACL revocation even when COUNT/MAX(__mj_UpdatedAt) match', async () => {
        RegisterPostRunViewProtectedEntity('MJ: Artifacts');
        const regularUser = new UserInfo(null, { ID: '22222222-2222-4222-8222-222222222222', Name: 'User', Email: 'u@example.com' });
        const ent = new EntityInfo({
            ID: 'ent-art-1',
            Name: 'MJ: Artifacts',
            SchemaName: '__mj',
            BaseTable: 'Artifact',
            BaseView: 'vwArtifacts',
            AllowAllRowsAPI: true,
            AllowCaching: true,
            TrackRecordChanges: false,
            Fields: [
                { ID: 'f1', EntityID: 'ent-art-1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f2', EntityID: 'ent-art-1', Name: 'Name', Type: 'nvarchar', Sequence: 2 },
                { ID: 'f3', EntityID: 'ent-art-1', Name: '__mj_UpdatedAt', Type: 'datetimeoffset', Sequence: 3 },
            ],
        });
        Object.defineProperty(ent, 'GetUserPermisions', {
            value: () => ({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }),
        });

        const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const matchingMaxUpdatedAt = '2026-11-15T12:00:00.000Z';
        const provider = new ProtectedProviderHarness([ent]);
        provider.FullRows = [{ ID: artifactId, Name: 'Secret Artifact', __mj_UpdatedAt: matchingMaxUpdatedAt }];

        // Simulate ACL revocation: DB row itself is unchanged (same COUNT and MAX(__mj_UpdatedAt)),
        // but PostRunView hook now rejects the user after ArtifactPermission was deleted.
        let userStillHasAccess = false;
        const hook: PostRunViewHook = async (_params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
            const kept = userStillHasAccess ? results.Results : [];
            return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
        };
        RegisterDataHook('PostRunView', hook);

        const prevProvider = Metadata.Provider;
        Metadata.Provider = provider;
        try {
            const res = await provider.RunViewsWithCacheCheck<{ ID: string; Name: string }>(
                [
                    {
                        params: { EntityName: 'MJ: Artifacts', CacheLocal: true, ResultType: 'simple' },
                        cacheStatus: { maxUpdatedAt: matchingMaxUpdatedAt, rowCount: 1 },
                    },
                ],
                regularUser,
            );
            expect(res.success).toBe(true);
            expect(res.results[0]?.status).toBe('stale');
            expect(res.results[0]?.results).toEqual([]);
            expect(res.results[0]?.rowCount).toBe(0);
        } finally {
            Metadata.Provider = prevProvider;
        }
    });
});
