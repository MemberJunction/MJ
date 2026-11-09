import { describe, it, expect, vi } from 'vitest';
import { CountOnlyBatchCoalescer, IsCoalescibleCountBatch, CountSQLExecutor } from '../countOnlyBatch';

const quote = (name: string): string => `"${name}"`;

/** Fake executor: answers the combined statement from a per-SQL count table. */
function fakeExecutor(counts: Record<string, number>, failOn?: (sql: string) => boolean): { exec: CountSQLExecutor; calls: string[] } {
    const calls: string[] = [];
    const exec: CountSQLExecutor = async (sql) => {
        calls.push(sql);
        if (failOn?.(sql)) throw new Error('bad filter');
        if (sql.includes('UNION ALL')) {
            return sql.split('\nUNION ALL\n').map((branch) => {
                const index = Number(/^SELECT (\d+) AS/.exec(branch)![1]);
                const inner = /FROM \((.*)\) "b\d+"$/.exec(branch)![1];
                return { BatchIndex: index, TotalRowCount: counts[inner] };
            });
        }
        return [{ TotalRowCount: counts[sql] }];
    };
    return { exec, calls };
}

describe('IsCoalescibleCountBatch', () => {
    it('requires two or more count_only items', () => {
        expect(IsCoalescibleCountBatch([{ ResultType: 'count_only' }])).toBe(false);
        expect(IsCoalescibleCountBatch([{ ResultType: 'count_only' }, { ResultType: 'count_only' }])).toBe(true);
    });
    it('rejects mixed batches', () => {
        expect(IsCoalescibleCountBatch([{ ResultType: 'count_only' }, { ResultType: 'simple' }])).toBe(false);
        expect(IsCoalescibleCountBatch([{ ResultType: 'count_only' }, {}])).toBe(false);
        expect(IsCoalescibleCountBatch([{ ResultType: 'count_only' }, null])).toBe(false);
    });
});

describe('CountOnlyBatchCoalescer', () => {
    it('runs every registered count as ONE statement and maps rows back by index', async () => {
        const { exec, calls } = fakeExecutor({ A: 3, B: 0, C: 12 });
        const batch = new CountOnlyBatchCoalescer(3, exec, quote);
        const results = await Promise.all([batch.Execute(0, 'A'), batch.Execute(1, 'B'), batch.Execute(2, 'C')]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('UNION ALL');
        expect(results.map((r) => r[0].TotalRowCount)).toEqual([3, 0, 12]);
    });

    it('does not flush until every view has registered or settled', async () => {
        const { exec, calls } = fakeExecutor({ A: 1, C: 2 });
        const batch = new CountOnlyBatchCoalescer(3, exec, quote);
        const a = batch.Execute(0, 'A');
        const c = batch.Execute(2, 'C');
        await Promise.resolve();
        expect(calls).toHaveLength(0);
        batch.MarkSettled(1); // view 1 failed before reaching its count
        expect((await a)[0].TotalRowCount).toBe(1);
        expect((await c)[0].TotalRowCount).toBe(2);
        expect(calls).toHaveLength(1);
    });

    it('runs a lone surviving count directly, without UNION ALL', async () => {
        const { exec, calls } = fakeExecutor({ A: 5 });
        const batch = new CountOnlyBatchCoalescer(2, exec, quote);
        const a = batch.Execute(0, 'A');
        batch.MarkSettled(1);
        expect((await a)[0].TotalRowCount).toBe(5);
        expect(calls).toEqual(['A']);
    });

    it('falls back to per-view execution when the combined statement fails, keeping failures per view', async () => {
        const { exec, calls } = fakeExecutor({ A: 4, C: 9 }, (sql) => sql.includes('BAD'));
        const batch = new CountOnlyBatchCoalescer(3, exec, quote);
        const a = batch.Execute(0, 'A');
        const bad = batch.Execute(1, 'BAD');
        const c = batch.Execute(2, 'C');
        expect((await a)[0].TotalRowCount).toBe(4);
        await expect(bad).rejects.toThrow('bad filter');
        expect((await c)[0].TotalRowCount).toBe(9);
        expect(calls[0]).toContain('UNION ALL');
        expect(calls.slice(1).sort()).toEqual(['A', 'BAD', 'C']);
    });

    it('rejects every view with a connection error from the combined statement and does not retry them one by one', async () => {
        const connectionError = Object.assign(new Error('Connection lost'), { code: 'ESOCKET' });
        const exec = vi.fn<CountSQLExecutor>().mockRejectedValue(connectionError);
        const isConnectionError = (error: unknown) => (error as { code?: string }).code === 'ESOCKET';
        const batch = new CountOnlyBatchCoalescer(3, exec, quote, isConnectionError);
        const results = [batch.Execute(0, 'A'), batch.Execute(1, 'B'), batch.Execute(2, 'C')];
        for (const result of results) {
            await expect(result).rejects.toBe(connectionError);
        }
        expect(exec).toHaveBeenCalledTimes(1);
        expect(exec.mock.calls[0][0]).toContain('UNION ALL');
    });

    it('coerces string counts (PostgreSQL bigint) to numbers', async () => {
        const exec = vi.fn<CountSQLExecutor>().mockResolvedValue([
            { BatchIndex: '0', TotalRowCount: '7' },
            { BatchIndex: '1', TotalRowCount: '0' },
        ]);
        const batch = new CountOnlyBatchCoalescer(2, exec, quote);
        const [a, b] = await Promise.all([batch.Execute(0, 'A'), batch.Execute(1, 'B')]);
        expect(a[0].TotalRowCount).toBe(7);
        expect(b[0].TotalRowCount).toBe(0);
    });

    it('rejects a view whose row is missing from the combined result', async () => {
        const exec = vi.fn<CountSQLExecutor>().mockResolvedValue([{ BatchIndex: 0, TotalRowCount: 1 }]);
        const batch = new CountOnlyBatchCoalescer(2, exec, quote);
        const a = batch.Execute(0, 'A');
        const b = batch.Execute(1, 'B');
        expect((await a)[0].TotalRowCount).toBe(1);
        await expect(b).rejects.toThrow(/no row for view 1/);
    });

    it('quotes identifiers with the dialect quoter and aliases every derived table', () => {
        const batch = new CountOnlyBatchCoalescer(2, vi.fn(), (n) => `[${n}]`);
        const sql = batch.BuildCombinedSQL([{ index: 0, sql: 'SELECT COUNT(*) AS [TotalRowCount] FROM [s].[v]' }, { index: 1, sql: 'X' }]);
        expect(sql).toBe(
            'SELECT 0 AS [BatchIndex], [TotalRowCount] FROM (SELECT COUNT(*) AS [TotalRowCount] FROM [s].[v]) [b0]\nUNION ALL\nSELECT 1 AS [BatchIndex], [TotalRowCount] FROM (X) [b1]',
        );
    });

    it('guards index range', () => {
        const batch = new CountOnlyBatchCoalescer(1, vi.fn(), quote);
        expect(() => batch.MarkSettled(1)).toThrow(/out of range/);
        expect(() => new CountOnlyBatchCoalescer(0, vi.fn(), quote)).toThrow();
    });
});
