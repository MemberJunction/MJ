import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ClearAllDataHooks,
    EntityInfo,
    IsPostRunViewProtectedEntity,
    Metadata,
    PostRunViewHook,
    RegisterDataHook,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    GenericDatabaseProvider,
    UserCache,
} from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ANCHORED_CONVERSATION_POST_RUN_VIEW_PROTECTED_ENTITIES,
} from '../custom/AnchoredConversationReadSecurityHook';
import {
    ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES,
    EnsureAnchoredConversationReadHookRegistered,
} from '../index';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';
const REGULAR_USER_ID = '11111111-1111-4111-8111-111111111111';

function makeUser(id: string, email: string): UserInfo {
    const user = new UserInfo(null, { ID: id, Email: email, Name: email, IsActive: true });
    Object.defineProperty(user, 'UserRoles', { value: [{ Role: 'UI' }], configurable: true });
    return user;
}

class MockProtectedQueryProvider extends GenericDatabaseProvider {
    private readonly entitiesList: EntityInfo[];
    public ExecuteSQLCalls: string[] = [];
    public FullRowsToReturn: Array<Record<string, string | number | boolean | null>> = [];

    constructor(entitiesList: EntityInfo[]) {
        super();
        this.entitiesList = entitiesList;
    }

    public override get Entities(): EntityInfo[] {
        return this.entitiesList;
    }

    public override EntityByName(entityName: string): EntityInfo | undefined {
        return this.entitiesList.find((e) => e.Name === entityName);
    }

    public override EntityByID(entityID: string): EntityInfo | undefined {
        return this.entitiesList.find((e) => e.ID === entityID);
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
        this.ExecuteSQLCalls.push(sql);
        return this.FullRowsToReturn as unknown as T[];
    }

    protected override async ExecuteSQLBatch<T = Record<string, string | number | boolean | null>>(
        queries: Array<{ sql: string; key: string }>,
    ): Promise<Record<string, T[]>> {
        const result: Record<string, T[]> = {};
        for (const q of queries) {
            this.ExecuteSQLCalls.push(q.sql);
            result[q.key] = (
                q.key === 'count' ? [{ TotalRowCount: this.FullRowsToReturn.length }] : this.FullRowsToReturn
            ) as unknown as T[];
        }
        return result;
    }

    protected override async getBatchedServerCacheStatus(): Promise<
        Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number }>
    > {
        const out = new Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number }>();
        out.set(0, { success: true, maxUpdatedAt: '2026-11-15T12:00:00.000Z', rowCount: 5 });
        return out;
    }
}

function makeEntityInfo(id: string, name: string, baseView: string, trackChanges: boolean): EntityInfo {
    const info = new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: '__mj',
        BaseTable: name.replace(/[^A-Za-z0-9]/g, ''),
        BaseView: baseView,
        AllowAllRowsAPI: true,
        TrackRecordChanges: trackChanges,
        Fields: [
            { ID: `${id}-f1`, EntityID: id, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
            { ID: `${id}-f2`, EntityID: id, Name: 'ArtifactID', Type: 'uniqueidentifier', Sequence: 2 },
            { ID: `${id}-f3`, EntityID: id, Name: 'Content', Type: 'nvarchar', Sequence: 3 },
            { ID: `${id}-f4`, EntityID: id, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', Sequence: 4 },
        ],
    });
    vi.spyOn(info, 'GetUserPermisions').mockReturnValue({
        CanRead: true,
        CanCreate: true,
        CanUpdate: true,
        CanDelete: true,
    });
    return info;
}

