import { TemplateRef } from '@angular/core';

// Re-export shared types from the main types file to avoid duplication
// These are used by both EntityGridComponent and EntityDataGridComponent
export {
  SortDirection,
  SortState,
  GridStateChangedEvent,
  // View grid types - re-exported from types.ts which gets them from core-entities
  ViewGridColumnSetting,
  ViewGridSortSetting,
  ViewGridState
} from '../../types';

// ========================================
// Enums and Union Types
// ========================================

/**
 * Selection mode for the grid
 * - 'none': No selection allowed
 * - 'single': Only one row can be selected at a time
 * - 'multiple': Multiple rows can be selected (click to toggle)
 * - 'checkbox': Checkbox column for selection
 */
export type GridSelectionMode = 'none' | 'single' | 'multiple' | 'checkbox';

/**
 * Edit mode for the grid
 * - 'none': No editing allowed
 * - 'cell': Individual cell editing
 * - 'row': Full row editing
 * - 'batch': Batch editing with explicit save
 */
export type GridEditMode = 'none' | 'cell' | 'row' | 'batch';

/**
 * Grid lines display mode
 */
export type GridLinesMode = 'none' | 'horizontal' | 'vertical' | 'both';

/**
 * Filter operators for column filtering
 */
export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startswith' | 'endswith'
  | 'isnull' | 'isnotnull'
  | 'in' | 'notin';

/**
 * Column data type for formatting and editing
 */
export type GridColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'percent'
  | 'custom';

// ========================================
// Column Configuration
// ========================================

/**
 * Configuration for a single grid column
 */
export interface GridColumnConfig {
  /** Field name on the entity */
  field: string;

  /** Display title (defaults to field name) */
  title?: string;

  /** Column width in pixels (or 'auto') */
  width?: number | 'auto';

  /** Minimum width for resizing */
  minWidth?: number;

  /** Maximum width for resizing */
  maxWidth?: number;

  /** Column is visible */
  visible?: boolean;

  /** Column is sortable */
  sortable?: boolean;

  /** Column is filterable */
  filterable?: boolean;

  /** Column is editable */
  editable?: boolean;

  /** Column is resizable */
  resizable?: boolean;

  /** Column is reorderable */
  reorderable?: boolean;

  /** Data type for formatting and editing */
  type?: GridColumnType;

  /** Format string (e.g., 'yyyy-MM-dd' for dates, '#,##0.00' for numbers) */
  format?: string;

  /** Text alignment */
  align?: 'left' | 'center' | 'right';

  /** Header alignment (defaults to align) */
  headerAlign?: 'left' | 'center' | 'right';

  /** CSS class for cells - can be string or function */
  cellClass?: string | ((row: Record<string, unknown>, column: GridColumnConfig) => string);

  /** CSS class for header */
  headerClass?: string;

  /** Custom cell template reference */
  cellTemplate?: TemplateRef<GridCellTemplateContext>;

  /** Custom header template reference */
  headerTemplate?: TemplateRef<GridHeaderTemplateContext>;

  /** Custom editor template reference */
  editorTemplate?: TemplateRef<GridEditorTemplateContext>;

  /** Cell value formatter function */
  formatter?: (value: unknown, row: Record<string, unknown>, column: GridColumnConfig) => string;

  /** Cell style function */
  cellStyle?: (row: Record<string, unknown>, column: GridColumnConfig) => Record<string, string>;

  /** Whether to show tooltip on hover */
  showTooltip?: boolean;

  /** Custom tooltip content */
  tooltip?: string | ((row: Record<string, unknown>, column: GridColumnConfig) => string);

  /** Frozen column position (alias for pinned, for backward compatibility) */
  frozen?: 'left' | 'right' | false;

  /** Column pinning position (AG Grid terminology) */
  pinned?: 'left' | 'right' | null;

  /** Flex grow factor for auto-sizing columns */
  flex?: number;

  /** Column group (for grouped headers) */
  group?: string;

  /** Filter options for dropdown filters */
  filterOptions?: Array<{ value: unknown; label: string }>;

