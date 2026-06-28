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

/**
 * Upper bound on how many names we publish in a name-list context field
 * (AvailableViews, VisibleColumns, AvailableEntities). Keeping the streamed note
 * bounded avoids flooding the co-agent with hundreds of names; when the underlying
 * list is larger we surface a companion total-count field instead.
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
 * The plain, component-supplied snapshot used to build the agent context.
 * Mirrors the salient slice of {@link DataExplorerState} plus a couple of
 * component-derived fields (selected entity name, debounced filter text,
 * record counts, and the home-view entity-search fields).
 */
export interface DataExplorerAgentContextInput {
    /** Name of the currently selected entity, or null at the home level. */
    SelectedEntityName: string | null;
    /** Active record-view mode (grid/cards/timeline/map). */
    ViewMode: DataExplorerViewMode;
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
    /**
     * Names of the entities loaded and available at the home level (so the co-agent
     * can navigate to one via OpenEntityData). The component supplies the full list;
     * this helper bounds it — see {@link AGENT_CONTEXT_NAME_LIST_CAP}.
     */
    AvailableEntityNames: string[];
}

/**
 * Build the agent-visible context object for the Data Explorer.
 *
 * When an entity is selected the context describes the record-browsing surface
 * (entity, view mode, active saved view, filter, record counts, selected record,
 * detail-panel state). When no entity is selected (home level) it instead
 * describes the entity-browsing surface (home view mode, entity search text,
 * count of visible entities) and reports `AtHomeLevel: true`.
 *
 * Keeping this a pure function (no `this`) makes the context shape unit-testable
 * and decouples it from change-detection timing.
 *
 * @param input - the component's current state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildDataExplorerAgentContext(input: DataExplorerAgentContextInput): Record<string, unknown> {
    if (input.SelectedEntityName) {
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

    // Home level — describe the entity-browsing surface instead.
    const homeContext: Record<string, unknown> = {
        AtHomeLevel: true,
        SelectedEntityName: null,
        HomeViewMode: input.HomeViewMode,
        EntitySearchText: input.EntitySearchText,
        VisibleEntityCount: input.VisibleEntityCount,
        AvailableEntities: capNames(input.AvailableEntityNames),
    };
    if (input.AvailableEntityNames.length > AGENT_CONTEXT_NAME_LIST_CAP) {
        homeContext['AvailableEntityCount'] = input.AvailableEntityNames.length;
    }
    return homeContext;
}
