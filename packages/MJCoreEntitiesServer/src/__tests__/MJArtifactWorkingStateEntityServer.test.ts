import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    DatabaseProviderBase,
    ExecuteSQLOptions,
    IMetadataProvider,
    ProviderConfigDataBase,
    RunViewParams,
    RunViewResult,
    UserInfo
} from '@memberjunction/core';
import { ArtifactPermissionEngine } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    ArtifactWorkingStatePostRunViewHook,
    MJArtifactWorkingStateEntityServer
} from '../custom/MJArtifactWorkingStateEntityServer.server';
import { ArtifactVersionPostRunViewHook } from '../custom/MJArtifactVersionEntityServer.server';

function makeUser(id: string, email: string): UserInfo {
    const u = new UserInfo(null, {
        ID: id,
        Name: email,
        Email: email,
        IsActive: true,
        Type: 'User',
        UserRoles: []
    });
    return u;
}

describe('MJArtifactWorkingStateEntityServer & ArtifactWorkingStatePostRunViewHook (B1)', () => {
    const systemUser = makeUser('00000000-0000-4000-8000-000000000001', 'sys.user@yourdomain.com');
    const devUser = makeUser('11111111-1111-4111-8111-111111111111', 'dev@example.com');
    const allowedArtifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const deniedArtifactId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
    });

    it('blocks non-system Save() and Delete() while allowing systemUser writes', async () => {
        const superSaveSpy = vi
            .spyOn(BaseEntity.prototype, 'Save')
            .mockResolvedValue(true);
        const superDeleteSpy = vi
            .spyOn(BaseEntity.prototype, 'Delete')
            .mockResolvedValue(true);

        const entity = Object.create(MJArtifactWorkingStateEntityServer.prototype) as MJArtifactWorkingStateEntityServer;
        const history = [] as MJArtifactWorkingStateEntityServer['ResultHistory'];
        Object.defineProperty(entity, 'ResultHistory', { value: history, writable: true });
        Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
        Object.defineProperty(entity, 'ContextCurrentUser', { value: devUser, writable: true });

        expect(await entity.Save()).toBe(false);
        expect(history[0]?.Message).toContain('server-managed');
        expect(await entity.Delete()).toBe(false);
        expect(history[1]?.Message).toContain('server-managed');
        expect(superSaveSpy).not.toHaveBeenCalled();
        expect(superDeleteSpy).not.toHaveBeenCalled();

        Object.defineProperty(entity, 'ContextCurrentUser', { value: systemUser, writable: true });
        expect(await entity.Save()).toBe(true);
        expect(await entity.Delete()).toBe(true);
        expect(superSaveSpy).toHaveBeenCalledTimes(1);
        expect(superDeleteSpy).toHaveBeenCalledTimes(1);
    });

    it('filters non-system RunView rows on MJ: Artifact Working States and MJ: Artifact Versions through ArtifactPermissionEngine', async () => {
        const fakeDbProvider = { ProviderType: 'Database' } as unknown as IMetadataProvider;
        Object.defineProperty(devUser, 'OwningProvider', { value: fakeDbProvider, configurable: true });

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(
            async (_p, artifactId) => ({
                ArtifactID: artifactId,
                CanRead: artifactId === allowedArtifactId,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: artifactId === allowedArtifactId ? 'ArtifactPermission' : 'Denied',
                Reason: artifactId === allowedArtifactId ? 'Allowed' : 'Denied'
            })
        );

        const params: RunViewParams = {
            EntityName: 'MJ: Artifact Working States',
            ResultType: 'simple'
        };
        const rawResults: RunViewResult = {
            Success: true,
            Results: [
                { ID: 'ws-1', ArtifactID: allowedArtifactId, YjsState: 'AQID' },
                { ID: 'ws-2', ArtifactID: deniedArtifactId, YjsState: 'SECRET' }
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };

        const filteredForDev = await ArtifactWorkingStatePostRunViewHook(params, rawResults, devUser);
        expect(filteredForDev.Results).toHaveLength(1);
        expect((filteredForDev.Results[0] as { ArtifactID: string }).ArtifactID).toBe(allowedArtifactId);
        expect(filteredForDev.RowCount).toBe(1);
        expect(filteredForDev.TotalRowCount).toBe(1);

        const unfilteredForSystem = await ArtifactWorkingStatePostRunViewHook(params, rawResults, systemUser);
        expect(unfilteredForSystem.Results).toHaveLength(2);

        const versionParams: RunViewParams = {
            EntityName: 'MJ: Artifact Versions',
            ResultType: 'simple'
        };
        const versionResults: RunViewResult = {
            Success: true,
            Results: [
                { ID: 'v-1', ArtifactID: allowedArtifactId, Content: 'Allowed' },
                { ID: 'v-2', ArtifactID: deniedArtifactId, Content: 'Secret' }
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: ''
        };
        const filteredVersions = await ArtifactVersionPostRunViewHook(versionParams, versionResults, devUser);
        expect(filteredVersions.Results).toHaveLength(1);
        expect((filteredVersions.Results[0] as { ArtifactID: string }).ArtifactID).toBe(allowedArtifactId);
    });

    it('persists and deletes MJ: Artifact Working States with dialect-neutral SQL across PostgreSQL ($1 / "col") and SQL Server (@p0 / [col]) (D4)', async () => {
        interface RecordedSqlCall {
            sql: string;
            params: unknown[] | undefined;
            options: ExecuteSQLOptions | undefined;
        }

        class MockDialectDbProvider extends DatabaseProviderBase {
            public readonly calls: RecordedSqlCall[] = [];
            private readonly _dialect: 'pg' | 'mssql';
            private readonly _handler: (sql: string, params?: unknown[]) => Record<string, unknown>[];

            public constructor(
                dialect: 'pg' | 'mssql',
                handler: (sql: string, params?: unknown[]) => Record<string, unknown>[]
            ) {
                super();
                this._dialect = dialect;
                this._handler = handler;
            }

            public override get ConfigData(): ProviderConfigDataBase {
                return { MJCoreSchemaName: '__mj' } as ProviderConfigDataBase;
            }

            public override QuoteIdentifier(name: string): string {
                return this._dialect === 'pg' ? `"${name}"` : `[${name}]`;
            }

            public override QuoteSchemaAndView(schemaName: string, objectName: string): string {
                return `${this.QuoteIdentifier(schemaName)}.${this.QuoteIdentifier(objectName)}`;
            }

            public override BuildParameterPlaceholder(index: number): string {
                return this._dialect === 'pg' ? `$${index + 1}` : `@p${index}`;
            }

            protected override get UUIDFunctionPattern(): RegExp {
                return /^gen_random_uuid\(\)$/i;
            }

            protected override get DBDefaultFunctionPattern(): RegExp {
                return /^now\(\)$/i;
            }

            public override async BeginTransaction(): Promise<void> {}
            public override async CommitTransaction(): Promise<void> {}
            public override async RollbackTransaction(): Promise<void> {}

            public override async ExecuteSQL<T>(
                sql: string,
                params?: unknown[],
                options?: ExecuteSQLOptions
            ): Promise<Array<T>> {
                this.calls.push({ sql, params, options });
                return this._handler(sql, params) as unknown as Array<T>;
            }
        }

        // 1. PostgreSQL dialect: insert -> update (with NULL fields) -> unique-race fallback -> delete
        let pgRowExists = false;
        let throwUniqueOnce = false;
        const pgProvider = new MockDialectDbProvider('pg', (sql) => {
            if (sql.startsWith('SELECT "ID"')) {
                return pgRowExists ? [{ ID: 'ws-pg-1' }] : [];
            }
            if (sql.startsWith('INSERT INTO')) {
                if (throwUniqueOnce) {
                    throwUniqueOnce = false;
                    throw new Error('duplicate key value violates unique constraint "UQ_ArtifactWorkingState_ArtifactID" (23505)');
                }
                pgRowExists = true;
                return [];
            }
            if (sql.startsWith('UPDATE')) {
                return [];
            }
            if (sql.startsWith('SELECT * FROM')) {
                return [
                    {
                        ID: 'ws-pg-1',
                        ArtifactID: allowedArtifactId,
                        YjsState: Buffer.from([1, 2, 3, 4]),
                        LastModifiedByUserID: devUser.ID
                    }
                ];
            }
            return [];
        });

        let loadedRowData: Record<string, unknown> | null = null;
        const makeWorkingStateEntity = (provider: DatabaseProviderBase): MJArtifactWorkingStateEntityServer => {
            const entity = Object.create(
                MJArtifactWorkingStateEntityServer.prototype
            ) as MJArtifactWorkingStateEntityServer;
            Object.defineProperty(entity, 'ResultHistory', { value: [], writable: true });
            Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
            Object.defineProperty(entity, 'ID', { value: '', writable: true });
            Object.defineProperty(entity, 'ArtifactID', { value: allowedArtifactId, writable: true });
            Object.defineProperty(entity, 'YjsState', {
                value: Buffer.from([1, 2, 3, 4]).toString('base64'),
                writable: true
            });
            Object.defineProperty(entity, 'LastModifiedByUserID', {
                value: devUser.ID,
                writable: true
            });
            Object.defineProperty(entity, 'ContextCurrentUser', { value: systemUser, writable: true });
            Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
            Object.defineProperty(entity, 'LoadFromData', {
                value: vi.fn(async (data: Record<string, unknown>) => {
                    loadedRowData = data;
                    Object.defineProperty(entity, 'ID', { value: String(data['ID'] ?? ''), writable: true });
                    Object.defineProperty(entity, 'IsSaved', { value: true, writable: true });
                    return true;
                }),
                configurable: true
            });
            Object.defineProperty(entity, 'NewRecord', {
                value: vi.fn(() => {
                    Object.defineProperty(entity, 'IsSaved', { value: false, writable: true });
                    return true;
                }),
                configurable: true
            });
            return entity;
        };

        const pgEntity = makeWorkingStateEntity(pgProvider);
        expect(await pgEntity.Save()).toBe(true);
        expect(pgProvider.calls.every((c) => !/MERGE|DECLARE|UNIQUEIDENTIFIER|\[/i.test(c.sql))).toBe(true);
        expect(pgProvider.calls[1]?.sql).toBe(
            'INSERT INTO "__mj"."ArtifactWorkingState" ("ID", "ArtifactID", "YjsState", "LastModifiedByUserID") VALUES ($1, $2, $3, $4)'
        );
        expect(Buffer.isBuffer(pgProvider.calls[1]?.params?.[2])).toBe(true);
        // Driver-returned BYTEA Buffer must be normalized to base64 before LoadFromData
        expect(loadedRowData?.['YjsState']).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));

        // Update path with NULL YjsState & NULL LastModifiedByUserID emits SQL literal NULL (no untyped null param)
        pgEntity.YjsState = null;
        pgEntity.LastModifiedByUserID = null;
        expect(await pgEntity.Save()).toBe(true);
        const updateCall = pgProvider.calls.find((c) => c.sql.startsWith('UPDATE'));
        expect(updateCall?.sql).toBe(
            'UPDATE "__mj"."ArtifactWorkingState" SET "YjsState" = NULL, "LastModifiedByUserID" = NULL, "__mj_UpdatedAt" = $1 WHERE "ArtifactID" = $2'
        );

        // Concurrent unique-constraint collision falls back cleanly to UPDATE
        pgRowExists = false;
        throwUniqueOnce = true;
        pgProvider.calls.length = 0;
        const racingEntity = makeWorkingStateEntity(pgProvider);
        expect(await racingEntity.Save()).toBe(true);
        expect(pgProvider.calls.some((c) => c.sql.startsWith('INSERT INTO'))).toBe(true);
        expect(pgProvider.calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(true);

        // Delete path on PostgreSQL
        pgProvider.calls.length = 0;
        expect(await pgEntity.Delete()).toBe(true);
        expect(pgProvider.calls[0]?.sql).toBe(
            'DELETE FROM "__mj"."ArtifactWorkingState" WHERE "ID" = $1 OR "ArtifactID" = $2'
        );

        // 2. SQL Server dialect: verifies @p0 / [__mj].[ArtifactWorkingState]
        const mssqlProvider = new MockDialectDbProvider('mssql', (sql) => {
            if (sql.startsWith('SELECT [ID]')) {
                return [];
            }
            if (sql.startsWith('SELECT * FROM')) {
                return [{ ID: 'ws-ms-1', ArtifactID: allowedArtifactId, YjsState: 'AQIDBA==' }];
            }
            return [];
        });
        const mssqlEntity = makeWorkingStateEntity(mssqlProvider);
        expect(await mssqlEntity.Save()).toBe(true);
        expect(mssqlProvider.calls[1]?.sql).toBe(
            'INSERT INTO [__mj].[ArtifactWorkingState] ([ID], [ArtifactID], [YjsState], [LastModifiedByUserID]) VALUES (@p0, @p1, @p2, @p3)'
        );
    });
});
