/**
 * @fileoverview Pure helpers for the Home dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. The component
 * ({@link HomeDashboardComponent}) supplies a plain snapshot of its current
 * state and these helpers shape it into the key-value `AgentContext` object that
 * flows to the async chat agent and the realtime co-agent via
 * `NavigationService.SetAgentContext`.
 *
 * Deep ("hardcore", Data-Explorer depth) enrichment: bounded name lists (cap
 * {@link HOME_AGENT_CONTEXT_NAME_LIST_CAP} with a companion `*Count` flag when
 * truncated) for apps, pins, pin groups, notifications, recents and pinned
 * dashboards; structured recent-item summaries; whether the Pinned section is
 * collapsed; the Home view (the overview, or a dashboard by name and id and
 * whether it is being edited); and a tolerant name resolver so the agent can
 * open a pin / app / recent / pinned dashboard the way the user named it (exact
 * name → partial contains).
 *
 * 🔒 SAFETY BOUNDARY: the Home dashboard exposes ONLY navigation / discovery /
 * panel-toggle operations; showing a pinned dashboard in Home is navigation. No
 * helper here describes — and no tool may perform — pin create / delete /
 * rename, group mutation, reordering, or dashboard create / rename / edit /
 * save / delete.
 */

/**
 * Upper bound on how many names we publish in a name-list context field
 * (AvailableApps, PinnedItems, PinGroupNames, NotificationTitles, RecentItems,
 * PinnedDashboardNames).
 * Keeping the streamed note bounded avoids flooding the co-agent with hundreds of
 * names; when the underlying list is larger we surface a companion total-count
 * field instead.
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
 * A minimal name-bearing record the agent can refer to (an app, pin, or recent).
 */
export interface NamedRecord {
    Name: string;
}

/**
 * Resolve an agent-supplied reference to one of the available named records,
 * matching the way a user names things. Tries, in order:
 *   1. exact name (case-insensitive, trimmed)
 *   2. partial (contains) match (case-insensitive)
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in
 * isolation.
 *
 * @param input - whatever the agent passed (typically the on-screen display name)
 * @param candidates - the records available on the Home screen
 * @returns the matched candidate, or null on a miss
 */
export function ResolveNamedRecord<T extends NamedRecord>(input: string, candidates: readonly T[]): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const exact = candidates.find(c => c.Name.trim().toLowerCase() === needle);
    if (exact) {
        return exact;
    }
    const contains = candidates.find(c => c.Name.toLowerCase().includes(needle));
    return contains ?? null;
}

/** @deprecated Use {@link ResolveNamedRecord}. */
export function resolveNamedRecord<T extends NamedRecord>(input: string, candidates: readonly T[]): T | null {
    return ResolveNamedRecord(input, candidates);
}

/**
 * Build a tolerant "not found" error listing a bounded sample of available names so
 * the agent can correct itself.
 */
export function BuildHomeNotFoundError(input: string, kind: string, candidates: readonly NamedRecord[]): string {
    const sample = candidates.slice(0, HOME_AGENT_CONTEXT_NAME_LIST_CAP).map(c => c.Name).join(', ');
    return `No ${kind} named "${input}". Available ${kind}s: ${sample || '(none)'}.`;
}

/** @deprecated Use {@link BuildHomeNotFoundError}. */
export function buildHomeNotFoundError(input: string, kind: string, candidates: readonly NamedRecord[]): string {
    return BuildHomeNotFoundError(input, kind, candidates);
}

/**
 * A structured summary of one recent item the agent can navigate to — its display
 * name and the resource type (record / view / dashboard / artifact / report).
 */
export interface RecentItemSummary {
    Name: string;
    ResourceType: string;
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
    /** Names of the distinct pin groups (bounded). */
    PinGroupNames: string[];
    /** Display names of the pinned items (the ones the agent can open via OpenPin). */
    PinNames: string[];
    /** Count of unread notifications shown in the sidebar. */
    UnreadNotifications: number;
    /** Titles of the unread notifications (bounded). */
    NotificationTitles: string[];
    /** Count of recent items shown in the sidebar. */
    RecentItemsCount: number;
    /** Structured summaries of the recent items (bounded) — the ones OpenRecent can target. */
    RecentItems: RecentItemSummary[];
    /** Whether pin edit mode is active. */
    EditMode: boolean;
    /** Whether the Add Pin panel is open. */
    AddPanelOpen: boolean;
    /** Whether the sidebar (notifications / favorites / recents) is open. */
    SidebarOpen: boolean;
    /** Current search query inside the Add Pin panel (empty when not searching). */
    AddPanelSearchQuery: string;
    /** Whether the Pinned section is collapsed. */
    PinnedCollapsed: boolean;
    /** The dashboard Home shows in place of its overview: its name, or null on the overview. */
    CurrentDashboardName: string | null;
    /** ID of that dashboard, or null. */
    CurrentDashboardID: string | null;
    /** True while that dashboard is in edit mode. */
    IsEditingDashboard: boolean;
    /** Names of the pinned dashboards the Dashboards switcher lists, in pin order. */
    PinnedDashboardNames: string[];
}

