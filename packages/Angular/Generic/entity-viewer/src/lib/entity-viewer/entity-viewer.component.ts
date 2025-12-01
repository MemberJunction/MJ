import { Component, Input, Output, EventEmitter, OnChanges, OnInit, OnDestroy, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
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
  ViewGridStateConfig,
  GridStateChangedEvent
} from '../types';

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
  selector: 'mj-entity-viewer',
  templateUrl: './entity-viewer.component.html',
  styleUrls: ['./entity-viewer.component.css'],
  host: {
    'style': 'display: block; height: 100%;'
  }
})
export class EntityViewerComponent implements OnInit, OnChanges, OnDestroy {
  // ========================================
  // INPUTS
  // ========================================

  /**
   * The entity to display records for
   */
  @Input() entity: EntityInfo | null = null;

  /**
   * Pre-loaded records (optional - if not provided, component loads data)
   */
  @Input() records: BaseEntity[] | null = null;

  /**
   * Configuration options for the viewer
   */
  @Input() config: Partial<EntityViewerConfig> = {};

  /**
   * Currently selected record ID (primary key string)
   */
  @Input() selectedRecordId: string | null = null;

  /**
   * External view mode - allows parent to control view mode
   * Supports two-way binding: [(viewMode)]="state.viewMode"
   */
  @Input() viewMode: EntityViewMode | null = null;

  /**
   * External filter text - allows parent to control filter
   * Supports two-way binding: [(filterText)]="state.filterText"
   */
  @Input() filterText: string | null = null;

  /**
   * External sort state - allows parent to control sorting
   */
  @Input() sortState: SortState | null = null;

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
  @Input() viewEntity: UserViewEntityExtended | null = null;

  /**
   * Grid state configuration from a User View
   * Controls column visibility, widths, order, and sort settings
   */
  @Input() gridState: ViewGridStateConfig | null = null;

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

  // ========================================
  // INTERNAL STATE
  // ========================================

  public internalViewMode: EntityViewMode = 'grid';
  public internalFilterText: string = '';
  public debouncedFilterText: string = '';
  public isLoading: boolean = false;
  public loadingMessage: string = 'Loading...';
  public internalRecords: BaseEntity[] = [];
  public totalRecordCount: number = 0;
  public filteredRecordCount: number = 0;

  /** Track which records matched on hidden (non-visible) fields */
  public hiddenFieldMatches = new Map<string, string>();

  /** Current sort state */
  public internalSortState: SortState | null = null;

  /** Pagination state */
  public pagination: PaginationState = {
    currentPage: 0,
    pageSize: 100,
    totalRecords: 0,
    hasMore: false,
    isLoading: false
  };

  private destroy$ = new Subject<void>();
  private filterInput$ = new Subject<string>();

  /** Track if this is the first load (vs. load more) */
  private isInitialLoad: boolean = true;

  constructor(private cdr: ChangeDetectorRef) {}

  // ========================================
  // COMPUTED PROPERTIES
  // ========================================

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
   * Get the effective sort state (external or internal)
   */
  get effectiveSortState(): SortState | null {
    return this.sortState ?? this.internalSortState;
  }

  /**
   * Get merged configuration with defaults
   */
  get effectiveConfig(): Required<EntityViewerConfig> {
    return { ...DEFAULT_VIEWER_CONFIG, ...this.config };
  }

  /**
   * Get the records to display (external or internal)
   */
  get displayRecords(): BaseEntity[] {
    return this.records ?? this.internalRecords;
  }

