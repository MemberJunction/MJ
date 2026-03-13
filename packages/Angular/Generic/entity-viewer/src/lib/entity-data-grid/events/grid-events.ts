import { GridColumnConfig, DataGridSortState, GridRunViewParams } from '../models/grid-types';

// Forward declaration to avoid circular dependency
// The actual component type is set at runtime
export type GridComponentRef = unknown;

// ========================================
// Base Event Classes
// ========================================

/**
 * Base class for all grid events
 */
export class GridEventArgs {
  /** The grid component that raised the event */
  readonly grid: GridComponentRef;

  /** Timestamp when event was raised */
  readonly timestamp: Date;

  constructor(grid: GridComponentRef) {
    this.grid = grid;
    this.timestamp = new Date();
  }
}

/**
 * Base class for cancelable events (Before events)
 */
export class CancelableGridEventArgs extends GridEventArgs {
  /** Set to true to cancel the operation */
  cancel: boolean = false;

  /** Optional reason for cancellation (for logging/debugging) */
  cancelReason?: string;

  constructor(grid: GridComponentRef) {
    super(grid);
  }
}

/**
 * Base class for row-related events
 */
export class RowEventArgs extends GridEventArgs {
  /** The row data (entity) */
  readonly row: Record<string, unknown>;

  /** The row index in the current view */
  readonly rowIndex: number;

  /** The row key (ID) */
  readonly rowKey: string;

  constructor(grid: GridComponentRef, row: Record<string, unknown>, rowIndex: number, rowKey: string) {
    super(grid);
    this.row = row;
    this.rowIndex = rowIndex;
    this.rowKey = rowKey;
  }
}

/**
 * Base class for cancelable row events
 */
export class CancelableRowEventArgs extends RowEventArgs {
  /** Set to true to cancel the operation */
  cancel: boolean = false;

  /** Optional reason for cancellation */
  cancelReason?: string;

  constructor(grid: GridComponentRef, row: Record<string, unknown>, rowIndex: number, rowKey: string) {
    super(grid, row, rowIndex, rowKey);
  }
}

// ========================================
// Row Selection Events
// ========================================

/**
 * Fired before a row is selected - can be canceled
 */
export class BeforeRowSelectEventArgs extends CancelableRowEventArgs {
  /** Whether this is adding to selection (multi-select) or replacing */
  readonly isAdditive: boolean;

  /** Current selection before this change */
  readonly currentSelection: string[];

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    isAdditive: boolean,
    currentSelection: string[]
  ) {
    super(grid, row, rowIndex, rowKey);
    this.isAdditive = isAdditive;
    this.currentSelection = [...currentSelection];
  }
}

/**
 * Fired after a row is selected
 */
export class AfterRowSelectEventArgs extends RowEventArgs {
  /** Whether this was additive selection */
  readonly wasAdditive: boolean;

  /** New selection state */
  readonly newSelection: string[];

  /** Previous selection state */
  readonly previousSelection: string[];

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    wasAdditive: boolean,
    newSelection: string[],
    previousSelection: string[]
  ) {
    super(grid, row, rowIndex, rowKey);
    this.wasAdditive = wasAdditive;
    this.newSelection = [...newSelection];
    this.previousSelection = [...previousSelection];
  }
}

/**
 * Fired before a row is deselected - can be canceled
 */
export class BeforeRowDeselectEventArgs extends CancelableRowEventArgs {
  /** Current selection before this change */
  readonly currentSelection: string[];

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    currentSelection: string[]
  ) {
    super(grid, row, rowIndex, rowKey);
    this.currentSelection = [...currentSelection];
  }
}

/**
 * Fired after a row is deselected
 */
export class AfterRowDeselectEventArgs extends RowEventArgs {
  /** New selection state */
  readonly newSelection: string[];

  /** Previous selection state */
  readonly previousSelection: string[];

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    newSelection: string[],
    previousSelection: string[]
  ) {
    super(grid, row, rowIndex, rowKey);
    this.newSelection = [...newSelection];
    this.previousSelection = [...previousSelection];
  }
}

// ========================================
// Row Click Events
// ========================================

/**
 * Fired before a row click is processed - can be canceled
 */
export class BeforeRowClickEventArgs extends CancelableRowEventArgs {
  /** The mouse event */
  readonly mouseEvent: MouseEvent;

  /** The column that was clicked (if any) */
  readonly column?: GridColumnConfig;

