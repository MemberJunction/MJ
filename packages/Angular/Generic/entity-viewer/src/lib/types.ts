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
  /** Image/thumbnail field name */
  thumbnailField: string | null;
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
   * @default 1000
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
  pageSize: 1000,
  showRecordCount: true,
  filterPlaceholder: 'Filter records...',
  filterDebounceMs: 250,
  gridColumns: [],
  cardTemplate: {
    titleField: '',
    subtitleField: null,
    descriptionField: null,
    displayFields: [],
    thumbnailField: null,
    badgeField: null
  },
  height: '100%'
};
