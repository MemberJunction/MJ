/**
 * @fileoverview Pure helpers for the Communication dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they
 * can be unit-tested in isolation. The dashboard component
 * ({@link CommunicationDashboardComponent}) supplies a plain snapshot of its current
 * state (its own active-tab state plus deep, per-surface state harvested from whichever
 * lazily-mounted child resource components exist) and these helpers shape it into the
 * key-value `AgentContext` object that flows to the async chat agent and the realtime
 * co-agent via `NavigationService.SetAgentContext`.
 *
 * The shape mirrors the "hardcore"/Data-Explorer-depth pattern: the active tab decides
 * which deep slice is published (mode-scoped context), every list is bounded, and the
 * selected item is reported by id AND name so the co-agent can refer to it the way a
 * user does.
 *
 * 🚨 SAFETY: these helpers only SHAPE read-only state into a context object. They
 * perform no mutation and have no side effects. Send-message / template-author /
 * provider-edit / test-send state is intentionally never surfaced here (see the
 * SAFETY BOUNDARY comment in the dashboard component). Nothing here exposes message
 * bodies, recipient lists, provider credentials, or template content — only aggregate
 * counts, the active filters/search, and the salient display names of visible rows.
 */

/** The six navigation tabs the Communication dashboard exposes. */
export const COMMUNICATION_TABS = ['monitor', 'logs', 'providers', 'templates', 'runs', 'settings'] as const;

/** A Communication-dashboard tab id. */
export type CommunicationTab = (typeof COMMUNICATION_TABS)[number];

/** Human-readable label for each tab, in {@link COMMUNICATION_TABS} order. */
export const COMMUNICATION_TAB_LABELS: Record<CommunicationTab, string> = {
    monitor: 'Monitor',
    logs: 'Logs',
    providers: 'Providers',
    templates: 'Templates',
    runs: 'Runs',
    settings: 'Settings',
};

/**
 * The communication-log status values the agent may filter by. `''` clears the
 * filter (all statuses). These mirror the chip options the logs resource renders.
 */
export const COMMUNICATION_LOG_STATUSES = ['', 'Complete', 'Failed', 'Pending'] as const;

/** A communication-log status filter value (empty string = no filter). */
export type CommunicationLogStatus = (typeof COMMUNICATION_LOG_STATUSES)[number];

/**
 * Upper bound on how many display names / item summaries we publish in any one
 * context list field (visible logs, providers, templates, runs). Bounded so the
 * streamed note stays small even when a surface holds hundreds of rows; a companion
 * total-count field reports the true number when the list is truncated.
 */
export const COMMUNICATION_CONTEXT_LIST_CAP = 25;

/**
 * Cap an array of names/summaries to {@link COMMUNICATION_CONTEXT_LIST_CAP} entries.
 * Pure + deterministic; returns a new array and never mutates the input.
 *
 * @param items - the full list (caller owns ordering / de-duplication)
 * @returns the first N entries, where N is the cap
 */
export function capCommunicationList<T>(items: readonly T[]): T[] {
    return items.slice(0, COMMUNICATION_CONTEXT_LIST_CAP);
}

/**
 * Type-guard / validator for a Communication tab id. Keeps the
 * `SwitchCommunicationTab` client tool tolerant of arbitrary agent input — only the
 * six known tab ids are accepted.
 */
export function isValidCommunicationTab(tab: unknown): tab is CommunicationTab {
    return typeof tab === 'string' && (COMMUNICATION_TABS as readonly string[]).includes(tab);
}

/** Resolve a tab id to its human-readable label, falling back to a default. */
export function communicationTabLabel(tab: string): string {
    return isValidCommunicationTab(tab) ? COMMUNICATION_TAB_LABELS[tab] : 'Communication Management';
}

/**
 * A minimal id+name descriptor for a selectable item on a Communication surface
 * (a log row, provider card, template, or run). The component derives `Name` from
 * whatever the surface shows the user (provider name, template name, a short run id),
 * so the resolver matches the way a user refers to the row.
 */
export interface CommunicationItemCandidate {
    ID: string;
    Name: string;
}

/**
 * Resolve an agent-supplied item reference (by id or display name) to one of the
 * available items on a surface. Tries, in order:
 *   1. exact id (case-insensitive — handles SQL-Server-uppercase vs PG-lowercase UUIDs)
 *   2. exact display name (case-insensitive)
 *   3. first case-insensitive *contains* match on the display name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in
 * isolation. Returns the matched candidate, or null on a miss.
 *
 * @param input - whatever the agent passed (an id or the on-screen name)
 * @param candidates - the items currently visible on the surface
 */