  /** Sort order index (for default multi-sort) */
  sortIndex?: number;

  /** Sort direction (for default sort) */
  sortDirection?: 'asc' | 'desc';
}

/**
 * Context provided to custom cell templates
 */
export interface GridCellTemplateContext {
  /** The row data (entity) */
  row: Record<string, unknown>;
  /** Column configuration */
  column: GridColumnConfig;
  /** The cell value */
  value: unknown;
  /** Row index in the current view */
  rowIndex: number;
  /** Whether the cell is currently being edited */
  isEditing: boolean;
}

/**
 * Context provided to custom header templates
 */
export interface GridHeaderTemplateContext {
  /** Column configuration */
  column: GridColumnConfig;
  /** Current sort direction for this column */
  sortDirection: 'asc' | 'desc' | 'none';
  /** Current filter value for this column */
  filterValue: unknown;
}

/**
 * Context provided to custom editor templates
 */
export interface GridEditorTemplateContext {
  /** The row data (entity) */
  row: Record<string, unknown>;
  /** Column configuration */
  column: GridColumnConfig;
  /** Current cell value */
  value: unknown;
  /** Row index in the current view */
  rowIndex: number;
  /** Function to commit the edit with a new value */
  commitEdit: (newValue: unknown) => void;
  /** Function to cancel the edit */
  cancelEdit: () => void;
}

// ========================================
// Toolbar Configuration
// ========================================

/**
 * Configuration for the grid toolbar
 */
export interface GridToolbarConfig {
  /** Show search input */
  showSearch?: boolean;

  /** Search placeholder text */
  searchPlaceholder?: string;

  /** Search debounce time in ms */
  searchDebounce?: number;

  /** Show refresh button */
  showRefresh?: boolean;

  /** Show add button */
  showAdd?: boolean;

  /** Show delete button (for selected rows) */
  showDelete?: boolean;

  /** Show export button */
  showExport?: boolean;

  /** Export formats available */
  exportFormats?: Array<'excel' | 'csv' | 'json'>;

  /** Show column chooser button */
  showColumnChooser?: boolean;

  /** Show filter toggle button */
  showFilterToggle?: boolean;

  /** Custom toolbar buttons */
  customButtons?: GridToolbarButton[];

  /** Toolbar position */
  position?: 'top' | 'bottom' | 'both';

  /** Show row count */
  showRowCount?: boolean;

  /** Show selection count */
  showSelectionCount?: boolean;
}

/**
 * Custom toolbar button configuration
 */
export interface GridToolbarButton {
  /** Unique button ID */
  id: string;

  /** Button text */
  text?: string;

  /** Button icon (Font Awesome class) */
  icon?: string;

  /** Button tooltip */
  tooltip?: string;

  /** Button is disabled - can be boolean or function */
  disabled?: boolean | (() => boolean);

  /** Button is visible - can be boolean or function */
  visible?: boolean | (() => boolean);

  /** Button CSS class */
  cssClass?: string;

  /** Button position: 'left' | 'right' */
  position?: 'left' | 'right';

  /** Click handler (if not using event) */
  onClick?: () => void;
}

// ========================================
// State Types (Extended for EntityDataGrid)
// ========================================

/**
 * Extended sort state with multi-sort index
 * Extends the base SortState from types.ts with an index for multi-sort ordering
 */
export interface DataGridSortState {
  /** Field name being sorted */
  field: string;
  /** Sort direction */
  direction: 'asc' | 'desc';
  /** Index for multi-sort ordering */
  index: number;
}

/**
 * Filter state for a column
 */
export interface FilterState {
  /** Field name being filtered */
  field: string;
  /** Filter operator */
  operator: FilterOperator;
  /** Filter value */
  value: unknown;
}

/**
 * Pending change for batch editing
 */
export interface PendingChange {
  /** Row key (usually ID) */
  rowKey: string;
  /** The row entity */
  row: Record<string, unknown>;
  /** Field that was changed */
  field: string;
  /** Original value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
  /** Type of change */
  changeType: 'update' | 'insert' | 'delete';
}

