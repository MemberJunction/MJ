/**
 * Pins that `RunViewsWithCacheCheck` applies BOTH field-security projections to the rows it
 * returns — not just the column-stripping one.
 *
 * Why this needs its own test. The smart-cache-check transport returns rows through legs
 * (serve-from-cache, full query, differential) that never traverse `PostRunView`, so it has to
 * redo `PostRunView`'s projections itself. `PostRunView` runs two, as a pair:
 *
 *     result.Results = this.ApplyFieldSecurityProjection(...)
 *     result.Results = this.ApplyRecordChangeFieldSecurityProjection(...)
 *
 * This transport originally replicated only the first, and the omission could not be caught by
 * any existing test because it is invisible to column stripping. `ApplyFieldSecurityProjection`
 * short-circuits on the RunView entity's own `EnableFieldLevelSecurity`, and `MJ: Record Changes`
 * has that flag OFF by design — so on precisely the rows that matter it is a no-op. The denied
 * values live INSIDE the `ChangesJSON` / `FullRecordJSON` payload columns, which stripping a
 * column list never reaches; `ApplyRecordChangeFieldSecurityProjection` is what projects those
 * payloads against the entity each row is *about*.
 *
 * The projections' own behaviour is covered in MJCore (`fieldSecurity.recordChanges.test.ts`).
 * What is at risk HERE is purely the wiring: that both are invoked, in the right order, and that
 * each one's RETURN VALUE is threaded into what the caller receives. These tests assert all
 * three, because "called but the result dropped" fails exactly as silently as "never called".
 *
 * Scope note: this exercises the full-query leg (`item.results`), which is the leg the reported
 * exploit path uses. The differential leg (`item.differentialData.updatedRows`) sits in the same
 * loop and is fixed identically, but reaching it requires a client cache status plus entity
 * metadata for change tracking, which this lightweight harness does not stand up.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: { Instance: { Config: async () => {}, EncryptValue: async (v: unknown) => v, DecryptValue: async (v: unknown) => v } },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { RunViewParams, RunViewResult, UserInfo, EntityInfo } from '@memberjunction/core';
import type { SaveSQLResult, DeleteSQLResult } from '../GenericDatabaseProvider';

type Row = Record<string, unknown>;

/**
 * Replaces both projections with marker-stamping stand-ins, so a test can see which ones ran,
 * in what order, and whether their output actually reached the caller.
 */
class ProjectionSpyProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return ProjectionSpyProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ProjectionSpyProvider._defaultPattern; }

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

    /** Ordered record of which projections ran. */
    public projectionCalls: string[] = [];
    /** The context user each projection received. */
    public seenUsers: Array<UserInfo | undefined> = [];
    public rowsToReturn: unknown[] = [];

    protected override async InternalRunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        const rows = this.rowsToReturn as T[];
        return { Success: true, Results: rows, UserViewRunID: '', RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    }

    protected override ApplyFieldSecurityProjection<T>(rows: T[], _params: RunViewParams, contextUser?: UserInfo): T[] {
        this.projectionCalls.push('columns');
        this.seenUsers.push(contextUser);
        return (rows as Row[]).map((r) => ({ ...r, columnsProjected: true })) as T[];
    }

    protected override ApplyRecordChangeFieldSecurityProjection<T>(rows: T[], _params: RunViewParams, contextUser?: UserInfo): T[] {
        this.projectionCalls.push('recordChanges');
        this.seenUsers.push(contextUser);
        return (rows as Row[]).map((r) => ({ ...r, recordChangesProjected: true })) as T[];
    }

    public override EntityByName(_name: string): EntityInfo | undefined {
        return undefined;
    }
}

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
} as UserInfo;

const rowsOf = (item: unknown): Row[] | undefined => (item as { results?: Row[] }).results;

describe('RunViewsWithCacheCheck — field-security projections', () => {
    let provider: ProjectionSpyProvider;

    beforeEach(() => {
        provider = new ProjectionSpyProvider();
    });

    it('REGRESSION: applies the Record Changes payload projection, not only column stripping', () => {
        // The audit-trail projection is the one that reaches denied values inside ChangesJSON.
        // Without it a restricted user receives the payload in full on this transport.
        provider.rowsToReturn = [{ ID: '1', ChangesJSON: '{"Salary":{"oldValue":100000,"newValue":120000}}' }];

        return provider.RunViewsWithCacheCheck([{ params: { EntityName: 'MJ: Record Changes' } }], mockUser).then((result) => {
            expect(result.success).toBe(true);
            expect(provider.projectionCalls).toContain('recordChanges');
            expect(rowsOf(result.results[0])?.[0]?.recordChangesProjected).toBe(true);
        });
    });

    it('applies BOTH projections, column stripping first — the same pair and order as PostRunView', async () => {
        provider.rowsToReturn = [{ ID: '1' }, { ID: '2' }];

        const result = await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'MJ: Record Changes' } }], mockUser);

        expect(provider.projectionCalls).toEqual(['columns', 'recordChanges']);
        // Both markers present on every row proves each projection's RETURN VALUE was threaded
        // through — calling one and discarding its result fails as silently as not calling it.
        const rows = rowsOf(result.results[0])!;
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.columnsProjected === true)).toBe(true);
        expect(rows.every((r) => r.recordChangesProjected === true)).toBe(true);
    });

    it('passes the resolved context user to both projections (they are per-user decisions)', async () => {
        provider.rowsToReturn = [{ ID: '1' }];

        await provider.RunViewsWithCacheCheck([{ params: { EntityName: 'MJ: Record Changes' } }], mockUser);

        expect(provider.seenUsers).toHaveLength(2);
        expect(provider.seenUsers.every((u) => u?.ID === 'test-user-id')).toBe(true);
    });

    it('projects every item in a batch, not just the first', async () => {
        // The reported reachability turns on batching: this transport is selected when
        // `params.some(p => p.CacheLocal)`, so a Record Changes view rides along with an
        // unrelated cache-local view. Every item must be projected, not only the one that
        // selected the transport.
        provider.rowsToReturn = [{ ID: '1' }];

        const result = await provider.RunViewsWithCacheCheck(
            [
                { params: { EntityName: 'Employees', CacheLocal: true } },
                { params: { EntityName: 'MJ: Record Changes' } },
            ],
            mockUser,
        );

        expect(result.results).toHaveLength(2);
        for (const item of result.results) {
            const rows = rowsOf(item);
            if (rows?.length) {
                expect(rows.every((r) => r.recordChangesProjected === true)).toBe(true);
            }
        }
        // Two items, two projections each.
        expect(provider.projectionCalls.filter((c) => c === 'recordChanges')).toHaveLength(2);
    });
});
