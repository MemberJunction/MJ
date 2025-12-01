import { EntityInfo, CompositeKey } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';

/**
 * View modes supported by the EntityViewer component
 */
export type EntityViewMode = 'grid' | 'cards';

/**
 * Behavior when a record is selected
 */
export type RecordSelectionBehavior =
  | 'emit-only'      // Only emit the recordSelected event
  | 'show-detail'    // Show the detail panel (if available)
  | 'emit-and-detail'; // Both emit event and show detail panel

/**
 * Field display type for smart rendering in cards
 */
export type CardFieldType = 'number' | 'boolean' | 'text' | 'date';

/**
 * Color categories for status pills based on semantic meaning
 */
export type PillColorType = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Metadata for a field to display in a card
 */
export interface CardDisplayField {
  /** Field name from the entity */
  name: string;
  /** Display type for rendering */
  type: CardFieldType;
  /** Human-readable label */
  label: string;
}

/**
 * Auto-generated card template based on entity metadata
 */
export interface CardTemplate {
  /** Primary title field name */
  titleField: string;
  /** Secondary subtitle field name */
  subtitleField: string | null;
  /** Description/notes field name */
  descriptionField: string | null;
  /** Display fields with type information for smart rendering */
  displayFields: CardDisplayField[];
  /**
   * Array of thumbnail field names in priority order
   * Per-record fallback: if the first field is empty, try the next, etc.
   */
  thumbnailFields: string[];
  /** Badge/priority field name */
  badgeField: string | null;
}

/**
 * Column definition for the grid view
 */
export interface GridColumnDef {
  /** Field name from the entity */
  field: string;
  /** Column header text */
  headerName: string;
  /** Column width in pixels */
  width?: number;
  /** Minimum column width */
  minWidth?: number;
  /** Maximum column width */
  maxWidth?: number;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Whether column is filterable */
  filter?: boolean;
  /** Whether column is resizable */
  resizable?: boolean;
  /** Whether to hide this column */
  hide?: boolean;
  /** Custom cell renderer type */
  cellRenderer?: string;
  /** Value formatter function name */
  valueFormatter?: string;
}

/**
 * Event emitted when a record is selected (clicked)
 */
export interface RecordSelectedEvent {
  /** The selected entity record */
  record: BaseEntity;
  /** The entity metadata */
  entity: EntityInfo;
  /** The composite key of the record */
  compositeKey: CompositeKey;
}

/**
 * Event emitted when a record should be opened (double-click or open button)
 */
export interface RecordOpenedEvent {
  /** The entity record to open */
  record: BaseEntity;
  /** The entity metadata */
  entity: EntityInfo;
  /** The composite key of the record */
  compositeKey: CompositeKey;
}

/**
 * Event emitted when data is loaded
 */
export interface DataLoadedEvent {
  /** Total number of records available */
  totalRowCount: number;
  /** Number of records currently loaded */
  loadedRowCount: number;
  /** Time taken to load in milliseconds */
  loadTime: number;
  /** The loaded records - allows parent to access records for state restoration */
  records: BaseEntity[];
}

/**
 * Event emitted when filtered count changes
 */
export interface FilteredCountChangedEvent {
  /** Number of records after filtering */
  filteredCount: number;
  /** Total number of records before filtering */
  totalCount: number;
}

/**
 * Sort direction for server-side sorting
 */
export type SortDirection = 'asc' | 'desc' | null;

/**
 * Sort state for a column
 */
export interface SortState {
  /** Field name to sort by */
  field: string;
  /** Sort direction */
  direction: SortDirection;
}

/**
 * Event emitted when sort changes in the grid
 */
export interface SortChangedEvent {
  /** The new sort state (null if no sorting) */
  sort: SortState | null;
}

/**
 * Pagination state for server-side paging
 */
export interface PaginationState {
  /** Current page number (0-based) */
  currentPage: number;
  /** Number of records per page */
  pageSize: number;
  /** Total number of records available (from server) */
  totalRecords: number;
  /** Whether there are more records to load */
  hasMore: boolean;
  /** Whether data is currently being loaded */
  isLoading: boolean;
}

/**
 * Event emitted when pagination changes
 */
export interface PaginationChangedEvent {
  /** The new pagination state */
  pagination: PaginationState;
}

/**
 * Event emitted when requesting to load more data
 */
export interface LoadMoreEvent {
  /** Current page being requested (0-based) */
  page: number;
  /** Page size */
  pageSize: number;
}

