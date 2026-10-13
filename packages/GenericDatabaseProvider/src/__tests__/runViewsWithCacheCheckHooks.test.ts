import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Reuse the module mocks the main provider test file establishes are needed
import { vi } from 'vitest';
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    RegisterDataHook,
    ClearAllDataHooks,
    RunViewParams,
    RunViewResult,
    UserInfo,
    EntityInfo,
    PreRunViewHook,
    PostRunViewHook,
} from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

/**
 * Minimal concrete provider that captures what InternalRunView receives —
 * the point of these tests is to prove the RunViewsWithCacheCheck pipeline
 * applies the registered PreRunView data hooks (the enforcement seam tenant
 * middleware uses) before any execution leg, matching the standard
 * PreRunView/PreRunViews pipeline.
 */
class HookCaptureProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return HookCaptureProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return HookCaptureProvider._defaultPattern; }

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

    /** Params captured from every InternalRunView invocation. */
    public capturedRunViewParams: RunViewParams[] = [];
    /** Rows InternalRunView returns — set by the PostRunView tests to have something to mask. */
    public rowsToReturn: unknown[] = [];

    protected override async InternalRunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.capturedRunViewParams.push(params);
        const rows = this.rowsToReturn as T[];
        return { Success: true, Results: rows, UserViewRunID: '', RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }

    // Widening/caching lookups are irrelevant to these tests — no entity metadata loaded.
    public override EntityByName(_name: string): EntityInfo | undefined {
        return undefined;
    }
}

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
} as UserInfo;

describe('RunViewsWithCacheCheck — PreRunView data hooks', () => {
    let provider: HookCaptureProvider;

    beforeEach(() => {
        ClearAllDataHooks();
        provider = new HookCaptureProvider();
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    it('applies registered PreRunView hooks to every item before execution', async () => {
        const hook: PreRunViewHook = (params) => ({
            ...params,
            ExtraFilter: params.ExtraFilter
                ? `(${params.ExtraFilter as string}) AND InjectedByHook = 1`
                : 'InjectedByHook = 1',
        });
        RegisterDataHook('PreRunView', hook);

        const result = await provider.RunViewsWithCacheCheck(
            [
                { params: { EntityName: 'Test Entity A', ExtraFilter: `Status = 'Active'` } },
                { params: { EntityName: 'Test Entity B' } },
            ],
            mockUser,
        );

        expect(result.success).toBe(true);
        expect(provider.capturedRunViewParams).toHaveLength(2);
        expect(provider.capturedRunViewParams[0].ExtraFilter).toBe(`(Status = 'Active') AND InjectedByHook = 1`);
        expect(provider.capturedRunViewParams[1].ExtraFilter).toBe('InjectedByHook = 1');
    });

    it('passes the resolved context user to the hooks', async () => {
        const seenUsers: Array<UserInfo | undefined> = [];
        const hook: PreRunViewHook = (params, contextUser) => {
            seenUsers.push(contextUser);
            return params;
        };
        RegisterDataHook('PreRunView', hook);

        await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'Test Entity A' } }], mockUser);

        expect(seenUsers).toHaveLength(1);
        expect(seenUsers[0]?.ID).toBe('test-user-id');
    });

    it('never mutates the caller-supplied params objects', async () => {
        const hook: PreRunViewHook = (params) => ({ ...params, ExtraFilter: 'InjectedByHook = 1' });
        RegisterDataHook('PreRunView', hook);

        const callerParams = { params: { EntityName: 'Test Entity A', ExtraFilter: 'A = 1' } };
        await provider.RunViewsWithCacheCheck([callerParams], mockUser);

        expect(callerParams.params.ExtraFilter).toBe('A = 1');
    });

    it('runs cleanly with no hooks registered (baseline unchanged)', async () => {
        const result = await provider.RunViewsWithCacheCheck(
            [{ params: { EntityName: 'Test Entity A', ExtraFilter: 'A = 1' } }],
            mockUser,
        );

        expect(result.success).toBe(true);
        expect(provider.capturedRunViewParams[0].ExtraFilter).toBe('A = 1');
    });
});

describe('RunViewsWithCacheCheck — PostRunView data hooks', () => {
    let provider: HookCaptureProvider;

    beforeEach(() => {
        ClearAllDataHooks();
        provider = new HookCaptureProvider();
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    /** Reads the row set off a returned cache-check item (stale/differential legs carry `results`). */
    const rowsOf = (item: unknown): Array<Record<string, unknown>> | undefined =>
        (item as { results?: Array<Record<string, unknown>> }).results;

    it('applies registered PostRunView hooks to the returned rows (data masking)', async () => {
        provider.rowsToReturn = [
            { ID: '1', Name: 'a', Secret: 'top' },
            { ID: '2', Name: 'b', Secret: 'sauce' },
        ];
        const hook: PostRunViewHook = (_params, result) => ({
            ...result,
            Results: (result.Results as Array<Record<string, unknown>>).map((r) => ({ ...r, Secret: '***' })),
        });
        RegisterDataHook('PostRunView', hook);

        const result = await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'Test Entity A' } }], mockUser);

        expect(result.success).toBe(true);
        const rows = rowsOf(result.results[0]);
        expect(rows).toBeDefined();
        expect(rows!.every((r) => r.Secret === '***')).toBe(true);
        // Non-masked fields survive untouched.
        expect(rows!.map((r) => r.Name)).toEqual(['a', 'b']);
    });

    it('passes the resolved context user to the PostRunView hooks', async () => {
        provider.rowsToReturn = [{ ID: '1' }];
        const seenUsers: Array<UserInfo | undefined> = [];
        const hook: PostRunViewHook = (_params, result, contextUser) => {
            seenUsers.push(contextUser);
            return result;
        };
        RegisterDataHook('PostRunView', hook);

        await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'Test Entity A' } }], mockUser);

        expect(seenUsers.map((u) => u?.ID)).toContain('test-user-id');
    });

    it('leaves rows unchanged when no PostRunView hooks are registered (baseline)', async () => {
        provider.rowsToReturn = [{ ID: '1', Secret: 'top' }];

        const result = await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'Test Entity A' } }], mockUser);

        expect(result.success).toBe(true);
        expect(rowsOf(result.results[0])?.[0]?.Secret).toBe('top');
    });
});
