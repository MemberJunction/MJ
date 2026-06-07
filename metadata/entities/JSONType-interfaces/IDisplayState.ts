/**
 * Persisted display-mode configuration for a User View.
 *
 * Stored in the `DisplayState` column of the `User Views` entity. Controls which
 * view modes (grid, cards, timeline) are available and which is shown by default,
 * along with mode-specific settings like timeline grouping and card sizing.
 *
 * The runtime helpers `ParsedDisplayState`, `DefaultViewMode`, and `TimelineConfig`
 * on `MJUserViewEntityExtended` currently parse this field manually; once CodeGen
 * emits a typed `DisplayStateObject` accessor, those helpers can delegate to it.
 */
export interface IDisplayState {
    /** The default view mode to show when loading this view */
    defaultMode: 'grid' | 'cards' | 'timeline';
    /** Which view modes are enabled/visible for this view */
    enabledModes?: {
        grid?: boolean;
        cards?: boolean;
        timeline?: boolean;
    };
    /** Timeline-specific configuration */
    timeline?: ITimelineState;
    /** Card-specific configuration */
    cards?: IDisplayCardState;
    /** Grid-specific configuration */
    grid?: IGridDisplayState;
    /**
     * Per-view-type configuration, one entry per view type the user has configured.
     * Keyed by the `MJ: View Types` row ID so each type (Grid, Cards, Timeline, Map,
     * Cluster, …) keeps its own settings in parallel — switching from one type to another
     * and back preserves each type's config. The *active* view type is stored on
     * `UserView.ViewTypeID` (the source of truth), not here; this array holds only the
     * per-type configuration payloads.
     */
    viewTypeConfigs?: IViewTypeConfigEntry[];
}

/**
 * A single per-view-type configuration entry within {@link IDisplayState}.viewTypeConfigs.
 *
 * `config` is intentionally an open map: each view-type plug-in owns the shape of its own
 * configuration (e.g. the Cluster plug-in stores algorithm/K/dimensions; a Map plug-in stores
 * lat/long field names). The host persists/loads it opaquely and hands it to the plug-in's
 * renderer + prop-sheet, which interpret it with their own typed config interface.
 */
export interface IViewTypeConfigEntry {
    /** The `MJ: View Types` row ID this configuration applies to. */
    viewTypeId: string;
    /** The view-type-specific configuration payload (shape owned by the plug-in). */
    config: Record<string, unknown>;
}

/**
 * Timeline-specific configuration for the entity viewer's timeline display mode.
 *
 * Used inside {@link IDisplayState}.timeline. Controls which date field drives the
 * timeline, how events are grouped into segments, and segment expand/collapse behavior.
 */
export interface ITimelineState {
    /** The date field name to use for timeline ordering */
    dateFieldName: string;
    /** Time segment grouping */
    segmentGrouping?: 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';
    /** Sort order for timeline events */
    sortOrder?: 'asc' | 'desc';
    /** Whether segments are collapsible */
    segmentsCollapsible?: boolean;
    /** Whether segments start expanded */
    segmentsDefaultExpanded?: boolean;
    /** Timeline orientation */
    orientation?: 'vertical' | 'horizontal';
}

/**
 * Card-specific display configuration within the view display state.
 *
 * Used inside {@link IDisplayState}.cards. Controls card sizing when the view
 * is in card display mode. The card template itself (title field, subtitle,
 * display fields) is auto-derived from entity metadata at runtime.
 */
export interface IDisplayCardState {
    /** Custom card size */
    cardSize?: 'small' | 'medium' | 'large';
}

/**
 * Grid-specific display configuration within the view display state.
 *
 * Used inside {@link IDisplayState}.grid. Controls grid-level display preferences
 * like row height that are separate from per-column settings in {@link IGridState}.
 */
export interface IGridDisplayState {
    /** Row height preference */
    rowHeight?: 'compact' | 'normal' | 'comfortable';
    /** Enable text wrapping in grid cells — long text wraps and rows auto-size */
    wrapText?: boolean;
}
