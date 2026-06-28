/**
 * @fileoverview Pure helpers for the Communication dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they
 * can be unit-tested in isolation. The dashboard component
 * ({@link CommunicationDashboardComponent}) supplies a plain snapshot of its current
 * state (its own active-tab state plus counts harvested from whichever lazily-mounted
 * child resource components exist) and these helpers shape it into the key-value
 * `AgentContext` object that flows to the async chat agent and the realtime co-agent
 * via `NavigationService.SetAgentContext`.
 *
 * 🚨 SAFETY: these helpers only SHAPE read-only state into a context object. They
 * perform no mutation and have no side effects. Send-message / template-author /
 * provider-edit state is intentionally never surfaced here (see the SAFETY BOUNDARY
 * comment in the dashboard component).
 */

/** The six navigation tabs the Communication dashboard exposes. */
export const COMMUNICATION_TABS = ['monitor', 'logs', 'providers', 'templates', 'runs', 'settings'] as const;

/** A Communication-dashboard tab id. */
export type CommunicationTab = (typeof COMMUNICATION_TABS)[number];

/**
 * The communication-log status values the agent may filter by. `''` clears the
 * filter (all statuses). These mirror the chip options the logs resource renders.
 */
export const COMMUNICATION_LOG_STATUSES = ['', 'Complete', 'Failed', 'Pending'] as const;

/** A communication-log status filter value (empty string = no filter). */
export type CommunicationLogStatus = (typeof COMMUNICATION_LOG_STATUSES)[number];

/**
 * Type-guard / validator for a Communication tab id. Keeps the
 * `SwitchCommunicationTab` client tool tolerant of arbitrary agent input — only the
 * six known tab ids are accepted.
 */
export function isValidCommunicationTab(tab: unknown): tab is CommunicationTab {
    return typeof tab === 'string' && (COMMUNICATION_TABS as readonly string[]).includes(tab);
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 *
 * The dashboard component itself only owns the active-tab / refresh state; the
 * per-feature counts are harvested from the relevant lazily-mounted child resource
 * component when (and only when) that tab has been visited. Counts are therefore
 * `null` until their owning child exists — this lets the context truthfully report
 * "not loaded yet" rather than a misleading `0`.
 */
export interface CommunicationAgentContextInput {
    /** The currently-active tab. */
    ActiveTab: CommunicationTab;
    /** Human-readable label for the active tab (e.g. "Message Logs"). */
    ActiveTabLabel: string;
    /** The tab ids the user has visited this session (their child content is mounted). */
    VisitedTabs: readonly string[];
    /** Whether a manual refresh is currently in flight. */
    IsRefreshing: boolean;
    /** Total communication-log rows loaded, or null if the logs tab isn't mounted. */
    LogCount: number | null;
    /** Communication-log rows after the current status filter, or null if not mounted. */
    FilteredLogCount: number | null;
    /** The active log status filter ('' = all), or null if the logs tab isn't mounted. */
    LogStatusFilter: CommunicationLogStatus | null;
    /** Configured provider count, or null if the providers tab isn't mounted. */
    ProviderCount: number | null;
    /** Template count, or null if the templates tab isn't mounted. */
    TemplateCount: number | null;
    /** Bulk-run count, or null if the runs tab isn't mounted. */
    RunCount: number | null;
    /** Recent successfully-sent message count (monitor KPI), or null if not mounted. */
    RecentSentCount: number | null;
    /** Recent failed message count (monitor KPI), or null if not mounted. */
    FailedCount: number | null;
}

/**
 * Build the agent-visible context object for the Communication dashboard.
 *
 * The result always reports the active tab and refresh state. Counts are included
 * only when their owning child resource is mounted (their input value is non-null) —
 * omitting a count rather than reporting a misleading `0` for an unvisited tab.
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

    if (input.LogCount !== null) {
        context['LogCount'] = input.LogCount;
    }
    if (input.FilteredLogCount !== null) {
        context['FilteredLogCount'] = input.FilteredLogCount;
    }
    if (input.LogStatusFilter !== null) {
        context['LogStatusFilter'] = input.LogStatusFilter;
    }
    if (input.ProviderCount !== null) {
        context['ProviderCount'] = input.ProviderCount;
    }
    if (input.TemplateCount !== null) {
        context['TemplateCount'] = input.TemplateCount;
    }
    if (input.RunCount !== null) {
        context['RunCount'] = input.RunCount;
    }
    if (input.RecentSentCount !== null) {
        context['RecentSentCount'] = input.RecentSentCount;
    }
    if (input.FailedCount !== null) {
        context['FailedCount'] = input.FailedCount;
    }

    return context;
}
