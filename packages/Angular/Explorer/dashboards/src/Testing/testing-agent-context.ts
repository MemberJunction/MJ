/**
 * @fileoverview Pure helpers for the Testing dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link TestingDashboardComponent}) supplies a plain snapshot of its current
 * state and these helpers shape it into the key-value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * Mirrors the Data Explorer's agent-context depth (`data-explorer-agent-context.ts`):
 * everything on screen, bounded name lists, selected id+NAME, per-surface metrics,
 * and a mode-scoped tool surface keyed on the active tab.
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

/** The two Review view modes (the queue vs. reviewed history). */
export const TESTING_REVIEW_VIEWS = ['queue', 'history'] as const;
export type TestingReviewView = (typeof TESTING_REVIEW_VIEWS)[number];

/**
 * Upper bound on how many names we publish in a name-list context field
 * (e.g. VisibleRunNames, TopFailingTests). Keeping the streamed note bounded
 * avoids flooding the co-agent with hundreds of names; when the underlying list
 * is larger we surface a companion total-count field instead. Mirrors the Data
 * Explorer's `AGENT_CONTEXT_RECORD_LIST_CAP` / `AGENT_CONTEXT_NAME_LIST_CAP`.
 */
export const TESTING_CONTEXT_LIST_CAP = 25;

/**
 * Upper bound on the analytics breakdown lists (top failing / slowest / most
 * expensive). These are already top-N on the service side, but we re-cap here so
 * the streamed note stays compact regardless of upstream changes.
 */
export const TESTING_CONTEXT_BREAKDOWN_CAP = 5;

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
 * Cap an array of names/strings to {@link TESTING_CONTEXT_LIST_CAP} (or a caller
 * override) entries. Pure + deterministic; never mutates the input. Tolerates a
 * non-finite cap by falling back to the default.
 */
export function capList(names: readonly string[], cap: number = TESTING_CONTEXT_LIST_CAP): string[] {
    const safeCap = Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : TESTING_CONTEXT_LIST_CAP;
    return names.slice(0, safeCap);
}

/** A minimal id+name pair describing a test run, as the Runs surface holds them. */
export interface TestRunNameCandidate {
    id: string;
    testName: string;
}

/** Outcome of {@link resolveTestRunByReference}: a matched run, or an error. */
export type TestRunResolution<T extends TestRunNameCandidate> =
    | { ok: true; run: T }
    | { ok: false; error: string };

/**
 * Resolve an agent-supplied run reference (either an exact run ID or a run name)
 * against the runs currently loaded on the Runs surface. The agent usually has
 * the ID from `GetTestRunDetails` / published context, but tolerantly accepts a
 * test name too. Pure + deterministic over the supplied `candidates`.
 *
 * Resolution order:
 *   1. exact id match (case-insensitive — UUIDs may arrive upper/lower-cased)
 *   2. exact test-name match (case-insensitive)
 *   3. first case-insensitive *contains* match on the test name
 *
 * @param reference - a run ID or a (partial) test name
 * @param candidates - the runs currently loaded on the Runs surface
 * @returns the matched run, or a clear error message
 */
export function resolveTestRunByReference<T extends TestRunNameCandidate>(
    reference: string,
    candidates: readonly T[],
): TestRunResolution<T> {
    const needle = reference.trim().toLowerCase();
    if (!needle) {
        return { ok: false, error: 'Provide a test-run ID or a test name to select.' };
    }
    if (candidates.length === 0) {
        return { ok: false, error: 'No test runs are currently loaded in the Runs view to select from.' };
    }
    const byId = candidates.find(c => c.id.toLowerCase() === needle);
    if (byId) {
        return { ok: true, run: byId };
    }
    const byExactName = candidates.find(c => c.testName.toLowerCase() === needle);
    if (byExactName) {
        return { ok: true, run: byExactName };
    }
    const byContains = candidates.find(c => c.testName.toLowerCase().includes(needle));
    if (byContains) {
        return { ok: true, run: byContains };
    }
    const sample = candidates.slice(0, 5).map(c => c.testName).join(', ');
    return { ok: false, error: `No loaded test run matches "${reference}". Loaded runs include: ${sample}.` };
}