/**
 * Complete grid state for persistence (internal to EntityDataGrid)
 * Note: For UserView persistence, use ViewGridState from @memberjunction/core-entities
 */
export interface GridState {
  /** Column states */
  columns: Array<{
    field: string;
    width: number;
    visible: boolean;
    order: number;
    /** Column pinning position */
    pinned?: 'left' | 'right' | null;
    /** Flex grow factor for auto-sizing */
    flex?: number;
    /** Minimum column width */
    minWidth?: number;
    /** Maximum column width */
    maxWidth?: number;
  }>;
  /** Sort state */
  sort: DataGridSortState[];
  /** Filter state */
  filters: FilterState[];
  /** Selected row keys */
  selection: string[];
}

/**
 * Export options for grid data
 */
export interface ExportOptions {
  /** Export only visible columns */
  visibleColumnsOnly?: boolean;

  /** Export only selected rows */
  selectedRowsOnly?: boolean;

  /** Include headers */
  includeHeaders?: boolean;

  /** Custom column mapping */
  columnMapping?: Record<string, string>;
}

// ========================================
// Event Types
// ========================================

/**
 * Event emitted when a foreign key link is clicked in the grid.
 * The parent component should handle navigation to the related record.
 */
export interface ForeignKeyClickEvent {
  /** The ID of the related entity (from EntityFieldInfo.RelatedEntityID) */
  relatedEntityId: string;
  /** The ID of the related record (the FK value) */
  recordId: string;
  /** The field name that was clicked */
  fieldName: string;
  /** The entity name of the related entity (if available) */
  relatedEntityName?: string;
}

// ========================================
// Internal Types
// ========================================

/**
 * Internal representation of a rendered row
 */
export interface GridRowData {
  /** Row key (usually ID) */
  key: string;
  /** Row index in the data array */
  index: number;
  /** The entity object */
  entity: Record<string, unknown>;
  /** Whether the row is selected */
  selected: boolean;
  /** Whether the row is being edited */
  editing: boolean;
  /** Whether the row has unsaved changes */
  dirty: boolean;
  /** CSS classes for the row */
  cssClasses: string[];
}

/**
 * Virtual scroll viewport info
 */
export interface VirtualScrollState {
  /** First visible row index */
  startIndex: number;
  /** Last visible row index */
  endIndex: number;
  /** Scroll offset from top */
  scrollTop: number;
  /** Total scroll height */
  totalHeight: number;
  /** Viewport height */
  viewportHeight: number;
  /** Number of buffer rows above and below */
  bufferSize: number;
}

/**
 * Column runtime state (internal)
 */
export interface ColumnRuntimeState {
  /** Column configuration */
  config: GridColumnConfig;
  /** Computed width */
  computedWidth: number;
  /** Current sort direction */
  sortDirection: 'asc' | 'desc' | 'none';
  /** Sort index for multi-sort */
  sortIndex: number;
  /** Current filter value */
  filterValue: unknown;
  /** Current visibility */
  visible: boolean;
  /** Current order/position */
  order: number;
}

/**
 * RunView parameters subset for data loading
 */
export interface GridRunViewParams {
  /** Entity name */
  entityName: string;
  /** Extra filter clause */
  extraFilter?: string;
  /** Order by clause */
  orderBy?: string;
  /** Maximum rows to fetch */
  maxRows?: number;
  /** Fields to retrieve */
  fields?: string[];
  /** User search string */
  searchString?: string;
}

// ========================================
// Entity Action Types
// ========================================

/**
 * Configuration for an entity action displayed in the grid toolbar.
 * This is a simplified representation of EntityAction for the UI layer.
 */
export interface EntityActionConfig {
  /** Unique action ID */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional icon (Font Awesome class) */
  icon?: string;
  /** Whether the action requires selected records */
  requiresSelection?: boolean;
  /** Minimum number of selected records required */
  minSelectedRecords?: number;
  /** Maximum number of selected records allowed */
  maxSelectedRecords?: number;
  /** Invocation type (e.g., 'View', 'SingleRecord', 'MultiRecord') */
  invocationType?: string;
  /** Additional action metadata */
  metadata?: Record<string, unknown>;
}