/**
 * Column configuration from a User View's GridState
 * Matches the format stored in UserView.GridState JSON
 */
export interface ViewColumnConfig {
  /** Entity field ID */
  ID?: string;
  /** Field name */
  Name: string;
  /** Display name for column header */
  DisplayName?: string;
  /** Whether the column is hidden */
  hidden?: boolean;
  /** Column width in pixels */
  width?: number;
  /** Column order index */
  orderIndex?: number;
}

/**
 * Sort configuration from a User View's GridState
 * Matches the format stored in UserView.GridState.sortSettings
 */
export interface ViewSortConfig {
  /** Field name to sort by */
  field: string;
  /** Sort direction - 'asc' or 'desc' */
  dir: 'asc' | 'desc';
}

/**
 * Grid state configuration from a User View
 * Matches the JSON structure stored in UserView.GridState
 */
export interface ViewGridStateConfig {
  /** Column visibility, width, and order settings */
  columnSettings?: ViewColumnConfig[];
  /** Sort settings */
  sortSettings?: ViewSortConfig[];
  /** Filter settings (Kendo format) */
  filter?: object;
}

/**
 * Event emitted when grid state changes (column resize, reorder, etc.)
 */
export interface GridStateChangedEvent {
  /** The updated grid state */
  gridState: ViewGridStateConfig;
  /** What changed: 'columns', 'sort', 'filter' */
  changeType: 'columns' | 'sort' | 'filter';
}

/**
 * Configuration options for the EntityViewer component
 */
export interface EntityViewerConfig {
  /**
   * Whether to show the filter input box
   * @default true
   */
  showFilter?: boolean;

  /**
   * Whether to show the view mode toggle (grid/cards)
   * @default true
   */
  showViewModeToggle?: boolean;

  /**
   * Behavior when a record is selected
   * @default 'emit-only'
   */
  selectionBehavior?: RecordSelectionBehavior;

  /**
   * Initial view mode
   * @default 'grid'
   */
  defaultViewMode?: EntityViewMode;

  /**
   * Whether to enable multi-select
   * @default false
   */
  enableMultiSelect?: boolean;

  /**
   * Maximum number of records to load per page
   * @default 100
   */
  pageSize?: number;

  /**
   * Whether to show record count in header
   * @default true
   */
  showRecordCount?: boolean;

  /**
   * Placeholder text for the filter input
   * @default 'Filter records...'
   */
  filterPlaceholder?: string;

  /**
   * Debounce time for filter input in milliseconds
   * @default 250
   */
  filterDebounceMs?: number;

  /**
   * Custom grid column definitions (optional - auto-generated if not provided)
   */
  gridColumns?: GridColumnDef[];

  /**
   * Custom card template (optional - auto-generated if not provided)
   */
  cardTemplate?: CardTemplate;

  /**
   * Height of the component (CSS value)
   * @default '100%'
   */
  height?: string;

  /**
   * Whether to use server-side filtering via UserSearchString
   * When true, filter text is sent to the server for SQL-based filtering
   * When false, filtering is done client-side on loaded records
   * @default true
   */
  serverSideFiltering?: boolean;

  /**
   * Whether to use server-side sorting via OrderBy
   * When true, sort changes trigger a new server request
   * When false, sorting is done client-side by AG Grid
   * @default true
   */
  serverSideSorting?: boolean;

  /**
   * Whether to show pagination controls
   * @default true
   */
  showPagination?: boolean;

  /**
   * Default sort field when loading data
   */
  defaultSortField?: string;

  /**
   * Default sort direction when loading data
   * @default 'asc'
   */
  defaultSortDirection?: SortDirection;
}

/**
 * Default configuration values
 */
export const DEFAULT_VIEWER_CONFIG: Required<EntityViewerConfig> = {
  showFilter: true,
  showViewModeToggle: true,
  selectionBehavior: 'emit-only',
  defaultViewMode: 'grid',
  enableMultiSelect: false,
  pageSize: 100,
  showRecordCount: true,
  filterPlaceholder: 'Filter records...',
  filterDebounceMs: 250,
  gridColumns: [],
  cardTemplate: {
    titleField: '',
    subtitleField: null,
    descriptionField: null,
    displayFields: [],
    thumbnailFields: [],
    badgeField: null
  },
  height: '100%',
  serverSideFiltering: true,
  serverSideSorting: true,
  showPagination: true,
  defaultSortField: '',
  defaultSortDirection: 'asc'
};
