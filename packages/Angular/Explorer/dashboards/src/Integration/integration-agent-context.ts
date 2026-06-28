/**
 * @fileoverview Pure, framework-agnostic helpers for the Integration dashboard's
 * AI-agent integration (context shaping + surface validation).
 *
 * The Integration "dashboard" is actually a set of sibling resource components
 * (Overview, Connections, Activity, Schedules) — each its own
 * `BaseResourceComponent`, each registered as a separate nav item in the
 * Integrations application. Every surface publishes its slice of state via
 * `NavigationService.SetAgentContext` and registers a small set of safe client
 * tools via `SetAgentClientTools`.
 *
 * These helpers are intentionally free of Angular / component dependencies so
 * they can be unit-tested in isolation. Each component supplies a plain snapshot
 * of its current state and the matching helper shapes it into the flat key-value
 * object that flows to the async chat agent and the realtime co-agent.
 *
 * 🔒 SAFETY BOUNDARY (applies to every Integration surface):
 *   These helpers only SHAPE READ-ONLY state and VALIDATE navigation/filter
 *   input. They never trigger a sync, mutate a mapping/schedule/credential, or
 *   perform any external side effect. The Integration surfaces deliberately do
 *   NOT expose `RunSync` (live external sync), edit-mapping, update-schedule, or
 *   change-credentials as agent client tools — those remain user-driven from the
 *   UI. See each component's SAFETY BOUNDARY comment.
 */

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

/**
 * The component-supplied snapshot used to build an Integration surface's agent
 * context. Every field is optional except `Surface` and `KPIs`, so each surface
 * can supply only the slice it actually owns.
 */
export interface IntegrationAgentContextInput {
    /** Which surface is publishing the context. */
    Surface: IntegrationSurface;
    /** The shared KPI strip (some fields may be 0 when a surface can't compute them). */
    KPIs: IntegrationContextKPIs;
    /** Whether the surface is mid-load. */
    IsLoading?: boolean;
    /** Activity surface: active run status filter (e.g. 'All', 'Failed'). */
    ActivityStatusFilter?: string;
    /** Activity surface: free-text search query currently applied. */
    ActivitySearchQuery?: string;
    /** Activity surface: number of runs after the current filters. */
    ActivityFilteredRunCount?: number;
    /** Activity surface: total runs loaded (unfiltered). */
    ActivityTotalRunCount?: number;
    /** Schedules surface: number of schedules with scheduling enabled. */
    SchedulesEnabledCount?: number;
    /** Schedules surface: number of schedules currently locked (running). */
    SchedulesLockedCount?: number;
}

/**
 * Build the flat, agent-visible context object for an Integration surface.
 *
 * Always includes the active `Surface` and the shared KPI strip
 * (TotalIntegrations, ActiveSyncs, RecordsSyncedToday, SyncErrorRate,
 * PipelineCount, ScheduledSyncCount). Surface-specific fields (Activity filters,
 * Schedule counts) are appended only when supplied, keeping the payload tight.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 *
 * @param input - the surface's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildIntegrationAgentContext(input: IntegrationAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        Surface: input.Surface,
        TotalIntegrations: input.KPIs.TotalIntegrations,
        ActiveSyncs: input.KPIs.ActiveSyncs,
        RecordsSyncedToday: input.KPIs.RecordsSyncedToday,
        SyncErrorRate: input.KPIs.SyncErrorRate,
        PipelineCount: input.KPIs.PipelineCount,
        ScheduledSyncCount: input.KPIs.ScheduledSyncCount,
    };

    if (input.IsLoading != null) {
        context['IsLoading'] = input.IsLoading;
    }

    if (input.Surface === 'Activity') {
        if (input.ActivityStatusFilter != null) {
            context['ActivityStatusFilter'] = input.ActivityStatusFilter;
        }
        if (input.ActivitySearchQuery != null) {
            context['ActivitySearchQuery'] = input.ActivitySearchQuery;
        }
        if (input.ActivityFilteredRunCount != null) {
            context['ActivityFilteredRunCount'] = input.ActivityFilteredRunCount;
        }
        if (input.ActivityTotalRunCount != null) {
            context['ActivityTotalRunCount'] = input.ActivityTotalRunCount;
        }
    }

    if (input.Surface === 'Schedules') {
        if (input.SchedulesEnabledCount != null) {
            context['SchedulesEnabledCount'] = input.SchedulesEnabledCount;
        }
        if (input.SchedulesLockedCount != null) {
            context['SchedulesLockedCount'] = input.SchedulesLockedCount;
        }
    }

    return context;
}