  /** The cell value that was clicked (if any) */
  readonly cellValue?: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    mouseEvent: MouseEvent,
    column?: GridColumnConfig,
    cellValue?: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.mouseEvent = mouseEvent;
    this.column = column;
    this.cellValue = cellValue;
  }
}

/**
 * Fired after a row click
 */
export class AfterRowClickEventArgs extends RowEventArgs {
  /** The mouse event */
  readonly mouseEvent: MouseEvent;

  /** The column that was clicked (if any) */
  readonly column?: GridColumnConfig;

  /** The cell value that was clicked (if any) */
  readonly cellValue?: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    mouseEvent: MouseEvent,
    column?: GridColumnConfig,
    cellValue?: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.mouseEvent = mouseEvent;
    this.column = column;
    this.cellValue = cellValue;
  }
}

/**
 * Fired before a row double-click - can be canceled
 */
export class BeforeRowDoubleClickEventArgs extends CancelableRowEventArgs {
  /** The mouse event */
  readonly mouseEvent: MouseEvent;

  /** The column that was clicked (if any) */
  readonly column?: GridColumnConfig;

  /** The cell value that was clicked (if any) */
  readonly cellValue?: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    mouseEvent: MouseEvent,
    column?: GridColumnConfig,
    cellValue?: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.mouseEvent = mouseEvent;
    this.column = column;
    this.cellValue = cellValue;
  }
}

/**
 * Fired after a row double-click
 */
export class AfterRowDoubleClickEventArgs extends RowEventArgs {
  /** The mouse event */
  readonly mouseEvent: MouseEvent;

  /** The column that was clicked (if any) */
  readonly column?: GridColumnConfig;

  /** The cell value that was clicked (if any) */
  readonly cellValue?: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    mouseEvent: MouseEvent,
    column?: GridColumnConfig,
    cellValue?: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.mouseEvent = mouseEvent;
    this.column = column;
    this.cellValue = cellValue;
  }
}

// ========================================
// Cell Editing Events
// ========================================

/**
 * Fired before cell edit begins - can be canceled
 */
export class BeforeCellEditEventArgs extends CancelableRowEventArgs {
  /** The column being edited */
  readonly column: GridColumnConfig;

  /** Current value in the cell */
  readonly currentValue: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    column: GridColumnConfig,
    currentValue: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.column = column;
    this.currentValue = currentValue;
  }
}

/**
 * Fired after cell edit begins
 */
export class AfterCellEditBeginEventArgs extends RowEventArgs {
  /** The column being edited */
  readonly column: GridColumnConfig;

  /** Current value in the cell */
  readonly currentValue: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    column: GridColumnConfig,
    currentValue: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.column = column;
    this.currentValue = currentValue;
  }
}

/**
 * Fired before cell edit is committed - can be canceled or value modified
 */
export class BeforeCellEditCommitEventArgs extends CancelableRowEventArgs {
  /** The column being edited */
  readonly column: GridColumnConfig;

  /** Original value before edit */
  readonly oldValue: unknown;

  /** New value being committed */
  readonly newValue: unknown;

  /** Set to modify the value before committing */
  modifiedValue?: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    column: GridColumnConfig,
    oldValue: unknown,
    newValue: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.column = column;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }
}

/**
 * Fired after cell edit is committed
 */
export class AfterCellEditCommitEventArgs extends RowEventArgs {
  /** The column that was edited */
  readonly column: GridColumnConfig;

  /** Original value before edit */
  readonly oldValue: unknown;

  /** New value that was committed */
  readonly newValue: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    column: GridColumnConfig,
    oldValue: unknown,
    newValue: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.column = column;
    this.oldValue = oldValue;
    this.newValue = newValue;
  }
}

/**
 * Fired before cell edit is canceled - can be canceled (forcing commit instead)
 */
export class BeforeCellEditCancelEventArgs extends CancelableRowEventArgs {
  /** The column being edited */
  readonly column: GridColumnConfig;

  /** Original value */
  readonly originalValue: unknown;

  /** The edited value that would be discarded */
  readonly editedValue: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    column: GridColumnConfig,
    originalValue: unknown,
    editedValue: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.column = column;
    this.originalValue = originalValue;
    this.editedValue = editedValue;
  }
}

/**
 * Fired after cell edit is canceled
 */
export class AfterCellEditCancelEventArgs extends RowEventArgs {
  /** The column that was being edited */
  readonly column: GridColumnConfig;

  /** Original value that was restored */
  readonly originalValue: unknown;

