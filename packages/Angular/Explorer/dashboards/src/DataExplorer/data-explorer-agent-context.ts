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
 * The "MJ: " schema prefix carried by newer core entities (e.g. "MJ: ML Models",
 * "MJ: AI Models"). The UI strips it when an entity has no explicit DisplayName,
 * and users almost always say the stripped form ("ML Models", "AI Models") rather
 * than the full registered Name. See {@link entityDisplayName} / {@link stripMJPrefix}.
 */
export const MJ_ENTITY_NAME_PREFIX = 'MJ: ';

/**
 * Upper bound on how many currently-loaded record display values we publish in the
 * record-view context (VisibleRecordNames). Bounded so the streamed note stays small
 * even when a page holds hundreds of rows; a companion LoadedRecordCount reports the
 * true number loaded.
 */
export const AGENT_CONTEXT_RECORD_LIST_CAP = 25;

/**
 * Strip the leading "MJ: " schema prefix from an entity Name, if present.
 * Pure + deterministic. Returns the input unchanged when the prefix is absent.
 *
 * @param name - a (possibly prefixed) entity Name, e.g. "MJ: ML Models"
 * @returns the name without the "MJ: " prefix, e.g. "ML Models"
 */
export function stripMJPrefix(name: string): string {
    return name.startsWith(MJ_ENTITY_NAME_PREFIX) ? name.slice(MJ_ENTITY_NAME_PREFIX.length) : name;
}

/**
 * The display label the Data Explorer shows for an entity — the same value the entity
 * cards render via `EntityInfo.DisplayNameOrName`, except we additionally strip the
 * "MJ: " schema prefix when no explicit DisplayName is set. This is what the user reads
 * on screen and therefore what they say ("ML Models", not "MJ: ML Models").
 *
 * @param name - the entity's registered Name (may carry an "MJ: " prefix)
 * @param displayName - the entity's DisplayName, if any (takes precedence, used verbatim)
 * @returns the user-facing display label
 */
export function entityDisplayName(name: string, displayName?: string | null): string {
    if (displayName) {
        return displayName;
    }
    return stripMJPrefix(name);
}

/**
 * A minimal name-bearing entity descriptor, supplied by the component so the pure
 * resolver can match agent input against what the user sees. Mirrors the salient
 * slice of `EntityInfo` ({@link entityDisplayName} reads the same two fields).
 */
export interface EntityNameCandidate {
    Name: string;
    DisplayName?: string | null;
}

/**
 * Resolve an agent-supplied entity reference to one of the available entities, matching
 * the way a user names things. The user says the DISPLAY name (what the card shows),
 * but the registered Name may carry an "MJ: " prefix — so we try, in order:
 *   1. exact registered Name (case-insensitive)
 *   2. display name (case-insensitive) — DisplayName, else the prefix-stripped Name
 *   3. display name ignoring the "MJ: " prefix (case-insensitive)
 *
 * Pure + deterministic over the supplied candidate list, so it's unit-testable in
 * isolation; the component passes its `EntityInfo[]` (structurally `EntityNameCandidate[]`).
 *
 * @param input - whatever the agent passed (typically the on-screen display name)
 * @param candidates - the entities available in this explorer
 * @returns the matched candidate, or null on a miss
 */
export function resolveEntityByName<T extends EntityNameCandidate>(input: string, candidates: readonly T[]): T | null {
    const needle = input.trim().toLowerCase();
    if (!needle) {
        return null;
    }
    // 1. exact registered Name (case-insensitive)
    const byName = candidates.find(c => c.Name.toLowerCase() === needle);
    if (byName) {
        return byName;
    }
    // 2. display name (DisplayName, else prefix-stripped Name)
    const byDisplay = candidates.find(c => entityDisplayName(c.Name, c.DisplayName).toLowerCase() === needle);
    if (byDisplay) {
        return byDisplay;
    }
    // 3. display name ignoring the "MJ: " prefix (covers an input that itself carries the prefix)
    const strippedNeedle = stripMJPrefix(input.trim()).toLowerCase();
    if (strippedNeedle !== needle) {
        const byStripped = candidates.find(c => entityDisplayName(c.Name, c.DisplayName).toLowerCase() === strippedNeedle);
        if (byStripped) {
            return byStripped;
        }
    }
    return null;
}

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
 * A request to select a loaded record, as the agent expresses it: either by ordinal
 * {@link RecordSelectionRequest.position} ('first' | 'last' | a 1-based index) OR by
 * {@link RecordSelectionRequest.name} (a contains/case-insensitive match on the record's
 * display value). Exactly one is honored; `position` takes precedence when both are given.
 */
