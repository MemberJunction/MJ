/**
 * @fileoverview Pure, framework-agnostic helpers for the Integration dashboard's
 * AI-agent integration (deep, Data-Explorer-depth context shaping + surface
 * validation + id→name→contains resolution).
 *
 * The Integration "dashboard" is actually a set of sibling resource components
 * (Overview, Connections, Activity, Schedules) — each its own
 * `BaseResourceComponent`, each registered as a separate nav item in the
 * Integrations application. Because the surfaces are NATURALLY SEPARATE (one
 * mounted component per nav item, not tabs in a single component), there is NO
 * mode-flip / `syncAgentToolsForMode()` here — each surface is intrinsically
 * mode-scoped: it publishes its own deep context slice and registers its own
 * tool set (the Lists pattern, not the Data-Explorer flip pattern).
 *
 * Every surface publishes its slice of state via `NavigationService.SetAgentContext`
 * and registers a small set of safe client tools via `SetAgentClientTools`.
 *
 * These helpers are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. Each component supplies a plain snapshot
 * of its current state and the matching helper shapes it into the flat key-value
 * object that flows to the async chat agent and the realtime co-agent.
 *
 * 🔒 SAFETY BOUNDARY (applies to every Integration surface):
 *   These helpers only SHAPE READ-ONLY state and VALIDATE navigation/filter
 *   input + RESOLVE agent-supplied references to records. They never trigger a
 *   sync, mutate a mapping/schedule/credential, or perform any external side
 *   effect. The Integration surfaces deliberately do NOT expose `RunSync` (live
 *   external sync), edit-mapping, update-schedule, or change-credentials as agent
 *   client tools — those remain user-driven from the UI. See each component's
 *   SAFETY BOUNDARY comment.
 */

// ============================================================================
// Surface resolution
// ============================================================================

/**
 * The agent-navigable Integration surfaces.
 *
 * These map 1:1 to the nav-item labels in the Integrations application metadata
 * (`metadata/applications/.integrations-application.json`). `SwitchIntegrationSurface`
 * resolves a requested surface to one of these labels and routes via
 * `NavigationService.OpenNavItemByName`.
 *
 * Note: the metadata label for the connections surface is "Integrations" (the
 * `IntegrationConnections` driver class). We expose it under the clearer alias
 * "Connections" to the agent and translate to the real label at routing time.
 */
export const INTEGRATION_SURFACES = ['Overview', 'Connections', 'Activity', 'Schedules'] as const;

/** One of the agent-navigable Integration surfaces. */
export type IntegrationSurface = (typeof INTEGRATION_SURFACES)[number];

/**
 * The real nav-item label (from application metadata) for each agent-facing
 * surface name. Used by `SwitchIntegrationSurface` to call `OpenNavItemByName`.
 */
const SURFACE_TO_NAV_LABEL: Readonly<Record<IntegrationSurface, string>> = {
    Overview: 'Overview',
    Connections: 'Integrations',
    Activity: 'Activity',
    Schedules: 'Schedules',
};

/**
 * Type-guard / validator for a requested surface string. Tolerant of arbitrary
 * agent input and of the metadata alias ("Integrations" → "Connections"): only
 * the four known surfaces resolve. Case-insensitive.
 *
 * @param surface - candidate surface string (may be anything the agent passes)
 * @returns the canonical {@link IntegrationSurface} when recognized, else null
 */
export function resolveIntegrationSurface(surface: unknown): IntegrationSurface | null {
    if (typeof surface !== 'string') {
        return null;
    }
    const normalized = surface.trim().toLowerCase();
    // Direct match against canonical surface names.
    const direct = INTEGRATION_SURFACES.find(s => s.toLowerCase() === normalized);
    if (direct) {
        return direct;
    }
    // Allow the metadata label "Integrations" as an alias for Connections.
    if (normalized === 'integrations') {
        return 'Connections';
    }
    return null;
}

/**
 * The real nav-item label to pass to `NavigationService.OpenNavItemByName` for a
 * given canonical surface.
 */
export function navLabelForSurface(surface: IntegrationSurface): string {
    return SURFACE_TO_NAV_LABEL[surface];
}

// ============================================================================
// Bounded name lists + id→name→contains resolution
// ============================================================================

/**
 * Upper bound on how many names an Integration surface publishes in a name-list
 * context field (e.g. visible integration names, visible run labels). Keeping
 * the streamed note bounded avoids flooding the co-agent with hundreds of names;
 * surfaces publish a companion total-count field so the agent still knows the
 * true size when the list is truncated.
 */
export const INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Cap an array of names to at most {@link INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP}
 * entries. Pure + deterministic; never mutates the input (returns a new array).
 *
 * @param names - the full list of names (caller owns de-duplication / ordering)
 * @returns the first N names, where N is the cap
 */