  /** The edited value that was discarded */
  readonly editedValue: unknown;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    column: GridColumnConfig,
    originalValue: unknown,
    editedValue: unknown
  ) {
    super(grid, row, rowIndex, rowKey);
    this.column = column;
    this.originalValue = originalValue;
    this.editedValue = editedValue;
  }
}

// ========================================
// Row Save/Delete Events
// ========================================

/**
 * Fired before row save - can be canceled or values modified
 */
export class BeforeRowSaveEventArgs extends CancelableRowEventArgs {
  /** The changes being saved */
  readonly changes: Record<string, { oldValue: unknown; newValue: unknown }>;

  /** Set to modify values before saving */
  modifiedValues?: Record<string, unknown>;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    changes: Record<string, { oldValue: unknown; newValue: unknown }>
  ) {
    super(grid, row, rowIndex, rowKey);
    this.changes = { ...changes };
  }
}

/**
 * Fired after row save
 */
export class AfterRowSaveEventArgs extends RowEventArgs {
  /** The changes that were saved */
  readonly changes: Record<string, { oldValue: unknown; newValue: unknown }>;

  /** Whether the save was successful */
  readonly success: boolean;

  /** Error message if save failed */
  readonly error?: string;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    changes: Record<string, { oldValue: unknown; newValue: unknown }>,
    success: boolean,
    error?: string
  ) {
    super(grid, row, rowIndex, rowKey);
    this.changes = { ...changes };
    this.success = success;
    this.error = error;
  }
}

/**
 * Fired before row delete - can be canceled
 */
export class BeforeRowDeleteEventArgs extends CancelableRowEventArgs {
  /** Whether this is part of a batch delete */
  readonly isBatch: boolean;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    isBatch: boolean
  ) {
    super(grid, row, rowIndex, rowKey);
    this.isBatch = isBatch;
  }
}

/**
 * Fired after row delete
 */
export class AfterRowDeleteEventArgs extends RowEventArgs {
  /** Whether the delete was successful */
  readonly success: boolean;

  /** Error message if delete failed */
  readonly error?: string;

  constructor(
    grid: GridComponentRef,
    row: Record<string, unknown>,
    rowIndex: number,
    rowKey: string,
    success: boolean,
    error?: string
  ) {
    super(grid, row, rowIndex, rowKey);
    this.success = success;
    this.error = error;
  }
}

// ========================================
// Data Loading Events
// ========================================

/**
 * Fired before data load - can be canceled or params modified
 */
export class BeforeDataLoadEventArgs extends CancelableGridEventArgs {
  /** The RunView parameters that will be used */
  readonly params: GridRunViewParams;

  /** Set to modify the parameters before loading */
  modifiedParams?: Partial<GridRunViewParams>;

  constructor(grid: GridComponentRef, params: GridRunViewParams) {
    super(grid);
    this.params = { ...params };
  }
}

/**
 * Fired after data load
 */
export class AfterDataLoadEventArgs extends GridEventArgs {
  /** The RunView parameters that were used */
  readonly params: GridRunViewParams;

  /** Whether the load was successful */
  readonly success: boolean;

  /** Total number of rows matching the query */
  readonly totalRowCount: number;

  /** Number of rows actually loaded (may be limited by maxRows) */
  readonly loadedRowCount: number;

  /** Time taken to load in milliseconds */
  readonly loadTimeMs: number;

  /** Error message if load failed */
  readonly error?: string;

  constructor(
    grid: GridComponentRef,
    params: GridRunViewParams,
    success: boolean,
    totalRowCount: number,
    loadedRowCount: number,
    loadTimeMs: number,
    error?: string
  ) {
    super(grid);
    this.params = { ...params };
    this.success = success;
    this.totalRowCount = totalRowCount;
    this.loadedRowCount = loadedRowCount;
    this.loadTimeMs = loadTimeMs;
    this.error = error;
  }
}

/**
 * Fired before data refresh (reload) - can be canceled
 */
export class BeforeDataRefreshEventArgs extends CancelableGridEventArgs {
  /** Whether this is an auto-refresh from parameter changes */
  readonly isAutoRefresh: boolean;

  constructor(grid: GridComponentRef, isAutoRefresh: boolean) {
    super(grid);
    this.isAutoRefresh = isAutoRefresh;
  }
}

/**
 * Fired after data refresh
 */
export class AfterDataRefreshEventArgs extends GridEventArgs {
  /** Whether the refresh was successful */
  readonly success: boolean;

  /** Total number of rows after refresh */
  readonly totalRowCount: number;

