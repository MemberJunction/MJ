import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo, EntityFieldTSType, RunView, RunViewParams, Metadata, CompositeKey } from '@memberjunction/core';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { buildCompositeKey, buildPkString, computeFieldsList } from '../utils/record.util';
import { TimelineGroup, TimeSegmentGrouping, TimelineSortOrder, AfterEventClickArgs } from '@memberjunction/ng-timeline';
import {
  EntityViewMode,
  EntityViewerConfig,
  DEFAULT_VIEWER_CONFIG,
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  CardTemplate,
  GridColumnDef,
  SortState,
  SortChangedEvent,
  PaginationState,
  ViewGridState,
  GridStateChangedEvent,
  TimelineSegmentGrouping,
  TimelineOrientation,
  TimelineState
} from '../types';
import {
  AfterRowClickEventArgs,
  AfterRowDoubleClickEventArgs,
  AfterSortEventArgs
} from '../entity-data-grid/events/grid-events';
import { GridToolbarConfig, GridSelectionMode, ForeignKeyClickEvent } from '../entity-data-grid/models/grid-types';
import { EntityDataGridComponent } from '../entity-data-grid/entity-data-grid.component';

/**
 * EntityViewerComponent - Full-featured composite component for viewing entity data
 *
 * This component provides a complete data viewing experience with:
 * - Switchable grid (AG Grid) and card views
 * - Server-side filtering with UserSearchString
 * - Server-side pagination with StartRow/MaxRows
 * - Server-side sorting with OrderBy
 * - Selection handling with configurable behavior
 * - Loading, empty, and error states
 * - Beautiful pagination UI with "Load More" pattern
 *
 * @example
 * ```html
 * <!-- Basic usage - loads data automatically -->
 * <mj-entity-viewer
 *   [entity]="selectedEntity"
 *   (recordSelected)="onRecordSelected($event)"
 *   (recordOpened)="onRecordOpened($event)">
 * </mj-entity-viewer>
 *
 * <!-- With external state control (like Data Explorer) -->
 * <mj-entity-viewer
 *   [entity]="selectedEntity"
 *   [(viewMode)]="state.viewMode"
 *   [filterText]="state.filterText"
 *   [selectedRecordId]="state.selectedRecordId"
 *   (recordSelected)="onRecordSelected($event)"
 *   (recordOpened)="onRecordOpened($event)"
 *   (sortChanged)="onSortChanged($event)">
 * </mj-entity-viewer>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-entity-viewer',
  templateUrl: './entity-viewer.component.html',
  styleUrls: ['./entity-viewer.component.css'],
  host: {
    'style': 'display: block; height: 100%;'
  }
})
export class EntityViewerComponent implements OnInit, OnDestroy {
  // ========================================
  // INPUTS (using getter/setter pattern)
  // ========================================

  private _entity: EntityInfo | null = null;
  private _records: Record<string, unknown>[] | null = null;
  private _config: Partial<EntityViewerConfig> = {};
  private _viewMode: EntityViewMode | null = null;
  private _filterText: string | null = null;
  private _sortState: SortState | null = null;
  private _viewEntity: MJUserViewEntityExtended | null = null;
  private _timelineConfig: TimelineState | null = null;
  private _initialized = false;

  /**
   * The entity to display records for
   */
  @Input()
  get entity(): EntityInfo | null {
    return this._entity;
  }
  set entity(value: EntityInfo | null) {
    this._entity = value;

    // Detect date fields for timeline support
    this.detectDateFields();

    if (this._initialized) {
      if (value && !this._records) {
        // Reset state for new entity - synchronously clear all data and force change detection
        // before starting the async load to prevent stale data display
        this.resetPaginationState();
        this.cdr.detectChanges();
        this.loadData();
      } else if (!value) {
        this.internalRecords = [];
        this.totalRecordCount = 0;
        this.filteredRecordCount = 0;
        this.resetPaginationState();
        this.cdr.detectChanges();
      }
    }
  }

  /**
   * Pre-loaded records (optional - if not provided, component loads data)
   */
  @Input()
  get records(): Record<string, unknown>[] | null {
    return this._records;
  }
  set records(value: Record<string, unknown>[] | null) {
    this._records = value;

    if (value) {
      this.internalRecords = value;
      this.totalRecordCount = value.length;
      this.filteredRecordCount = value.length;
      // Update timeline with new records
      this.updateTimelineGroups();
    }
  }

  /**
   * Configuration options for the viewer
   */
  @Input()
  get config(): Partial<EntityViewerConfig> {
    return this._config;
  }
  set config(value: Partial<EntityViewerConfig>) {
    this._config = value;
    this.applyConfig();
  }

  /**
   * Currently selected record ID (primary key string)
   */
  @Input() selectedRecordId: string | null = null;

  /**
   * External view mode - allows parent to control view mode
   * Supports two-way binding: [(viewMode)]="state.viewMode"
   */
  @Input()
  get viewMode(): EntityViewMode | null {
    return this._viewMode;
  }
  set viewMode(value: EntityViewMode | null) {
    this._viewMode = value;
    if (value !== null) {
      this.internalViewMode = value;
    }
  }

  /**
   * External filter text - allows parent to control filter
   * Supports two-way binding: [(filterText)]="state.filterText"
   */
  @Input()
  get filterText(): string | null {
    return this._filterText;
  }
  set filterText(value: string | null) {
    const oldFilter = this.debouncedFilterText;
    this._filterText = value;

    const newFilter = value ?? '';
    this.internalFilterText = newFilter;
    this.debouncedFilterText = newFilter;

    if (this._initialized) {
      // If server-side filtering and filter changed, reload from page 1
      // Keep existing records visible during refresh for better UX
      if (this.effectiveConfig.serverSideFiltering && newFilter !== oldFilter && !this._records) {
        this.resetPaginationState(false);
        this.loadData();
      } else {
        this.updateFilteredCount();
      }
      this.cdr.detectChanges();
    }
  }

  /**
   * External sort state - allows parent to control sorting
   */
  @Input()
  get sortState(): SortState | null {
    return this._sortState;
  }
  set sortState(value: SortState | null) {
    const oldSort = this.internalSortState;
    this._sortState = value;

    if (value !== null) {
      this.internalSortState = value;

      if (this._initialized) {
        // If sort changed and using server-side sorting, reload
        // Keep existing records visible during refresh for better UX
        if (this.effectiveConfig.serverSideSorting && !this._records) {
          const sortChanged = !oldSort || !value ||
            oldSort.field !== value.field ||
            oldSort.direction !== value.direction;

          if (sortChanged) {
            this.resetPaginationState(false);
            this.loadData();
          }
        }
      }
    }
  }

  /**
   * Custom grid column definitions
   */
  @Input() gridColumns: GridColumnDef[] = [];

  /**
   * Custom card template
   */
  @Input() cardTemplate: CardTemplate | null = null;

  /**
   * Optional User View entity that provides view configuration
   * When provided, the component will use the view's WhereClause, GridState, SortState, etc.
   * The view's filter is additive - UserSearchString is applied ON TOP of the view's WhereClause
   */
  @Input()
  get viewEntity(): MJUserViewEntityExtended | null {
    return this._viewEntity;
  }
  set viewEntity(value: MJUserViewEntityExtended | null) {
    this._viewEntity = value;

    if (this._initialized && this._entity && !this._records) {
      // Apply view's sort state if available
      if (value) {
        const viewSortInfo = value.ViewSortInfo;
        if (viewSortInfo && viewSortInfo.length > 0) {
          this.internalSortState = {
            field: viewSortInfo[0].field,
            direction: viewSortInfo[0].direction === 'Desc' ? 'desc' : 'asc'
          };
        }
      }
      this.resetPaginationState();
      this.loadData();
    }
  }

  /**
   * Grid state configuration from a User View
   * Controls column visibility, widths, order, and sort settings
   */
  @Input() gridState: ViewGridState | null = null;

  /**
   * Timeline configuration state
   * Controls which date field is used and segment grouping
   */
  @Input()
  get timelineConfig(): TimelineState | null {
    return this._timelineConfig;
  }
  set timelineConfig(value: TimelineState | null) {
    const prev = this._timelineConfig;
    // Compare by value, not reference
    const isEqual = (prev === null && value === null) ||
      (prev !== null && value !== null &&
        prev.dateFieldName === value.dateFieldName &&
        prev.sortOrder === value.sortOrder &&
        prev.orientation === value.orientation &&
        prev.segmentGrouping === value.segmentGrouping);

    if (!isEqual) {
      this._timelineConfig = value;
      if (value && this._entity) {
        this.configureTimeline();
        this.cdr.markForCheck();
      }
    }
  }

  /**
   * Whether to show the grid toolbar.
   * When false, the grid is displayed without its own toolbar - useful when
   * entity-viewer provides its own filter/actions in the header.
   * @default false
   */
  @Input() showGridToolbar: boolean = false;

  /**
   * Grid toolbar configuration - controls which buttons are shown and their behavior
   * When not provided, uses sensible defaults
   */
  @Input() gridToolbarConfig: Partial<GridToolbarConfig> | null = null;

  /**
   * Grid selection mode
   * @default 'single'
   */
  @Input() gridSelectionMode: GridSelectionMode = 'single';

  /**
   * Show the "Add to List" button in the grid toolbar.
   * Requires gridSelectionMode to be 'multiple' for best UX.
   * @default false
   */
  @Input() showAddToListButton: boolean = false;

  // ========================================
  // OUTPUTS
  // ========================================

  /**
   * Emitted when a record is selected (single click)
   */
  @Output() recordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when a record should be opened (double-click or open button)
   */
  @Output() recordOpened = new EventEmitter<RecordOpenedEvent>();

  /**
   * Emitted when data is loaded
   */
  @Output() dataLoaded = new EventEmitter<DataLoadedEvent>();

  /**
   * Emitted when the view mode changes (for two-way binding)
   */
  @Output() viewModeChange = new EventEmitter<EntityViewMode>();

  /**
   * Emitted when filter text changes (for two-way binding)
   */
  @Output() filterTextChange = new EventEmitter<string>();

  /**
   * Emitted when filtered count changes
   */
  @Output() filteredCountChanged = new EventEmitter<FilteredCountChangedEvent>();

  /**
   * Emitted when sort state changes
   */
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();

  /**
   * Emitted when grid state changes (column resize, reorder, etc.)
   */
  @Output() gridStateChanged = new EventEmitter<GridStateChangedEvent>();

  /**
   * Emitted when timeline configuration changes (date field, grouping, etc.)
   */
  @Output() timelineConfigChange = new EventEmitter<TimelineState>();

  /**
   * Emitted when the Add/New button is clicked in the grid toolbar
   */
  @Output() addRequested = new EventEmitter<void>();

  /**
   * Emitted when the Delete button is clicked in the grid toolbar
   * Includes the selected records to be deleted
   */
  @Output() deleteRequested = new EventEmitter<{ records: Record<string, unknown>[] }>();

  /**
   * Emitted when the Refresh button is clicked in the grid toolbar
   */
  @Output() refreshRequested = new EventEmitter<void>();

  /**
   * Emitted when the Export button is clicked in the grid toolbar
   */
  @Output() exportRequested = new EventEmitter<{ format: 'excel' | 'csv' | 'json' }>();

  /**
   * Emitted when the Add to List button is clicked in the grid toolbar.
   * Parent components should handle this to show the list management dialog.
   */
  @Output() addToListRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: Record<string, unknown>[];
    recordIds: string[];
  }>();

  /**
   * Emitted when grid selection changes.
   * Parent components can use this to track selected records for their own toolbar buttons.
   */
  @Output() selectionChanged = new EventEmitter<{
    records: Record<string, unknown>[];
    recordIds: string[];
  }>();

  // ========================================
  // INTERNAL STATE
  // ========================================

  public internalViewMode: EntityViewMode = 'grid';
  public internalFilterText: string = '';
  public debouncedFilterText: string = '';
  public isLoading: boolean = false;
  public loadingMessage: string = 'Loading...';
  public internalRecords: Record<string, unknown>[] = [];
  public totalRecordCount: number = 0;
  public filteredRecordCount: number = 0;

  /** Track which records matched on hidden (non-visible) fields */
  public hiddenFieldMatches = new Map<string, string>();

  /** Current sort state */
  public internalSortState: SortState | null = null;

  /** Cached grid params to avoid recreating object on every change detection */
  private _cachedGridParams: RunViewParams | null = null;
  private _lastGridParamsEntity: string | null = null;
  private _lastGridParamsViewEntity: MJUserViewEntityExtended | null = null;

  /** Pagination state */
  public pagination: PaginationState = {
    currentPage: 0,
    pageSize: 100,
    totalRecords: 0,
    hasMore: false,
    isLoading: false
  };

  // ========================================
  // TIMELINE STATE
  // ========================================

  /** Whether the current entity has date fields available for timeline view */
  public hasDateFields: boolean = false;

  /** Available date fields from the entity (sorted by priority) */
  public availableDateFields: EntityFieldInfo[] = [];

  /** Timeline groups configuration for the timeline component */
  get timelineGroups(): TimelineGroup<Record<string, unknown>>[] {
    return this._timelineGroups;
  }
  set timelineGroups(value: TimelineGroup<Record<string, unknown>>[]) {
    const prev = this._timelineGroups;
    this._timelineGroups = value;

    // Detect meaningful changes to trigger refresh in child timeline component
    const hasChanged = prev !== value ||
      (prev.length > 0 && value.length > 0 &&
        (prev[0].EntityObjects !== value[0]?.EntityObjects ||
         prev[0].DateFieldName !== value[0]?.DateFieldName));

    if (hasChanged) {
      // Force change detection to propagate to child timeline component
      this.cdr.markForCheck();
    }
  }
  private _timelineGroups: TimelineGroup<Record<string, unknown>>[] = [];

  /** Timeline sort order */
  public timelineSortOrder: TimelineSortOrder = 'desc';

  /** Timeline segment grouping */
  public timelineSegmentGrouping: TimeSegmentGrouping = 'month';

  /** Timeline orientation (vertical or horizontal) */
  public timelineOrientation: TimelineOrientation = 'vertical';

  /** Currently selected date field for timeline */
  public selectedTimelineDateField: string | null = null;

  private destroy$ = new Subject<void>();
  private filterInput$ = new Subject<string>();

  /** Track if this is the first load (vs. load more) */
  private isInitialLoad: boolean = true;

  /** Reference to the data grid component for flushing pending changes */
  @ViewChild(EntityDataGridComponent) private dataGridRef: EntityDataGridComponent | undefined;

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  // ========================================
  // PUBLIC METHODS
  // ========================================

  /**
   * Ensures any pending grid state changes are saved immediately without waiting for debounce.
   * Call this before switching views or entities to ensure changes are saved.
   */
  public EnsurePendingChangesSaved(): void {
    this.dataGridRef?.EnsurePendingChangesSaved();
  }

  // ========================================
  // COMPUTED PROPERTIES
  // ========================================

  /**
   * Get the effective entity - uses entity input if provided, otherwise derives from viewEntity
   * This allows callers to provide just a viewEntity without explicitly setting the entity input.
   * Uses fallback resolution when ViewEntityInfo is not available.
   */
  get effectiveEntity(): EntityInfo | null {
    if (this.entity) {
      return this.entity;
    }
    // Auto-derive from viewEntity if available
    if (this.viewEntity) {
      return this.getEntityInfoFromViewEntity(this.viewEntity);
    }
    return null;
  }

  /**
   * Gets EntityInfo from a ViewEntity with multiple fallback strategies.
   * Priority: 1) ViewEntityInfo property (set by Load)
   *           2) Entity name lookup (virtual field)
   *           3) EntityID lookup
   * Returns null if entity cannot be determined.
   */
  private getEntityInfoFromViewEntity(viewEntity: MJUserViewEntityExtended): EntityInfo | null {
    // First try: ViewEntityInfo is the preferred source (set by MJUserViewEntityExtended.Load)
    if (viewEntity.ViewEntityInfo) {
      return viewEntity.ViewEntityInfo;
    }

    const md = new Metadata();

    // Second try: Look up by Entity name (virtual field that returns entity name)
    if (viewEntity.Entity) {
      const entityByName = md.Entities.find(e => e.Name === viewEntity.Entity);
      if (entityByName) {
        return entityByName;
      }
    }

    // Third try: Look up by EntityID
    if (viewEntity.EntityID) {
      const entityById = md.Entities.find(e => e.ID === viewEntity.EntityID);
      if (entityById) {
        return entityById;
      }
    }

    console.warn(`[EntityViewer] Could not determine entity for view "${viewEntity.Name}" (ID: ${viewEntity.ID})`);
    return null;
  }

  /**
   * Get the effective view mode (external or internal)
   */
  get effectiveViewMode(): EntityViewMode {
    return this.viewMode ?? this.internalViewMode;
  }

  /**
   * Get the effective filter text (external or internal)
   */
  get effectiveFilterText(): string {
    return this.filterText ?? this.internalFilterText;
  }

  /**
   * Get the raw ID value from selectedRecordId for timeline selection.
   * The selectedRecordId is in composite key format (e.g., "ID|abc-123" or "ID=abc-123"),
   * but the timeline stores just the raw ID value.
   */
  get timelineSelectedEventId(): string | null {
    if (!this.selectedRecordId) return null;

    // Handle "ID|value" format (pipe separator)
    if (this.selectedRecordId.includes('|')) {
      const parts = this.selectedRecordId.split('|');
      return parts.length > 1 ? parts[1] : this.selectedRecordId;
    }

    // Handle "ID=value" format (equals separator)
    if (this.selectedRecordId.includes('=')) {
      const parts = this.selectedRecordId.split('=');
      return parts.length > 1 ? parts[1] : this.selectedRecordId;
    }

    // Return as-is if no separator found
    return this.selectedRecordId;
  }

  /**
   * Get the effective sort state (external or internal)
   */
  get effectiveSortState(): SortState | null {
    return this.sortState ?? this.internalSortState;
  }

  /**
   * Get the OrderBy string for mj-entity-data-grid from the effective sort state
   */
  get effectiveSortOrderBy(): string {
    const sortState = this.effectiveSortState;
    if (!sortState?.field || !sortState.direction) {
      return '';
    }
    return `${sortState.field} ${sortState.direction.toUpperCase()}`;
  }

  /**
   * Get merged configuration with defaults
   */
  get effectiveConfig(): Required<EntityViewerConfig> {
    return { ...DEFAULT_VIEWER_CONFIG, ...this.config };
  }

  /**
   * Get cached grid params - only recreates object when entity or viewEntity changes
   * This prevents Angular from seeing a new object reference on every change detection
   * which would cause the grid to reinitialize
   */
  get gridParams(): RunViewParams | null {
    const entity = this.effectiveEntity;
    if (!entity) {
      return null;
    }

    // Check if we need to recreate the params object
    const entityChanged = this._lastGridParamsEntity !== entity.Name;
    const viewEntityChanged = this._lastGridParamsViewEntity !== this.viewEntity;

    if (entityChanged || viewEntityChanged || !this._cachedGridParams) {
      this._lastGridParamsEntity = entity.Name;
      this._lastGridParamsViewEntity = this.viewEntity ?? null;
      this._cachedGridParams = {
        EntityName: entity.Name,
        ViewEntity: this.viewEntity || undefined
      };
    }

    return this._cachedGridParams;
  }

  /**
   * Get the effective grid toolbar configuration
   * Merges user-provided config with defaults appropriate for entity-viewer context
   */
  get effectiveGridToolbarConfig(): GridToolbarConfig {
    const defaults: GridToolbarConfig = {
      showSearch: false, // Entity-viewer has its own filter
      showRefresh: true,
      showAdd: true,
      showDelete: true,
      showExport: true,
      showColumnChooser: true,
      showRowCount: true,
      showSelectionCount: true
    };
    return { ...defaults, ...this.gridToolbarConfig };
  }

  /**
   * Get the records to display (external or internal)
   */
  get displayRecords(): Record<string, unknown>[] {
    return this.records ?? this.internalRecords;
  }

  /**
   * Get filtered records - when using server-side filtering, records are already filtered
   * When using client-side filtering, apply filter locally
   */
  get filteredRecords(): Record<string, unknown>[] {
    const records = this.displayRecords;

    // If server-side filtering is enabled, records are already filtered
    if (this.effectiveConfig.serverSideFiltering) {
      return records;
    }

    // Client-side filtering fallback
    const filterText = this.debouncedFilterText?.trim().toLowerCase();
    this.hiddenFieldMatches.clear();

    if (!filterText || !this.entity) {
      return records;
    }

    const visibleFields = this.getVisibleFieldNames();

    return records.filter(record => {
      const matchResult = this.recordMatchesFilter(record, filterText, visibleFields);
      if (matchResult.matches && matchResult.matchedField && !matchResult.matchedInVisibleField) {
        const recordKey = buildPkString(record, this.entity!);
        this.hiddenFieldMatches.set(recordKey, matchResult.matchedField);
      }
      return matchResult.matches;
    });
  }

  /**
   * Check if a record matches the filter text (client-side)
   */
  private recordMatchesFilter(
    record: Record<string, unknown>,
    filterText: string,
    visibleFields: Set<string>
  ): { matches: boolean; matchedField: string | null; matchedInVisibleField: boolean } {
    if (!this.entity) return { matches: true, matchedField: null, matchedInVisibleField: false };

    let matchedField: string | null = null;
    let matchedInVisibleField = false;

    for (const field of this.entity.Fields) {
      if (!this.shouldSearchField(field)) continue;

      const value = record[field.Name];
      if (value == null) continue;

      const stringValue = String(value).toLowerCase();
      if (this.matchesSearchTerm(stringValue, filterText)) {
        matchedField = field.Name;
        if (visibleFields.has(field.Name)) {
          matchedInVisibleField = true;
          break;
        }
      }
    }

    return {
      matches: matchedField !== null,
      matchedField,
      matchedInVisibleField
    };
  }

  /**
   * Determine if a field should be included in search
   */
  private shouldSearchField(field: EntityFieldInfo): boolean {
    if (field.Name.startsWith('__mj_')) return false;
    if (field.TSType === 'Date') return false;
    if (field.SQLFullType?.trim().toLowerCase() === 'uniqueidentifier') return false;
    return true;
  }

  /**
   * Check if a value matches the search term (supports SQL-style % wildcards)
   */
  private matchesSearchTerm(value: string, searchTerm: string): boolean {
    if (!searchTerm.includes('%')) {
      return value.includes(searchTerm);
    }

    const fragments = searchTerm.split('%').filter(s => s.length > 0);
    if (fragments.length === 0) return true;

    let searchStartIndex = 0;
    for (const fragment of fragments) {
      const foundIndex = value.indexOf(fragment, searchStartIndex);
      if (foundIndex === -1) return false;
      searchStartIndex = foundIndex + fragment.length;
    }
    return true;
  }

  /**
   * Get set of field names that are visible in the current view
   */
  private getVisibleFieldNames(): Set<string> {
    const visible = new Set<string>();
    if (!this.entity) return visible;

    for (const field of this.entity.Fields) {
      if (field.DefaultInView === true) {
        visible.add(field.Name);
      }
    }

    if (this.entity.NameField) {
      visible.add(this.entity.NameField.Name);
    }

    return visible;
  }

  /**
   * Check if a record matched on a hidden field
   */
  public hasHiddenFieldMatch(record: Record<string, unknown>): boolean {
    if (!this.debouncedFilterText || !this.entity) return false;
    return this.hiddenFieldMatches.has(buildPkString(record, this.entity));
  }

  /**
   * Get the name of the hidden field that matched for display
   */
  public getHiddenMatchFieldName(record: Record<string, unknown>): string {
    if (!this.entity) return '';
    const fieldName = this.hiddenFieldMatches.get(buildPkString(record, this.entity));
    if (!fieldName || !this.entity) return '';
    const field = this.entity.Fields.find(f => f.Name === fieldName);
    return field ? field.DisplayNameOrName : fieldName;
  }

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================

  ngOnInit(): void {
    this.applyConfig();
    this.setupFilterDebounce();

    // Initialize debounced filter from external filter text if provided
    if (this.filterText !== null) {
      this.debouncedFilterText = this.filterText;
    }

    // Initialize sort state from config
    if (this.effectiveConfig.defaultSortField) {
      this.internalSortState = {
        field: this.effectiveConfig.defaultSortField,
        direction: this.effectiveConfig.defaultSortDirection ?? 'asc'
      };
    }

    // Mark as initialized - setters will now trigger data loading
    this._initialized = true;

    // If entity was set before initialization, load data now
    if (this._entity && !this._records) {
      this.loadData();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========================================
  // CONFIGURATION
  // ========================================

  private applyConfig(): void {
    const config = this.effectiveConfig;
    this.pagination.pageSize = config.pageSize;

    if (this.viewMode === null) {
      this.internalViewMode = config.defaultViewMode;
    }
  }

  private setupFilterDebounce(): void {
    this.filterInput$
      .pipe(
        debounceTime(this.effectiveConfig.filterDebounceMs),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(filterText => {
        const oldFilter = this.debouncedFilterText;
        this.debouncedFilterText = filterText;
        this.filterTextChange.emit(filterText);

        // If server-side filtering and filter changed, reload from page 1
        // Keep existing records visible during refresh for better UX
        if (this.effectiveConfig.serverSideFiltering && filterText !== oldFilter && !this.records) {
          this.resetPaginationState(false);
          this.loadData();
        } else {
          this.updateFilteredCount();
        }
        this.cdr.detectChanges();
      });
  }

  /**
   * Update the filtered record count and emit event
   */
  private updateFilteredCount(): void {
    const newCount = this.filteredRecords.length;
    if (this.filteredRecordCount !== newCount) {
      this.filteredRecordCount = newCount;
      this.filteredCountChanged.emit({
        filteredCount: newCount,
        totalCount: this.totalRecordCount
      });
    }
  }

  /**
   * Reset pagination state for a fresh load.
   * When clearRecords is true (default), clears all record data - use for entity switches.
   * When clearRecords is false, keeps existing records visible during refresh - use for sort/filter changes.
   */
  private resetPaginationState(clearRecords: boolean = true): void {
    this.pagination = {
      currentPage: 0,
      pageSize: this.effectiveConfig.pageSize,
      totalRecords: clearRecords ? 0 : this.pagination.totalRecords,
      hasMore: false,
      isLoading: false
    };
    if (clearRecords) {
      this.internalRecords = [];
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
    }
    this.isInitialLoad = true;
  }

  // ========================================
  // DATA LOADING
  // ========================================

  // Sequence counter for tracking load requests and detecting stale responses
  private _loadSequence = 0;
  // Flag to indicate a reload is pending (requested while another load was in progress)
  private _pendingReload = false;

  /**
   * Load data for the current entity with server-side filtering/sorting/pagination
   */
  public async loadData(): Promise<void> {
    const entity = this.effectiveEntity;
    if (!entity) {
      this.internalRecords = [];
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
      return;
    }

    // Increment sequence to track this load request
    const loadId = ++this._loadSequence;

    // If a load is already in progress, mark that we need to reload when it completes
    // This handles the case where view/filter changes occur during an active load
    if (this.isLoading) {
      this._pendingReload = true;
      return;
    }

    this.isLoading = true;
    this.pagination.isLoading = true;
    this.loadingMessage = this.isInitialLoad
      ? `Loading ${entity.Name}...`
      : 'Loading more records...';
    this.cdr.detectChanges();

    const startTime = Date.now();
    const config = this.effectiveConfig;

    try {
      const rv = new RunView();

      // Build OrderBy clause
      // Priority: 1) External sort state 2) View's OrderByClause 3) undefined
      let orderBy: string | undefined;
      const sortState = this.effectiveSortState;
      if (config.serverSideSorting && sortState?.field && sortState.direction) {
        orderBy = `${sortState.field} ${sortState.direction.toUpperCase()}`;
      } else if (this.viewEntity?.OrderByClause) {
        orderBy = this.viewEntity.OrderByClause;
      }

      // Calculate StartRow for pagination
      const startRow = this.pagination.currentPage * config.pageSize;

      // Build ExtraFilter from view's WhereClause if available
      // The view's WhereClause is the "business filter" - UserSearchString is additive
      const extraFilter = this.viewEntity?.WhereClause || undefined;

      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entity.Name,
        ResultType: 'simple',
        Fields: computeFieldsList(entity, this.gridState),
        MaxRows: config.pageSize,
        StartRow: startRow,
        OrderBy: orderBy,
        ExtraFilter: extraFilter,
        // Only use UserSearchString for regular text search, NOT for smart filters
        // Smart filters generate WhereClause via AI on the server, so the prompt text should not be passed as UserSearchString
        UserSearchString: config.serverSideFiltering && !this.viewEntity?.SmartFilterEnabled
          ? this.debouncedFilterText || undefined
          : undefined
      });

      // Check if this load is still the current one (detect stale responses)
      if (loadId !== this._loadSequence) {
        return;
      }

      if (result.Success) {

        // Append or replace records based on whether this is initial load
        if (this.isInitialLoad) {
          this.internalRecords = result.Results;
        } else {
          this.internalRecords = [...this.internalRecords, ...result.Results];
        }

        this.totalRecordCount = result.TotalRowCount;
        this.filteredRecordCount = this.internalRecords.length;

        // Update pagination state
        this.pagination.totalRecords = result.TotalRowCount;
        this.pagination.hasMore = this.internalRecords.length < result.TotalRowCount;

        this.dataLoaded.emit({
          totalRowCount: result.TotalRowCount,
          loadedRowCount: this.internalRecords.length,
          loadTime: Date.now() - startTime,
          records: this.internalRecords
        });

        this.filteredCountChanged.emit({
          filteredCount: this.internalRecords.length,
          totalCount: result.TotalRowCount
        });

        // Update timeline groups with new data
        this.updateTimelineGroups();
      } else {
        if (this.isInitialLoad) {
          this.internalRecords = [];
        }
        this.totalRecordCount = 0;
        this.filteredRecordCount = 0;
      }
    } catch (error) {
      if (this.isInitialLoad) {
        this.internalRecords = [];
      }
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
    } finally {
      // Use ngZone.run() to ensure state changes trigger change detection.
      // With es2022 native async/await + zone.js 0.16, the await resumes
      // outside Angular's zone, so detectChanges() alone may not flush properly.
      this.ngZone.run(() => {
        this.isLoading = false;
        this.pagination.isLoading = false;
        this.isInitialLoad = false;
        this.cdr.detectChanges();
      });

      // If a reload was requested while we were loading, trigger it now
      if (this._pendingReload) {
        this._pendingReload = false;
        this.resetPaginationState();
        // Use setTimeout to break the call stack and allow Angular to process
        setTimeout(() => this.loadData(), 0);
      }
    }
  }

  /**
   * Load more records (next page)
   */
  public loadMore(): void {
    if (this.pagination.isLoading || !this.pagination.hasMore) {
      return;
    }

    this.pagination.currentPage++;
    this.loadData();
  }

  /**
   * Refresh data (re-load from server, starting at page 1)
   * Keeps existing records visible during refresh for better UX
   */
  public refresh(): void {
    if (!this.records) {
      this.resetPaginationState(false);
      this.loadData();
    }
  }

  // ========================================
  // VIEW MODE
  // ========================================

  /**
   * Set the view mode and emit change event
   */
  setViewMode(mode: EntityViewMode): void {
    if (this.effectiveViewMode !== mode) {
      this.internalViewMode = mode;
      this.viewModeChange.emit(mode);
      this.cdr.detectChanges();
    }
  }

  // ========================================
  // FILTERING
  // ========================================

  /**
   * Handle filter input change
   */
  onFilterChange(value: string): void {
    this.internalFilterText = value;
    this.filterInput$.next(value);
  }

  /**
   * Clear the filter
   */
  clearFilter(): void {
    this.internalFilterText = '';
    this.filterInput$.next('');
    this.cdr.detectChanges();
  }

  // ========================================
  // SORTING
  // ========================================

  /**
   * Handle sort change from grid component
   */
  onSortChanged(event: SortChangedEvent): void {
    const oldSort = this.internalSortState;
    this.internalSortState = event.sort;
    this.sortChanged.emit(event);

    // If server-side sorting, reload from page 1
    // Keep existing records visible during refresh for better UX
    if (this.effectiveConfig.serverSideSorting && !this.records) {
      const sortChanged = !oldSort || !event.sort ||
        oldSort.field !== event.sort?.field ||
        oldSort.direction !== event.sort?.direction;

      if (sortChanged) {
        this.resetPaginationState(false);
        this.loadData();
      }
    }
  }

  // ========================================
  // EVENT HANDLERS
  // ========================================

  /**
   * Handle record selection from child components (grid or cards)
   */
  onRecordSelected(event: RecordSelectedEvent): void {
    this.recordSelected.emit(event);
  }

  /**
   * Handle record opened from child components (grid or cards)
   */
  onRecordOpened(event: RecordOpenedEvent): void {
    this.recordOpened.emit(event);
  }

  /**
   * Handle grid state changes (column resize, reorder, etc.)
   */
  onGridStateChanged(event: GridStateChangedEvent): void {
    this.gridStateChanged.emit(event);
  }

  /**
   * Handle load more from pagination component
   */
  onLoadMore(): void {
    this.loadMore();
  }

  // ========================================
  // DATA GRID EVENT HANDLERS
  // ========================================

  /**
   * Handle row click from mj-entity-data-grid
   * Maps to recordSelected event for parent components
   */
  onDataGridRowClick(event: AfterRowClickEventArgs): void {
    const entity = this.effectiveEntity;
    if (!entity || !event.row) return;

    this.recordSelected.emit({
      record: event.row,
      entity: entity,
      compositeKey: buildCompositeKey(event.row, entity)
    });
  }

  /**
   * Handle row double-click from mj-entity-data-grid
   * Maps to recordOpened event for parent components
   */
  onDataGridRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
    const entity = this.effectiveEntity;
    if (!entity || !event.row) return;

    this.recordOpened.emit({
      record: event.row,
      entity: entity,
      compositeKey: buildCompositeKey(event.row, entity)
    });
  }

  /**
   * Handle sort changed from mj-entity-data-grid
   * Maps to sortChanged event for parent components
   */
  onDataGridSortChanged(event: AfterSortEventArgs): void {
    // Convert the data grid's sort state to our SortState format
    const newSort: SortState | null = event.newSortState && event.newSortState.length > 0
      ? {
          field: event.newSortState[0].field,
          direction: event.newSortState[0].direction
        }
      : null;

    this.internalSortState = newSort;
    this.sortChanged.emit({ sort: newSort });

    // If server-side sorting, reload from page 1
    // Keep existing records visible during refresh for better UX
    if (this.effectiveConfig.serverSideSorting && !this.records) {
      this.resetPaginationState(false);
      this.loadData();
    }
  }

  /**
   * Handle foreign key link click from mj-entity-data-grid
   * Bubbles the event up for parent components to handle navigation
   */
  /**
   * Handle foreign key link click from mj-entity-data-grid
   * Converts to recordOpened event for seamless navigation integration
   */
  onForeignKeyClick(event: ForeignKeyClickEvent): void {
    // Look up the related entity by name
    const md = new Metadata();
    const relatedEntity = event.relatedEntityName
      ? md.Entities.find(e => e.Name === event.relatedEntityName)
      : md.Entities.find(e => e.ID === event.relatedEntityId);

    if (!relatedEntity) {
      return;
    }

    // Create composite key from the FK value using the static factory method
    const compositeKey = CompositeKey.FromID(event.recordId);

    // Emit recordOpened for the related entity (record is undefined since it's not loaded)
    this.recordOpened.emit({
      entity: relatedEntity,
      compositeKey
    });
  }

  /**
   * Handle Add/New button click from data grid toolbar
   */
  onGridAddRequested(): void {
    this.addRequested.emit();
  }

  /**
   * Handle Refresh button click from data grid toolbar
   */
  onGridRefreshRequested(): void {
    this.refreshRequested.emit();
    // Also trigger an internal refresh
    this.refresh();
  }

  /**
   * Handle Delete button click from data grid toolbar
   */
  onGridDeleteRequested(records: Record<string, unknown>[]): void {
    this.deleteRequested.emit({ records });
  }

  /**
   * Handle Export button click from data grid toolbar
   */
  onGridExportRequested(): void {
    this.exportRequested.emit({ format: 'excel' });
  }

  /**
   * Handle Add to List button click from data grid toolbar.
   * Forwards the event to parent components for list management.
   */
  onGridAddToListRequested(event: { entityInfo: EntityInfo; records: Record<string, unknown>[]; recordIds: string[] }): void {
    this.addToListRequested.emit(event);
  }

  /**
   * Handle selection change from data grid.
   * Converts selected keys to records and forwards to parent components.
   */
  onGridSelectionChange(selectedKeys: string[]): void {
    const entity = this.effectiveEntity;
    if (!entity) return;

    // Find the actual records from our filtered records
    const records = this.filteredRecords.filter(record => {
      const key = buildPkString(record, entity);
      return selectedKeys.includes(key);
    });

    // Get the raw primary key values for list management
    const recordIds = records.map(record =>
      String(record[entity.PrimaryKeys[0].Name])
    );

    this.selectionChanged.emit({ records, recordIds });
  }

  // ========================================
  // TIMELINE METHODS
  // ========================================

  /**
   * Handle timeline event click - emit as record selection
   */
  onTimelineEventClick(event: AfterEventClickArgs): void {
    const record = event.event.entity as Record<string, unknown>;
    const entity = this.effectiveEntity;
    if (record && entity) {
      this.recordSelected.emit({
        record,
        entity: entity,
        compositeKey: buildCompositeKey(record, entity)
      });
    }
  }

  /**
   * Toggle timeline orientation between vertical and horizontal
   */
  toggleTimelineOrientation(): void {
    this.timelineOrientation = this.timelineOrientation === 'vertical' ? 'horizontal' : 'vertical';

    // Emit config change so parent can persist the preference
    this.emitTimelineConfigChange();
    this.cdr.detectChanges();
  }

  /**
   * Toggle timeline sort order between newest first (desc) and oldest first (asc)
   */
  toggleTimelineSortOrder(): void {
    this.timelineSortOrder = this.timelineSortOrder === 'desc' ? 'asc' : 'desc';

    // Emit config change so parent can persist the preference
    this.emitTimelineConfigChange();
    this.cdr.detectChanges();
  }

  /**
   * Change the date field used for the timeline
   */
  setTimelineDateField(fieldName: string): void {
    if (this.availableDateFields.some(f => f.Name === fieldName)) {
      this.selectedTimelineDateField = fieldName;
      this.updateTimelineGroups();
      this.emitTimelineConfigChange();
      this.cdr.detectChanges();
    }
  }

  /**
   * Get the display name of the currently selected timeline date field
   */
  get selectedDateFieldDisplayName(): string {
    if (!this.selectedTimelineDateField) return '';
    const field = this.availableDateFields.find(f => f.Name === this.selectedTimelineDateField);
    return field?.DisplayNameOrName || this.selectedTimelineDateField;
  }

  /**
   * Emit the current timeline configuration for persistence
   */
  private emitTimelineConfigChange(): void {
    if (this.selectedTimelineDateField) {
      this.timelineConfigChange.emit({
        dateFieldName: this.selectedTimelineDateField,
        sortOrder: this.timelineSortOrder,
        segmentGrouping: this.timelineSegmentGrouping as TimelineSegmentGrouping,
        orientation: this.timelineOrientation
      });
    }
  }

  /**
   * Detect and configure timeline based on entity's date fields
   * Called when entity changes
   */
  private detectDateFields(): void {
    if (!this.entity) {
      this.hasDateFields = false;
      this.availableDateFields = [];
      this.timelineGroups = [];
      this.fallbackFromTimelineIfNeeded();
      return;
    }

    // Find all date fields - include __mj_CreatedAt and __mj_UpdatedAt as they're useful for timelines
    const dateFields = this.entity.Fields.filter(
      f => f.TSType === EntityFieldTSType.Date
    );

    if (dateFields.length === 0) {
      this.hasDateFields = false;
      this.availableDateFields = [];
      this.timelineGroups = [];
      this.fallbackFromTimelineIfNeeded();
      return;
    }

    // Sort by priority: DefaultInView date fields first (by Sequence), then others (by Sequence)
    this.availableDateFields = this.sortDateFieldsByPriority(dateFields);
    this.hasDateFields = true;

    // Configure timeline with the best date field
    this.configureTimeline();
  }

  /**
   * If currently on timeline view but timeline is no longer available,
   * fall back to grid view
   */
  private fallbackFromTimelineIfNeeded(): void {
    if (this.effectiveViewMode === 'timeline' && !this.hasDateFields) {
      this.setViewMode('grid');
    }
  }

  /**
   * Sort date fields by priority:
   * 1. DefaultInView=true fields, sorted by Sequence (lowest first)
   * 2. Other date fields, sorted by Sequence (lowest first)
   */
  private sortDateFieldsByPriority(dateFields: EntityFieldInfo[]): EntityFieldInfo[] {
    const defaultInView = dateFields.filter(f => f.DefaultInView).sort((a, b) => a.Sequence - b.Sequence);
    const others = dateFields.filter(f => !f.DefaultInView).sort((a, b) => a.Sequence - b.Sequence);
    return [...defaultInView, ...others];
  }

  /**
   * Configure the timeline with the current date field and records
   */
  private configureTimeline(): void {
    if (!this.entity || !this.hasDateFields || this.availableDateFields.length === 0) {
      this.timelineGroups = [];
      return;
    }

    // Determine which date field to use
    const dateFieldName = this.getEffectiveTimelineDateField();
    this.selectedTimelineDateField = dateFieldName;

    // Apply timeline config if provided
    if (this.timelineConfig) {
      this.timelineSortOrder = (this.timelineConfig.sortOrder || 'desc') as TimelineSortOrder;
      this.timelineSegmentGrouping = (this.timelineConfig.segmentGrouping || 'month') as TimeSegmentGrouping;
      this.timelineOrientation = this.timelineConfig.orientation || 'vertical';
    }

    // Create a timeline group for the current entity's data
    this.updateTimelineGroups();
  }

  /**
   * Get the effective date field to use for timeline
   * Priority: timelineConfig > first available date field
   */
  private getEffectiveTimelineDateField(): string {
    // If we have a config with a specific date field, use it if valid
    if (this.timelineConfig?.dateFieldName) {
      const configField = this.availableDateFields.find(f => f.Name === this.timelineConfig!.dateFieldName);
      if (configField) {
        return configField.Name;
      }
    }

    // Otherwise use the first available date field (already sorted by priority)
    return this.availableDateFields[0].Name;
  }

  /**
   * Update timeline groups with current records
   * Called when records change
   */
  private updateTimelineGroups(): void {
    if (!this.entity || !this.selectedTimelineDateField) {
      this.timelineGroups = [];
      return;
    }

    // Find title field - prefer NameField, then first string field with DefaultInView
    const titleField = this.findTitleField();

    // Create a single group for the current data
    const group = new TimelineGroup<Record<string, unknown>>();
    group.DataSourceType = 'array';
    group.EntityObjects = this.filteredRecords;
    group.TitleFieldName = titleField;
    group.DateFieldName = this.selectedTimelineDateField;
    group.IdFieldName = 'ID';
    group.GroupLabel = this.entity.Name;

    // Find a suitable description field
    const descField = this.findDescriptionField();
    if (descField) {
      group.DescriptionFieldName = descField;
    }

    // Find a suitable subtitle field
    const subtitleField = this.findSubtitleField(titleField);
    if (subtitleField) {
      group.SubtitleFieldName = subtitleField;
    }

    // Configure card display
    group.CardConfig = {
      collapsible: true,
      defaultExpanded: false,
      showDate: true,
      dateFormat: 'MMM d, yyyy h:mm a'
    };

    this.timelineGroups = [group];
  }

  /**
   * Find the best field to use as the title
   */
  private findTitleField(): string {
    if (!this.entity) return 'ID';

    // Prefer the entity's NameField
    if (this.entity.NameField) {
      return this.entity.NameField.Name;
    }

    // Look for common name patterns in DefaultInView string fields
    const stringFields = this.entity.Fields.filter(
      f => f.TSType === EntityFieldTSType.String && f.DefaultInView && !f.Name.startsWith('__mj_')
    ).sort((a, b) => a.Sequence - b.Sequence);

    const namePatterns = ['name', 'title', 'subject', 'label'];
    for (const pattern of namePatterns) {
      const match = stringFields.find(f => f.Name.toLowerCase().includes(pattern));
      if (match) return match.Name;
    }

    // Fall back to first string field
    return stringFields.length > 0 ? stringFields[0].Name : 'ID';
  }

  /**
   * Find a suitable description field
   */
  private findDescriptionField(): string | null {
    if (!this.entity) return null;

    // Look for common description patterns
    const descPatterns = ['description', 'notes', 'summary', 'content', 'body', 'details'];
    const textFields = this.entity.Fields.filter(
      f => (f.TSType === EntityFieldTSType.String) && !f.Name.startsWith('__mj_')
    );

    for (const pattern of descPatterns) {
      const match = textFields.find(f => f.Name.toLowerCase().includes(pattern));
      if (match) return match.Name;
    }

    return null;
  }

  /**
   * Find a suitable subtitle field (different from title)
   */
  private findSubtitleField(excludeField: string): string | null {
    if (!this.entity) return null;

    // Look for status, type, category, or other short classification fields
    const patterns = ['status', 'type', 'category', 'state', 'priority'];
    const fields = this.entity.Fields.filter(
      f => f.TSType === EntityFieldTSType.String &&
           f.DefaultInView &&
           f.Name !== excludeField &&
           !f.Name.startsWith('__mj_')
    ).sort((a, b) => a.Sequence - b.Sequence);

    for (const pattern of patterns) {
      const match = fields.find(f => f.Name.toLowerCase().includes(pattern));
      if (match) return match.Name;
    }

    // Use the first string field that's not the title field
    const firstOther = fields.find(f => f.Name !== excludeField);
    return firstOther?.Name || null;
  }
}

