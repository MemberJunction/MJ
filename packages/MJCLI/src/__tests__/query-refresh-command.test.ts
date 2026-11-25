/**
 * `mj query refresh`: the flags become a refresh filter; the run goes through
 * `QueryExtractionService` as the System user on the configured provider; the report is printed;
 * a failed or unavailable query exits 1; no selector exits 2 before connecting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryRefreshFilter, QueryRefreshOptions, QueryRefreshReport, QueryRefreshRunReport } from '@memberjunction/core-entities-server';
import { QueryRefreshExit, QueryRefreshFilterFromFlags, QueryRefreshRunFailed } from '../lib/query-refresh.js';

const h = vi.hoisted(() => ({
    calls: [] as Array<{ Filter: unknown; Options: unknown; User: unknown }>,
    outcome: 'Refreshed' as string,
    initialized: 0,
    cleaned: 0,
}));

vi.mock('@memberjunction/metadata-sync', () => ({
    LoadMJConfig: () => ({ dbHost: 'x' }),
    InitializeProvider: vi.fn(async () => { h.initialized++; return { RunView: () => undefined, RunViews: () => undefined }; }),
    CleanupProvider: vi.fn(async () => { h.cleaned++; }),
    GetSystemUser: () => ({ ID: 'system' }),
}));

vi.mock('@memberjunction/core-entities-server', () => ({
    HasRefreshSelector: (f: QueryRefreshFilter) => Object.keys(f).length > 0,
    IsQueryRefreshProvider: () => true,
    FormatQueryRefreshRun: (run: QueryRefreshRunReport) => run.Reports.map(r => `${r.Outcome} ${r.QueryName}`),
    QueryExtractionService: class {
        constructor(private readonly context: { User: unknown }) {}
        async RefreshQueries(filter: QueryRefreshFilter, options: QueryRefreshOptions): Promise<QueryRefreshRunReport> {
            h.calls.push({ Filter: filter, Options: { DryRun: options.DryRun, WithAI: options.WithAI }, User: this.context.User });
            const report = { QueryID: 'Q1', QueryName: 'Top', Outcome: h.outcome, DryRun: options.DryRun === true } as QueryRefreshReport;
            return { DryRun: options.DryRun === true, Reports: [report], Cycles: [] };
        }
    },
}));

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function exitCodeOf(run: () => Promise<unknown>): Promise<number | undefined> {
    try {
        await run();
        return undefined;
    } catch (error: unknown) {
        return (error as Error & { oclif?: { exit?: number } }).oclif?.exit;
    }
}

beforeEach(() => {
    vi.spyOn(QueryRefreshExit, 'Exit').mockImplementation((code: number) => {
        throw Object.assign(new Error(`EEXIT: ${code}`), { oclif: { exit: code } });
    });
    h.calls.length = 0;
    h.outcome = 'Refreshed';
    h.initialized = 0;
    h.cleaned = 0;
});

describe('QueryRefreshFilterFromFlags', () => {
    it('maps each selector flag, and gives nothing for none', () => {
        expect(QueryRefreshFilterFromFlags({ id: ['Q1'], name: ['A/B'], category: 'MJ', entity: ['MJ: Users'], all: true }))
            .toEqual({ QueryIDs: ['Q1'], QueryNames: ['A/B'], CategoryPath: 'MJ', EntityNames: ['MJ: Users'], All: true });
        expect(QueryRefreshFilterFromFlags({ category: '  ', all: false })).toEqual({});
    });

    it('fails a run with a failed or unavailable query', () => {
        const run = (outcome: QueryRefreshReport['Outcome']): QueryRefreshRunReport => ({ DryRun: false, Cycles: [], Reports: [{ Outcome: outcome } as QueryRefreshReport] });
        expect([run('Refreshed'), run('Unchanged'), run('NotPermitted'), run('Failed'), run('Unavailable')].map(QueryRefreshRunFailed))
            .toEqual([false, false, false, true, true]);
    });
});

describe('mj query refresh', () => {
    it('refreshes as the System user with the flags given, and disconnects', async () => {
        const { default: QueryRefresh } = await import('../commands/query/refresh.js');
        const code = await exitCodeOf(() => QueryRefresh.run(['--all', '--dry-run', '--with-ai'], packageRoot));

        expect(code).toBe(0);
        expect(h.calls).toEqual([{ Filter: { All: true }, Options: { DryRun: true, WithAI: true }, User: { ID: 'system' } }]);
        expect([h.initialized, h.cleaned]).toEqual([1, 1]);
    }, 60_000);

    it('exits 1 when a query failed', async () => {
        h.outcome = 'Failed';
        const { default: QueryRefresh } = await import('../commands/query/refresh.js');
        expect(await exitCodeOf(() => QueryRefresh.run(['--name', 'Top'], packageRoot))).toBe(1);
    }, 60_000);

    it('exits 2 without connecting when no selector is given', async () => {
        const { default: QueryRefresh } = await import('../commands/query/refresh.js');
        expect(await exitCodeOf(() => QueryRefresh.run(['--dry-run'], packageRoot))).toBe(2);
        expect(h.initialized).toBe(0);
    }, 60_000);
});
