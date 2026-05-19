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
