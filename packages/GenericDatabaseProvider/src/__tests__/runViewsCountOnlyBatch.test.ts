/**
 * Routing for `InternalRunViews`: an all-`count_only` batch runs every view through
 * `RunViewCore` (full per-view security path) with a coalescing count executor, so
 * the counts reach the database as ONE statement. Mixed / single batches keep the
 * per-view path.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';

type CountExecutor = (sql: string) => Promise<{ TotalRowCount: number }[]>;

/** The slice of the provider `InternalRunViews` touches, driven by a fake RunViewCore. */
function fakeProvider(executeSQL: (sql: string) => Promise<Record<string, unknown>[]>) {
    const proto = GenericDatabaseProvider.prototype as unknown as Record<string, Function>;
    const self = {
        ExecuteSQL: vi.fn(executeSQL),
        QuoteIdentifier: (n: string) => `[${n}]`,
        InternalRunView: vi.fn(async (): Promise<RunViewResult> => ({ Success: true, Results: [], RowCount: 1, TotalRowCount: 1 } as unknown as RunViewResult)),
        // Mimics the tail of the real RunViewCore for count_only: hands its COUNT SQL to the executor.
        RunViewCore: vi.fn(async (p: RunViewParams, _u: unknown, exec?: CountExecutor): Promise<RunViewResult> => {
            if (p.ExtraFilter === 'FAIL-EARLY') {
                return { Success: false, ErrorMessage: 'no CanRead', Results: [], RowCount: 0, TotalRowCount: 0 } as unknown as RunViewResult;
            }
            const rows = await exec!(`SELECT COUNT(*) AS [TotalRowCount] FROM [s].[${p.EntityName}]`);
            return { Success: true, Results: [], RowCount: rows[0].TotalRowCount, TotalRowCount: rows[0].TotalRowCount } as unknown as RunViewResult;
        }),
        RunCoalescedCountBatch: proto.RunCoalescedCountBatch,
    };
    const internalRunViews = (params: RunViewParams[]) => (proto.InternalRunViews as Function).call(self, params) as Promise<RunViewResult[]>;
    return { self, internalRunViews };
}

describe('GenericDatabaseProvider.InternalRunViews — count_only coalescing', () => {
    it('runs an all-count_only batch as ONE UNION ALL statement', async () => {
        const { self, internalRunViews } = fakeProvider(async (sql) =>
            sql.split('\nUNION ALL\n').map((_, i) => ({ BatchIndex: i, TotalRowCount: i * 10 })),
        );
        const results = await internalRunViews([
            { EntityName: 'A', ResultType: 'count_only' },
            { EntityName: 'B', ResultType: 'count_only' },
            { EntityName: 'C', ResultType: 'count_only' },
        ]);
        expect(self.ExecuteSQL).toHaveBeenCalledTimes(1);
        expect(self.ExecuteSQL.mock.calls[0][0]).toContain('UNION ALL');
        expect(self.InternalRunView).not.toHaveBeenCalled();
        expect(results.map((r) => r.TotalRowCount)).toEqual([0, 10, 20]);
    });

    it('keeps a view that fails before its count as its own failure', async () => {
        const { self, internalRunViews } = fakeProvider(async () => [{ TotalRowCount: 7 }]);
        const results = await internalRunViews([
            { EntityName: 'A', ResultType: 'count_only' },
            { EntityName: 'B', ResultType: 'count_only', ExtraFilter: 'FAIL-EARLY' },
        ]);
        expect(results[0]).toMatchObject({ Success: true, TotalRowCount: 7 });
        expect(results[1]).toMatchObject({ Success: false, ErrorMessage: 'no CanRead' });
        // Only one survivor → run directly, no UNION ALL.
        expect(self.ExecuteSQL).toHaveBeenCalledTimes(1);
        expect(self.ExecuteSQL.mock.calls[0][0]).not.toContain('UNION ALL');
    });

    it('leaves mixed and single-item batches on the per-view path', async () => {
        const { self, internalRunViews } = fakeProvider(async () => []);
        await internalRunViews([{ EntityName: 'A', ResultType: 'count_only' }, { EntityName: 'B', ResultType: 'simple' }]);
        await internalRunViews([{ EntityName: 'A', ResultType: 'count_only' }]);
        expect(self.InternalRunView).toHaveBeenCalledTimes(3);
        expect(self.RunViewCore).not.toHaveBeenCalled();
    });
});