/**
 * Add a bounded name list under `key` when it is not empty, plus `countKey` with the true total
 * when the list is longer than {@link HOME_AGENT_CONTEXT_NAME_LIST_CAP}.
 */
function addBoundedNames(context: Record<string, unknown>, key: string, countKey: string, names: readonly string[]): void {
    if (names.length === 0) {
        return;
    }
    context[key] = capNames(names);
    if (names.length > HOME_AGENT_CONTEXT_NAME_LIST_CAP) {
        context[countKey] = names.length;
    }
}

/** Add the Home view (overview or a dashboard), the open dashboard and the pinned dashboards to the context. */
function addDashboardViewContext(context: Record<string, unknown>, input: HomeAgentContextInput): void {
    context['HomeView'] = input.CurrentDashboardName ? 'Dashboard' : 'Overview';
    if (input.CurrentDashboardName) {
        context['CurrentDashboardName'] = input.CurrentDashboardName;
        context['IsEditingDashboard'] = input.IsEditingDashboard;
        if (input.CurrentDashboardID) {
            context['CurrentDashboardID'] = input.CurrentDashboardID;
        }
    }
    addBoundedNames(context, 'PinnedDashboardNames', 'PinnedDashboardNameCount', input.PinnedDashboardNames);
}

/**
 * Build the agent-visible context object for the Home dashboard.
 *
 * Reports the app launcher state (app counts + names), the pin board state (pin
 * counts + names + groups + edit mode), the notifications (count + bounded titles),
 * the recents (count + bounded structured summaries), the Add Pin panel state, the
 * sidebar state, whether the Pinned section is collapsed, the Home view (the
 * overview, or the dashboard Home shows by name and id and whether it is being
 * edited) and the pinned dashboards' names. Each name list is bounded with a
 * companion total-count when truncated. Keeping this a pure function (no `this`)
 * makes the context shape unit-testable and decouples it from change-detection
 * timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function BuildHomeAgentContext(input: HomeAgentContextInput): Record<string, unknown> {
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
        PinnedCollapsed: input.PinnedCollapsed,
    };

    // When the lists are longer than we publish names for, tell the co-agent the
    // true totals so it knows the name lists are truncated.
    if (input.AppNames.length > HOME_AGENT_CONTEXT_NAME_LIST_CAP) {
        context['AvailableAppCount'] = input.AppNames.length;
    }
    if (input.PinNames.length > HOME_AGENT_CONTEXT_NAME_LIST_CAP) {
        context['PinnedItemNameCount'] = input.PinNames.length;
    }

    // Pin group names and unread notification titles — bounded; only surfaced when
    // there are some, with a companion count when over the cap.
    addBoundedNames(context, 'PinGroupNames', 'PinGroupNameCount', input.PinGroupNames);
    addBoundedNames(context, 'NotificationTitles', 'NotificationTitleCount', input.NotificationTitles);

    // Recent items — bounded structured summaries (name + resource type).
    if (input.RecentItems.length > 0) {
        context['RecentItems'] = input.RecentItems.slice(0, HOME_AGENT_CONTEXT_NAME_LIST_CAP);
        if (input.RecentItems.length > HOME_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['RecentItemNameCount'] = input.RecentItems.length;
        }
    }

    // Only surface the panel search text when the panel is open and there's a query —
    // keeps the context lean when the panel is closed.
    if (input.AddPanelOpen && input.AddPanelSearchQuery) {
        context['AddPanelSearchQuery'] = input.AddPanelSearchQuery;
    }

    addDashboardViewContext(context, input);

    return context;
}

/** @deprecated Use {@link BuildHomeAgentContext}. */
export function buildHomeAgentContext(input: HomeAgentContextInput): Record<string, unknown> {
    return BuildHomeAgentContext(input);
}
