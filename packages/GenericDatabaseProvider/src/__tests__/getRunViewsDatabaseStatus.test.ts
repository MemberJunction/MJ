/**
 * GetRunViewsDatabaseStatus — the database-only probe the engine sweeper uses (plan Phase 3.1).
 *
 * It must ask the database, never a cache, with the same WHERE clause a read would use
 * (including PreRunView hooks), and report each view's outcome in order.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { ClearAllDataHooks, RegisterDataHook, EntityInfo, ExecuteSQLOptions, RunViewParams, UserInfo } from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

const WIDGETS = {
    Name: 'Widgets', SchemaName: '__mj', BaseView: 'vwWidgets',
    // A real entity always carries its fields, and the probe reads them to decide whether the view
    // has a __mj_UpdatedAt column to take a MAX of.
    Fields: [{ Name: '__mj_UpdatedAt', IsUpdatedAtField: true }],
} as unknown as EntityInfo;

class StatusProbeProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*gen_random_uuid\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*now\s*\(\s*\)\s*$/i;
    protected get UUIDFunctionPattern(): RegExp { return StatusProbeProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return StatusProbeProvider._defaultPattern; }
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

    public Statements: string[] = [];
    public FailOn: string | null = null;
    public Rows: unknown[] = [{ TotalRows: 3, MaxUpdatedAt: '2026-09-03T00:00:00.000Z' }];

    public override EntityByName(name: string): EntityInfo | undefined {
        return name === 'Widgets' ? WIDGETS : undefined;
    }

    protected override async buildWhereClauseForCacheCheck(params: RunViewParams): Promise<string> {
        return (params.ExtraFilter as string) ?? '';
    }

    protected override async resolveEffectiveBaseView(entityInfo: EntityInfo): Promise<string> {
        return entityInfo.BaseView;
    }

    public override async ExecuteSQL<T>(query: string, _parameters?: unknown[], _options?: ExecuteSQLOptions): Promise<T[]> {
        this.Statements.push(query);
        if (this.FailOn && query.includes(this.FailOn)) {
            throw new Error('deadlock');
        }
        return this.Rows as T[];
    }
}

const user = { ID: 'u1', Name: 'System', Email: 'system@test' } as UserInfo;

describe('GenericDatabaseProvider.GetRunViewsDatabaseStatus', () => {
    let provider: StatusProbeProvider;

    beforeEach(() => {
        ClearAllDataHooks();
        provider = new StatusProbeProvider();
    });

    afterEach(() => ClearAllDataHooks());

    it('counts rows and reads the newest timestamp from the database, one entry per view in order', async () => {
        const statuses = await provider.GetRunViewsDatabaseStatus([
            { EntityName: 'Widgets', ExtraFilter: `Color = 'red'` },
            { EntityName: 'Nope' },
            { EntityName: 'Widgets' },
        ], user);

        expect(statuses).toEqual([
            { Success: true, RowCount: 3, MaxUpdatedAt: '2026-09-03T00:00:00.000Z' },
            { Success: false, ErrorMessage: 'Entity Nope not found' },
            { Success: true, RowCount: 3, MaxUpdatedAt: '2026-09-03T00:00:00.000Z' },
        ]);
        expect(provider.Statements[0]).toBe(`SELECT COUNT(*) AS "TotalRows", MAX("__mj_UpdatedAt") AS "MaxUpdatedAt" FROM "__mj"."vwWidgets" WHERE Color = 'red'`);
        expect(provider.Statements[1]).not.toContain('WHERE');
    });

    it('applies PreRunView hooks, as a read would, without changing the caller\'s params', async () => {
        RegisterDataHook('PreRunView', (params) => ({ ...params, ExtraFilter: 'TenantID = 7' }));
        const params: RunViewParams = { EntityName: 'Widgets', ExtraFilter: 'A = 1' };
        await provider.GetRunViewsDatabaseStatus([params], user);
        expect(provider.Statements[0]).toContain('WHERE TenantID = 7');
        expect(params.ExtraFilter).toBe('A = 1');
    });

    it('reports an empty view and a failed query per entry', async () => {
        provider.Rows = [{ TotalRows: 0, MaxUpdatedAt: null }];
        provider.FailOn = 'B = 2';
        const statuses = await provider.GetRunViewsDatabaseStatus([
            { EntityName: 'Widgets', ExtraFilter: 'A = 1' },
            { EntityName: 'Widgets', ExtraFilter: 'B = 2' },
        ], user);
        expect(statuses[0]).toEqual({ Success: true, RowCount: 0, MaxUpdatedAt: undefined });
        expect(statuses[1]).toEqual({ Success: false, ErrorMessage: 'deadlock' });
    });
});
