/**
 * @fileoverview Pure helpers for the Data Explorer dashboard's AI-agent integration.
 *
 * These functions are intentionally free of Angular / component dependencies so they
 * can be unit-tested in isolation. The component ({@link DataExplorerDashboardComponent})
 * supplies a plain snapshot of its current state and these helpers shape it into the
 * key-value `AgentContext` object that flows to the async chat agent and the realtime
 * co-agent via `NavigationService.SetAgentContext`.
 */

import { DataExplorerViewMode } from './models/explorer-state.interface';

/** The four record-view modes the Data Explorer supports. */
const VALID_VIEW_MODES: readonly DataExplorerViewMode[] = ['grid', 'cards', 'timeline', 'map'] as const;

/** The two entity-browser modes the home screen supports (All Entities vs My Favorites). */
export const VALID_ENTITY_BROWSER_MODES: readonly ('all' | 'favorites')[] = ['all', 'favorites'] as const;

/**
 * Upper bound on how many names we publish in a name-list context field
 * (AvailableViews, VisibleColumns, AvailableEntities). Keeping the streamed note
 * bounded avoids flooding the co-agent with hundreds of names; when the underlying
 * list is larger we surface a companion total-count field instead.
 */
export const AGENT_CONTEXT_NAME_LIST_CAP = 25;

/**
 * Upper bound on how many application-group summaries we publish. The home screen
 * groups entities by application (Actions, Admin, AI, Archiving, …); there are
 * on the order of ~20 of these so a small cap keeps the streamed note bounded
 * while still letting the co-agent see the full landscape.
 */
export const AGENT_CONTEXT_APP_GROUP_CAP = 25;

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
 * Type-guard / validator for a record-view mode string. Used to keep the
 * `SetViewMode` client tool tolerant of arbitrary agent input — only the four
 * known modes are accepted.
 *
 * @param mode - candidate mode string (may be anything the agent passes)
 * @returns true when `mode` is one of grid | cards | timeline | map
 */
export function isValidViewMode(mode: unknown): mode is DataExplorerViewMode {
    return typeof mode === 'string' && (VALID_VIEW_MODES as readonly string[]).includes(mode);
}

/**
 * Type-guard / validator for an entity-browser mode string, backing the
 * `SetEntityBrowserMode` client tool.
 *
 * @param mode - candidate mode string (may be anything the agent passes)
 * @returns true when `mode` is one of 'all' | 'favorites'
 */
export function isValidEntityBrowserMode(mode: unknown): mode is 'all' | 'favorites' {
    return typeof mode === 'string' && (VALID_ENTITY_BROWSER_MODES as readonly string[]).includes(mode);
}

/**
 * A summary of one application group shown on the home screen's entity browser.
 * `Name` is the application name (e.g. "AI", "Admin", "System & Other"); `EntityCount`
 * is how many entities are currently visible under it (after the active filter/mode);
 * `Expanded` reflects whether the group is currently expanded in the UI.
 */
export interface AppGroupSummary {
    Name: string;
    EntityCount: number;
    Expanded: boolean;
}

/**
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of {@link DataExplorerState} plus a couple of
 * component-derived fields (selected entity name, debounced filter text,
 * record counts, the home-view entity-search fields, the application-group
 * landscape, and pagination state).
 */