/** One analytics breakdown row published to the agent (name + a metric). */
export interface TestingBreakdownEntry {
    name: string;
    value: number;
}

/**
 * The Runs-surface slice of the snapshot. Optional because it's only meaningful
 * when the Runs tab is (or has been) active; the dashboard supplies it from the
 * child Runs component's reported state.
 */
export interface TestingRunsSurfaceState {
    /** Active status filter on the Runs surface. */
    StatusFilter: TestingStatusFilter;
    /** Active time-range filter on the Runs surface. */
    TimeRange: TestingTimeRange;
    /** Free-text search applied to the Runs list. */
    SearchText: string;
    /** Number of runs currently visible after the Runs-surface filters. */
    VisibleRunCount: number;
    /** Display names of the currently-visible runs, in list order (bounded). */
    VisibleRunNames: string[];
    /** ID of the run whose detail panel is open, or null. */
    SelectedRunId: string | null;
    /** Display name of the run whose detail panel is open, or null. */
    SelectedRunName: string | null;
    /** Whether the run-detail panel is open. */
    DetailPanelOpen: boolean;
}

/**
 * The Analytics-surface slice of the snapshot. Optional — supplied when the
 * Analytics tab is active and has reported its breakdowns.
 */
export interface TestingAnalyticsSurfaceState {
    /** The trailing window the Analytics surface is showing, in days. */
    SelectedDays: number;
    /** Names of the top failing tests (bounded, top-N). */
    TopFailingTests: string[];
    /** Names of the slowest tests (bounded, top-N). */
    SlowestTests: string[];
    /** Names of the most expensive tests (bounded, top-N). */
    MostExpensiveTests: string[];
    /** Number of distinct version rows shown in the version-comparison table. */
    VersionCount: number;
}

/**
 * The Review-surface slice of the snapshot. Optional — supplied when the Review
 * tab is active.
 */
export interface TestingReviewSurfaceState {
    /** Which Review view is active (queue vs. reviewed history). */
    View: TestingReviewView;
    /** Count of runs awaiting human review (the queue depth). */
    PendingCount: number;
    /** Count of runs that have human feedback (reviewed). */
    ReviewedCount: number;
    /** Average human rating across reviewed runs (0 when none). */
    AverageHumanRating: number;
    /** Human/auto agreement rate (%) across runs evaluated by both. */
    AgreementRate: number;
    /** Free-text search applied to the reviewed-history list. */
    HistorySearchText: string;
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Carries the always-on KPIs (read from {@link TestingInstrumentationService})
 * plus optional per-surface slices the dashboard collects from the child
 * components. Only the slice for the active tab is published in detail.
 */
export interface TestingAgentContextInput {
    /** The currently active tab (dashboard / runs / analytics / review). */
    ActiveTab: TestingTab;
    /** Count of in-flight (live) test runs from the execution service. */
    ActiveRunCount: number;
    /** Total number of test runs in the active date range. */
    TotalTestsRun: number;
    /** Count of passing test runs in the active date range. */
    PassedCount: number;
    /** Pass rate (%) over the active date range. */
    PassRate: number;
    /** Count of failed test runs in the active date range. */
    FailureCount: number;
    /** Count of skipped test runs in the active date range. */
    SkippedCount: number;
    /** Number of active (enabled) tests in the catalog. */
    ActiveTestCount: number;
    /** Average run duration in milliseconds over the active date range. */
    AverageRunDuration: number;
    /** Total LLM/run cost (USD) over the active date range. */
    TotalTestCost: number;
    /** Count of test runs awaiting human review (no feedback). */
    PendingReviewCount: number;
    /** Pass-rate trend (percentage-point change vs. the previous period). */
    PassRateTrend: number;
    /** Display names of the active live runs (bounded). */
    ActiveRunNames: string[];

