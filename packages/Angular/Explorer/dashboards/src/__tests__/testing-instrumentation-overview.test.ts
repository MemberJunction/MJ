/**
 * F17 — the Testing app Overview (KPIs, Suite Health) and every other window read of the Testing service.
 *
 * The fake provider behaves like the real one where it matters: a RunView with no MaxRows returns at most the
 * entity's UserViewMaxRows (1000) rows (ordered by OrderBy, else by primary key), while Aggregates and count_only
 * cover EVERY row the filter matches. Totals must therefore come from aggregates (or the server-grouped
 * TestRunTotalsByTest query), every read must be bounded, and Suite Health must use real suite membership.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import type { RunViewParams, RunViewResult, AggregateResult, RunQueryParams } from '@memberjunction/core';

vi.mock('@angular/core', () => ({ Injectable: () => (target: unknown) => target }));

interface FakeRun { ID: string; TestID: string; Status: string; Score: number; CostUSD: number; StartedAt: string; CompletedAt: string | null }
interface FakeFeedback { ID: string; TestRunID: string; Rating: number; IsCorrect: boolean; CreatedAt: string }

const { state } = vi.hoisted(() => ({
    state: {
        runs: [] as FakeRun[],
        feedback: [] as FakeFeedback[],
        calls: [] as RunViewParams[],
        queries: [] as RunQueryParams[],
        suites: [] as Array<{ ID: string; Name: string; ParentID: string | null; Status: string }>,
        members: new Map<string, string[]>(),
        testTypes: new Map<string, string>(),
        failCountOnly: false,
        failQuery: false,
        suiteRuns: [] as Array<Record<string, unknown>>,
    },
}));

const VIEWS: Record<string, { SchemaName: string; BaseView: string }> = {
    'MJ: Test Run Feedbacks': { SchemaName: '__mj', BaseView: 'vwTestRunFeedbacks' },
    'MJ: Test Suite Tests': { SchemaName: '__mj', BaseView: 'vwTestSuiteTests' },
    'MJ: Tests': { SchemaName: '__mj', BaseView: 'vwTests' },
};

const filterOf = (params: RunViewParams): string => (typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '');
const quotedList = (text: string): string[] => text.split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
const reviewed = (runID: string): boolean => state.feedback.some((f) => f.TestRunID === runID);

/** Runs the filter matches: window bounds, TestID IN list, the feedback IN / NOT IN subquery and the discrepancy clause. */
function matchingRuns(filter: string): FakeRun[] {
    const lower = /StartedAt >= '([^']+)'/.exec(filter)?.[1];
    const upper = /StartedAt <= '([^']+)'/.exec(filter)?.[1];
    const strictUpper = /StartedAt < '([^']+)'/.exec(filter)?.[1];
    const ids = /TestID IN \(('[^)]*)\)/.exec(filter);
    const withoutFeedback = filter.includes('ID NOT IN (SELECT TestRunID FROM [__mj].[vwTestRunFeedbacks]');
    const withFeedback = !withoutFeedback && filter.includes('ID IN (SELECT TestRunID FROM [__mj].[vwTestRunFeedbacks]');
    const discrepant = filter.includes("((Status = 'Failed' AND Score >= 0.8) OR (Status = 'Passed' AND Score < 0.5))");
    return state.runs.filter((r) =>
        (!lower || r.StartedAt >= lower) && (!upper || r.StartedAt <= upper) && (!strictUpper || r.StartedAt < strictUpper)
        && (!ids || quotedList(ids[1]).includes(r.TestID))
        && (!withoutFeedback || !reviewed(r.ID)) && (!withFeedback || reviewed(r.ID))
        && (!discrepant || (r.Status === 'Failed' && r.Score >= 0.8) || (r.Status === 'Passed' && r.Score < 0.5)));
}

function matchingFeedback(filter: string): FakeFeedback[] {
    const lower = /CreatedAt >= '([^']+)'/.exec(filter)?.[1];
    const upper = /CreatedAt <= '([^']+)'/.exec(filter)?.[1];
    const runIDs = /TestRunID IN \(('[^)]*)\)/.exec(filter);
    return state.feedback.filter((f) => (!lower || f.CreatedAt >= lower) && (!upper || f.CreatedAt <= upper)
        && (!runIDs || quotedList(runIDs[1]).includes(f.TestRunID)));
}

const avg = (values: number[]): number | null => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

/** Evaluates the aggregate expressions the service sends, over the matching rows. */
function aggregate(expression: string, runs: FakeRun[], feedback: FakeFeedback[], isFeedback: boolean): number | null {
    const statusCount = /^SUM\(CASE WHEN Status = '(\w+)' THEN 1 ELSE 0 END\)$/.exec(expression);
    if (statusCount) return runs.filter((r) => r.Status === statusCount[1]).length;
    switch (expression) {
        case 'COUNT(*)': return isFeedback ? feedback.length : runs.length;
        case 'SUM(CostUSD)': return runs.reduce((s, r) => s + r.CostUSD, 0);
        case 'AVG(COALESCE(Score, 0))': return avg(runs.map((r) => r.Score));
        case 'AVG(DATEDIFF(second, StartedAt, CompletedAt) * 1000.0)':
            return avg(runs.filter((r) => r.CompletedAt).map((r) => Math.floor((Date.parse(r.CompletedAt!) - Date.parse(r.StartedAt)) / 1000) * 1000));
        case 'AVG(CAST(COALESCE(Rating, 0) AS FLOAT))': return avg(feedback.map((f) => f.Rating));
        case 'SUM(CASE WHEN IsCorrect = 1 THEN 1 ELSE 0 END)': return feedback.filter((f) => f.IsCorrect).length;
        case 'SUM(CASE WHEN IsCorrect = 0 THEN 1 ELSE 0 END)': return feedback.filter((f) => !f.IsCorrect).length;
        default: throw new Error(`fake provider: unexpected aggregate ${expression}`);
    }
}

function ordered<T extends { ID: string }>(rows: T[], orderBy: string | undefined, key: (row: T) => string): T[] {
    const sorted = [...rows].sort((a, b) => (orderBy ? key(a).localeCompare(key(b)) : a.ID.localeCompare(b.ID)));
    return orderBy && orderBy.endsWith('DESC') ? sorted.reverse() : sorted;
}

function run(params: RunViewParams): RunViewResult {
    state.calls.push(params);
    if (params.EntityName === 'MJ: Test Suite Runs') {
        return { Success: true, Results: state.suiteRuns, RowCount: state.suiteRuns.length, TotalRowCount: state.suiteRuns.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' } as RunViewResult;
    }
    if (state.failCountOnly && params.ResultType === 'count_only') {
        return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'boom', UserViewRunID: '' } as RunViewResult;
    }
    const isFeedback = params.EntityName === 'MJ: Test Run Feedbacks';
    const filter = filterOf(params);
    const runs = isFeedback ? [] : matchingRuns(filter);
    const feedback = isFeedback ? matchingFeedback(filter) : [];
    const orderBy = typeof params.OrderBy === 'string' ? params.OrderBy : undefined;
    const rows: Array<FakeRun | FakeFeedback> = isFeedback
        ? ordered(feedback, orderBy, (f) => f.CreatedAt)
        : ordered(runs, orderBy, (r) => r.StartedAt);
    const capped = params.IgnoreMaxRows ? rows : rows.slice(0, params.MaxRows || 1000);
    const aggregates: AggregateResult[] | undefined = params.Aggregates?.map((a) => ({
        expression: a.expression, alias: a.alias || a.expression, value: aggregate(a.expression, runs, feedback, isFeedback),
    }));
    return {
        Success: true, Results: params.ResultType === 'count_only' ? [] : capped, RowCount: capped.length,
        TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '', AggregateResults: aggregates,
    } as RunViewResult;
}

/** The TestRunTotalsByTest query, grouped the way its SQL groups. */
function runTotalsQuery(params: RunQueryParams): { Success: boolean; Results: Array<Record<string, unknown>> } {
    state.queries.push(params);
    if (state.failQuery) return { Success: false, Results: [], ErrorMessage: 'Query not found' } as { Success: boolean; Results: Array<Record<string, unknown>> };
    const { start, end } = params.Parameters as { start: string; end: string };
    const byTest = new Map<string, FakeRun[]>();
    for (const r of state.runs.filter((x) => x.StartedAt >= start && x.StartedAt <= end)) {
        byTest.set(r.TestID, [...(byTest.get(r.TestID) || []), r]);
    }
    return {
        Success: true,
        Results: Array.from(byTest.entries()).map(([testID, runs]) => ({
            TestID: testID, TestName: `Test ${testID}`, TestType: state.testTypes.get(testID) || 'Integration Test',
            Runs: runs.length, Passed: runs.filter((r) => r.Status === 'Passed').length,
            Failures: runs.filter((r) => r.Status === 'Failed' || r.Status === 'Error').length,
            Skipped: runs.filter((r) => r.Status === 'Skipped').length,
            TotalCost: runs.reduce((s, r) => s + r.CostUSD, 0), AvgDurationMs: null, MaxDurationMs: null,
        })),
    };
}

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        public static Provider = {
            EntityByName: (name: string) => VIEWS[name],
            RunQuery: async () => ({ Success: false }),
            RunQueries: async () => [],
        };
    },
    LogError: vi.fn(),
    RunView: {
        FromMetadataProvider: () => ({
            RunView: async (p: RunViewParams) => run(p),
            RunViews: async (ps: RunViewParams[]) => ps.map((p) => run(p)),
        }),
    },
    RunQuery: class { public async RunQuery(p: RunQueryParams) { return runTotalsQuery(p); } },
}));
vi.mock('../AI/services/ai-instrumentation.service', () => ({
    IsRunQueryProvider: (p: { RunQuery?: unknown }) => typeof p.RunQuery === 'function',
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

import { LogError } from '@memberjunction/core';
import { TestingInstrumentationService } from '../Testing/services/testing-instrumentation.service';

const NOW = new Date('2026-10-15T02:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

/** 1,200 free runs whose IDs sort first, then the three paid runs (IDs sort after the 1000-row cap). */
function seedRuns(): void {
    state.runs = Array.from({ length: 1200 }, (_, i) => ({
        ID: `a-${String(i).padStart(5, '0')}`, TestID: 'T-free', Status: 'Passed', Score: 1, CostUSD: 0,
        StartedAt: minutesAgo(600 + i), CompletedAt: minutesAgo(599 + i),
    }));
    state.runs.push(
        { ID: 'z-1', TestID: 'T-it125', Status: 'Passed', Score: 1, CostUSD: 0.107134, StartedAt: minutesAgo(110), CompletedAt: minutesAgo(107) },
        { ID: 'z-2', TestID: 'T-golden', Status: 'Passed', Score: 0.9, CostUSD: 0.035711, StartedAt: minutesAgo(16), CompletedAt: minutesAgo(15) },
        { ID: 'z-3', TestID: 'T-golden', Status: 'Failed', Score: 0.2, CostUSD: 0.035609, StartedAt: minutesAgo(18), CompletedAt: minutesAgo(17) },
    );
}

const feedbackOn = (runID: string, minutes: number, rating = 4, isCorrect = true): FakeFeedback =>
    ({ ID: `f-${runID}-${minutes}`, TestRunID: runID, Rating: rating, IsCorrect: isCorrect, CreatedAt: minutesAgo(minutes) });

describe('TestingInstrumentationService — Overview (F17)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        state.calls = [];
        state.queries = [];
        state.suites = [];
        state.members = new Map();
        state.testTypes = new Map();
        state.feedback = [feedbackOn('z-1', 100)];
        state.failCountOnly = false;
        state.failQuery = false;
        state.suiteRuns = [];
        vi.mocked(LogError).mockClear();
        seedRuns();
    });
    afterEach(() => vi.useRealTimers());

    it('totals the cost of every run in the window, not of the first 1000 rows', async () => {
        const kpis = await firstValueFrom(new TestingInstrumentationService().Kpis$);
        expect(kpis.TotalCostThisMonth).toBeCloseTo(0.178454, 6);
        expect(kpis.TotalTestRuns).toBe(1203);
        expect(kpis.FailedTests).toBe(1);
        expect(kpis.PassRateThisMonth).toBeCloseTo((1202 / 1203) * 100, 6);
        expect(kpis.TestsPendingReview).toBe(1202);
    });

    it('lists each suite with its member-test count and the pass rate of its members\' runs', async () => {
        state.suites = [
            { ID: 'S-gates', Name: 'Predictive Studio Gates — Feature Pipelines', ParentID: null, Status: 'Active' },
            { ID: 'S-empty', Name: 'Integration Tests', ParentID: null, Status: 'Active' },
        ];
        state.members.set('S-gates', ['T-it125', 'T-golden', 'T-a', 'T-b', 'T-c', 'T-d']);
        const nodes = await firstValueFrom(new TestingInstrumentationService().SuiteHierarchy$);
        const gates = nodes.find((n) => n.id === 'S-gates')!;
        expect(gates.testCount).toBe(6);
        expect(gates.passRate).toBeCloseTo((2 / 3) * 100, 6);
        expect(gates.totalCost).toBeCloseTo(0.178454, 6);
        const empty = nodes.find((n) => n.id === 'S-empty')!;
        expect(gates.RunCount).toBe(3);
        expect(empty.testCount).toBe(0);
        expect(empty.RunCount).toBe(0);
        expect(empty.passRate).toBe(0);
    });

    it('rolls the default "last 30 days" window forward to now on Refresh, and publishes it', async () => {
        const service = new TestingInstrumentationService();
        const seen: number[] = [];
        const sub = service.Kpis$.subscribe((k) => seen.push(k.TotalTestRuns));
        await vi.waitFor(() => expect(seen.length).toBe(1));
        const later = new Date(NOW.getTime() + 60 * 60_000);
        state.runs.push({ ID: 'z-9', TestID: 'T-it125', Status: 'Passed', Score: 1, CostUSD: 0.1, StartedAt: new Date(later.getTime() - 60_000).toISOString(), CompletedAt: later.toISOString() });
        vi.setSystemTime(later);
        service.Refresh();
        await vi.waitFor(() => expect(seen.length).toBe(2));
        expect(seen[1]).toBe(1204);
        expect((await firstValueFrom(service.DateRange$)).end.getTime()).toBe(later.getTime());
        sub.unsubscribe();
    });

    it('buckets every run in the window into the trend from per-bucket aggregates', async () => {
        const trends = await firstValueFrom(new TestingInstrumentationService().Trends$);
        expect(trends.reduce((n, b) => n + b.totalRuns, 0)).toBe(1203);
        expect(trends.reduce((c, b) => c + b.totalCost, 0)).toBeCloseTo(0.178454, 6);
        expect(trends.reduce((n, b) => n + b.failed, 0)).toBe(1);
    });

    it('ranks analytics from the server-grouped TestRunTotalsByTest query over the window', async () => {
        state.testTypes.set('T-golden', 'Feature Pipeline Golden Set');
        const analytics = await firstValueFrom(new TestingInstrumentationService().Analytics$);
        expect(state.queries.map((q) => q.QueryName)).toEqual(['TestRunTotalsByTest']);
        expect(analytics.mostExpensiveTests[0]).toEqual({ testName: 'Test T-it125', totalCost: 0.107134, avgCost: 0.107134 });
        expect(analytics.topFailingTests[0]).toMatchObject({ testName: 'Test T-golden', failureCount: 1, failureRate: 50 });
        expect(analytics.costByType.find((t) => t.testType === 'Integration Test')).toMatchObject({ testCount: 1201 });
        expect(analytics.passingRateByType[0]).toMatchObject({ testType: 'Feature Pipeline Golden Set', passRate: 50, totalTests: 2 });
    });

    it('queues an old unreviewed run even when more than 1000 newer runs are reviewed, plus reviewed discrepancies', async () => {
        // Every free run but the oldest is reviewed: 1199 reviewed runs are newer than the one left unreviewed.
        state.feedback = state.runs.filter((r) => r.ID.startsWith('a-') && r.ID !== 'a-01199').map((r) => feedbackOn(r.ID, 1));
        state.runs.push({ ID: 'z-4', TestID: 'T-golden', Status: 'Failed', Score: 0.9, CostUSD: 0, StartedAt: minutesAgo(5), CompletedAt: minutesAgo(4) });
        state.feedback.push(feedbackOn('z-4', 2));
        const pending = await firstValueFrom(new TestingInstrumentationService().PendingFeedback$);
        expect(pending.map((p) => [p.testRunID, p.reason])).toEqual([
            ['z-4', 'high-score-failed'], ['z-2', 'no-feedback'], ['z-3', 'no-feedback'], ['z-1', 'no-feedback'], ['a-01199', 'no-feedback'],
        ]);
        expect(state.calls.some((c) => c.EntityName === 'MJ: Test Run Feedbacks')).toBe(false);
    });

    it('computes the feedback stats over every feedback row in the window', async () => {
        state.feedback = Array.from({ length: 1500 }, (_, i) => feedbackOn(`a-${String(i % 1200).padStart(5, '0')}`, 1 + (i % 600), i < 300 ? 2 : 5, i >= 300));
        const stats = await firstValueFrom(new TestingInstrumentationService().FeedbackStats$);
        expect(stats.TotalFeedback).toBe(1500);
        expect(stats.AvgRating).toBeCloseTo((300 * 2 + 1200 * 5) / 1500, 6);
        expect(stats.AgreementRate).toBeCloseTo(80, 6);
        expect(stats.DisagreementRate).toBeCloseTo(20, 6);
    });

    it('reads the evaluation list\'s feedback for the listed runs only, newest feedback first', async () => {
        state.feedback = [feedbackOn('z-2', 10, 1, false), feedbackOn('z-2', 3, 5, true), feedbackOn('a-01199', 1)];
        const runs = await firstValueFrom(new TestingInstrumentationService().TestRunsWithFeedback$);
        const feedbackRead = state.calls.find((c) => c.EntityName === 'MJ: Test Run Feedbacks')!;
        const listed = quotedList(/TestRunID IN \(([^)]*)\)/.exec(filterOf(feedbackRead))![1]);
        expect(listed).toHaveLength(1000);
        expect(listed).not.toContain('a-01199'); // the oldest run is past the listed 1000
        expect(feedbackRead.MaxRows).toBe(5000);
        expect(runs.find((r) => r.id === 'z-2')).toMatchObject({ hasHumanFeedback: true, humanRating: 5, humanIsCorrect: true });
    });

    it('bounds every read: no IgnoreMaxRows, and every row read carries an explicit MaxRows', async () => {
        const service = new TestingInstrumentationService();
        await Promise.all([
            firstValueFrom(service.Kpis$), firstValueFrom(service.TestRuns$), firstValueFrom(service.SuiteHierarchy$),
            firstValueFrom(service.Trends$), firstValueFrom(service.Analytics$), firstValueFrom(service.PendingFeedback$),
            firstValueFrom(service.FeedbackStats$), firstValueFrom(service.TestRunsWithFeedback$),
        ]);
        expect(state.calls.length).toBeGreaterThan(0);
        for (const call of state.calls) {
            expect(call.IgnoreMaxRows).toBeFalsy();
            expect(call.CacheLocal).toBeFalsy();
            if (call.ResultType !== 'count_only') expect(call.MaxRows).toBeGreaterThan(0);
        }
    });

    it('filters runs by suite and type through views named by metadata', async () => {
        const service = new TestingInstrumentationService();
        service.SetSuiteFilter('S-gates');
        service.SetTestTypeFilter('TT-1');
        await firstValueFrom(service.TestRuns$);
        const filter = filterOf(state.calls.find((c) => c.EntityName === 'MJ: Test Runs')!);
        expect(filter).toContain("TestID IN (SELECT TestID FROM [__mj].[vwTestSuiteTests] WHERE SuiteID = 'S-gates')");
        expect(filter).toContain("TestID IN (SELECT ID FROM [__mj].[vwTests] WHERE TypeID = 'TT-1')");
    });

    it('logs a failed pending-review count instead of silently reading 0', async () => {
        state.failCountOnly = true;
        const kpis = await firstValueFrom(new TestingInstrumentationService().Kpis$);
        expect(kpis.TestsPendingReview).toBe(0);
        expect(vi.mocked(LogError)).toHaveBeenCalledWith('Testing Overview: pending review count failed: boom');
    });

    it('publishes each capped list\'s exact total next to the rows it shows', async () => {
        state.feedback = [];
        const service = new TestingInstrumentationService();
        await firstValueFrom(service.PendingFeedback$);
        await firstValueFrom(service.TestRunsWithFeedback$);
        await firstValueFrom(service.TestRuns$);
        const bounds = await firstValueFrom(service.ListBounds$);
        expect(bounds.PendingUnreviewed).toEqual({ Shown: 1000, Total: 1203 });
        expect(bounds.PendingDiscrepant).toEqual({ Shown: 0, Total: 0 });
        expect(bounds.RunsWithFeedback).toEqual({ Shown: 1000, Total: 1203 });
        expect(bounds.Runs).toEqual({ Shown: 1000, Total: 1203 });
    });

    it('carries the analytics query failure to the view instead of only logging it', async () => {
        state.failQuery = true;
        const analytics = await firstValueFrom(new TestingInstrumentationService().Analytics$);
        expect(analytics.LoadError).toBe('Query not found');
        expect(analytics.topFailingTests).toEqual([]);
    });

    describe('QF2-Y2: Skipped runs are neither passes nor failures', () => {
        const skip = (id: string, testID: string): FakeRun =>
            ({ ID: id, TestID: testID, Status: 'Skipped', Score: 0, CostUSD: 0, StartedAt: minutesAgo(30), CompletedAt: minutesAgo(30) });

        it('leaves skipped runs out of the KPI pass rate and keeps them in the run count', async () => {
            state.runs.push(skip('s-1', 'T-free'), skip('s-2', 'T-free'));
            const kpis = await firstValueFrom(new TestingInstrumentationService().Kpis$);
            expect(kpis.TotalTestRuns).toBe(1205);
            expect(kpis.SkippedTests).toBe(2);
            expect(kpis.PassRateThisMonth).toBeCloseTo((1202 / 1203) * 100, 6);
        });

        it('rates a suite over its executed runs and reports its skipped runs', async () => {
            state.suites = [
                { ID: 'S-gates', Name: 'Gates', ParentID: null, Status: 'Active' },
                { ID: 'S-skip', Name: 'All skipped', ParentID: null, Status: 'Active' },
            ];
            state.members.set('S-gates', ['T-golden']);
            state.members.set('S-skip', ['T-skip']);
            state.runs.push(skip('s-1', 'T-golden'), skip('s-2', 'T-skip'));
            const nodes = await firstValueFrom(new TestingInstrumentationService().SuiteHierarchy$);
            const gates = nodes.find((n) => n.id === 'S-gates')!;
            expect(gates).toMatchObject({ RunCount: 3, SkippedCount: 1, passRate: 50 });
            expect(nodes.find((n) => n.id === 'S-skip')).toMatchObject({ RunCount: 1, SkippedCount: 1, passRate: 0 });
        });

        it('rates analytics failures and types over executed runs', async () => {
            state.runs.push(skip('s-1', 'T-golden'), skip('s-2', 'T-golden'));
            state.testTypes.set('T-golden', 'Golden');
            const analytics = await firstValueFrom(new TestingInstrumentationService().Analytics$);
            expect(analytics.topFailingTests[0]).toMatchObject({ testName: 'Test T-golden', failureCount: 1, failureRate: 50 });
            expect(analytics.passingRateByType.find((t) => t.testType === 'Golden')).toMatchObject({ passRate: 50, totalTests: 4, Skipped: 2 });
        });

        it('rates version metrics over executed tests', async () => {
            state.suiteRuns = [{ TotalTests: 10, PassedTests: 6, SkippedTests: 2, FailedTests: 2, TotalCostUSD: 0, StartedAt: minutesAgo(5), GitCommit: 'abcdef12', AgentVersion: '1' }];
            const metrics = await new TestingInstrumentationService().GetVersionMetrics();
            expect(metrics[0]).toMatchObject({ totalTests: 10, SkippedTests: 2, passRate: 75 });
        });

        it('rates execution success over executed runs', async () => {
            state.runs = [
                { ID: 'p', TestID: 'T', Status: 'Passed', Score: 1, CostUSD: 0, StartedAt: minutesAgo(5), CompletedAt: minutesAgo(4) },
                { ID: 'e', TestID: 'T', Status: 'Error', Score: 0, CostUSD: 0, StartedAt: minutesAgo(6), CompletedAt: minutesAgo(5) },
                skip('s', 'T'),
            ];
            const metrics = await firstValueFrom(new TestingInstrumentationService().EvaluationMetrics$);
            expect(metrics.execSuccessRate).toBeCloseTo(50, 6);
        });
    });
});