  /**
   * Get filtered records - when using server-side filtering, records are already filtered
   * When using client-side filtering, apply filter locally
   */
  get filteredRecords(): BaseEntity[] {
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
        const recordKey = record.PrimaryKey.ToConcatenatedString();
        this.hiddenFieldMatches.set(recordKey, matchResult.matchedField);
      }
      return matchResult.matches;
    });
  }

  /**
   * Check if a record matches the filter text (client-side)
   */
  private recordMatchesFilter(
    record: BaseEntity,
    filterText: string,
    visibleFields: Set<string>
  ): { matches: boolean; matchedField: string | null; matchedInVisibleField: boolean } {
    if (!this.entity) return { matches: true, matchedField: null, matchedInVisibleField: false };

    let matchedField: string | null = null;
    let matchedInVisibleField = false;

    for (const field of this.entity.Fields) {
      if (!this.shouldSearchField(field)) continue;

      const value = record.Get(field.Name);
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
  public hasHiddenFieldMatch(record: BaseEntity): boolean {
    if (!this.debouncedFilterText) return false;
    return this.hiddenFieldMatches.has(record.PrimaryKey.ToConcatenatedString());
  }

  /**
   * Get the name of the hidden field that matched for display
   */
  public getHiddenMatchFieldName(record: BaseEntity): string {
    const fieldName = this.hiddenFieldMatches.get(record.PrimaryKey.ToConcatenatedString());
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

    // Note: We don't call loadData() here because ngOnChanges runs before ngOnInit
    // and already handles the initial entity binding. Calling loadData() here would
    // result in duplicate data loading (200 records instead of 100).
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.applyConfig();
    }

    if (changes['entity']) {
      if (this.entity && !this.records) {
        // Reset state for new entity - synchronously clear all data and force change detection
        // before starting the async load to prevent stale data display
        this.resetPaginationState();
        this.cdr.detectChanges();
        this.loadData();
      } else if (!this.entity) {
        this.internalRecords = [];
        this.totalRecordCount = 0;
        this.filteredRecordCount = 0;
        this.resetPaginationState();
        this.cdr.detectChanges();
      }
    }

    if (changes['records'] && this.records) {
      this.internalRecords = this.records;
      this.totalRecordCount = this.records.length;
      this.filteredRecordCount = this.records.length;
    }

    // Handle external filter text changes (from parent component)
    if (changes['filterText']) {
      const newFilter = this.filterText ?? '';
      const oldFilter = this.debouncedFilterText;

      this.internalFilterText = newFilter;
      this.debouncedFilterText = newFilter;

      // If server-side filtering and filter changed, reload from page 1
      if (this.effectiveConfig.serverSideFiltering && newFilter !== oldFilter && !this.records) {
        this.resetPaginationState();
        this.loadData();
      } else {
        this.updateFilteredCount();
      }
      this.cdr.detectChanges();
    }

    // Handle external view mode changes
    if (changes['viewMode'] && this.viewMode !== null) {
      this.internalViewMode = this.viewMode;
    }

    // Handle external sort state changes
    if (changes['sortState'] && this.sortState !== null) {
      const oldSort = this.internalSortState;
      this.internalSortState = this.sortState;

      // If sort changed and using server-side sorting, reload
      if (this.effectiveConfig.serverSideSorting && !this.records) {
        const sortChanged = !oldSort || !this.sortState ||
          oldSort.field !== this.sortState.field ||
          oldSort.direction !== this.sortState.direction;

        if (sortChanged) {
          this.resetPaginationState();
          this.loadData();
        }
      }
    }

    // Handle viewEntity changes - reload data when view changes
    if (changes['viewEntity']) {
      if (this.entity && !this.records) {
        // Apply view's sort state if available
        if (this.viewEntity) {
          const viewSortInfo = this.viewEntity.ViewSortInfo;
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
        if (this.effectiveConfig.serverSideFiltering && filterText !== oldFilter && !this.records) {
          this.resetPaginationState();
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
   * Clears all record data and counts to prevent stale data display during entity switches.
   */
  private resetPaginationState(): void {
    this.pagination = {
      currentPage: 0,
      pageSize: this.effectiveConfig.pageSize,
      totalRecords: 0,
      hasMore: false,
      isLoading: false
    };
    this.internalRecords = [];
    this.totalRecordCount = 0;
    this.filteredRecordCount = 0;
    this.isInitialLoad = true;
  }

  // ========================================
  // DATA LOADING
  // ========================================

  /**
   * Load data for the current entity with server-side filtering/sorting/pagination
   */
  public async loadData(): Promise<void> {
    if (!this.entity) {
      this.internalRecords = [];
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
      return;
    }

    // Prevent concurrent loads which can cause duplicate records
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.pagination.isLoading = true;
    this.loadingMessage = this.isInitialLoad
      ? `Loading ${this.entity.Name}...`
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

      const result = await rv.RunView({
        EntityName: this.entity.Name,
        ResultType: 'entity_object',
        MaxRows: config.pageSize,
        StartRow: startRow,
        OrderBy: orderBy,
        ExtraFilter: extraFilter,
        UserSearchString: config.serverSideFiltering ? this.debouncedFilterText || undefined : undefined
      });

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
      } else {
        console.error('Failed to load records:', result.ErrorMessage);
        if (this.isInitialLoad) {
          this.internalRecords = [];
        }
        this.totalRecordCount = 0;
        this.filteredRecordCount = 0;
      }
    } catch (error) {
      console.error('Error loading records:', error);
      if (this.isInitialLoad) {
        this.internalRecords = [];
      }
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
    } finally {
      this.isLoading = false;
      this.pagination.isLoading = false;
      this.isInitialLoad = false;
      this.cdr.detectChanges();
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
   */
  public refresh(): void {
    if (!this.records) {
      this.resetPaginationState();
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
    if (this.effectiveConfig.serverSideSorting && !this.records) {
      const sortChanged = !oldSort || !event.sort ||
        oldSort.field !== event.sort?.field ||
        oldSort.direction !== event.sort?.direction;

      if (sortChanged) {
        this.resetPaginationState();
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
}
