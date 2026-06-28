/**
 * @fileoverview Pure helpers for the Testing dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link TestingDashboardComponent}) supplies a plain snapshot of its current
 * state and these helpers shape it into the key-value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 */

/** The four tabs the Testing dashboard supports. */
export const TESTING_TABS = ['dashboard', 'runs', 'analytics', 'review'] as const;
export type TestingTab = (typeof TESTING_TABS)[number];

/** The five status filters the Runs surface supports. */
export const TESTING_STATUS_FILTERS = ['all', 'running', 'passed', 'failed', 'error'] as const;
export type TestingStatusFilter = (typeof TESTING_STATUS_FILTERS)[number];

/** The four time ranges the Runs surface supports. */
export const TESTING_TIME_RANGES = ['today', 'week', 'month', '90days'] as const;
export type TestingTimeRange = (typeof TESTING_TIME_RANGES)[number];

/**
 * Type-guard / validator for a tab string. Keeps the `SwitchTestingTab` client
 * tool tolerant of arbitrary agent input — only the four known tabs are accepted.
 */
export function isValidTestingTab(tab: unknown): tab is TestingTab {
    return typeof tab === 'string' && (TESTING_TABS as readonly string[]).includes(tab);
}

/** Type-guard for a status filter string (used by `FilterTestsByStatus`). */
export function isValidTestingStatusFilter(status: unknown): status is TestingStatusFilter {
    return typeof status === 'string' && (TESTING_STATUS_FILTERS as readonly string[]).includes(status);
}

/** Type-guard for a time-range string (used by `FilterTestsByTimeRange`). */
export function isValidTestingTimeRange(range: unknown): range is TestingTimeRange {
    return typeof range === 'string' && (TESTING_TIME_RANGES as readonly string[]).includes(range);
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the active tab plus the salient run-instrumentation KPIs that the
 * dashboard reads from {@link TestingInstrumentationService}.
 */
export interface TestingAgentContextInput {
    /** The currently active tab (dashboard / runs / analytics / review). */
    ActiveTab: TestingTab;
    /** Count of in-flight (live) test runs from the execution service. */
    ActiveRunCount: number;
    /** Total number of test runs in the active date range. */
    TotalTestsRun: number;
    /** Pass rate (%) over the active date range. */
    PassRate: number;
    /** Count of failed test runs in the active date range. */
    FailureCount: number;
    /** Average run duration in milliseconds over the active date range. */
    AverageRunDuration: number;
    /** Total LLM/run cost (USD) over the active date range. */
    TotalTestCost: number;
    /** Count of test runs awaiting human review (no feedback). */
    PendingReviewCount: number;
}

/**
 * Build the agent-visible context object for the Testing dashboard.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing. Numbers are rounded to keep the
 * agent payload compact and human-readable.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildTestingAgentContext(input: TestingAgentContextInput): Record<string, unknown> {
    return {
        ActiveTab: input.ActiveTab,
        ActiveRunCount: input.ActiveRunCount,
        TotalTestsRun: input.TotalTestsRun,
        PassRate: roundTo(input.PassRate, 1),
        FailureCount: input.FailureCount,
        AverageRunDuration: Math.round(input.AverageRunDuration),
        TotalTestCost: roundTo(input.TotalTestCost, 2),
        PendingReviewCount: input.PendingReviewCount,
    };
}

/** Round a number to a fixed number of decimal places, tolerating non-finite input. */
function roundTo(value: number, decimals: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
