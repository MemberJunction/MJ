/**
 * Tests for the Testing dashboard's pure agent-context helpers
 * (`Testing/testing-agent-context.ts`).
 *
 * These back the agent context + the SAFE client tools wired into the Testing
 * dashboard. The validators must be tolerant (reject bad input, never throw),
 * the context builder must produce a stable, rounded, flat payload that is
 * MODE-SCOPED (only the active tab's detailed slice is published), name lists
 * must be bounded, and the run-reference resolver must match by id-then-name.
 */
import { describe, it, expect } from 'vitest';
import {
    buildTestingAgentContext,
    isValidTestingTab,
    isValidTestingStatusFilter,
    isValidTestingTimeRange,
    capList,
    resolveTestRunByReference,
    TESTING_CONTEXT_LIST_CAP,
    TESTING_CONTEXT_BREAKDOWN_CAP,
    TestingAgentContextInput,
    TestingRunsSurfaceState,
    TestingAnalyticsSurfaceState,
    TestingReviewSurfaceState,
} from '../Testing/testing-agent-context';

describe('testing-agent-context', () => {
    describe('isValidTestingTab', () => {
        it('accepts each known tab', () => {
            for (const tab of ['dashboard', 'runs', 'analytics', 'review']) {
                expect(isValidTestingTab(tab)).toBe(true);
            }
        });

        it('rejects unknown / non-string input', () => {
            expect(isValidTestingTab('settings')).toBe(false);
            expect(isValidTestingTab('')).toBe(false);
            expect(isValidTestingTab(undefined)).toBe(false);
            expect(isValidTestingTab(null)).toBe(false);
            expect(isValidTestingTab(42)).toBe(false);
        });
    });

    describe('isValidTestingStatusFilter', () => {
        it('accepts each known status', () => {
            for (const s of ['all', 'running', 'passed', 'failed', 'error']) {
                expect(isValidTestingStatusFilter(s)).toBe(true);
            }
        });

        it('rejects unknown / non-string input', () => {
            expect(isValidTestingStatusFilter('skipped')).toBe(false);
            expect(isValidTestingStatusFilter(undefined)).toBe(false);
            expect(isValidTestingStatusFilter(0)).toBe(false);
        });
    });

    describe('isValidTestingTimeRange', () => {
        it('accepts each known range', () => {
            for (const r of ['today', 'week', 'month', '90days']) {
                expect(isValidTestingTimeRange(r)).toBe(true);
            }
        });

        it('rejects unknown / non-string input', () => {
            expect(isValidTestingTimeRange('year')).toBe(false);
            expect(isValidTestingTimeRange('90 days')).toBe(false);
            expect(isValidTestingTimeRange(null)).toBe(false);
        });
    });

    describe('capList', () => {
        it('caps to the default list cap', () => {
            const names = Array.from({ length: TESTING_CONTEXT_LIST_CAP + 10 }, (_, i) => `n${i}`);
            expect(capList(names).length).toBe(TESTING_CONTEXT_LIST_CAP);
        });

        it('honors an explicit cap and never mutates the input', () => {
            const names = ['a', 'b', 'c', 'd'];
            const out = capList(names, 2);
            expect(out).toEqual(['a', 'b']);
            expect(names.length).toBe(4); // input untouched
            expect(out).not.toBe(names);
        });

        it('falls back to the default on a non-finite cap', () => {
            const names = Array.from({ length: TESTING_CONTEXT_LIST_CAP + 5 }, (_, i) => `n${i}`);
            expect(capList(names, Number.NaN).length).toBe(TESTING_CONTEXT_LIST_CAP);
        });
    });

    describe('resolveTestRunByReference', () => {
        const candidates = [
            { id: 'AAAA-1111', testName: 'Login Flow' },
            { id: 'BBBB-2222', testName: 'Checkout Flow' },
            { id: 'CCCC-3333', testName: 'Search Flow' },
        ];

        it('matches by exact id (case-insensitive)', () => {
            const r = resolveTestRunByReference('aaaa-1111', candidates);
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.run.testName).toBe('Login Flow');
        });

        it('matches by exact test name', () => {
            const r = resolveTestRunByReference('Checkout Flow', candidates);
            expect(r.ok && r.run.id).toBe('BBBB-2222');
        });

        it('falls back to a contains match on the name', () => {
            const r = resolveTestRunByReference('search', candidates);
            expect(r.ok && r.run.id).toBe('CCCC-3333');
        });

        it('errors with a sample on a miss', () => {
            const r = resolveTestRunByReference('nope', candidates);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error).toContain('Login Flow');
        });

        it('errors on empty input or empty candidate set', () => {
            expect(resolveTestRunByReference('', candidates).ok).toBe(false);
            expect(resolveTestRunByReference('x', []).ok).toBe(false);
        });
    });

    describe('buildTestingAgentContext', () => {
        const base: TestingAgentContextInput = {
            ActiveTab: 'dashboard',
            ActiveRunCount: 2,
            TotalTestsRun: 120,
            PassedCount: 100,
            PassRate: 83.33333,
            FailureCount: 7,
            SkippedCount: 13,
            ActiveTestCount: 18,
            AverageRunDuration: 1234.6,
            TotalTestCost: 4.56789,
            PendingReviewCount: 5,
            PassRateTrend: 2.345,
            ActiveRunNames: ['Live A', 'Live B'],
        };

        it('publishes the KPI slice (rounded) on the dashboard tab', () => {
            const ctx = buildTestingAgentContext(base);
            expect(ctx).toMatchObject({
                ActiveTab: 'dashboard',
                ActiveRunCount: 2,
                TotalTestsRun: 120,
                PassedCount: 100,
                PassRate: 83.3,            // 1 decimal
                FailureCount: 7,
                SkippedCount: 13,
                ActiveTestCount: 18,
                AverageRunDuration: 1235,  // rounded to integer ms
                TotalTestCost: 4.57,       // 2 decimals
                PendingReviewCount: 5,
                PassRateTrend: 2.3,        // 1 decimal
                ActiveRunNames: ['Live A', 'Live B'],
            });
        });

        it('does NOT include per-surface slices on the dashboard tab', () => {
            const ctx = buildTestingAgentContext(base);
            expect(ctx['SelectedRunId']).toBeUndefined();
            expect(ctx['TopFailingTests']).toBeUndefined();
            expect(ctx['View']).toBeUndefined();
        });

        it('coerces non-finite numeric inputs to 0', () => {
            const ctx = buildTestingAgentContext({
                ...base,
                PassRate: Number.NaN,
                TotalTestCost: Number.POSITIVE_INFINITY,
            });
            expect(ctx['PassRate']).toBe(0);
            expect(ctx['TotalTestCost']).toBe(0);
        });

        describe('mode-scoping: Runs', () => {
            const runs: TestingRunsSurfaceState = {
                StatusFilter: 'failed',
                TimeRange: 'week',
                SearchText: 'login',
                VisibleRunCount: 3,
                VisibleRunNames: ['Login Flow', 'Checkout Flow'],
                SelectedRunId: 'AAAA-1111',
                SelectedRunName: 'Login Flow',
                DetailPanelOpen: true,
            };

            it('publishes the Runs slice with selected run id+NAME', () => {
                const ctx = buildTestingAgentContext({ ...base, ActiveTab: 'runs', Runs: runs });
                expect(ctx).toMatchObject({
                    StatusFilter: 'failed',
                    TimeRange: 'week',
                    SearchText: 'login',
                    VisibleRunCount: 3,
                    VisibleRunNames: ['Login Flow', 'Checkout Flow'],
                    SelectedRunId: 'AAAA-1111',
                    SelectedRunName: 'Login Flow',
                    DetailPanelOpen: true,
                });
            });

            it('bounds VisibleRunNames and flags truncation', () => {
                const many = Array.from({ length: TESTING_CONTEXT_LIST_CAP + 3 }, (_, i) => `run-${i}`);
                const ctx = buildTestingAgentContext({
                    ...base,
                    ActiveTab: 'runs',
                    Runs: { ...runs, VisibleRunNames: many },
                });
                expect((ctx['VisibleRunNames'] as string[]).length).toBe(TESTING_CONTEXT_LIST_CAP);
                expect(ctx['VisibleRunNamesTruncated']).toBe(true);
            });

            it('omits the Runs slice when the active tab is not runs', () => {
                const ctx = buildTestingAgentContext({ ...base, ActiveTab: 'analytics', Runs: runs });
                expect(ctx['SelectedRunId']).toBeUndefined();
            });
        });

        describe('mode-scoping: Analytics', () => {
            const analytics: TestingAnalyticsSurfaceState = {
                SelectedDays: 90,
                TopFailingTests: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'],
                SlowestTests: ['s1', 's2'],
                MostExpensiveTests: ['e1'],
                VersionCount: 4,
            };

            it('publishes breakdowns bounded to the breakdown cap', () => {
                const ctx = buildTestingAgentContext({ ...base, ActiveTab: 'analytics', Analytics: analytics });
                expect(ctx['SelectedDays']).toBe(90);
                expect(ctx['VersionCount']).toBe(4);
                expect((ctx['TopFailingTests'] as string[]).length).toBe(TESTING_CONTEXT_BREAKDOWN_CAP);
                expect(ctx['SlowestTests']).toEqual(['s1', 's2']);
            });
        });

        describe('mode-scoping: Review', () => {
            const review: TestingReviewSurfaceState = {
                View: 'history',
                PendingCount: 9,
                ReviewedCount: 30,
                AverageHumanRating: 7.456,
                AgreementRate: 88.888,
                HistorySearchText: 'flow',
            };

            it('publishes the Review slice (rounded)', () => {
                const ctx = buildTestingAgentContext({ ...base, ActiveTab: 'review', Review: review });
                expect(ctx).toMatchObject({
                    View: 'history',
                    PendingCount: 9,
                    ReviewedCount: 30,
                    AverageHumanRating: 7.5,
                    AgreementRate: 88.9,
                    HistorySearchText: 'flow',
                });
            });
        });
    });
});
