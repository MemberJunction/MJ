/**
 * @fileoverview Pure helpers for the Home dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link HomeDashboardComponent}) supplies a plain snapshot of its current
 * state and these helpers shape it into the key-value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 */

/**
 * Upper bound on how many names we publish in a name-list context field
 * (AppNames, PinNames). Keeping the streamed note bounded avoids flooding the
 * co-agent with hundreds of names; when the underlying list is larger we surface
 * a companion total-count field instead.
 */
export const HOME_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to {@link HOME_AGENT_CONTEXT_NAME_LIST_CAP} entries.
 * Pure + deterministic so the context shape stays unit-testable.
 */
function capNames(names: readonly string[]): string[] {
    return names.slice(0, HOME_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * The plain, component-supplied snapshot used to build the Home agent context.
 * Mirrors the salient slice of the Home dashboard's state.
 */
export interface HomeAgentContextInput {
    /** Total apps available to the user (Home itself excluded). */
    AppCount: number;
    /** Apps currently visible after any display filtering (== AppCount today). */
    VisibleAppCount: number;
    /** Names of the available apps (the ones the agent can open via OpenApp). */
    AppNames: string[];
    /** Total pinned items on the Home screen. */
    PinnedItemCount: number;
    /** Number of distinct pin groups. */
    PinGroupCount: number;
    /** Display names of the pinned items (the ones the agent can open via OpenPin). */
    PinNames: string[];
    /** Count of unread notifications shown in the sidebar. */
    UnreadNotifications: number;
    /** Count of recent items shown in the sidebar. */
    RecentItemsCount: number;
    /** Whether pin edit mode is active. */
    EditMode: boolean;
    /** Whether the Add Pin panel is open. */
    AddPanelOpen: boolean;
    /** Whether the sidebar (notifications / favorites / recents) is open. */
    SidebarOpen: boolean;
    /** Current search query inside the Add Pin panel (empty when not searching). */
    AddPanelSearchQuery: string;
}

/**
 * Build the agent-visible context object for the Home dashboard.
 *
 * Reports the app launcher state (app counts + names), the pin board state
 * (pin counts + names + groups + edit mode), the Add Pin panel state, the
 * sidebar state, and the sidebar item counts. Keeping this a pure function
 * (no `this`) makes the context shape unit-testable and decouples it from
 * change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildHomeAgentContext(input: HomeAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        AppCount: input.AppCount,
        VisibleAppCount: input.VisibleAppCount,
        AvailableApps: capNames(input.AppNames),
        PinnedItemCount: input.PinnedItemCount,
        PinGroupCount: input.PinGroupCount,
        PinnedItems: capNames(input.PinNames),
        UnreadNotifications: input.UnreadNotifications,
        RecentItemsCount: input.RecentItemsCount,
        EditMode: input.EditMode,
        AddPanelOpen: input.AddPanelOpen,
        SidebarOpen: input.SidebarOpen,
    };

    // When the lists are longer than we publish names for, tell the co-agent the
    // true totals so it knows the name lists are truncated.
    if (input.AppNames.length > HOME_AGENT_CONTEXT_NAME_LIST_CAP) {
        context['AvailableAppCount'] = input.AppNames.length;
    }
    if (input.PinNames.length > HOME_AGENT_CONTEXT_NAME_LIST_CAP) {
        context['PinnedItemNameCount'] = input.PinNames.length;
    }

    // Only surface the panel search text when the panel is open and there's a query —
    // keeps the context lean when the panel is closed.
    if (input.AddPanelOpen && input.AddPanelSearchQuery) {
        context['AddPanelSearchQuery'] = input.AddPanelSearchQuery;
    }

    return context;
}
