import { Component, Input, Output, EventEmitter, OnChanges, OnInit, OnDestroy, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import {
  EntityViewMode,
  EntityViewerConfig,
  DEFAULT_VIEWER_CONFIG,
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  CardTemplate,
  GridColumnDef
} from '../types';

/**
 * EntityViewerComponent - Full-featured composite component for viewing entity data
 *
 * This component provides a complete data viewing experience with:
 * - Switchable grid (AG Grid) and card views
 * - Built-in filtering with SQL-style wildcard support
 * - Automatic data loading or pre-loaded data support
 * - Selection handling with configurable behavior
 * - Loading, empty, and error states
 * - Two-way binding support for view mode and filter text
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
 *   [(filterText)]="state.filterText"
 *   [selectedRecordId]="state.selectedRecordId"
 *   (recordSelected)="onRecordSelected($event)"
 *   (recordOpened)="onRecordOpened($event)">
 * </mj-entity-viewer>
 *
 * <!-- With pre-loaded data -->
 * <mj-entity-viewer
 *   [entity]="selectedEntity"
 *   [records]="myRecords"
 *   [config]="{ showFilter: true, defaultViewMode: 'cards' }">
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
   * Custom grid column definitions
   */
  @Input() gridColumns: GridColumnDef[] = [];

  /**
   * Custom card template
   */
  @Input() cardTemplate: CardTemplate | null = null;

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

  private destroy$ = new Subject<void>();
  private filterInput$ = new Subject<string>();

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
   * Get filtered records based on debounced filter text
   * Filters across all visible text fields in the entity, excluding UUIDs and dates
   */
  get filteredRecords(): BaseEntity[] {
    const records = this.displayRecords;
    const filterText = this.debouncedFilterText?.trim().toLowerCase();

    // Clear hidden field matches before filtering
    this.hiddenFieldMatches.clear();

    if (!filterText || !this.entity) {
      return records;
    }

    const visibleFields = this.getVisibleFieldNames();

    return records.filter(record => {
      const matchResult = this.recordMatchesFilter(record, filterText, visibleFields);
      if (matchResult.matches && matchResult.matchedField && !matchResult.matchedInVisibleField) {
        // Track hidden field match
        const recordKey = record.PrimaryKey.ToConcatenatedString();
        this.hiddenFieldMatches.set(recordKey, matchResult.matchedField);
      }
      return matchResult.matches;
    });
  }

  /**
   * Check if a record matches the filter text
   * Searches across all string-compatible fields, excluding UUIDs and dates
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
      // Skip fields that shouldn't be searched
      if (!this.shouldSearchField(field)) continue;

      const value = record.Get(field.Name);
      if (value == null) continue;

      const stringValue = String(value).toLowerCase();
      if (this.matchesSearchTerm(stringValue, filterText)) {
        matchedField = field.Name;
        if (visibleFields.has(field.Name)) {
          matchedInVisibleField = true;
          break; // Found a visible match, no need to continue
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
    // Skip internal MJ fields
    if (field.Name.startsWith('__mj_')) return false;

    // Skip date/time fields
    if (field.TSType === 'Date') return false;

    // Skip UUID/GUID fields
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

    // Handle SQL-style wildcards
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
   * This is used to determine if a match occurred in a hidden field
   */
  private getVisibleFieldNames(): Set<string> {
    const visible = new Set<string>();
    if (!this.entity) return visible;

    // Add fields that are DefaultInView
    for (const field of this.entity.Fields) {
      if (field.DefaultInView === true) {
        visible.add(field.Name);
      }
    }

    // Add the entity's name field if it exists
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
    // Look up the field in entity metadata and use DisplayNameOrName
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

    // Load data if entity is provided and no pre-loaded records
    if (!this.records && this.entity) {
      this.loadData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.applyConfig();
    }

    if (changes['entity']) {
      if (this.entity && !this.records) {
        this.loadData();
      } else if (!this.entity) {
        this.internalRecords = [];
        this.totalRecordCount = 0;
        this.filteredRecordCount = 0;
      }
    }

    if (changes['records'] && this.records) {
      this.internalRecords = this.records;
      this.totalRecordCount = this.records.length;
      this.filteredRecordCount = this.records.length;
    }

    // Handle external filter text changes (from parent component)
    if (changes['filterText']) {
      this.internalFilterText = this.filterText ?? '';
      this.debouncedFilterText = this.filterText ?? '';
      this.updateFilteredCount();
      this.cdr.detectChanges();
    }

    // Handle external view mode changes (from parent component)
    if (changes['viewMode'] && this.viewMode !== null) {
      this.internalViewMode = this.viewMode;
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
    // Only apply default view mode if not externally controlled
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
        this.debouncedFilterText = filterText;
        this.filterTextChange.emit(filterText);
        this.updateFilteredCount();
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

  // ========================================
  // DATA LOADING
  // ========================================

  /**
   * Load data for the current entity
   */
  public async loadData(): Promise<void> {
    if (!this.entity) {
      this.internalRecords = [];
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
      return;
    }

    this.isLoading = true;
    this.loadingMessage = `Loading ${this.entity.Name}...`;
    this.cdr.detectChanges();

    const startTime = Date.now();

    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: this.entity.Name,
        ResultType: 'entity_object',
        MaxRows: this.effectiveConfig.pageSize
      });

      if (result.Success) {
        this.internalRecords = result.Results;
        this.totalRecordCount = result.TotalRowCount;
        this.filteredRecordCount = result.Results.length;

        this.dataLoaded.emit({
          totalRowCount: result.TotalRowCount,
          loadedRowCount: result.Results.length,
          loadTime: Date.now() - startTime,
          records: result.Results
        });
      } else {
        console.error('Failed to load records:', result.ErrorMessage);
        this.internalRecords = [];
        this.totalRecordCount = 0;
        this.filteredRecordCount = 0;
      }
    } catch (error) {
      console.error('Error loading records:', error);
      this.internalRecords = [];
      this.totalRecordCount = 0;
      this.filteredRecordCount = 0;
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Refresh data (re-load from server)
   */
  public refresh(): void {
    if (!this.records) {
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
}
