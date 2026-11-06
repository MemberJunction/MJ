/**
 * A caller that asks for a row cap can tell whether it got one: the cap step reports its outcome,
 * the render result carries it, and a requested cap that was not applied is logged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { QueryPagingEngine } from '../queryPagingEngine';
import { RenderPipeline } from '../renderPipeline';

afterEach(() => vi.restoreAllMocks());

function stubMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ Queries: [], QueryDependencies: [] } as unknown as typeof Metadata.Provider);
}

describe('QueryPagingEngine.ApplyMaxRows outcome', () => {
    it('reports a cap placed in the statement', () => {
        expect(QueryPagingEngine.ApplyMaxRows('SELECT a FROM t', 5, 'sqlserver').Outcome).toEqual({ Applied: true, Method: 'top', Reason: null });
        expect(QueryPagingEngine.ApplyMaxRows('SELECT a FROM t', 5, 'postgresql').Outcome).toEqual({ Applied: true, Method: 'limit', Reason: null });
        expect(QueryPagingEngine.ApplyMaxRows('SELECT a FROM t UNION SELECT b FROM u', 5, 'sqlserver').Outcome.Method).toBe('fetch');
    });

    it('reports the query’s own tighter cap', () => {
        const result = QueryPagingEngine.ApplyMaxRows('SELECT TOP 3 a FROM t', 5, 'sqlserver');
        expect(result.SQL).toBe('SELECT TOP 3 a FROM t');
        expect(result.Outcome).toEqual({ Applied: true, Method: 'own-cap', Reason: null });
    });

    it('reports a derived-table cap', () => {
        expect(QueryPagingEngine.ApplyMaxRows('SELECT TOP 10 PERCENT a FROM t ORDER BY a', 5, 'sqlserver').Outcome.Method).toBe('derived-table');
    });

    it('reports a document query it could not cap, with the reason', () => {
        const outcome = QueryPagingEngine.ApplyMaxRows('SELECT a FROM t UNION SELECT b FROM u FOR JSON PATH', 5, 'sqlserver').Outcome;
        expect(outcome.Applied).toBe(false);
        expect(outcome.Reason).toMatch(/FOR JSON/);
    });

    it('reports a statement that is not a read query, with the reason', () => {
        const outcome = QueryPagingEngine.ApplyMaxRows('SELECT * INTO copy FROM t', 5, 'sqlserver').Outcome;
        expect(outcome.Applied).toBe(false);
        expect(outcome.Reason).toMatch(/SELECT … INTO/);
    });

    it('keeps WrapWithMaxRows returning the SQL only', () => {
        expect(QueryPagingEngine.WrapWithMaxRows('SELECT a FROM t', 5, 'sqlserver')).toBe('SELECT TOP 5 a FROM t');
    });
});

describe('RenderPipeline carries the outcome', () => {
    it('on the render result when MaxRows was requested', () => {
        stubMetadata();
        expect(RenderPipeline.Run('SELECT a FROM t', { Platform: 'sqlserver', MaxRows: 5 }).RowCap).toEqual({ Applied: true, Method: 'top', Reason: null });
    });

    it('as null when no cap was requested', () => {
        stubMetadata();
        expect(RenderPipeline.Run('SELECT a FROM t', { Platform: 'sqlserver' }).RowCap).toBeNull();
    });

    it('and logs when a requested cap was not applied', () => {
        stubMetadata();
        const log = vi.spyOn(console, 'log');
        const result = RenderPipeline.Run('SELECT a FROM t UNION SELECT b FROM u FOR JSON PATH', { Platform: 'sqlserver', MaxRows: 5 });
        expect(result.RowCap?.Applied).toBe(false);
        expect(log.mock.calls.flat().some(m => typeof m === 'string' && /MaxRows 5 was not applied/.test(m))).toBe(true);
    });
});
