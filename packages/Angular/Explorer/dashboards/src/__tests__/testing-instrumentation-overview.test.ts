import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';

vi.mock('@angular/core', () => ({ Injectable: () => (target: unknown) => target }));

interface FakeRun { ID: string; TestID: string; Status: string; Score: number; CostUSD: number; StartedAt: string; CompletedAt: string | null }

const { state } = vi.hoisted(() => ({
    state: {
        runs: [] as FakeRun[],
        calls: [] as RunViewParams[],
        suites: [] as Array<{ ID: string; Name: string; ParentID: string | null; Status: string }>,
        members: new Map<string, string[]>(),
    },
}));

const filterOf = (params: RunViewParams): string => (typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '');

function run(params: RunViewParams): RunViewResult {
    state.calls.push(params);
    const filter = filterOf(params);
    const lower = /StartedAt >= '([^']+)'/.exec(filter)?.[1];
    const upper = /StartedAt <= '([^']+)'/.exec(filter)?.[1];
    const rows = params.EntityName === 'MJ: Test Runs'
        ? state.runs.filter((r) => (!lower || r.StartedAt >= lower) && (!upper || r.StartedAt <= upper))
        : [];
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' } as RunViewResult;
}

vi.mock('@memberjunction/core', () => ({
    Metadata: class { public static Provider = {}; },
    RunView: {
        FromMetadataProvider: () => ({
            RunView: async (p: RunViewParams) => run(p),
            RunViews: async (ps: RunViewParams[]) => ps.map((p) => run(p)),
        }),
    },
}));
vi.mock('@memberjunction/core-entities', () => ({ MJTestRunFeedbackEntity: class {} }));
vi.mock('@memberjunction/testing-engine-base', () => ({
    TestEngineBase: {
        Instance: {
            get Tests() { return [] as Array<{ Status: string }>; },
            get TestSuites() { return state.suites; },
            GetTestsForSuite: (suiteID: string) => (state.members.get(suiteID) || []).map((ID) => ({ ID })),
        },
    },
}));

import { TestingInstrumentationService } from '../Testing/services/testing-instrumentation.service';

const NOW = new Date('2026-10-15T02:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const testRun = (ID: string, TestID: string, Status: string, CostUSD: number, minutes: number): FakeRun =>
    ({ ID, TestID, Status, Score: Status === 'Passed' ? 1 : 0, CostUSD, StartedAt: minutesAgo(minutes), CompletedAt: minutesAgo(minutes - 1) });

describe('TestingInstrumentationService — Overview', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        state.calls = [];
        state.suites = [];
        state.members = new Map();
        state.runs = [
            testRun('r-1', 'T-golden', 'Passed', 0.04, 20),
            testRun('r-2', 'T-golden', 'Failed', 0.03, 30),
            testRun('r-3', 'T-it125', 'Passed', 0.1, 40),
            testRun('r-4', 'T-other', 'Failed', 0, 50),
        ];
    });
    afterEach(() => vi.useRealTimers());

    it('rates each suite from the runs of its member tests', async () => {
        state.suites = [
            { ID: 'S-gates', Name: 'Predictive Studio Gates', ParentID: null, Status: 'Active' },
            { ID: 'S-empty', Name: 'Integration Tests', ParentID: null, Status: 'Active' },
        ];
        state.members.set('S-gates', ['t-golden', 'T-IT125', 'T-unrun']);
        const nodes = await firstValueFrom(new TestingInstrumentationService().SuiteHierarchy$);
        expect(nodes.find((n) => n.name === 'Predictive Studio Gates')).toMatchObject({ testCount: 3, RunCount: 3, passRate: (2 / 3) * 100 });
        expect(nodes.find((n) => n.name === 'Integration Tests')).toMatchObject({ testCount: 0, RunCount: 0, passRate: 0 });
    });

    it('includes runs started after the service was created in the default window', async () => {
        const service = new TestingInstrumentationService();
        const later = new Date(NOW.getTime() + 60 * 60_000);
        vi.setSystemTime(later);
        state.runs.push({ ...testRun('r-5', 'T-it125', 'Passed', 0.2, 0), StartedAt: new Date(later.getTime() - 60_000).toISOString() });
        const kpis = await firstValueFrom(service.Kpis$);
        expect(kpis.TotalTestRuns).toBe(5);
        expect(kpis.TotalCostThisMonth).toBeCloseTo(0.37, 6);
    });

    it('filters runs by suite on the SuiteID column', async () => {
        const service = new TestingInstrumentationService();
        service.SetSuiteFilter('S-gates');
        await firstValueFrom(service.TestRuns$);
        const runsRead = state.calls.find((c) => c.EntityName === 'MJ: Test Runs');
        expect(runsRead).toBeDefined();
        expect(filterOf(runsRead as RunViewParams))
            .toContain("TestID IN (SELECT TestID FROM [__mj].[vwTestSuiteTests] WHERE SuiteID = 'S-gates')");
    });
});