export interface DataExplorerAgentContextInput {
    /** Name of the currently selected entity, or null at the home level. */
    SelectedEntityName: string | null;
    /** Active record-view mode (grid/cards/timeline/map). */
    ViewMode: DataExplorerViewMode;
    /**
     * The record-view modes the CURRENT entity actually supports (e.g. 'map' only
     * when the entity supports geocoding, 'timeline' only when it has date fields).
     * Lets the co-agent avoid requesting an unsupported view type. Empty at home level.
     */
    AvailableViewTypes: DataExplorerViewMode[];
    /** ID of the currently selected saved view, or null. */
    ActiveViewId: string | null;
    /**
     * Resolved display name for {@link ActiveViewId}, or null when no view is active
     * (or the id couldn't be resolved). Lets the co-agent refer to the view by name
     * rather than an opaque GUID.
     */
    ActiveViewName: string | null;
    /**
     * Names of the saved views available for the currently selected entity (the ones
     * the agent can open via the SelectView tool). The component supplies the full
     * list; this helper bounds it — see {@link AGENT_CONTEXT_NAME_LIST_CAP}.
     */
    AvailableViewNames: string[];
    /**
     * Field/column names visible in the current entity's grid. The component supplies
     * the full list; this helper bounds it.
     */
    VisibleColumnNames: string[];
    /** The debounced record filter text currently applied to the grid. */
    FilterText: string;
    /** Total record count for the selected entity/view (unfiltered). */
    TotalRecordCount: number;
    /** Record count after the current filter is applied. */
    FilteredRecordCount: number;
    /**
     * Number of records loaded per page in the grid (server-side pagination page size).
     * Used to derive {@link TotalPages} when the live grid hasn't reported a page count.
     */
    PageSize: number;
    /**
     * Live 1-based current page reported by the inner grid, or null when the grid
     * hasn't mounted / reported yet (e.g. before first data load).
     */
    CurrentPage: number | null;
    /**
     * Live total page count reported by the inner grid, or null when unavailable.
     * When present it takes precedence over the count derived from record counts.
     */
    TotalPages: number | null;
    /**
     * Field/column the grid is currently sorted by, or null when unsorted.
     */
    SortColumn: string | null;
    /**
     * Active sort direction ('asc' | 'desc'), or null when unsorted.
     */
    SortDirection: 'asc' | 'desc' | null;
    /**
     * Names of the entities related to the selected entity (from EntityInfo.RelatedEntities
     * metadata), so the agent can suggest NavigateToRelated targets. The component supplies
     * the full list; this helper bounds it — see {@link AGENT_CONTEXT_NAME_LIST_CAP}.
     * Empty at the home level.
     */
    RelatedEntityNames: string[];
    /** Display name of the currently selected record, or null. */
    SelectedRecordName: string | null;
    /** Whether the detail panel is currently open. */
    DetailPanelOpen: boolean;
    /** Home-view mode (all vs favorites) — only meaningful at the home level. */
    HomeViewMode: 'all' | 'favorites';
    /** The entity-search text on the home screen. */
    EntitySearchText: string;
    /** Count of entities currently visible after the home-screen filter. */
    VisibleEntityCount: number;
    /** Count of entities the current user has favorited (across all applications). */
    FavoriteEntityCount: number;
    /**
     * Names of the entities loaded and available at the home level (so the co-agent
     * can navigate to one via OpenEntityData). The component supplies the full list;
     * this helper bounds it — see {@link AGENT_CONTEXT_NAME_LIST_CAP}.
     */
    AvailableEntityNames: string[];
    /**
     * Application-group summaries currently shown on the home screen's entity browser.
     * Empty when the explorer is scoped to a single application (no grouping). The
     * component supplies the full list; this helper bounds it — see
     * {@link AGENT_CONTEXT_APP_GROUP_CAP}.
     */
    AppGroups: AppGroupSummary[];
}

/**
 * Build the record-browsing slice of the agent context (entity selected).
 */
