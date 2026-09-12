import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageMetadataBase, type MaterializedQueryConfig } from '../Database/manage-metadata';
import type { CodeGenConnection, CodeGenQueryResult } from '../Database/codeGenDatabaseProvider';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { UserInfo } from '@memberjunction/core';

class TestableManageMetadata extends ManageMetadataBase {
    public executedSQL: Array<{ sql: string; description: string }> = [];
    public existingMaterializedResultRows: Array<{ ID: string }> = [];

    constructor() {
        super();
        this.apiKeyRowFilterTargets = new Set<string>();
    }

    protected get dialect() {
        return new SQLServerDialect();
    }

    protected override get dbProvider(): any {
        return {
            PlatformKey: 'sqlserver',
            getMaterializedHashSurrogateColumnType: () => 'varchar(64)',
            getMaterializedSurrogateColumnType: () => 'int',
            generateMaterializedTableSQL: () => 'CREATE TABLE test',
            generateMaterializedWrapperViewSQL: () => 'CREATE VIEW test',
            BatchSeparator: 'GO',
        };
    }

    public exposeExtractMaterializedQueries(config: Record<string, unknown>): MaterializedQueryConfig[] {
        return this.extractMaterializedQueriesFromConfig(config);
    }

    protected override async queryHasIsMaterializedColumn(_pool: CodeGenConnection): Promise<boolean> {
        return true;
    }

    protected override async queryHasExternalDataSourceColumn(_pool: CodeGenConnection): Promise<boolean> {
        return false;
    }

    protected override async materializedResultTableExists(_pool: CodeGenConnection): Promise<boolean> {
        return true;
    }

    protected override assessQuerySourceRLSSafety(): { safe: boolean; reason?: string } {
        return { safe: true };
    }

    protected override async runQueryWithParams(
        _pool: CodeGenConnection,
        sql: string,
        _params: Record<string, unknown>
    ): Promise<CodeGenQueryResult> {
        if (sql.includes('FROM') && sql.includes('Query') && sql.includes('IsMaterialized')) {
            return {
                recordset: [
                    {
                        ID: '00B15E3C-A9F1-4E0A-A3D2-BC34FB585931',
                        Name: 'AIUsageHourly',
                        SQL: 'SELECT HourBucket, COUNT(*) AS RunCount FROM [__mj].vwAIUsageFacts WHERE IsCompleted = 1 GROUP BY HourBucket',
                    },
                ],
            } as CodeGenQueryResult;
        }
        if (sql.includes('QueryParameter')) {
            return { recordset: [{ n: 0 }] } as CodeGenQueryResult;
        }
        if (sql.includes('QueryField')) {
            return {
                recordset: [
                    { Name: 'HourBucket', SQLFullType: 'datetimeoffset', IsComputed: false },
                    { Name: 'RunCount', SQLFullType: 'int', IsComputed: true },
                ],
            } as CodeGenQueryResult;
        }
        if (sql.includes('vwQueryEntities')) {
            return { recordset: [] } as CodeGenQueryResult;
        }
        if (sql.includes('vwEntities')) {
            return { recordset: [{ ID: 'gen-entity-1' }] } as CodeGenQueryResult;
        }
        if (sql.includes('TableName = @T')) {
            // table owner check
            return { recordset: [] } as CodeGenQueryResult;
        }
        if (sql.includes('MaterializedResultQuery')) {
            return { recordset: this.existingMaterializedResultRows } as CodeGenQueryResult;
        }
        return { recordset: [] } as CodeGenQueryResult;
    }

    public override async LogSQLAndExecute(_pool: CodeGenConnection, sql: string, description: string): Promise<void> {
        this.executedSQL.push({ sql: sql.trim(), description });
    }

    public async callProcessQueryMaterializations(pool: CodeGenConnection, user: UserInfo) {
        return this.processQueryMaterializations(pool, user);
    }
}

describe('ManageMetadataBase: MaterializedQueries schedule and workload configuration', () => {
    let mm: TestableManageMetadata;
    const fakePool = {} as CodeGenConnection;
    const fakeUser = { ID: 'u1', Name: 'test' } as UserInfo;

    beforeEach(() => {
        mm = new TestableManageMetadata();
        ManageMetadataBase.invalidateSoftPKFKConfigCache();
    });

    it('extractMaterializedQueriesFromConfig extracts valid query declarations', () => {
        const config = {
            MaterializedQueries: [
                {
                    QueryName: 'AIUsageHourly',
                    RefreshSchedule: '0 5 * * * *',
                    IntendedWorkload: 'Hourly snapshot of AI metrics',
                },
                {
                    QueryName: 'AIUsageDaily',
                    RefreshSchedule: '0 20 0 * * *',
                },
                {
                    // missing QueryName should be filtered out
                    RefreshSchedule: '0 * * * *',
                },
            ],
        };

        const extracted = mm.exposeExtractMaterializedQueries(config);
        expect(extracted).toHaveLength(2);
        expect(extracted[0]).toEqual({
            QueryName: 'AIUsageHourly',
            RefreshSchedule: '0 5 * * * *',
            IntendedWorkload: 'Hourly snapshot of AI metrics',
        });
        expect(extracted[1]).toEqual({
            QueryName: 'AIUsageDaily',
            RefreshSchedule: '0 20 0 * * *',
            IntendedWorkload: undefined,
        });
    });

    it('propagates RefreshSchedule and IntendedWorkload to MaterializedResult INSERT', async () => {
        const spy = vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            MaterializedQueries: [
                {
                    QueryName: 'AIUsageHourly',
                    RefreshSchedule: '0 5 * * * *',
                    IntendedWorkload: 'Hourly snapshot of AI metrics',
                },
            ],
        });

        mm.existingMaterializedResultRows = []; // triggers INSERT
        await mm.callProcessQueryMaterializations(fakePool, fakeUser);

        const insertSql = mm.executedSQL.find(e => e.description.includes('Insert MJ: Materialized Results'));
        expect(insertSql).toBeDefined();
        expect(insertSql!.sql).toContain('[RefreshSchedule]');
        expect(insertSql!.sql).toContain("'0 5 * * * *'");
        expect(insertSql!.sql).toContain('[IntendedWorkload]');
        expect(insertSql!.sql).toContain("'Hourly snapshot of AI metrics'");

        spy.mockRestore();
    });

    it('propagates RefreshSchedule and IntendedWorkload to MaterializedResult UPDATE', async () => {
        const spy = vi.spyOn(ManageMetadataBase, 'getSoftPKFKConfig').mockReturnValue({
            MaterializedQueries: [
                {
                    QueryName: 'AIUsageHourly',
                    RefreshSchedule: '0 5 * * * *',
                    IntendedWorkload: 'Hourly snapshot of AI metrics',
                },
            ],
        });

        mm.existingMaterializedResultRows = [{ ID: 'existing-mr-1' }]; // triggers UPDATE
        await mm.callProcessQueryMaterializations(fakePool, fakeUser);

        const updateSql = mm.executedSQL.find(e => e.description.includes('Update MJ: Materialized Results'));
        expect(updateSql).toBeDefined();
        expect(updateSql!.sql).toContain("[RefreshSchedule]='0 5 * * * *'");
        expect(updateSql!.sql).toContain("[IntendedWorkload]='Hourly snapshot of AI metrics'");

        spy.mockRestore();
    });
});