describe('P0-P3-1 Artifact & Anchored Conversation PostRunView Protection', () => {
    const sysUser = makeUser(SYSTEM_USER_ID, 'system@example.com');
    const regularUser = makeUser(REGULAR_USER_ID, 'user@example.com');

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(sysUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => Boolean(u && UUIDsEqual(u.ID, SYSTEM_USER_ID)),
        );
    });

    afterEach(() => {
        ClearAllDataHooks();
        EnsureAnchoredConversationReadHookRegistered();
        vi.restoreAllMocks();
    });

    it('registers all 9 artifact/collection entities and 4 anchored conversation entities at module load', () => {
        expect(ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES).toHaveLength(9);
        for (const entityName of ARTIFACT_POST_RUN_VIEW_PROTECTED_ENTITIES) {
            expect(IsPostRunViewProtectedEntity(entityName)).toBe(true);
        }

        expect(ANCHORED_CONVERSATION_POST_RUN_VIEW_PROTECTED_ENTITIES).toEqual([
            'MJ: Conversations',
            'MJ: Comments',
            'MJ: Field Suggestions',
            'MJ: Conversation Details',
        ]);
        for (const entityName of ANCHORED_CONVERSATION_POST_RUN_VIEW_PROTECTED_ENTITIES) {
            expect(IsPostRunViewProtectedEntity(entityName)).toBe(true);
        }
    });

    it('fails closed on Aggregates against PostRunView-protected entities in InternalRunView and RunViewsWithCacheCheck', async () => {
        const provider = new MockProtectedQueryProvider([
            makeEntityInfo('e-av', 'MJ: Artifact Versions', 'vwArtifactVersions', true),
            makeEntityInfo('e-conv', 'MJ: Conversations', 'vwConversations', true),
        ]);
        const mdSpy = vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(provider);

        const internalRes = await provider.InternalRunView(
            {
                EntityName: 'MJ: Artifact Versions',
                Aggregates: [{ expression: 'MAX([Content])' }],
                ResultType: 'simple',
            },
            regularUser,
        );
        expect(internalRes.Success).toBe(false);
        expect(internalRes.ErrorMessage).toMatch(/aggregate/i);
        expect(internalRes.ErrorMessage).toMatch(/PostRunView-protected/i);
        expect(provider.ExecuteSQLCalls).toHaveLength(0);

        const cacheCheckRes = await provider.RunViewsWithCacheCheck(
            [
                {
                    params: {
                        EntityName: 'MJ: Conversations',
                        Aggregates: [{ expression: 'MAX([Content])' }],
                        ResultType: 'simple',
                    },
                },
            ],
            regularUser,
        );
        expect(cacheCheckRes.success).toBe(true);
        expect(cacheCheckRes.results).toHaveLength(1);
        expect(cacheCheckRes.results[0]?.status).toBe('error');
        expect(cacheCheckRes.results[0]?.errorMessage).toMatch(/aggregate/i);
        expect(provider.ExecuteSQLCalls).toHaveLength(0);

        mdSpy.mockRestore();
    });

    it('bypasses differential SQL in RunViewsWithCacheCheck for PostRunView-protected entities and applies PostRunView hooks', async () => {
        ClearAllDataHooks();
        const allowedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const deniedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

        const provider = new MockProtectedQueryProvider([
            makeEntityInfo('e-av', 'MJ: Artifact Versions', 'vwArtifactVersions', true),
        ]);
        provider.FullRowsToReturn = [
            { ID: allowedId, ArtifactID: '11111111-1111-4111-8111-111111111111', Content: 'allowed' },
            { ID: deniedId, ArtifactID: '22222222-2222-4222-8222-222222222222', Content: 'secret' },
        ];
        const mdSpy = vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(provider);

        const hook: PostRunViewHook = async (
            _params: RunViewParams,
            results: RunViewResult,
        ): Promise<RunViewResult> => {
            const kept = (results.Results as Array<{ ID?: string }>).filter((r) => r.ID === allowedId);
            return {
                ...results,
                Results: kept,
                RowCount: kept.length,
                TotalRowCount: kept.length,
            };
        };
        RegisterDataHook('PostRunView', hook);

        const res = await provider.RunViewsWithCacheCheck<{ ID: string; Content: string }>(
            [
                {
                    params: {
                        EntityName: 'MJ: Artifact Versions',
                        ResultType: 'simple',
                    },
                    cacheStatus: {
                        maxUpdatedAt: '2026-11-14T00:00:00.000Z',
                        rowCount: 1,
                    },
                },
            ],
            regularUser,
        );

        mdSpy.mockRestore();

        expect(res.success).toBe(true);
        expect(res.results).toHaveLength(1);
        const item = res.results[0];
        expect(item?.status).toBe('stale');
        expect(item?.differentialData).toBeUndefined();
        expect(item?.results).toHaveLength(1);
        expect(item?.results?.[0]?.ID).toBe(allowedId);
        expect(item?.rowCount).toBe(1);
        // Must have queried the base view directly rather than differential RecordChanges SQL
        expect(provider.ExecuteSQLCalls.some((sql) => sql.includes('vwArtifactVersions'))).toBe(true);
        expect(provider.ExecuteSQLCalls.some((sql) => sql.includes('RecordChanges'))).toBe(false);
    });
});
