/**
 * @fileoverview Pure helpers for the Dashboard Browser's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The resource component
 * ({@link DashboardBrowserResourceComponent}) supplies a plain snapshot of its
 * current state and these helpers shape it into the flat key-value `AgentContext`
 * object that flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * 🔒 SAFETY: this module only *describes* state and validates input. It performs
 * no mutation and has no side effects.
 */

/** The two browser-mode levels surfaced to the agent. */
type BrowserMode = 'list' | 'view' | 'edit';

/** The two record-view modes the browser list supports. */
const VALID_BROWSER_VIEW_MODES = ['cards', 'list'] as const;

/** Narrowed union for the browser list's view mode. */
export type BrowserViewMode = (typeof VALID_BROWSER_VIEW_MODES)[number];

/**
 * Upper bound on how many names we publish in a name-list context field
 * (VisibleDashboards, AvailableCategories). Keeping the streamed note bounded
 * avoids flooding the co-agent with hundreds of names; when the underlying list
 * is larger we surface a companion total-count field instead. Mirrors the cap
 * used by the Data Explorer's agent context.
 */
export const AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to {@link AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic so the context shape stays unit-testable.
 *
 * @param names - the full list of names (already de-duplicated by the caller)
 * @returns the first N names, where N is the cap
 */
function capNames(names: readonly string[]): string[] {
    return names.slice(0, AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * Type-guard / validator for a browser view-mode string. Keeps the
 * `SwitchViewMode` client tool tolerant of arbitrary agent input — only the two
 * known modes are accepted.
 *
 * @param mode - candidate mode string (may be anything the agent passes)
 * @returns true when `mode` is one of cards | list
 */
export function isValidBrowserViewMode(mode: unknown): mode is BrowserViewMode {
    return typeof mode === 'string' && (VALID_BROWSER_VIEW_MODES as readonly string[]).includes(mode);
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of {@link DashboardBrowserResourceComponent}'s state.
 */
export interface DashboardBrowserAgentContextInput {
    /** Current browser mode: list / view / edit. */
    Mode: BrowserMode;
    /** ID of the currently selected dashboard, or null at the list level. */
    SelectedDashboardId: string | null;
    /** Display name of the currently selected dashboard, or null. */
    SelectedDashboardName: string | null;
    /**
     * Names of the dashboards currently visible in the list (after any agent
     * search narrowing) — the ones the agent can open by name via OpenDashboard.
     * The component supplies the full visible list; this helper bounds it — see
     * {@link AGENT_CONTEXT_NAME_LIST_CAP}.
     */
    VisibleDashboardNames: string[];
    /** Total number of dashboards accessible to the user (unfiltered). */
    TotalDashboardCount: number;
    /**
     * Number of dashboards currently visible in the list. Equals
     * `VisibleDashboardNames.length` before the name-list cap is applied, so the
     * agent knows the true filtered count even when the published names are
     * truncated.
     */
    FilteredDashboardCount: number;
    /** The current free-text search applied to the dashboard list, or '' when none. */
    SearchText: string;
    /**
     * Names of the categories accessible to the user (so the agent can pick one
     * to filter by via SelectCategory). The component supplies the full list;
     * this helper bounds it — see {@link AGENT_CONTEXT_NAME_LIST_CAP}.
     */
    AvailableCategoryNames: string[];
    /** ID of the currently selected category filter, or null (root). */
    SelectedCategoryId: string | null;
    /** Display name of the currently selected category, or null (root). */
    SelectedCategoryName: string | null;
    /** Active record-view mode for the list (cards / list). */
    ViewMode: BrowserViewMode;
    /** Whether the browser is currently loading data. */
    IsLoading: boolean;
}

/**
 * Build the agent-visible context object for the Dashboard Browser.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildDashboardBrowserAgentContext(
    input: DashboardBrowserAgentContextInput,
): Record<string, unknown> {
    const hasSearch = input.SearchText.trim().length > 0;

    const context: Record<string, unknown> = {
        Mode: input.Mode,
        SelectedDashboardId: input.SelectedDashboardId,
        SelectedDashboardName: input.SelectedDashboardName,
        VisibleDashboards: capNames(input.VisibleDashboardNames),
        TotalDashboardCount: input.TotalDashboardCount,
        FilteredDashboardCount: input.FilteredDashboardCount,
        HasSearch: hasSearch,
        SearchText: input.SearchText,
        AvailableCategories: capNames(input.AvailableCategoryNames),
        SelectedCategoryId: input.SelectedCategoryId,
        SelectedCategoryName: input.SelectedCategoryName,
        ViewMode: input.ViewMode,
        IsLoading: input.IsLoading,
    };

    // When more dashboards/categories are visible than we publish names for, tell
    // the co-agent the true total so it knows the streamed list is truncated.
    if (input.VisibleDashboardNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        context['VisibleDashboardCount'] = input.VisibleDashboardNames.length;
    }
    if (input.AvailableCategoryNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        context['AvailableCategoryCount'] = input.AvailableCategoryNames.length;
    }

    return context;
}