// ========================================
// Visual Customization Types
// ========================================

/**
 * Header style preset options
 */
export type GridHeaderStyle = 'flat' | 'elevated' | 'gradient' | 'bold';

/**
 * Configuration for grid visual appearance
 * All properties are optional - defaults provide an attractive "out of the box" experience
 */
export interface GridVisualConfig {
  // Header Styling
  /** Header style preset: 'flat' | 'elevated' | 'gradient' | 'bold' */
  headerStyle?: GridHeaderStyle;
  /** Custom header background color (overrides preset) */
  headerBackground?: string;
  /** Custom header text color */
  headerTextColor?: string;
  /** Show bottom shadow/border on header */
  headerShadow?: boolean;

  // Row Styling
  /** Enable alternating row colors (zebra striping) */
  alternateRows?: boolean;
  /** Contrast level for alternating rows: 'subtle' | 'medium' | 'strong' */
  alternateRowContrast?: 'subtle' | 'medium' | 'strong';
  /** Enable smooth hover transitions */
  hoverTransitions?: boolean;
  /** Hover transition duration in ms */
  hoverTransitionDuration?: number;

  // Cell Formatting
  /** Right-align numeric columns automatically */
  rightAlignNumbers?: boolean;
  /** Format dates with a friendly format (e.g., "Jan 15, 2024" instead of "2024-01-15") */
  friendlyDates?: boolean;
  /** Render email cells as clickable mailto links */
  clickableEmails?: boolean;
  /** Render boolean cells as checkmark/x icons instead of text */
  booleanIcons?: boolean;
  /** Render URL cells as clickable links */
  clickableUrls?: boolean;

  // Selection Styling
  /** Color for selection indicator (left border on selected rows) */
  selectionIndicatorColor?: string;
  /** Width of selection indicator in pixels */
  selectionIndicatorWidth?: number;
  /** Selection background color */
  selectionBackground?: string;

  // Checkbox Column
  /** Style for checkbox column: 'default' | 'rounded' | 'filled' */
  checkboxStyle?: 'default' | 'rounded' | 'filled';
  /** Checkbox accent color */
  checkboxColor?: string;

  // Loading States
  /** Show skeleton loading rows instead of spinner */
  skeletonLoading?: boolean;
  /** Number of skeleton rows to show */
  skeletonRowCount?: number;

  // Borders & Spacing
  /** Border radius for the grid container */
  borderRadius?: number;
  /** Cell padding preset: 'compact' | 'normal' | 'comfortable' */
  cellPadding?: 'compact' | 'normal' | 'comfortable';

  // Accent Color (used for sort indicators, focus states, etc.)
  /** Primary accent color for interactive elements */
  accentColor?: string;
}

/**
 * Default visual configuration - provides attractive defaults out of the box
 */
export const DEFAULT_VISUAL_CONFIG: Required<GridVisualConfig> = {
  // Header - elevated style with shadow
  headerStyle: 'elevated',
  headerBackground: '',  // Empty = use CSS variable
  headerTextColor: '',   // Empty = use CSS variable
  headerShadow: true,

  // Rows - medium contrast zebra striping with transitions
  alternateRows: true,
  alternateRowContrast: 'medium',
  hoverTransitions: true,
  hoverTransitionDuration: 150,

  // Cell formatting - smart defaults
  rightAlignNumbers: true,
  friendlyDates: true,
  clickableEmails: true,
  booleanIcons: true,
  clickableUrls: true,

  // Selection - mellow yellow accent (avoids conflict with blue hyperlinks)
  selectionIndicatorColor: '#f9a825',
  selectionIndicatorWidth: 3,
  selectionBackground: '#fff9e6',

  // Checkbox - rounded style
  checkboxStyle: 'rounded',
  checkboxColor: '#2196F3',

  // Loading - skeleton for modern feel
  skeletonLoading: true,
  skeletonRowCount: 8,

  // Borders & Spacing
  borderRadius: 0,
  cellPadding: 'normal',

  // Accent color
  accentColor: '#2196F3'
};