    /** Runs-surface slice (published when ActiveTab === 'runs'). */
    Runs?: TestingRunsSurfaceState;
    /** Analytics-surface slice (published when ActiveTab === 'analytics'). */
    Analytics?: TestingAnalyticsSurfaceState;
    /** Review-surface slice (published when ActiveTab === 'review'). */
    Review?: TestingReviewSurfaceState;
}

/** Build the always-on KPI slice shared by every tab. */
function buildKpiContext(input: TestingAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        ActiveTab: input.ActiveTab,
        ActiveRunCount: input.ActiveRunCount,
        TotalTestsRun: input.TotalTestsRun,
        PassedCount: input.PassedCount,
        PassRate: roundTo(input.PassRate, 1),
        FailureCount: input.FailureCount,
        SkippedCount: input.SkippedCount,
        ActiveTestCount: input.ActiveTestCount,
        AverageRunDuration: Math.round(input.AverageRunDuration),
        TotalTestCost: roundTo(input.TotalTestCost, 2),
        PendingReviewCount: input.PendingReviewCount,
        PassRateTrend: roundTo(input.PassRateTrend, 1),
    };
    if (input.ActiveRunNames.length > 0) {
        context['ActiveRunNames'] = capList(input.ActiveRunNames);
    }
    return context;
}

/** Build the Runs-surface slice (selected run id+NAME, visible runs, filters). */
function buildRunsContext(runs: TestingRunsSurfaceState): Record<string, unknown> {
    const context: Record<string, unknown> = {
        StatusFilter: runs.StatusFilter,
        TimeRange: runs.TimeRange,
        SearchText: runs.SearchText,
        VisibleRunCount: runs.VisibleRunCount,
        SelectedRunId: runs.SelectedRunId,
        SelectedRunName: runs.SelectedRunName,
        DetailPanelOpen: runs.DetailPanelOpen,
    };
    if (runs.VisibleRunNames.length > 0) {
        context['VisibleRunNames'] = capList(runs.VisibleRunNames);
        if (runs.VisibleRunNames.length > TESTING_CONTEXT_LIST_CAP) {
            context['VisibleRunNamesTruncated'] = true;
        }
    }
    return context;
}

/** Build the Analytics-surface slice (window + breakdown name lists). */
function buildAnalyticsContext(a: TestingAnalyticsSurfaceState): Record<string, unknown> {
    return {
        SelectedDays: a.SelectedDays,
        VersionCount: a.VersionCount,
        TopFailingTests: capList(a.TopFailingTests, TESTING_CONTEXT_BREAKDOWN_CAP),
        SlowestTests: capList(a.SlowestTests, TESTING_CONTEXT_BREAKDOWN_CAP),
        MostExpensiveTests: capList(a.MostExpensiveTests, TESTING_CONTEXT_BREAKDOWN_CAP),
    };
}

/** Build the Review-surface slice (queue depth, agreement, view mode). */
function buildReviewContext(r: TestingReviewSurfaceState): Record<string, unknown> {
    return {
        View: r.View,
        PendingCount: r.PendingCount,
        ReviewedCount: r.ReviewedCount,
        AverageHumanRating: roundTo(r.AverageHumanRating, 1),
        AgreementRate: roundTo(r.AgreementRate, 1),
        HistorySearchText: r.HistorySearchText,
    };
}

/**
 * Build the agent-visible context object for the Testing dashboard.
 *
 * Always publishes the KPI slice (active-run count, run totals, pass rate, cost,
 * average duration, pending-review count, trend). Additionally publishes the
 * detailed slice for the ACTIVE tab — the Runs surface's selected run id+name,
 * visible run names and filters; the Analytics surface's window + breakdown name
 * lists; or the Review surface's queue depth, agreement rate and view mode.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing. Numbers are rounded to keep the
 * agent payload compact and human-readable.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildTestingAgentContext(input: TestingAgentContextInput): Record<string, unknown> {
    const context = buildKpiContext(input);

    if (input.ActiveTab === 'runs' && input.Runs) {
        Object.assign(context, buildRunsContext(input.Runs));
    } else if (input.ActiveTab === 'analytics' && input.Analytics) {
        Object.assign(context, buildAnalyticsContext(input.Analytics));
    } else if (input.ActiveTab === 'review' && input.Review) {
        Object.assign(context, buildReviewContext(input.Review));
    }

    return context;
}

/** Round a number to a fixed number of decimal places, tolerating non-finite input. */
function roundTo(value: number, decimals: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
