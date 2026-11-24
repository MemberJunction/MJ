import { describe, it, expect, vi, afterEach } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { MatrixConcurrency, RunWithConcurrency } from '../checks/sqlpipe-matrix-runner';
import { OracleRunner } from '../checks/sqlpipe-oracle';

describe('sqlpipe-matrix-runner concurrency helpers', () => {
    const originalConcurrency = process.env.SQLPIPE_CONCURRENCY;

    afterEach(() => {
        if (originalConcurrency === undefined) delete process.env.SQLPIPE_CONCURRENCY;
        else process.env.SQLPIPE_CONCURRENCY = originalConcurrency;
    });

    it('bounds in-flight work to the requested limit while preserving result order', async () => {
        let active = 0;
        let peak = 0;
        const items = [40, 10, 30, 5, 25, 15, 20, 1];

        const results = await RunWithConcurrency(items, 3, async (delayMs, index) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((r) => setTimeout(r, delayMs));
            active--;
            return `item-${index}:${delayMs}`;
        });

        expect(peak).toBeGreaterThan(1);
        expect(peak).toBeLessThanOrEqual(3);
        expect(results).toEqual(items.map((d, i) => `item-${i}:${d}`));
    });

    it('handles an empty input list without invoking the worker', async () => {
        const worker = vi.fn(async (x: number) => x);
        const results = await RunWithConcurrency([], 4, worker);
        expect(results).toEqual([]);
        expect(worker).not.toHaveBeenCalled();
    });

    it('parses SQLPIPE_CONCURRENCY with safe clamping and fallback', () => {
        delete process.env.SQLPIPE_CONCURRENCY;
        expect(MatrixConcurrency(6)).toBe(6);

        process.env.SQLPIPE_CONCURRENCY = '8';
        expect(MatrixConcurrency(6)).toBe(8);

        process.env.SQLPIPE_CONCURRENCY = '999';
        expect(MatrixConcurrency(6)).toBe(16);

        process.env.SQLPIPE_CONCURRENCY = 'invalid';
        expect(MatrixConcurrency(4)).toBe(4);
    });
});

describe('OracleRunner concurrent safety', () => {
    it('coalesces concurrent Rows calls for identical SQL into a single ExecuteSQL call', async () => {
        const executeSQL = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 20));
            return [{ ID: 1 }];
        });
        const provider = { ExecuteSQL: executeSQL } as unknown as DatabaseProviderBase;
        const user = {} as UserInfo;
        const runner = new OracleRunner(provider, user, 'sqlserver');

        const [a, b, c] = await Promise.all([
            runner.Rows('SELECT 1 AS ID'),
            runner.Rows('SELECT 1 AS ID'),
            runner.Rows('SELECT 1 AS ID'),
        ]);

        expect(executeSQL).toHaveBeenCalledTimes(1);
        expect(a).toEqual([{ ID: 1 }]);
        expect(b).toBe(a);
        expect(c).toBe(a);
    });

    it('uses distinct temporary probe view names for concurrent PostgreSQL Describe calls', async () => {
        const createdViews: string[] = [];
        const executeSQL = vi.fn(async (sql: string) => {
            const createMatch = /CREATE VIEW\s+([^\s]+)\s+AS/.exec(sql);
            if (createMatch) createdViews.push(createMatch[1]);
            await new Promise((r) => setTimeout(r, 10));
            if (sql.includes('pg_attribute')) return [{ attname: 'id', type: 'integer' }];
            return [];
        });
        const provider = { ExecuteSQL: executeSQL } as unknown as DatabaseProviderBase;
        const user = {} as UserInfo;
        const runner = new OracleRunner(provider, user, 'postgresql');

        await Promise.all([
            runner.Describe('SELECT 1 AS id'),
            runner.Describe('SELECT 2 AS id'),
        ]);

        expect(createdViews).toHaveLength(2);
        expect(createdViews[0]).not.toBe(createdViews[1]);
    });
});