function buildRecordBrowsingContext(input: DataExplorerAgentContextInput): Record<string, unknown> {
    const context: Record<string, unknown> = {
        AtHomeLevel: false,
        SelectedEntityName: input.SelectedEntityName,
        ViewMode: input.ViewMode,
        ActiveViewId: input.ActiveViewId,
        ActiveViewName: input.ActiveViewName,
        FilterText: input.FilterText,
        TotalRecordCount: input.TotalRecordCount,
        FilteredRecordCount: input.FilteredRecordCount,
        SelectedRecordName: input.SelectedRecordName,
        DetailPanelOpen: input.DetailPanelOpen,
        AvailableViews: capNames(input.AvailableViewNames),
    };

    // Pagination — prefer the live values the inner grid reports; fall back to deriving
    // total pages from the filtered count and page size. A page size of 0 or a
    // non-positive count yields 1 page.
    context['PageSize'] = input.PageSize;
    context['CurrentPage'] = input.CurrentPage ?? 1;
    context['TotalPages'] = input.TotalPages ?? computeTotalPages(input.FilteredRecordCount, input.PageSize);

    // Sort — only surfaced when the grid is actually sorted by a column.
    if (input.SortColumn) {
        context['SortColumn'] = input.SortColumn;
        context['SortDirection'] = input.SortDirection ?? 'asc';
    }

    // Related entities — so the agent can suggest NavigateToRelated targets.
    if (input.RelatedEntityNames.length > 0) {
        context['RelatedEntities'] = capNames(input.RelatedEntityNames);
        if (input.RelatedEntityNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
            context['RelatedEntityCount'] = input.RelatedEntityNames.length;
        }
    }

    // The view types the current entity actually supports (so the agent doesn't request
    // an unsupported one — e.g. 'map' on an entity without geocoding).
    if (input.AvailableViewTypes.length > 0) {
        context['AvailableViewTypes'] = input.AvailableViewTypes;
    }

    // When the entity has more saved views than we publish names for, tell the
    // co-agent the true total so it knows the list is truncated.
    if (input.AvailableViewNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        context['AvailableViewCount'] = input.AvailableViewNames.length;
    }
    if (input.VisibleColumnNames.length > 0) {
        context['VisibleColumns'] = capNames(input.VisibleColumnNames);
        if (input.VisibleColumnNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
            context['VisibleColumnCount'] = input.VisibleColumnNames.length;
        }
    }
    return context;
}

/**
 * Build the entity-browsing slice of the agent context (home level, no entity selected).
 */
function buildEntityBrowsingContext(input: DataExplorerAgentContextInput): Record<string, unknown> {
    const homeContext: Record<string, unknown> = {
        AtHomeLevel: true,
        SelectedEntityName: null,
        HomeViewMode: input.HomeViewMode,
        // 'all' | 'favorites' — alias surfaced under the tool's parameter name so the agent
        // can correlate context with the SetEntityBrowserMode tool.
        EntityBrowserMode: input.HomeViewMode,
        EntitySearchText: input.EntitySearchText,
        VisibleEntityCount: input.VisibleEntityCount,
        FavoriteEntityCount: input.FavoriteEntityCount,
        AvailableEntities: capNames(input.AvailableEntityNames),
    };
    if (input.AvailableEntityNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        homeContext['AvailableEntityCount'] = input.AvailableEntityNames.length;
    }

    // Application-group landscape (Actions, Admin, AI, …). Bounded; companion count when over.
    if (input.AppGroups.length > 0) {
        homeContext['AppGroups'] = input.AppGroups.slice(0, AGENT_CONTEXT_APP_GROUP_CAP);
        // Names of the groups currently expanded — lets the co-agent know what's already open.
        const expanded = input.AppGroups.filter(g => g.Expanded).map(g => g.Name);
        homeContext['ExpandedAppGroups'] = expanded;
        if (input.AppGroups.length > AGENT_CONTEXT_APP_GROUP_CAP) {
            homeContext['AppGroupCount'] = input.AppGroups.length;
        }
    }
    return homeContext;
}

/**
 * Derive the total page count from a record count and page size.
 * Guards against a non-positive page size (returns 1 page) and rounds up.
 */
export function computeTotalPages(recordCount: number, pageSize: number): number {
    if (!Number.isFinite(pageSize) || pageSize <= 0 || recordCount <= 0) {
        return 1;
    }
    return Math.ceil(recordCount / pageSize);
}

/**
 * Build the agent-visible context object for the Data Explorer.
 *
 * When an entity is selected the context describes the record-browsing surface
 * (entity, view mode, available view types, active saved view, filter, record
 * counts, pagination, selected record, detail-panel state). When no entity is
 * selected (home level) it instead describes the entity-browsing surface
 * (home/browser view mode, entity search text, count of visible entities,
 * favorite count, available entities, and the application-group landscape) and
 * reports `AtHomeLevel: true`.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildDataExplorerAgentContext(input: DataExplorerAgentContextInput): Record<string, unknown> {
    if (input.SelectedEntityName) {
        return buildRecordBrowsingContext(input);
    }
    return buildEntityBrowsingContext(input);
}
