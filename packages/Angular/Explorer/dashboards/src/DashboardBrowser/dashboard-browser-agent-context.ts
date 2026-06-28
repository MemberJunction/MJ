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
    /** Total number of dashboards accessible to the user. */
    TotalDashboardCount: number;
    /** ID of the currently selected category filter, or null (root). */
    SelectedCategoryId: string | null;
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
    return {
        Mode: input.Mode,
        SelectedDashboardId: input.SelectedDashboardId,
        SelectedDashboardName: input.SelectedDashboardName,
        TotalDashboardCount: input.TotalDashboardCount,
        SelectedCategoryId: input.SelectedCategoryId,
        ViewMode: input.ViewMode,
        IsLoading: input.IsLoading,
    };
}