export function capIntegrationNames(names: readonly string[]): string[] {
    return names.slice(0, INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
}

/**
 * A minimal name-and-id descriptor, supplied by the component so the pure
 * resolver can match an agent-supplied reference against what the user sees.
 * Mirrors the salient slice of any integration / run / schedule row.
 */
export interface NamedIntegrationRecord {
    ID: string;
    Name: string;
}

/**
 * Resolve an agent-supplied reference to one of the available records, the way
 * a user names things. The agent may pass an exact ID, an exact name, or a
 * partial name — so we try, in order:
 *   1. exact ID match (case-insensitive, to tolerate UUID-casing differences)
 *   2. exact name match (case-insensitive, whitespace-trimmed)
 *   3. first case-insensitive *contains* match on the name
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable
 * in isolation. Returns the matched record, or null on a miss.
 *
 * @param input - whatever the agent passed (an ID or an integration/run name)
 * @param candidates - the records available on this surface
 */
export function resolveIntegrationRecord<T extends NamedIntegrationRecord>(
    input: string,
    candidates: readonly T[],
): T | null {
    const needle = (input ?? '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    // 1. exact ID match (case-insensitive — SQL Server upper- vs PG lower-case UUIDs).
    const byId = candidates.find(c => c.ID.toLowerCase() === needle);
    if (byId) {
        return byId;
    }
    // 2. exact name match.
    const byName = candidates.find(c => c.Name.trim().toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    // 3. first contains match on the name.
    const byContains = candidates.find(c => c.Name.toLowerCase().includes(needle));
    return byContains ?? null;
}

/**
 * Build a tolerant "not found" error message that lists a few of the available
 * names, so the agent can correct itself. Pure + deterministic.
 *
 * @param input - the agent-supplied reference that didn't resolve
 * @param candidates - the available records (their names are sampled)
 * @param noun - the kind of thing (e.g. "integration", "run") for the message
 */
export function buildIntegrationNotFoundError(
    input: string,
    candidates: readonly NamedIntegrationRecord[],
    noun: string,
): string {
    const sample = candidates.slice(0, 6).map(c => c.Name).join(', ');
    return `No ${noun} matching "${input}" is available. Available ${noun}s include: ${sample || '(none)'}.`;
}

// ============================================================================
// Shared KPI strip
// ============================================================================

/**
 * The KPI slice shared by every Integration surface's context. Sourced from
 * `IntegrationKPIs` (computed in `IntegrationDataService.ComputeKPIs`) plus a
 * couple of derived counts the surfaces already display.
 */
export interface IntegrationContextKPIs {
    /** Total number of company integrations configured. */
    TotalIntegrations: number;
    /** Number of integrations whose latest run is In Progress / Pending. */
    ActiveSyncs: number;
    /** Records synced across all integrations since local midnight. */
    RecordsSyncedToday: number;
    /** Percentage of recent runs that failed (0–100, one decimal). */
    SyncErrorRate: number;
    /** Number of entity-map "pipelines" with sync enabled, when known. */
    PipelineCount: number;
    /** Number of integrations with scheduling enabled, when known. */
    ScheduledSyncCount: number;
}

/** Append the shared KPI strip onto a context object (mutates + returns it). */
function appendKPIs(context: Record<string, unknown>, kpis: IntegrationContextKPIs): Record<string, unknown> {
    context['TotalIntegrations'] = kpis.TotalIntegrations;
    context['ActiveSyncs'] = kpis.ActiveSyncs;
    context['RecordsSyncedToday'] = kpis.RecordsSyncedToday;
    context['SyncErrorRate'] = kpis.SyncErrorRate;
    context['PipelineCount'] = kpis.PipelineCount;
    context['ScheduledSyncCount'] = kpis.ScheduledSyncCount;
    return context;
}

// ============================================================================
// OVERVIEW context (deep)
// ============================================================================

/** Component-supplied snapshot for the Overview surface's deep context. */
export interface OverviewAgentContextInput {
    /** The shared KPI strip. */
    KPIs: IntegrationContextKPIs;
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
    /** Overall success rate (0–100), complement of the error rate. */
    SuccessRate: number;
    /** Count of integrations by health-status color (green/amber/red/gray). */
    HealthyCount: number;
    WarningCount: number;
    ErrorCount: number;
    InactiveCount: number;
    /** Average sync duration in ms across integrations with a measured run, or null. */
    AverageSyncDurationMs: number | null;
    /** Names of the integration "pipeline" cards visible on the overview (bounded). */
    VisibleIntegrationNames: string[];
    /** Total recent-activity feed rows shown. */
    ActivityFeedCount: number;
    /** Most-recent activity-feed entries (integration · status · relative time), bounded. */
    RecentActivity: Array<{ Integration: string; Status: string; When: string }>;
}

/**
 * Build the deep agent context for the Overview surface: the KPI strip plus the
 * health-status breakdown, success rate, avg duration, the visible pipeline-card
 * names (bounded), and a bounded recent-activity sample.
 */
export function buildOverviewAgentContext(input: OverviewAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = { Surface: 'Overview', IsLoading: input.IsLoading };
    appendKPIs(context, input.KPIs);
    context['SuccessRate'] = input.SuccessRate;
    context['HealthyCount'] = input.HealthyCount;
    context['WarningCount'] = input.WarningCount;
    context['ErrorCount'] = input.ErrorCount;
    context['InactiveCount'] = input.InactiveCount;
    context['AverageSyncDurationMs'] = input.AverageSyncDurationMs;
    context['ActivityFeedCount'] = input.ActivityFeedCount;
    if (input.VisibleIntegrationNames.length > 0) {
        context['VisibleIntegrationNames'] = capIntegrationNames(input.VisibleIntegrationNames);
        if (input.VisibleIntegrationNames.length > INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['VisibleIntegrationNameCount'] = input.VisibleIntegrationNames.length;
        }
    }
    if (input.RecentActivity.length > 0) {
        context['RecentActivity'] = input.RecentActivity.slice(0, INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
    }
    return context;
}

// ============================================================================
// CONNECTIONS context (deep)
// ============================================================================

/** Component-supplied snapshot for the Connections surface's deep context. */
export interface ConnectionsAgentContextInput {
    /** The shared KPI strip. */
    KPIs: IntegrationContextKPIs;
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
    /** Total connections loaded. */
    ConnectionCount: number;
    /** Number of connections that are active. */
    ActiveConnectionCount: number;
    /** Names of the connection cards visible on the grid (bounded). */
    VisibleConnectionNames: string[];
    /** ID of the integration whose detail view is open, or null (grid view). */
    SelectedConnectionId: string | null;
    /** Name of the selected integration, or null. */
    SelectedConnectionName: string | null;
    /** When a connection is selected: the entity-map count of its detail view. */
    SelectedEntityMapCount?: number | null;
    /** When a connection is selected: free-text search in the entity-map detail. */
    DetailSearchTerm?: string | null;
}

/**
 * Build the deep agent context for the Connections surface: the KPI strip plus
 * connection counts, the visible card names (bounded), and — when a connection's
 * detail view is open — the selected id+name and its entity-map detail state.
 */
export function buildConnectionsAgentContext(input: ConnectionsAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = { Surface: 'Connections', IsLoading: input.IsLoading };
    appendKPIs(context, input.KPIs);
    context['ConnectionCount'] = input.ConnectionCount;
    context['ActiveConnectionCount'] = input.ActiveConnectionCount;
    context['SelectedConnectionId'] = input.SelectedConnectionId;
    context['SelectedConnectionName'] = input.SelectedConnectionName;
    if (input.VisibleConnectionNames.length > 0) {
        context['VisibleConnectionNames'] = capIntegrationNames(input.VisibleConnectionNames);
        if (input.VisibleConnectionNames.length > INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['VisibleConnectionNameCount'] = input.VisibleConnectionNames.length;
        }
    }
    if (input.SelectedConnectionId) {
        if (input.SelectedEntityMapCount != null) {
            context['SelectedEntityMapCount'] = input.SelectedEntityMapCount;
        }
        if (input.DetailSearchTerm != null) {
            context['DetailSearchTerm'] = input.DetailSearchTerm;
        }
    }
    return context;
}

// ============================================================================
// ACTIVITY context (deep)
// ============================================================================

/** One run row summarized for the agent (id+label for selection + resolution). */
export interface ActivityRunSummary {
    ID: string;
    /** Display label, e.g. "HubSpot (Acme) · Success". */
    Name: string;
    Status: string;
    TotalRecords: number;
    When: string;
}

/** Component-supplied snapshot for the Activity surface's deep context. */
export interface ActivityAgentContextInput {
    /** The shared KPI strip. */
    KPIs: IntegrationContextKPIs;
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
    /** Active run-status filter (e.g. 'All', 'Failed'). */
    StatusFilter: string;
    /** Active date-range filter (today/7d/30d/all). */
    DateFilter: string;
    /** Active integration filter (a company-integration name), or null. */
    IntegrationFilterName: string | null;
    /** Free-text search query currently applied. */
    SearchQuery: string;
    /** Number of runs after the current filters. */
    FilteredRunCount: number;
    /** Total runs loaded (unfiltered). */
    TotalRunCount: number;
    /** Count of filtered runs by status (for at-a-glance signal). */
    SuccessfulRunCount: number;
    FailedRunCount: number;
    /** Sum of TotalRecords across the filtered runs. */
    TotalRecordsProcessed: number;
    /** The visible (filtered) run rows, bounded. */
    VisibleRuns: ActivityRunSummary[];
    /** ID of the selected run (detail panel open), or null. */
    SelectedRunId: string | null;
    /** Display label of the selected run, or null. */
    SelectedRunName: string | null;
    /** Names of the integrations available in the integration-filter dropdown (bounded). */
    AvailableIntegrationNames: string[];
}

/**
 * Build the deep agent context for the Activity surface: the KPI strip plus the
 * active filters (status/date/integration/search), filtered/total run counts +
 * status breakdown + records processed, the visible run rows (bounded), the
 * selected run id+name, and the bounded list of integrations available to filter.
 */
export function buildActivityAgentContext(input: ActivityAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = { Surface: 'Activity', IsLoading: input.IsLoading };
    appendKPIs(context, input.KPIs);
    context['ActivityStatusFilter'] = input.StatusFilter;
    context['ActivityDateFilter'] = input.DateFilter;
    context['ActivityIntegrationFilter'] = input.IntegrationFilterName;
    context['ActivitySearchQuery'] = input.SearchQuery;
    context['ActivityFilteredRunCount'] = input.FilteredRunCount;
    context['ActivityTotalRunCount'] = input.TotalRunCount;
    context['ActivitySuccessfulRunCount'] = input.SuccessfulRunCount;
    context['ActivityFailedRunCount'] = input.FailedRunCount;
    context['ActivityTotalRecordsProcessed'] = input.TotalRecordsProcessed;
    context['SelectedRunId'] = input.SelectedRunId;
    context['SelectedRunName'] = input.SelectedRunName;
    if (input.VisibleRuns.length > 0) {
        context['VisibleRuns'] = input.VisibleRuns.slice(0, INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
        if (input.VisibleRuns.length > INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['VisibleRunCount'] = input.VisibleRuns.length;
        }
    }
    if (input.AvailableIntegrationNames.length > 0) {
        context['AvailableIntegrationNames'] = capIntegrationNames(input.AvailableIntegrationNames);
        if (input.AvailableIntegrationNames.length > INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['AvailableIntegrationNameCount'] = input.AvailableIntegrationNames.length;
        }
    }
    return context;
}

// ============================================================================
// SCHEDULES context (deep)
// ============================================================================

/** One schedule row summarized for the agent. */
export interface ScheduleSummary {
    /** Integration name + cadence, e.g. "HubSpot · Every hour". */
    Name: string;
    /** Schedule type (Manual/Interval/Cron). */
    Type: string;
    Enabled: boolean;
    Locked: boolean;
    NextRun: string;
}

/** Component-supplied snapshot for the Schedules surface's deep context. */
export interface SchedulesAgentContextInput {
    /** The shared KPI strip. */
    KPIs: IntegrationContextKPIs;
    /** Whether the surface is mid-load. */
    IsLoading: boolean;
    /** Total schedules loaded. */
    ScheduleCount: number;
    /** Number of schedules with scheduling enabled. */
    EnabledCount: number;
    /** Number of schedules currently locked (running). */
    LockedCount: number;
    /** Number of schedules by cadence type. */
    IntervalCount: number;
    CronCount: number;
    ManualCount: number;
    /** Visible schedule rows, bounded. */
    VisibleSchedules: ScheduleSummary[];
}

/**
 * Build the deep agent context for the Schedules surface: the KPI strip plus the
 * schedule counts (total / enabled / locked) and the cadence-type breakdown, and
 * the visible schedule rows (bounded).
 */
export function buildSchedulesAgentContext(input: SchedulesAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = { Surface: 'Schedules', IsLoading: input.IsLoading };
    appendKPIs(context, input.KPIs);
    context['ScheduleCount'] = input.ScheduleCount;
    context['SchedulesEnabledCount'] = input.EnabledCount;
    context['SchedulesLockedCount'] = input.LockedCount;
    context['SchedulesIntervalCount'] = input.IntervalCount;
    context['SchedulesCronCount'] = input.CronCount;
    context['SchedulesManualCount'] = input.ManualCount;
    if (input.VisibleSchedules.length > 0) {
        context['VisibleSchedules'] = input.VisibleSchedules.slice(0, INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP);
        if (input.VisibleSchedules.length > INTEGRATION_AGENT_CONTEXT_NAME_LIST_CAP) {
            context['VisibleScheduleCount'] = input.VisibleSchedules.length;
        }
    }
    return context;
}
