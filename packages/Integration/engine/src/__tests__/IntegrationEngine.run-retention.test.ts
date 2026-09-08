/**
 * Run-history retention must actually prune.
 *
 * The pruner reads the `keep` most-recent runs for a company integration, takes the oldest of
 * those as the cutoff, and deletes everything older — details before runs, because the details
 * carry the FK. Two things are easy to get wrong and neither fails loudly: deleting in the wrong
 * order (FK violation, or orphaned details where the FK is not enforced), and treating "exactly
 * `keep` runs exist" as a backlog and deleting the oldest run it was supposed to keep.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationRunEntity } from '@memberjunction/core-entities';
import { IntegrationEngine } from '../IntegrationEngine.js';

let mockRunViewFn: ReturnType<typeof vi.fn>;
/**
 * The provider `ProviderToUse` resolves to. The engine carries NO shared `_provider` field —
 * each run owns its provider through an AsyncLocalStorage context, and outside a run
 * `ProviderToUse` falls back to `Metadata.Provider`. The pruner runs at the tail of a run but
 * needs no run-scoped state, so the fallback is the seam to stub here.
 */
let mockProvider: unknown;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return {
        ...actual,
        RunView: class MockRunView {
            RunView(...args: unknown[]) { return mockRunViewFn(...args); }
        },
        Metadata: class MockMetadata {
            static get Provider() { return mockProvider; }
        },
    };
});

const contextUser = { ID: 'user-1' } as UserInfo;

const RUN_INFO = {
    Name: 'MJ: Company Integration Runs',
    SchemaName: '__mj',
    BaseTable: 'CompanyIntegrationRun',
    PrimaryKeys: [{ Name: 'ID' }],
};
const DETAIL_INFO = {
    Name: 'MJ: Company Integration Run Details',
    SchemaName: '__mj',
    BaseTable: 'CompanyIntegrationRunDetail',
};

/** Minimal provider: just the dialect + ExecuteSQL surface the pruner touches. */
function createProvider() {
    const executed: string[] = [];
    const provider = {
        EntityByName: (name: string) => (name === DETAIL_INFO.Name ? DETAIL_INFO : RUN_INFO),
        Dialect: {
            QuoteIdentifier: (s: string) => `"${s}"`,
            QuoteStringLiteral: (s: string) => `'${s.replace(/'/g, "''")}'`,
        },
        ExecuteSQL: (sql: string) => { executed.push(sql); return Promise.resolve([]); },
    };
    return { provider, executed };
}

function createRun(): MJCompanyIntegrationRunEntity {
    return {
        CompanyIntegrationID: 'ci-1',
        EntityInfo: RUN_INFO,
    } as unknown as MJCompanyIntegrationRunEntity;
}

/** Invokes the private pruner with a stubbed provider. */
function prune(engine: IntegrationEngine, provider: unknown): Promise<void> {
    mockProvider = provider;
    return (engine as unknown as {
        pruneOldRunHistory: (r: MJCompanyIntegrationRunEntity, u: UserInfo) => Promise<void>;
    }).pruneOldRunHistory(createRun(), contextUser);
}

describe('IntegrationEngine.pruneOldRunHistory', () => {
    let engine: IntegrationEngine;

    beforeEach(() => {
        engine = new IntegrationEngine();
        mockRunViewFn = vi.fn();
        mockProvider = undefined;
        process.env.MJ_INTEGRATION_MAX_RUNS_PER_CI = '100';
    });

    it('reads exactly the retention count, newest first, to find the cutoff', async () => {
        const { provider } = createProvider();
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: Array.from({ length: 100 }, () => ({ StartedAt: '2026-01-01T00:00:00.000Z' })),
            TotalRowCount: 100,
        });

        await prune(engine, provider);

        const params = mockRunViewFn.mock.calls[0][0] as { MaxRows: number; OrderBy: string };
        expect(params.MaxRows).toBe(100);
        expect(params.OrderBy).toBe('StartedAt DESC');
    });

    it('deletes details then runs once the backlog exceeds the retention count', async () => {
        const { provider, executed } = createProvider();
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: Array.from({ length: 100 }, () => ({ StartedAt: '2026-01-01T00:00:00.000Z' })),
            TotalRowCount: 137,          // 37 runs older than the cutoff
        });

        await prune(engine, provider);

        expect(executed).toHaveLength(2);
        expect(executed[0]).toContain('CompanyIntegrationRunDetail'); // FK children first
        expect(executed[1]).toContain('CompanyIntegrationRun"');
    });

    it('does nothing when the run count is exactly the retention count', async () => {
        const { provider, executed } = createProvider();
        mockRunViewFn.mockResolvedValue({
            Success: true,
            Results: Array.from({ length: 100 }, () => ({ StartedAt: '2026-01-01T00:00:00.000Z' })),
            TotalRowCount: 100,
        });

        await prune(engine, provider);

        expect(executed).toHaveLength(0);
    });

    it('does nothing when retention is disabled', async () => {
        process.env.MJ_INTEGRATION_MAX_RUNS_PER_CI = '0';
        const { provider, executed } = createProvider();

        await prune(engine, provider);

        expect(mockRunViewFn).not.toHaveBeenCalled();
        expect(executed).toHaveLength(0);
    });
});