  /** Time taken to refresh in milliseconds */
  readonly loadTimeMs: number;

  constructor(
    grid: GridComponentRef,
    success: boolean,
    totalRowCount: number,
    loadTimeMs: number
  ) {
    super(grid);
    this.success = success;
    this.totalRowCount = totalRowCount;
    this.loadTimeMs = loadTimeMs;
  }
}

// ========================================
// Sorting Events
// ========================================

/**
 * Fired before sort - can be canceled
 */
export class BeforeSortEventArgs extends CancelableGridEventArgs {
  /** The column being sorted */
  readonly column: GridColumnConfig;

  /** The new sort direction */
  readonly direction: 'asc' | 'desc' | 'none';

  /** Whether this is a multi-sort operation (shift+click) */
  readonly isMultiSort: boolean;

  /** Current sort state before change */
  readonly currentSortState: DataGridSortState[];

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    direction: 'asc' | 'desc' | 'none',
    isMultiSort: boolean,
    currentSortState: DataGridSortState[]
  ) {
    super(grid);
    this.column = column;
    this.direction = direction;
    this.isMultiSort = isMultiSort;
    this.currentSortState = [...currentSortState];
  }
}

/**
 * Fired after sort
 */
export class AfterSortEventArgs extends GridEventArgs {
  /** The column that was sorted */
  readonly column: GridColumnConfig;

  /** The new sort direction */
  readonly direction: 'asc' | 'desc' | 'none';

  /** New sort state */
  readonly newSortState: DataGridSortState[];

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    direction: 'asc' | 'desc' | 'none',
    newSortState: DataGridSortState[]
  ) {
    super(grid);
    this.column = column;
    this.direction = direction;
    this.newSortState = [...newSortState];
  }
}

// ========================================
// Column Events
// ========================================

/**
 * Fired before column reorder - can be canceled
 */
export class BeforeColumnReorderEventArgs extends CancelableGridEventArgs {
  /** The column being moved */
  readonly column: GridColumnConfig;

  /** Original index */
  readonly fromIndex: number;

  /** Target index */
  readonly toIndex: number;

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    fromIndex: number,
    toIndex: number
  ) {
    super(grid);
    this.column = column;
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
  }
}

/**
 * Fired after column reorder
 */
export class AfterColumnReorderEventArgs extends GridEventArgs {
  /** The column that was moved */
  readonly column: GridColumnConfig;

  /** Original index */
  readonly fromIndex: number;

  /** New index */
  readonly toIndex: number;

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    fromIndex: number,
    toIndex: number
  ) {
    super(grid);
    this.column = column;
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
  }
}

/**
 * Fired before column resize - can be canceled
 */
export class BeforeColumnResizeEventArgs extends CancelableGridEventArgs {
  /** The column being resized */
  readonly column: GridColumnConfig;

  /** Original width */
  readonly oldWidth: number;

  /** New width */
  readonly newWidth: number;

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    oldWidth: number,
    newWidth: number
  ) {
    super(grid);
    this.column = column;
    this.oldWidth = oldWidth;
    this.newWidth = newWidth;
  }
}

/**
 * Fired after column resize
 */
export class AfterColumnResizeEventArgs extends GridEventArgs {
  /** The column that was resized */
  readonly column: GridColumnConfig;

  /** Original width */
  readonly oldWidth: number;

  /** New width */
  readonly newWidth: number;

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    oldWidth: number,
    newWidth: number
  ) {
    super(grid);
    this.column = column;
    this.oldWidth = oldWidth;
    this.newWidth = newWidth;
  }
}

/**
 * Fired before column visibility change - can be canceled
 */
export class BeforeColumnVisibilityChangeEventArgs extends CancelableGridEventArgs {
  /** The column being shown/hidden */
  readonly column: GridColumnConfig;

  /** New visibility state */
  readonly newVisibility: boolean;

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    newVisibility: boolean
  ) {
    super(grid);
    this.column = column;
    this.newVisibility = newVisibility;
  }
}

/**
 * Fired after column visibility change
 */
export class AfterColumnVisibilityChangeEventArgs extends GridEventArgs {
  /** The column that was shown/hidden */
  readonly column: GridColumnConfig;

  /** New visibility state */
  readonly newVisibility: boolean;

  constructor(
    grid: GridComponentRef,
    column: GridColumnConfig,
    newVisibility: boolean
  ) {
    super(grid);
    this.column = column;
    this.newVisibility = newVisibility;
  }
}
