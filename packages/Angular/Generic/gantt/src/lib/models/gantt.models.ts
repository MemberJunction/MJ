/**
 * A single item (bar) on the Gantt timeline.
 */
export interface GanttItemData {
    /** Unique identifier. */
    ID: string;
    /** Display name shown in the grid and on the bar. */
    Name: string;
    /** Start date for the bar. */
    StartDate: Date;
    /** End date for the bar. If omitted, `Duration` is used instead. */
    EndDate?: Date;
    /** Duration in days. Used when `EndDate` is not provided. */
    Duration?: number;
    /** Completion percentage (0–100). Rendered as a filled portion of the bar. */
    Progress?: number;
    /** Parent item ID for tree hierarchy. Omit for top-level items. */
    ParentID?: string;
    /** Whether this item's children are expanded in the tree. Default: true. */
    Open?: boolean;
    /** Arbitrary consumer data passed through with events. */
    Data?: any;
}

/**
 * A dependency link (arrow) between two Gantt items.
 */
export interface GanttLinkData {
    /** Unique identifier for this link. */
    ID: string;
    /** ID of the source (predecessor) item. */
    SourceID: string;
    /** ID of the target (successor) item. */
    TargetID: string;
    /** Dependency type. Default: `'FS'` (Finish-to-Start). */
    Type?: 'FS' | 'SS' | 'FF' | 'SF';
}

/**
 * Defines a column in the Gantt grid (left side).
 */
export interface GanttColumnDef {
    /** Internal field name used by DHTMLX (e.g. 'text', 'start_date', 'duration'). */
    Name: string;
    /** Display label for the column header. */
    Label: string;
    /** Column width in pixels. Use `'*'` for flex. */
    Width?: number | string;
    /** Text alignment. */
    Align?: 'left' | 'center' | 'right';
    /** Show as tree column (with expand/collapse). Only one column should be tree. */
    Tree?: boolean;
    /** Custom template function for cell rendering. Receives the DHTMLX task object. */
    Template?: (item: any) => string;
}

/**
 * Event emitted when an item is clicked on the Gantt chart.
 */
export interface GanttItemClickedEvent {
    /** The item that was clicked. */
    Item: GanttItemData;
}

/**
 * Event emitted when an item is changed via drag/resize (if not read-only).
 */
export interface GanttItemChangedEvent {
    /** The item that was changed. */
    Item: GanttItemData;
    /** New start date after the change. */
    NewStartDate: Date;
    /** New end date after the change. */
    NewEndDate: Date;
    /** New duration in days after the change. */
    NewDuration: number;
}