export interface RecordSelectionRequest {
    position?: 'first' | 'last' | number;
    name?: string;
}

/** Outcome of {@link resolveRecordSelection}: a 0-based index into the loaded records, or an error. */
export type RecordSelectionResult =
    | { ok: true; index: number }
    | { ok: false; error: string };

/**
 * Resolve an agent record-selection request against the display values of the records
 * currently loaded in the grid. Pure + deterministic over the supplied `recordNames`
 * (the component derives those from its `loadedRecords` via the entity's name field, in
 * the same order). Returns a 0-based index the component maps back to the actual record.
 *
 * Resolution order:
 *   - `position` first when present: 'first' → 0, 'last' → last, a 1-based number → number-1.
 *   - otherwise `name`: an exact case-insensitive match wins; failing that, the first
 *     case-insensitive *contains* match.
 *
 * @param recordNames - display values of the loaded records, in grid order
 * @param request - the agent's selection request
 * @returns the resolved 0-based index, or a clear error message
 */
export function resolveRecordSelection(recordNames: readonly string[], request: RecordSelectionRequest): RecordSelectionResult {
    if (recordNames.length === 0) {
        return { ok: false, error: 'No records are currently loaded in the view to select from.' };
    }

    if (request.position !== undefined && request.position !== null) {
        return resolveRecordByPosition(recordNames, request.position);
    }

    const name = (request.name ?? '').trim();
    if (name) {
        return resolveRecordByName(recordNames, name);
    }

    return { ok: false, error: 'Provide either a position ("first", "last", or a 1-based index) or a record name to select.' };
}

/** Resolve a 'first' | 'last' | 1-based-index position to a 0-based index. */
function resolveRecordByPosition(recordNames: readonly string[], position: 'first' | 'last' | number): RecordSelectionResult {
    const count = recordNames.length;
    if (position === 'first') {
        return { ok: true, index: 0 };
    }
    if (position === 'last') {
        return { ok: true, index: count - 1 };
    }
    if (typeof position === 'number' && Number.isInteger(position) && position >= 1 && position <= count) {
        return { ok: true, index: position - 1 };
    }
    return { ok: false, error: `Position "${String(position)}" is out of range. There ${count === 1 ? 'is 1 record' : `are ${count} records`} loaded (use 1-${count}, "first", or "last").` };
}

/** Resolve a record by an exact (then contains) case-insensitive display-value match. */
function resolveRecordByName(recordNames: readonly string[], name: string): RecordSelectionResult {
    const needle = name.toLowerCase();
    const exact = recordNames.findIndex(n => n.toLowerCase() === needle);
    if (exact >= 0) {
        return { ok: true, index: exact };
    }
    const contains = recordNames.findIndex(n => n.toLowerCase().includes(needle));
    if (contains >= 0) {
        return { ok: true, index: contains };
    }
    const sample = recordNames.slice(0, 5).join(', ');
    return { ok: false, error: `No loaded record matches "${name}". Loaded records include: ${sample}.` };
}

/**
 * Cap an array of record display values to {@link AGENT_CONTEXT_RECORD_LIST_CAP} entries.
 * Pure + deterministic, mirroring {@link capNames}.
 */
function capRecordNames(names: readonly string[]): string[] {
    return names.slice(0, AGENT_CONTEXT_RECORD_LIST_CAP);
}

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
    /**
     * Display values of the records currently loaded in the grid, in grid order — so the
     * agent knows what's selectable (and can pick "the first one" or one by name via the
     * SelectRecord tool). The component supplies the full loaded set; this helper bounds it —
     * see {@link AGENT_CONTEXT_RECORD_LIST_CAP}. Empty at the home level / before first load.
     */
    VisibleRecordNames: string[];
    /** Total number of records loaded in the current page of the grid (may exceed VisibleRecordNames after the cap). */
    LoadedRecordCount: number;
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

    // Loaded records — so the agent knows what rows are selectable (SelectRecord tool).
    if (input.VisibleRecordNames.length > 0) {
        context['VisibleRecordNames'] = capRecordNames(input.VisibleRecordNames);
        context['LoadedRecordCount'] = input.LoadedRecordCount;
    }

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