export function resolveCommunicationItem<T extends CommunicationItemCandidate>(
    input: string,
    candidates: readonly T[],
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    const byName = candidates.find(c => c.Name.toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    const byContains = candidates.find(c => c.Name.toLowerCase().includes(needle));
    return byContains ?? null;
}

/**
 * Selected-item context (id + name), shared by every surface that can have a
 * selected/opened row. Both are null when nothing is selected.
 */
export interface CommunicationSelectedItem {
    SelectedItemId: string | null;
    SelectedItemName: string | null;
}

// ---------------------------------------------------------------------------
// Per-surface context inputs (a discriminated union keyed by the active tab).
// Each surface carries everything visible on that screen, bounded lists, and the
// selected id+name where applicable. Counts are non-nullable here — the component
// only supplies a surface slice once its child is mounted; an unmounted surface
// publishes the lean fallback (active tab only) instead.
// ---------------------------------------------------------------------------

/** Monitor surface: delivery KPIs + provider-health / channel breakdown. */
export interface CommunicationMonitorContext {
    Surface: 'monitor';
    /** Successfully-sent messages in the last 24h. */
    TotalSent: number;
    /** Delivery success rate (%). */
    DeliveryRate: number;
    /** Messages awaiting a provider. */
    Pending: number;
    /** Failed messages in the last 24h. */
    Failed: number;
    /** Provider names shown in the Provider Health panel (bounded). */
    ProviderHealthNames: string[];
    /** Total providers tracked in the health panel (for truncation reporting). */
    ProviderHealthCount: number;
    /** Channel names shown in the Channel Breakdown panel (e.g. Email, SMS). */
    ChannelNames: string[];
    /** Message-type / provider summary of the most-recent activity rows (bounded). */
    RecentActivityNames: string[];
}

/** Logs surface: the (read-only) message-log list with a status filter + search. */
export interface CommunicationLogsContext extends CommunicationSelectedItem {
    Surface: 'logs';
    /** Total log rows loaded. */
    LogCount: number;
    /** Log rows after the current status + search filters. */
    FilteredLogCount: number;
    /** Active status filter ('' = all). */
    StatusFilter: CommunicationLogStatus;
    /** Current free-text search applied to the log list. */
    SearchText: string;
    /** Per-row summaries of the visible (filtered) log rows (bounded). */
    VisibleLogSummaries: string[];
}

/** Providers surface: the configured messaging-provider cards. */
export interface CommunicationProvidersContext extends CommunicationSelectedItem {
    Surface: 'providers';
    /** Total provider cards. */
    ProviderCount: number;
    /** Count of providers whose Status is Active. */
    ActiveProviderCount: number;
    /** Provider display names (bounded). */
    ProviderNames: string[];
}

/** Templates surface: reusable message templates with a category filter + search. */
export interface CommunicationTemplatesContext extends CommunicationSelectedItem {
    Surface: 'templates';
    /** Total templates loaded. */
    TemplateCount: number;
    /** Templates after the current category + search filters. */
    FilteredTemplateCount: number;
    /** Active category filter ('' = all). */
    CategoryFilter: string;
    /** Current free-text search applied to the template list. */
    SearchText: string;
    /** The category names available to filter by (bounded). */
    AvailableCategories: string[];
    /** Visible (filtered) template names (bounded). */
    VisibleTemplateNames: string[];
}

/** Runs surface: bulk communication-run history (read-only timeline). */
export interface CommunicationRunsContext extends CommunicationSelectedItem {
    Surface: 'runs';
    /** Total runs loaded in the timeline. */
    RunCount: number;
    /** Currently-active (In-Progress) runs. */
    ActiveRunCount: number;
    /** Runs completed in the last 24h. */
    CompletedRunCount: number;
    /** Run success rate (%). */
    SuccessRate: number;
    /** Short summaries of the visible runs ("<short-id> · <status>") (bounded). */
    VisibleRunSummaries: string[];
}

/** A surface that the user has opened but whose child hasn't reported data yet. */
export interface CommunicationNoSurfaceContext {
    Surface: 'none';
}

/** The deep per-surface slice, discriminated on {@link CommunicationSurfaceContext.Surface}. */
export type CommunicationSurfaceContext =
    | CommunicationMonitorContext
    | CommunicationLogsContext
    | CommunicationProvidersContext
    | CommunicationTemplatesContext
    | CommunicationRunsContext
    | CommunicationNoSurfaceContext;

/**
 * The plain, component-supplied snapshot used to build the agent context.
 *
 * The dashboard owns the active-tab / refresh state; the deep `Surface` slice is
 * harvested from the active tab's lazily-mounted child resource component. When that
 * child isn't mounted yet (the tab was restored from saved state but its content hasn't
 * loaded, or the active tab is "settings" which has no child), `Surface` is the lean
 * `{ Surface: 'none' }` and only the active-tab/refresh fields are published — truthfully
 * reporting "not loaded yet" rather than a misleading `0`.
 */
export interface CommunicationAgentContextInput {
    /** The currently-active tab. */
    ActiveTab: CommunicationTab;
    /** Human-readable label for the active tab (e.g. "Logs"). */
    ActiveTabLabel: string;
    /** The tab ids the user has visited this session (their child content is mounted). */
    VisitedTabs: readonly string[];
    /** Whether a manual refresh is currently in flight. */
    IsRefreshing: boolean;
    /** The deep state of whichever surface is active (or `none` when unmounted). */
    Surface: CommunicationSurfaceContext;
}

/** Append a bounded list field plus a companion total-count field when truncated. */
function appendBoundedList(
    context: Record<string, unknown>,
    listKey: string,
    countKey: string,
    items: readonly string[],
): void {
    if (items.length === 0) {
        return;
    }
    context[listKey] = capCommunicationList(items);
    if (items.length > COMMUNICATION_CONTEXT_LIST_CAP) {
        context[countKey] = items.length;
    }
}

/** Shape the monitor surface slice. */
function buildMonitorContext(s: CommunicationMonitorContext, context: Record<string, unknown>): void {
    context['TotalSent'] = s.TotalSent;
    context['DeliveryRate'] = s.DeliveryRate;
    context['Pending'] = s.Pending;
    context['Failed'] = s.Failed;
    context['ProviderHealthCount'] = s.ProviderHealthCount;
    appendBoundedList(context, 'ProviderHealthNames', 'ProviderHealthNameCount', s.ProviderHealthNames);
    appendBoundedList(context, 'ChannelNames', 'ChannelNameCount', s.ChannelNames);
    appendBoundedList(context, 'RecentActivity', 'RecentActivityCount', s.RecentActivityNames);
}

/** Shape the logs surface slice. */
function buildLogsContext(s: CommunicationLogsContext, context: Record<string, unknown>): void {
    context['LogCount'] = s.LogCount;
    context['FilteredLogCount'] = s.FilteredLogCount;
    context['LogStatusFilter'] = s.StatusFilter;
    context['LogSearchText'] = s.SearchText;
    context['SelectedLogId'] = s.SelectedItemId;
    context['SelectedLogName'] = s.SelectedItemName;
    appendBoundedList(context, 'VisibleLogs', 'VisibleLogCount', s.VisibleLogSummaries);
}

/** Shape the providers surface slice. */
function buildProvidersContext(s: CommunicationProvidersContext, context: Record<string, unknown>): void {
    context['ProviderCount'] = s.ProviderCount;
    context['ActiveProviderCount'] = s.ActiveProviderCount;
    context['SelectedProviderId'] = s.SelectedItemId;
    context['SelectedProviderName'] = s.SelectedItemName;
    appendBoundedList(context, 'ProviderNames', 'ProviderNameCount', s.ProviderNames);
}

/** Shape the templates surface slice. */
function buildTemplatesContext(s: CommunicationTemplatesContext, context: Record<string, unknown>): void {
    context['TemplateCount'] = s.TemplateCount;
    context['FilteredTemplateCount'] = s.FilteredTemplateCount;
    context['TemplateCategoryFilter'] = s.CategoryFilter;
    context['TemplateSearchText'] = s.SearchText;
    context['SelectedTemplateId'] = s.SelectedItemId;
    context['SelectedTemplateName'] = s.SelectedItemName;
    appendBoundedList(context, 'AvailableCategories', 'AvailableCategoryCount', s.AvailableCategories);
    appendBoundedList(context, 'VisibleTemplates', 'VisibleTemplateCount', s.VisibleTemplateNames);
}

/** Shape the runs surface slice. */
function buildRunsContext(s: CommunicationRunsContext, context: Record<string, unknown>): void {
    context['RunCount'] = s.RunCount;
    context['ActiveRunCount'] = s.ActiveRunCount;
    context['CompletedRunCount'] = s.CompletedRunCount;
    context['RunSuccessRate'] = s.SuccessRate;
    context['SelectedRunId'] = s.SelectedItemId;
    context['SelectedRunName'] = s.SelectedItemName;
    appendBoundedList(context, 'VisibleRuns', 'VisibleRunCount', s.VisibleRunSummaries);
}

/**
 * Build the agent-visible context object for the Communication dashboard.
 *
 * Always reports the active tab and refresh state. The deep, per-surface slice is
 * appended only for the active, mounted surface — so the co-agent sees a focused view
 * of exactly what's on screen (mode-scoped context) rather than a flat dump of every
 * tab's counts. An unmounted surface (`Surface: 'none'`) contributes nothing beyond the
 * active-tab fields.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable and
 * decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildCommunicationAgentContext(input: CommunicationAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        ActiveTab: input.ActiveTab,
        ActiveTabLabel: input.ActiveTabLabel,
        VisitedTabs: [...input.VisitedTabs],
        IsRefreshing: input.IsRefreshing,
    };

    switch (input.Surface.Surface) {
        case 'monitor':
            buildMonitorContext(input.Surface, context);
            break;
        case 'logs':
            buildLogsContext(input.Surface, context);
            break;
        case 'providers':
            buildProvidersContext(input.Surface, context);
            break;
        case 'templates':
            buildTemplatesContext(input.Surface, context);
            break;
        case 'runs':
            buildRunsContext(input.Surface, context);
            break;
        case 'none':
            break;
    }

    return context;
}
