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
        return {
            AtHomeLevel: false,
            SelectedEntityName: input.SelectedEntityName,
            ViewMode: input.ViewMode,
            ActiveViewId: input.ActiveViewId,
            FilterText: input.FilterText,
            TotalRecordCount: input.TotalRecordCount,
            FilteredRecordCount: input.FilteredRecordCount,
            SelectedRecordName: input.SelectedRecordName,
            DetailPanelOpen: input.DetailPanelOpen,
        };
    }

    // Home level — describe the entity-browsing surface instead.
    return {
        AtHomeLevel: true,
        SelectedEntityName: null,
        HomeViewMode: input.HomeViewMode,
        EntitySearchText: input.EntitySearchText,
        VisibleEntityCount: input.VisibleEntityCount,
    };
}
