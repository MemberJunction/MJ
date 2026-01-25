import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { BaseEntity, RunView, RunViewParams, Metadata, EntityInfo, EntityFieldInfo, AggregateResult, AggregateValue, AggregateExpression } from '@memberjunction/core';
import { UserViewEntityExtended, ViewInfo, ViewGridState, UserViewEngine, UserInfoEngine, ColumnFormat, ColumnTextStyle, ViewGridAggregatesConfig, ViewGridAggregate } from '@memberjunction/core-entities';
import {
  ColDef,
  GridReadyEvent,
  RowClickedEvent,
  GridApi,
  RowDoubleClickedEvent,
  ModuleRegistry,
  AllCommunityModule,
  RowSelectionOptions,
  GetRowIdParams,
  themeAlpine,
  SortChangedEvent as AgSortChangedEvent,
  ColumnResizedEvent,
  ColumnMovedEvent,
  SelectionChangedEvent,
  CellClickedEvent,
  ICellRendererParams,
  IDatasource,
  IGetRowsParams,
  GridOptions
} from 'ag-grid-community';
// Use the existing HighlightUtil from entity-viewer package
import { HighlightUtil } from '../utils/highlight.util';
import {
  GridSelectionMode,
  GridEditMode,
  GridLinesMode,
  GridColumnConfig,
  GridToolbarConfig,
  GridToolbarButton,
  DataGridSortState,
  FilterState,
  PendingChange,
  GridState,
  GridRowData,
  ColumnRuntimeState,
  GridRunViewParams,
  ViewGridStateConfig,
  ViewColumnConfig,
  ViewSortConfig,
  GridStateChangedEvent,
  EntityActionConfig,
  GridVisualConfig,
  DEFAULT_VISUAL_CONFIG,
  ForeignKeyClickEvent
} from './models/grid-types';
import {
  BeforeRowSelectEventArgs,
  AfterRowSelectEventArgs,
  BeforeRowDeselectEventArgs,
  AfterRowDeselectEventArgs,
  BeforeRowClickEventArgs,
  AfterRowClickEventArgs,
  BeforeRowDoubleClickEventArgs,
  AfterRowDoubleClickEventArgs,
  BeforeCellEditEventArgs,
  AfterCellEditBeginEventArgs,
  BeforeCellEditCommitEventArgs,
  AfterCellEditCommitEventArgs,
  BeforeCellEditCancelEventArgs,
  AfterCellEditCancelEventArgs,
  BeforeRowSaveEventArgs,
  AfterRowSaveEventArgs,
  BeforeRowDeleteEventArgs,
  AfterRowDeleteEventArgs,
  BeforeDataLoadEventArgs,
  AfterDataLoadEventArgs,
  BeforeDataRefreshEventArgs,
  AfterDataRefreshEventArgs,
  BeforeSortEventArgs,
  AfterSortEventArgs,
  BeforeColumnReorderEventArgs,
  AfterColumnReorderEventArgs,
  BeforeColumnResizeEventArgs,
  AfterColumnResizeEventArgs,
  BeforeColumnVisibilityChangeEventArgs,
  AfterColumnVisibilityChangeEventArgs
} from './events/grid-events';
import {
  ExportService,
  ExportDialogConfig,
  ExportDialogResult
} from '@memberjunction/ng-export-service';
import {
  ExportOptions,
  ExportResult,
  ExportColumn,
  ExportData
} from '@memberjunction/export-engine';

// Register AG Grid modules (required for v34+)
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * A modern, flexible data grid component for displaying and managing entity data.
 * Built on AG Grid Community edition with a rich Before/After cancelable event system.
 *
 * Features:
 * - RunView-based data loading with automatic refresh
 * - AG Grid for high-performance rendering
 * - Rich event system with Before/After cancelable patterns
 * - Column configuration with type-aware formatters
 * - Row selection (single, multiple, checkbox modes)
 * - Inline cell and row editing
 * - Column reordering, resizing, and visibility toggle
 * - State persistence to User Settings
 * - Compatible with ViewGridStateConfig from User Views
 *
 * @example
 * ```html
 * <mj-entity-data-grid
 *   [entityName]="'Contacts'"
 *   [showToolbar]="true"
 *   [allowSorting]="true"
 *   [selectionMode]="'multiple'"
 *   (afterRowDoubleClick)="onRowDoubleClick($event)">
 * </mj-entity-data-grid>
 * ```
 */
@Component({
  selector: 'mj-entity-data-grid',
  templateUrl: './entity-data-grid.component.html',
  styleUrls: ['./entity-data-grid.component.css'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('150ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('100ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
      ])
    ])
  ]
})
export class EntityDataGridComponent implements OnInit, OnDestroy {
  // ========================================
  // Data Source Inputs (RunViewParams-based)
  // ========================================

  private _params: RunViewParams | null = null;
  /**
   * RunViewParams for data loading - the primary way to specify data source.
   * Supports stored views (ViewID, ViewName, ViewEntity) and dynamic views (EntityName + filters).
   * Mutually exclusive with the legacy entityName/extraFilter inputs.
   * When Params is provided, it takes precedence over legacy inputs.
   */
  @Input()
  set Params(value: RunViewParams | null) {
    const previousValue = this._params;
    this._params = value;
    // Use deep comparison to avoid triggering changes when the same params are passed
    // as a new object reference (common with template bindings like BuildRelationshipViewParamsByEntityName)
    if (!RunViewParams.Equals(value, previousValue)) {
      this.onParamsChanged();
    }
  }
  get Params(): RunViewParams | null {
    return this._params;
  }

  private _allowLoad: boolean = true;
  /**
   * Controls whether data loading is allowed.
   * Set to false to defer loading until ready (useful for complex forms where params may change multiple times).
   * When set to true and Params is provided, triggers a data load.
   */
  @Input()
  set AllowLoad(value: boolean) {
    const previousValue = this._allowLoad;
    this._allowLoad = value;
    if (value && !previousValue && this._params) {
      // AllowLoad was just enabled and we have params - load now
      this.loadData(false);
    }
  }
  get AllowLoad(): boolean {
    return this._allowLoad;
  }

  private _autoRefreshOnParamsChange: boolean = true;
  /**
   * When true, automatically refreshes data when Params changes.
   * When false, you must call Refresh() manually after changing Params.
   */
  @Input()
  set AutoRefreshOnParamsChange(value: boolean) {
    this._autoRefreshOnParamsChange = value;
  }
  get AutoRefreshOnParamsChange(): boolean {
    return this._autoRefreshOnParamsChange;
  }

  // ========================================
  // Pagination Inputs
  // ========================================

  private _paginationMode: 'client' | 'infinite' = 'client';
  /**
   * Pagination mode for the grid:
   * - 'client': All data loaded upfront (default, legacy behavior)
   * - 'infinite': Server-side pagination with infinite scroll (recommended for large datasets)
   */
  @Input()
  set PaginationMode(value: 'client' | 'infinite') {
    this._paginationMode = value;
  }
  get PaginationMode(): 'client' | 'infinite' {
    return this._paginationMode;
  }

  private _pageSize: number = 100;
  /**
   * Number of rows to fetch per page when using infinite pagination mode.
   * Default is 100 rows per page.
   */
  @Input()
  set PageSize(value: number) {
    this._pageSize = value;
  }
  get PageSize(): number {
    return this._pageSize;
  }

  private _cacheBlockSize: number = 100;
  /**
   * Size of each cache block in infinite scroll mode.
   * Should match or be a multiple of PageSize for optimal performance.
   */
  @Input()
  set CacheBlockSize(value: number) {
    this._cacheBlockSize = value;
  }
  get CacheBlockSize(): number {
    return this._cacheBlockSize;
  }

  private _maxBlocksInCache: number = 10;
  /**
   * Maximum number of blocks to keep in cache.
   * When exceeded, oldest blocks are purged.
   */
  @Input()
  set MaxBlocksInCache(value: number) {
    this._maxBlocksInCache = value;
  }
  get MaxBlocksInCache(): number {
    return this._maxBlocksInCache;
  }

  // ========================================
  // External Data Input
  // ========================================

  private _data: BaseEntity[] = [];
  /**
   * Pre-loaded data (bypass RunView, use provided data).
   * When provided, the grid displays this data instead of loading via RunView.
   * Parent component is responsible for data loading and passing results here.
   */
  @Input()
  set Data(value: BaseEntity[]) {
    const hadData = this._data.length > 0;
    this._data = value || [];
    this._useExternalData = this._data.length > 0;
    if (this._useExternalData || hadData) {
      // Suppress sort events during data update to prevent AG Grid from clearing
      // our saved sort state when it processes the new row data
      const savedSortState = [...this._sortState];
      this.suppressSortEvents = true;

      try {
        this.processData();
      } finally {
        this.suppressSortEvents = false;
      }

      // Reapply sort state to grid after data changes to maintain visual indicators
      // Use microtask to ensure AG Grid has processed the new row data first
      if (this.gridApi && savedSortState.length > 0) {
        // Restore sort state in case it was cleared during processData
        this._sortState = savedSortState;
        Promise.resolve().then(() => {
          this.applySortStateToGrid();
        });
      }
    }
  }
  get Data(): BaseEntity[] {
    return this._data;
  }

  // ========================================
  // Column Configuration Inputs
  // ========================================

  private _columns: GridColumnConfig[] = [];
  /**
   * Column definitions - if not provided, auto-generates from entity metadata
   */
  @Input()
  set Columns(value: GridColumnConfig[]) {
    this._columns = value || [];
    if (this._columns.length > 0) {
      this.initializeColumnStates();
      this.buildAgColumnDefs();
    }
  }
  get Columns(): GridColumnConfig[] {
    return this._columns;
  }

  private _gridState: ViewGridStateConfig | null = null;
  /**
   * Grid state from a User View - controls columns, widths, order, sort
   * When provided, this takes precedence over auto-generated columns
   */
  @Input()
  set GridState(value: ViewGridStateConfig | null) {
    if (!!value) {
      const previousValue = this._gridState;
      this._gridState = value;
      if (value !== previousValue) {
        this.onGridStateChanged();
      }
    }
  }
  get GridState(): ViewGridStateConfig | null {
    return this._gridState;
  }

  private _allowColumnReorder: boolean = true;
  @Input()
  set AllowColumnReorder(value: boolean) {
    this._allowColumnReorder = value;
  }
  get AllowColumnReorder(): boolean {
    return this._allowColumnReorder;
  }

  private _allowColumnResize: boolean = true;
  @Input()
  set AllowColumnResize(value: boolean) {
    this._allowColumnResize = value;
  }
  get AllowColumnResize(): boolean {
    return this._allowColumnResize;
  }

  private _allowColumnToggle: boolean = true;
  @Input()
  set AllowColumnToggle(value: boolean) {
    this._allowColumnToggle = value;
  }
  get AllowColumnToggle(): boolean {
    return this._allowColumnToggle;
  }

  private _showHeader: boolean = true;
  @Input()
  set ShowHeader(value: boolean) {
    this._showHeader = value;
  }
  get ShowHeader(): boolean {
    return this._showHeader;
  }

  // ========================================
  // Sorting & Filtering Inputs
  // ========================================

  private _allowSorting: boolean = true;
  @Input()
  set AllowSorting(value: boolean) {
    this._allowSorting = value;
  }
  get AllowSorting(): boolean {
    return this._allowSorting;
  }

  private _allowMultiSort: boolean = true;
  @Input()
  set AllowMultiSort(value: boolean) {
    this._allowMultiSort = value;
  }
  get AllowMultiSort(): boolean {
    return this._allowMultiSort;
  }

  private _serverSideSorting: boolean = true;
  /**
   * Whether sorting is handled server-side
   * When true, sort changes trigger a new data load
   */
  @Input()
  set ServerSideSorting(value: boolean) {
    this._serverSideSorting = value;
  }
  get ServerSideSorting(): boolean {
    return this._serverSideSorting;
  }

  private _allowColumnFilters: boolean = false;
  @Input()
  set AllowColumnFilters(value: boolean) {
    this._allowColumnFilters = value;
  }
  get AllowColumnFilters(): boolean {
    return this._allowColumnFilters;
  }

  private _showSearch: boolean = true;
  @Input()
  set ShowSearch(value: boolean) {
    this._showSearch = value;
  }
  get ShowSearch(): boolean {
    return this._showSearch;
  }

  // ========================================
  // Selection Inputs
  // ========================================

  private _selectionMode: GridSelectionMode = 'single';
  @Input()
  set SelectionMode(value: GridSelectionMode) {
    this._selectionMode = value;
    this.updateAgRowSelection();
    if (value === 'none') {
      this.ClearSelection();
    }
  }
  get SelectionMode(): GridSelectionMode {
    return this._selectionMode;
  }

  private _selectedKeys: string[] = [];
  @Input()
  set SelectedKeys(value: string[]) {
    this._selectedKeys = value || [];
    this.updateRowSelectionState();
  }
  get SelectedKeys(): string[] {
    return this._selectedKeys;
  }

  private _keyField: string = 'ID';
  @Input()
  set KeyField(value: string) {
    this._keyField = value || 'ID';
  }
  get KeyField(): string {
    return this._keyField;
  }

  // ========================================
  // Editing Inputs
  // ========================================

  private _editMode: GridEditMode = 'none';
  @Input()
  set EditMode(value: GridEditMode) {
    this._editMode = value;
  }
  get EditMode(): GridEditMode {
    return this._editMode;
  }

  private _allowAdd: boolean = false;
  @Input()
  set AllowAdd(value: boolean) {
    this._allowAdd = value;
  }
  get AllowAdd(): boolean {
    return this._allowAdd;
  }

  private _allowDelete: boolean = false;
  @Input()
  set AllowDelete(value: boolean) {
    this._allowDelete = value;
  }
  get AllowDelete(): boolean {
    return this._allowDelete;
  }

  // ========================================
  // Display Inputs
  // ========================================

  private _height: number | 'auto' | 'fit-content' = 'auto';
  @Input()
  set Height(value: number | 'auto' | 'fit-content') {
    this._height = value;
  }
  get Height(): number | 'auto' | 'fit-content' {
    return this._height;
  }

  private _rowHeight: number = 40;
  @Input()
  set RowHeight(value: number) {
    this._rowHeight = value;
  }
  get RowHeight(): number {
    return this._rowHeight;
  }

  private _virtualScroll: boolean = true;
  @Input()
  set VirtualScroll(value: boolean) {
    this._virtualScroll = value;
  }
  get VirtualScroll(): boolean {
    return this._virtualScroll;
  }

  private _showRowNumbers: boolean = false;
  @Input()
  set ShowRowNumbers(value: boolean) {
    this._showRowNumbers = value;
    this.buildAgColumnDefs();
  }
  get ShowRowNumbers(): boolean {
    return this._showRowNumbers;
  }

  private _striped: boolean = true;
  @Input()
  set Striped(value: boolean) {
    this._striped = value;
  }
  get Striped(): boolean {
    return this._striped;
  }

  private _gridLines: GridLinesMode = 'horizontal';
  @Input()
  set GridLines(value: GridLinesMode) {
    this._gridLines = value;
  }
  get GridLines(): GridLinesMode {
    return this._gridLines;
  }

  // ========================================
  // Visual Customization Inputs
  // ========================================

  private _visualConfig: GridVisualConfig = {};
  /**
   * Visual configuration for the grid appearance.
   * Allows customization of header styles, row colors, cell formatting, and more.
   * All properties are optional - unset properties use attractive defaults.
   */
  @Input()
  set VisualConfig(value: GridVisualConfig) {
    this._visualConfig = value || {};
    this.applyVisualConfig();
  }
  get VisualConfig(): GridVisualConfig {
    return this._visualConfig;
  }

  /**
   * Get the effective visual config (user config merged with defaults)
   */
  get effectiveVisualConfig(): Required<GridVisualConfig> {
    return { ...DEFAULT_VISUAL_CONFIG, ...this._visualConfig };
  }

  // ========================================
  // Toolbar Inputs
  // ========================================

  private _showToolbar: boolean = true;
  @Input()
  set ShowToolbar(value: boolean) {
    this._showToolbar = value;
  }
  get ShowToolbar(): boolean {
    return this._showToolbar;
  }

  private _toolbarConfig: GridToolbarConfig = {};
  @Input()
  set ToolbarConfig(value: GridToolbarConfig) {
    this._toolbarConfig = value || {};
  }
  get ToolbarConfig(): GridToolbarConfig {
    return this._toolbarConfig;
  }

  // ========================================
  // State Inputs
  // ========================================

  private _stateKey: string = '';
  @Input()
  set StateKey(value: string) {
    this._stateKey = value || '';
    if (this._stateKey) {
      this.loadPersistedState();
    }
  }
  get StateKey(): string {
    return this._stateKey;
  }

  private _autoPersistState: boolean = true;
  /**
   * When true and using a stored view (ViewID/ViewName/ViewEntity in Params),
   * automatically persists grid state changes (column widths, order, sort) to the UserView entity.
   * Only saves if the user has edit permission on the view.
   * For dynamic views, only emits the gridStateChanged event.
   */
  @Input()
  set AutoPersistState(value: boolean) {
    this._autoPersistState = value;
  }
  get AutoPersistState(): boolean {
    return this._autoPersistState;
  }

  private _statePersistDebounce: number = 5000;
  /**
   * Debounce time in milliseconds before persisting state changes to the server.
   * Default is 5000ms (5 seconds) to avoid excessive server calls during rapid column adjustments.
   */
  @Input()
  set StatePersistDebounce(value: number) {
    this._statePersistDebounce = value;
    // Re-setup the debounce subscription with new timing
    this.setupStatePersistDebounce();
  }
  get StatePersistDebounce(): number {
    return this._statePersistDebounce;
  }

  private _refreshDebounce: number = 300;
  @Input()
  set RefreshDebounce(value: number) {
    this._refreshDebounce = value;
  }
  get RefreshDebounce(): number {
    return this._refreshDebounce;
  }

  // ========================================
  // Highlighting Input
  // ========================================

  private _filterText: string = '';
  /**
   * Text to highlight in grid cells.
   * Supports SQL-style % wildcards for pattern matching.
   */
  @Input()
  set FilterText(value: string) {
    const previousValue = this._filterText;
    this._filterText = value || '';
    if (value !== previousValue) {
      this.onFilterTextChanged();
    }
  }
  get FilterText(): string {
    return this._filterText;
  }

  // ========================================
  // Predefined Toolbar Button Inputs
  // ========================================

  private _showNewButton: boolean = true;
  /**
   * Show the "New" button in toolbar (creates new record)
   */
  @Input()
  set ShowNewButton(value: boolean) {
    this._showNewButton = value;
  }
  get ShowNewButton(): boolean {
    return this._showNewButton;
  }

  private _showRefreshButton: boolean = true;
  /**
   * Show the "Refresh" button in toolbar
   */
  @Input()
  set ShowRefreshButton(value: boolean) {
    this._showRefreshButton = value;
  }
  get ShowRefreshButton(): boolean {
    return this._showRefreshButton;
  }

  private _showExportButton: boolean = true;
  /**
   * Show the "Export to Excel" button in toolbar
   */
  @Input()
  set ShowExportButton(value: boolean) {
    this._showExportButton = value;
  }
  get ShowExportButton(): boolean {
    return this._showExportButton;
  }

  private _showDeleteButton: boolean = false;
  /**
   * Show the "Delete" button in toolbar (deletes selected rows)
   */
  @Input()
  set ShowDeleteButton(value: boolean) {
    this._showDeleteButton = value;
  }
  get ShowDeleteButton(): boolean {
    return this._showDeleteButton;
  }

  private _showCompareButton: boolean = false;
  /**
   * Show the "Compare" button in toolbar (compare selected records)
   */
  @Input()
  set ShowCompareButton(value: boolean) {
    this._showCompareButton = value;
  }
  get ShowCompareButton(): boolean {
    return this._showCompareButton;
  }

  private _showMergeButton: boolean = false;
  /**
   * Show the "Merge" button in toolbar (merge selected records)
   */
  @Input()
  set ShowMergeButton(value: boolean) {
    this._showMergeButton = value;
  }
  get ShowMergeButton(): boolean {
    return this._showMergeButton;
  }

  private _showAddToListButton: boolean = false;
  /**
   * Show the "Add to List" button in toolbar
   */
  @Input()
  set ShowAddToListButton(value: boolean) {
    this._showAddToListButton = value;
  }
  get ShowAddToListButton(): boolean {
    return this._showAddToListButton;
  }

  private _showDuplicateSearchButton: boolean = false;
  /**
   * Show the "Search for Duplicates" button in toolbar
   */
  @Input()
  set ShowDuplicateSearchButton(value: boolean) {
    this._showDuplicateSearchButton = value;
  }
  get ShowDuplicateSearchButton(): boolean {
    return this._showDuplicateSearchButton;
  }

  private _showCommunicationButton: boolean = false;
  /**
   * Show the "Send Message" button in toolbar (if entity supports communication)
   */
  @Input()
  set ShowCommunicationButton(value: boolean) {
    this._showCommunicationButton = value;
  }
  get ShowCommunicationButton(): boolean {
    return this._showCommunicationButton;
  }

  // ========================================
  // Navigation Inputs
  // ========================================

  private _autoNavigate: boolean = true;
  /**
   * When true, clicking or double-clicking a row will emit a navigation request.
   * The parent component can handle the navigationRequested event to open the record.
   */
  @Input()
  set AutoNavigate(value: boolean) {
    this._autoNavigate = value;
  }
  get AutoNavigate(): boolean {
    return this._autoNavigate;
  }

  private _navigateOnDoubleClick: boolean = true;
  /**
   * When true, navigation is triggered on double-click only.
   * When false, navigation is triggered on single click.
   * Only applies when AutoNavigate is true.
   */
  @Input()
  set NavigateOnDoubleClick(value: boolean) {
    this._navigateOnDoubleClick = value;
  }
  get NavigateOnDoubleClick(): boolean {
    return this._navigateOnDoubleClick;
  }

  private _createRecordMode: 'Dialog' | 'Tab' = 'Tab';
  /**
   * How to open new records when the "New" button is clicked:
   * - 'Tab': Emit event to open in a new tab (default)
   * - 'Dialog': Emit event to open in a dialog
   */
  @Input()
  set CreateRecordMode(value: 'Dialog' | 'Tab') {
    this._createRecordMode = value;
  }
  get CreateRecordMode(): 'Dialog' | 'Tab' {
    return this._createRecordMode;
  }

  private _newRecordValues: Record<string, unknown> = {};
  /**
   * Default values to set on new records.
   * These values are passed with the newRecordDialogRequested event.
   */
  @Input()
  set NewRecordValues(value: Record<string, unknown>) {
    this._newRecordValues = value || {};
  }
  get NewRecordValues(): Record<string, unknown> {
    return this._newRecordValues;
  }

  // ========================================
  // Entity Actions Inputs
  // ========================================

  private _showEntityActionButtons: boolean = false;
  /**
   * When true, displays entity action buttons in the toolbar overflow menu.
   * Entity actions are loaded dynamically based on the current entity.
   * The entityActionsLoaded event is emitted when actions are ready.
   */
  @Input()
  set ShowEntityActionButtons(value: boolean) {
    this._showEntityActionButtons = value;
    if (value && this._entityInfo) {
      this.LoadEntityActionsRequested.emit({ entityInfo: this._entityInfo });
    }
  }
  get ShowEntityActionButtons(): boolean {
    return this._showEntityActionButtons;
  }

  private _entityActions: EntityActionConfig[] = [];
  /**
   * Array of entity actions to display in the toolbar.
   * Set this after receiving the entityActionsLoaded event.
   */
  @Input()
  set EntityActions(value: EntityActionConfig[]) {
    this._entityActions = value || [];
  }
  get EntityActions(): EntityActionConfig[] {
    return this._entityActions;
  }

  // ========================================
  // Aggregate Inputs
  // ========================================

  /**
   * Aggregate configuration for the grid.
   * When provided, aggregate expressions are calculated alongside data and displayed:
   * - Column-bound aggregates appear in a pinned bottom row
   * - Card-bound aggregates are exposed via AggregateValues for use with AggregatePanelComponent
   */
  @Input()
  set AggregatesConfig(value: ViewGridAggregatesConfig | null) {
    this._aggregatesConfig = value;
  }
  get AggregatesConfig(): ViewGridAggregatesConfig | null {
    return this._aggregatesConfig;
  }

  /**
   * Returns the aggregate values map, keyed by expression or id.
   * Use this to pass values to AggregatePanelComponent.
   */
  public get AggregateValuesMap(): Map<string, AggregateValue> {
    return this._aggregateValues;
  }

  /**
   * Returns the raw aggregate results from the last RunView call.
   */
  public get AggregateResultsList(): AggregateResult[] {
    return this._aggregateResults;
  }

  /**
   * Whether aggregates are currently loading.
   */
  public get AggregatesLoading(): boolean {
    return this._aggregatesLoading;
  }

  // ========================================
  // Event Outputs
  // ========================================

  // Aggregate Results
  /**
   * Emitted when aggregate results are loaded.
   * Contains the array of AggregateResult objects and a values map for easy lookup.
   */
  @Output() AggregatesLoaded = new EventEmitter<{ results: AggregateResult[]; values: Map<string, AggregateValue>; executionTime?: number }>();

  // Row Selection
  @Output() BeforeRowSelect = new EventEmitter<BeforeRowSelectEventArgs>();
  @Output() AfterRowSelect = new EventEmitter<AfterRowSelectEventArgs>();
  @Output() BeforeRowDeselect = new EventEmitter<BeforeRowDeselectEventArgs>();
  @Output() AfterRowDeselect = new EventEmitter<AfterRowDeselectEventArgs>();
  @Output() SelectionChange = new EventEmitter<string[]>();

  // Row Click
  @Output() BeforeRowClick = new EventEmitter<BeforeRowClickEventArgs>();
  @Output() AfterRowClick = new EventEmitter<AfterRowClickEventArgs>();
  @Output() BeforeRowDoubleClick = new EventEmitter<BeforeRowDoubleClickEventArgs>();
  @Output() AfterRowDoubleClick = new EventEmitter<AfterRowDoubleClickEventArgs>();

  // Foreign Key Link Click
  /**
   * Emitted when a foreign key link is clicked in the grid.
   * Parent components should handle this to navigate to the related record.
   */
  @Output() ForeignKeyClick = new EventEmitter<ForeignKeyClickEvent>();

  // Editing
  @Output() BeforeCellEdit = new EventEmitter<BeforeCellEditEventArgs>();
  @Output() AfterCellEditBegin = new EventEmitter<AfterCellEditBeginEventArgs>();
  @Output() BeforeCellEditCommit = new EventEmitter<BeforeCellEditCommitEventArgs>();
  @Output() AfterCellEditCommit = new EventEmitter<AfterCellEditCommitEventArgs>();
  @Output() BeforeCellEditCancel = new EventEmitter<BeforeCellEditCancelEventArgs>();
  @Output() AfterCellEditCancel = new EventEmitter<AfterCellEditCancelEventArgs>();
  @Output() BeforeRowSave = new EventEmitter<BeforeRowSaveEventArgs>();
  @Output() AfterRowSave = new EventEmitter<AfterRowSaveEventArgs>();
  @Output() BeforeRowDelete = new EventEmitter<BeforeRowDeleteEventArgs>();
  @Output() AfterRowDelete = new EventEmitter<AfterRowDeleteEventArgs>();

  // Data Loading
  @Output() BeforeDataLoad = new EventEmitter<BeforeDataLoadEventArgs>();
  @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();
  @Output() BeforeDataRefresh = new EventEmitter<BeforeDataRefreshEventArgs>();
  @Output() AfterDataRefresh = new EventEmitter<AfterDataRefreshEventArgs>();

  // Sorting
  @Output() BeforeSort = new EventEmitter<BeforeSortEventArgs>();
  @Output() AfterSort = new EventEmitter<AfterSortEventArgs>();

  // Column Management
  @Output() BeforeColumnReorder = new EventEmitter<BeforeColumnReorderEventArgs>();
  @Output() AfterColumnReorder = new EventEmitter<AfterColumnReorderEventArgs>();
  @Output() BeforeColumnResize = new EventEmitter<BeforeColumnResizeEventArgs>();
  @Output() AfterColumnResize = new EventEmitter<AfterColumnResizeEventArgs>();
  @Output() BeforeColumnVisibilityChange = new EventEmitter<BeforeColumnVisibilityChangeEventArgs>();
  @Output() AfterColumnVisibilityChange = new EventEmitter<AfterColumnVisibilityChangeEventArgs>();

  // Grid State
  @Output() GridStateChanged = new EventEmitter<GridStateChangedEvent>();

  // Toolbar Actions (legacy names)
  @Output() AddRequested = new EventEmitter<void>();
  @Output() DeleteRequested = new EventEmitter<BaseEntity[]>();
  @Output() ExportRequested = new EventEmitter<void>();

  // Predefined Toolbar Button Events
  @Output() NewButtonClick = new EventEmitter<void>();
  @Output() RefreshButtonClick = new EventEmitter<void>();
  @Output() ExportButtonClick = new EventEmitter<void>();
  @Output() DeleteButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() CompareButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() MergeButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() AddToListButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() DuplicateSearchButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() CommunicationButtonClick = new EventEmitter<BaseEntity[]>();

  // Navigation Events
  /**
   * Emitted when a row is clicked/double-clicked and AutoNavigate is enabled.
   * Parent components should handle this to open the entity record.
   */
  @Output() NavigationRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    record: BaseEntity;
    compositeKey: string;
  }>();

  /**
   * Emitted when the "New" button is clicked and CreateRecordMode is 'Dialog'.
   * Parent components should handle this to show a new record dialog.
   */
  @Output() NewRecordDialogRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    defaultValues: Record<string, unknown>;
  }>();

  /**
   * Emitted when the "New" button is clicked and CreateRecordMode is 'Tab'.
   * Parent components should handle this to open a new record in a tab.
   */
  @Output() NewRecordTabRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    defaultValues: Record<string, unknown>;
  }>();

  // Dialog Request Events (for Explorer-specific dialogs)
  /**
   * Emitted when Compare Records functionality is requested.
   * Parent components should handle this to show the compare dialog.
   */
  @Output() CompareRecordsRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
  }>();

  /**
   * Emitted when Merge Records functionality is requested.
   * Parent components should handle this to show the merge dialog.
   */
  @Output() MergeRecordsRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
  }>();

  /**
   * Emitted when Communication/Send Message functionality is requested.
   * Parent components should handle this to show the communication dialog.
   */
  @Output() CommunicationRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
    viewParams: RunViewParams | null;
  }>();

  /**
   * Emitted when duplicate search functionality is requested.
   * Parent components should handle this to show the duplicate search results.
   */
  @Output() DuplicateSearchRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
  }>();

  /**
   * Emitted when the Add to List button is clicked.
   * Parent components should handle this to show the list management dialog.
   */
  @Output() AddToListRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
    recordIds: string[];
  }>();

  // Entity Action Events
  /**
   * Emitted when entity actions need to be loaded.
   * Parent components should load actions and set the EntityActions input.
   */
  @Output() LoadEntityActionsRequested = new EventEmitter<{
    entityInfo: EntityInfo;
  }>();

  /**
   * Emitted when an entity action is selected for execution.
   * Parent components should handle the action execution.
   */
  @Output() EntityActionRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    action: EntityActionConfig;
    selectedRecords: BaseEntity[];
  }>();

  // ========================================
  // View Children
  // ========================================

  @ViewChild('gridContainer') gridContainer!: ElementRef<HTMLDivElement>;

  // ========================================
  // AG Grid Properties
  // ========================================

  /** AG Grid column definitions */
  public agColumnDefs: ColDef[] = [];

  /** AG Grid row data */
  public rowData: Record<string, unknown>[] = [];

  /** AG Grid API reference */
  private gridApi: GridApi | null = null;

  /** AG Grid theme (v34+) with custom selection colors */
  public agGridTheme = themeAlpine.withParams({
    selectedRowBackgroundColor: '#fff3cd',  // More visible mellow yellow selection
    rowHoverColor: '#f5f5f5'
  });

  /** AG Grid row selection configuration */
  public agRowSelection: RowSelectionOptions = { mode: 'singleRow' };

  /** Default column settings */
  public defaultColDef: ColDef = {
    sortable: true,
    filter: false,
    resizable: true,
    minWidth: 80
  };

  /** Get row ID function for AG Grid */
  public getRowId = (params: GetRowIdParams<Record<string, unknown>>) =>
    params.data['__pk'] as string;

  /** Suppress sort changed events during programmatic updates */
  private suppressSortEvents: boolean = false;

  /** AG Grid options for infinite scroll mode */
  public gridOptions: GridOptions = {};

  /** Datasource for infinite scroll mode */
  private infiniteDatasource: IDatasource | null = null;

  // ========================================
  // Internal State
  // ========================================

  private _useExternalData: boolean = false;
  private _allData: BaseEntity[] = [];
  private _rowDataMap = new Map<string, GridRowData>();
  private _entityInfo: EntityInfo | null = null;
  private _viewEntity: UserViewEntityExtended | null = null;
  private _columnStates: ColumnRuntimeState[] = [];
  private _sortState: DataGridSortState[] = [];
  private _filterState: FilterState[] = [];
  private _editingRowKey: string | null = null;
  private _editingField: string | null = null;
  private _pendingChanges: PendingChange[] = [];

  // Aggregate state
  private _aggregatesConfig: ViewGridAggregatesConfig | null = null;
  private _aggregateResults: AggregateResult[] = [];
  private _aggregateValues: Map<string, AggregateValue> = new Map();
  private _aggregatesLoading: boolean = false;

  // ========================================
  // Public Read-Only Properties
  // ========================================

  /**
   * The loaded view entity if using a stored view (ViewID, ViewName, or ViewEntity in Params).
   * Null for dynamic views or when using legacy entityName input.
   */
  public get ViewEntity(): UserViewEntityExtended | null {
    return this._viewEntity;
  }

  /**
   * The entity metadata for the current data source.
   * Available after Params is set and data is loaded.
   */
  public get EntityInfo(): EntityInfo | null {
    return this._entityInfo;
  }

  /**
   * True if using a dynamic view (EntityName only) rather than a stored view.
   * False if using ViewID, ViewName, ViewEntity in Params, or viewEntity input.
   */
  public get IsDynamicView(): boolean {
    // If we have a viewEntity (from either Params or input), it's a stored view
    if (this._viewEntity) return false;

    // Check Params for stored view indicators
    if (this._params) {
      return !this._params.ViewID && !this._params.ViewName && !this._params.ViewEntity;
    }

    // Legacy mode without viewEntity is considered dynamic
    return true;
  }

  // Loading state
  loading: boolean = false;
  errorMessage: string = '';
  totalRowCount: number = 0;
  private _loadDataPromise: Promise<void> | null = null;

  // Cleanup
  private destroy$ = new Subject<void>();
  private refreshSubject = new Subject<void>();
  private statesSaveSubject = new Subject<void>();
  private statePersistSubject = new Subject<ViewGridStateConfig>();
  private userDefaultsPersistSubject = new Subject<ViewGridStateConfig>();

  // Persist state tracking
  private pendingStateToSave: ViewGridStateConfig | null = null;
  private isSavingState: boolean = false;

  /**
   * Pending state waiting to be persisted (for flushing on destroy).
   * Tracks state for both saved views and user defaults separately.
   */
  private _pendingViewStateToPersist: ViewGridStateConfig | null = null;
  private _pendingUserDefaultsToPersist: ViewGridStateConfig | null = null;

  /**
   * Flag to suppress state persistence during view transitions.
   * When true, emitGridStateChanged will not trigger persistence.
   * This prevents the old view's column state from being saved to the new view.
   */
  private _suppressPersist: boolean = false;

  /**
   * Dirty flag to track if grid state has actually been modified by user actions.
   * Only set to true when: column resize, column move, or sort change.
   * Reset to false: when view loads, after successful persistence.
   * This prevents emitting gridStateChanged events when no real change occurred.
   */
  private _isGridStateDirty: boolean = false;

  /**
   * Whether the current user can edit the view.
   * For dynamic views, always true (persists to user settings).
   * For saved views, depends on view ownership and permissions.
   */
  public get canEditCurrentView(): boolean {
    if (this.IsDynamicView) {
      return true; // Dynamic views persist to user settings
    }
    return this._viewEntity?.UserCanEdit ?? false;
  }

  // Overflow menu state
  public showOverflowMenu: boolean = false;

  // Export dialog state
  public showExportDialog: boolean = false;
  public exportDialogConfig: ExportDialogConfig | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private exportService: ExportService
  ) {}

  // ========================================
  // Lifecycle Hooks
  // ========================================

  async ngOnInit() {
    this.setupRefreshDebounce();
    this.setupStatePersistDebounce();
    this.setupUserDefaultsPersistDebounce();
    this.updateAgRowSelection();
  }

  ngOnDestroy(): void {
    // Flush any pending state persistence immediately before destroying
    this.EnsurePendingChangesSaved();

    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Immediately persists any pending state changes without waiting for debounce.
   * Called on component destroy to ensure changes aren't lost.
   * Also exposed publicly so parent components can flush before view/entity switches.
   */
  public EnsurePendingChangesSaved(): void {
    // Flush pending view state
    if (this._pendingViewStateToPersist && this._viewEntity) {
      this.persistGridStateToView(this._pendingViewStateToPersist);
      this._pendingViewStateToPersist = null;
    }

    // Flush pending user defaults
    if (this._pendingUserDefaultsToPersist && this._entityInfo) {
      this.persistUserDefaultGridState(this._pendingUserDefaultsToPersist);
      this._pendingUserDefaultsToPersist = null;
    }
  }

  // ========================================
  // Setup Methods
  // ========================================

  private setupRefreshDebounce(): void {
    this.refreshSubject.pipe(
      debounceTime(this._refreshDebounce),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.loadData(true);
    });
  }

  private setupStatePersistDebounce(): void {
    this.statePersistSubject.pipe(
      debounceTime(this._statePersistDebounce),
      takeUntil(this.destroy$)
    ).subscribe((state) => {
      this.persistGridStateToView(state);
    });
  }

  private setupUserDefaultsPersistDebounce(): void {
    this.userDefaultsPersistSubject.pipe(
      debounceTime(this._statePersistDebounce),
      takeUntil(this.destroy$)
    ).subscribe((state) => {
      this.persistUserDefaultGridState(state);
    });
  }

  /**
   * Called when Params input changes. Handles loading view entity metadata
   * and triggering data load if allowed.
   */
  private async onParamsChanged(): Promise<void> {
    if (!this._params) {
      // Params cleared - reset view entity
      this._viewEntity = null;
      return;
    }

    // Suppress persistence during view transition to prevent old view's state
    // from being saved to the new view's storage
    this._suppressPersist = true;

    // Reset dirty flag - no changes have been made to the new view yet
    this._isGridStateDirty = false;

    // Reset internal grid state when params change - this ensures we don't
    // carry over column/sort settings from a previous view when switching views
    this._gridState = null;
    this._sortState = [];

    try {
      // If using a stored view, load the view entity first
      if (this._params.ViewEntity) {
        // ViewEntity was provided directly
        this._viewEntity = this._params.ViewEntity as UserViewEntityExtended;
        this._entityInfo = this.getEntityInfoFromViewEntity(this._viewEntity);
        this.applyViewEntitySettings();
      } else if (this._params.ViewID) {
        // Load view entity by ID from engine
        const cachedView = this.getViewFromEngine(this._params.ViewID);
        if (cachedView) {
          this._viewEntity = cachedView;
        } else {
          // View not in cache - use ViewInfo (which also uses engine)
          this._viewEntity = await ViewInfo.GetViewEntity(this._params.ViewID);
        }
        this._entityInfo = this.getEntityInfoFromViewEntity(this._viewEntity);
        this.applyViewEntitySettings();
      } else if (this._params.ViewName) {
        // Load view entity by name from engine
        const cachedView = this.getViewFromEngineByName(this._params.ViewName);
        if (cachedView) {
          this._viewEntity = cachedView;
        } else {
          // View not in cache - use ViewInfo (which also uses engine)
          this._viewEntity = await ViewInfo.GetViewEntityByName(this._params.ViewName);
        }
        this._entityInfo = this.getEntityInfoFromViewEntity(this._viewEntity);
        this.applyViewEntitySettings();
      } else if (this._params.EntityName) {
        // Dynamic view - just get entity metadata
        this._viewEntity = null;
        const md = new Metadata();
        this._entityInfo = md.Entities.find(e => e.Name === this._params!.EntityName) || null;

        // Reset columns to force regeneration from metadata when switching to dynamic view
        // This ensures we don't carry over column config from a previous saved view
        this._columns = [];

        // For dynamic views, try to load user's saved defaults
        if (this._entityInfo && this._autoPersistState) {
          this.loadUserDefaultGridState(this._entityInfo.Name);
        }
      }

      // Generate columns if not already set
      if (this._columns.length === 0 && this._entityInfo) {
        this.generateColumnsFromMetadata();
      }

      // Rebuild AG Grid column definitions to reflect the new view's settings
      this.buildAgColumnDefs();

      // Load data if auto-refresh is enabled
      if (this._autoRefreshOnParamsChange) {
        await this.loadData(false);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load view';
      this.cdr.detectChanges();
    } finally {
      // Re-enable persistence now that the new view is fully loaded
      this._suppressPersist = false;
    }
  }

  /**
   * Gets a view from the UserViewEngine cache by ID.
   * Returns undefined if not found or engine not initialized.
   */
  private getViewFromEngine(viewId: string): UserViewEntityExtended | undefined {
    try {
      return UserViewEngine.Instance.GetViewById(viewId);
    } catch {
      // Engine may not be initialized yet
      return undefined;
    }
  }

  /**
   * Gets a view from the UserViewEngine cache by name.
   * Returns undefined if not found or engine not initialized.
   */
  private getViewFromEngineByName(viewName: string): UserViewEntityExtended | undefined {
    try {
      return UserViewEngine.Instance.GetViewByName(viewName);
    } catch {
      // Engine may not be initialized yet
      return undefined;
    }
  }

  /**
   * Gets EntityInfo from a ViewEntity with multiple fallback strategies.
   * Priority: 1) ViewEntityInfo property (set by Load)
   *           2) Entity name lookup (virtual field)
   *           3) EntityID lookup
   * Returns null if entity cannot be determined.
   */
  private getEntityInfoFromViewEntity(viewEntity: UserViewEntityExtended | null): EntityInfo | null {
    if (!viewEntity) return null;

    // First try: ViewEntityInfo is the preferred source (set by UserViewEntityExtended.Load)
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

    console.warn(`[EntityDataGrid] Could not determine entity for view "${viewEntity.Name}" (ID: ${viewEntity.ID})`);
    return null;
  }

  /**
   * Loads user's saved grid state defaults for a dynamic view.
   * Uses UserInfoEngine to retrieve settings stored with key format: "default-view-setting/{entityName}"
   */
  private loadUserDefaultGridState(entityName: string): void {
    try {
      const settingKey = `default-view-setting/${entityName}`;
      const savedState = UserInfoEngine.Instance.GetSetting(settingKey);

      if (savedState) {
        const gridState = JSON.parse(savedState) as ViewGridState;

        // Only apply if not already set via props (props take precedence)
        if (!this._gridState && gridState.columnSettings?.length) {
          this._gridState = {
            columnSettings: gridState.columnSettings,
            sortSettings: gridState.sortSettings || [],
            aggregates: gridState.aggregates
          };
        }

        // Apply sort state if not already set
        if (this._sortState.length === 0 && gridState.sortSettings?.length) {
          this._sortState = gridState.sortSettings.map((s, index) => ({
            field: s.field,
            direction: s.dir,
            index
          }));
        }

        // Apply aggregates from user defaults if present and not already set
        if (gridState.aggregates && !this._aggregatesConfig) {
          this._aggregatesConfig = gridState.aggregates;
        }
      }
    } catch (error) {
      console.error('[entity-data-grid] Failed to load user default grid state:', error);
    }
  }

  /**
   * Persists the current grid state as user defaults for a dynamic view.
   * Uses UserInfoEngine to store settings with key format: "default-view-setting/{entityName}"
   */
  private async persistUserDefaultGridState(state: ViewGridStateConfig): Promise<void> {
    if (!this._entityInfo) {
      this._pendingUserDefaultsToPersist = null;
      return;
    }

    try {
      const settingKey = `default-view-setting/${this._entityInfo.Name}`;
      const gridStateJson: ViewGridState = {
        columnSettings: state.columnSettings,
        sortSettings: state.sortSettings,
        aggregates: state.aggregates
      };

      await UserInfoEngine.Instance.SetSetting(settingKey, JSON.stringify(gridStateJson));
      // Clear pending state and reset dirty flag after successful save
      this._pendingUserDefaultsToPersist = null;
      this._isGridStateDirty = false;
    } catch (error) {
      console.error('[entity-data-grid] Failed to persist user default grid state:', error);
    }
  }

  /**
   * Applies settings from a loaded ViewEntity (column configuration, sort state, etc.)
   *
   * Precedence rules (highest to lowest):
   * 1. Props passed directly (gridState, orderBy, etc.) - always take precedence
   * 2. Settings from ViewEntity.GridState (persisted column/sort configuration)
   * 3. Settings from ViewEntity.SortInfo (legacy sort configuration)
   * 4. Auto-generated defaults from entity metadata
   */
  private applyViewEntitySettings(): void {
    if (!this._viewEntity) return;

    // Only apply grid state from view entity if not already set via props
    // (gridState input takes precedence)
    if (!this._gridState && this._viewEntity.GridState) {
      try {
        const gridState = JSON.parse(this._viewEntity.GridState) as ViewGridState;
        if (gridState.columnSettings?.length) {
          this._gridState = {
            columnSettings: gridState.columnSettings,
            sortSettings: gridState.sortSettings || [],
            aggregates: gridState.aggregates
          };
        }
        // Apply aggregates from view's GridState if present
        if (gridState.aggregates && !this._aggregatesConfig) {
          this._aggregatesConfig = gridState.aggregates;
        }
      } catch (e) {
        console.warn('Failed to parse view GridState:', e);
      }
    }

    // Only apply sort state if:
    // 1. No explicit OrderBy in Params
    // 2. No sort already set via gridState (either prop or from view)
    const hasExplicitOrderBy = this._params?.OrderBy && this._params.OrderBy.trim().length > 0;
    const hasSortFromGridState = this._gridState?.sortSettings && this._gridState.sortSettings.length > 0;

    if (!hasExplicitOrderBy && !hasSortFromGridState && this._sortState.length === 0) {
      const sortInfo = this._viewEntity.ViewSortInfo;
      if (sortInfo?.length) {
        this._sortState = sortInfo.map((s, index) => ({
          field: s.field,
          direction: s.direction?.toLowerCase() === 'desc' ? 'desc' : 'asc',
          index
        }));
      }
    }
  }

  private onGridStateChanged(): void {
    if (this._gridState && this._entityInfo) {
      this.buildAgColumnDefs();

      // Update AG Grid with new column definitions to apply header styles
      if (this.gridApi) {
        this.gridApi.setGridOption('columnDefs', this.agColumnDefs);
        // Refresh header to apply new header styles
        this.gridApi.refreshHeader();
      }

      // Apply sort if present - support multi-column sort
      if (this._gridState.sortSettings?.length && this.gridApi) {
        this._sortState = this._gridState.sortSettings.map((sortSetting, index) => ({
          field: sortSetting.field,
          direction: sortSetting.dir,
          index: index
        }));
        this.applySortStateToGrid();
      }

      // Apply aggregates from GridState if present
      if (this._gridState.aggregates) {
        this._aggregatesConfig = this._gridState.aggregates;
      }
    }
  }

  private onFilterTextChanged(): void {
    // Rebuild column defs to update cell renderers with new filter text
    this.buildAgColumnDefs();

    // Update AG Grid with new column definitions and refresh cells
    if (this.gridApi) {
      // Update the column definitions in AG Grid
      this.gridApi.setGridOption('columnDefs', this.agColumnDefs);
      // Force refresh all cells to apply new highlighting
      this.gridApi.refreshCells({ force: true });
    }
  }

  private generateColumnsFromMetadata(): void {
    if (!this._entityInfo) return;

    this._columns = this._entityInfo.Fields
      .filter(f => this.shouldShowField(f))
      .map(field => ({
        field: field.Name,
        title: field.DisplayName || field.Name,
        type: this.mapFieldTypeToGridType(field.Type),
        sortable: true,
        filterable: true,
        visible: true,
        width: this.estimateColumnWidth(field)
      }));

    this.initializeColumnStates();
    this.buildAgColumnDefs();
  }

  /**
   * Determines if a field should be shown by default when no saved view exists.
   * This logic is aligned with UserViewEntity.SetDefaultsFromEntity() to ensure
   * consistent column visibility between initial load and saved views.
   */
  private shouldShowField(field: EntityFieldInfo): boolean {
    // Always exclude system fields
    if (field.Name.startsWith('__mj_')) return false;

    // Always exclude UUID primary keys (they're not useful to display)
    if (field.IsPrimaryKey && field.SQLFullType?.toLowerCase() === 'uniqueidentifier') {
      return false;
    }

    // Only show fields explicitly marked as DefaultInView
    // This aligns with UserViewEntity.SetDefaultsFromEntity() behavior
    // ensuring users see the same columns before and after saving a view
    return field.DefaultInView === true;
  }

  /**
   * Estimate an appropriate column width based on field metadata.
   * Takes into account: metadata DefaultColumnWidth, header text length, data type, and field patterns.
   */
  private estimateColumnWidth(field: EntityFieldInfo): number {
    // Priority 1: Use metadata-defined width if set
    if (field.DefaultColumnWidth && field.DefaultColumnWidth > 0) {
      return field.DefaultColumnWidth;
    }

    // Calculate minimum width needed for header text
    const headerText = field.DisplayName || field.Name;
    const headerWidth = this.calculateHeaderWidth(headerText);

    // Calculate estimated data width based on field type
    const dataWidth = this.calculateDataWidth(field);

    // Use the larger of header or data width, with bounds
    const estimatedWidth = Math.max(headerWidth, dataWidth);

    // Apply min/max bounds: minimum 80px, maximum 350px
    return Math.max(Math.min(estimatedWidth, 350), 80);
  }

  /**
   * Calculate minimum width needed to display header text without truncation.
   */
  private calculateHeaderWidth(text: string): number {
    // Average char width ~7.5px for typical grid font
    const charWidth = 7.5;
    // Padding for sort icon and cell padding
    const sortIconPadding = 24;
    const cellPadding = 16;
    return Math.ceil(text.length * charWidth + sortIconPadding + cellPadding);
  }

  /**
   * Calculate estimated data width based on field type and patterns.
   */
  private calculateDataWidth(field: EntityFieldInfo): number {
    const fieldNameLower = field.Name.toLowerCase();
    const tsType = field.TSType;

    // Fixed-width types
    if (tsType === 'boolean') return 90;
    if (tsType === 'Date') return 130;

    // Numeric fields - compact
    if (tsType === 'number') {
      if (fieldNameLower.includes('year') || fieldNameLower.includes('age')) return 80;
      if (fieldNameLower.includes('amount') || fieldNameLower.includes('price') ||
          fieldNameLower.includes('cost') || fieldNameLower.includes('total')) return 130;
      return 100;
    }

    // ID fields (typically UUIDs shown truncated or as links)
    if (fieldNameLower.endsWith('id') && field.Length <= 50) return 100;

    // Email - needs more space
    if (fieldNameLower.includes('email')) return 220;

    // Phone numbers
    if (fieldNameLower.includes('phone') || fieldNameLower.includes('mobile') || fieldNameLower.includes('fax')) return 140;

    // Description fields - give them adequate room (increased from 150)
    if (fieldNameLower.includes('description')) return 250;

    // Name fields - medium width
    if (fieldNameLower.includes('name') || fieldNameLower.includes('title')) {
      if (fieldNameLower === 'firstname' || fieldNameLower === 'lastname' ||
          fieldNameLower === 'first name' || fieldNameLower === 'last name') return 130;
      return 180;
    }

    // Location fields
    if (fieldNameLower.includes('city')) return 130;
    if (fieldNameLower.includes('state') || fieldNameLower.includes('country')) return 110;
    if (fieldNameLower.includes('zip') || fieldNameLower.includes('postal')) return 100;
    if (fieldNameLower.includes('address')) return 220;

    // Date-like strings
    if (fieldNameLower.includes('date') || fieldNameLower.includes('time')) return 130;

    // Status/Type/Category fields
    if (fieldNameLower.includes('status') || fieldNameLower.includes('type') ||
        fieldNameLower.includes('category') || fieldNameLower.includes('mode')) return 130;

    // Code/abbreviation fields
    if (fieldNameLower.includes('code') || fieldNameLower.includes('abbr')) return 110;

    // Long text fields - give them more room (nvarchar(max) has Length < 0)
    if (field.Length < 0) return 250;  // nvarchar(max)
    if (field.Length > 500) return 220;
    if (field.Length > 200) return 200;

    // Default: estimate based on field length with reasonable bounds
    const estimatedChars = Math.min(field.Length || 50, 40);
    return Math.max(estimatedChars * 6 + 24, 100);
  }

  private mapFieldTypeToGridType(fieldType: string): 'string' | 'number' | 'boolean' | 'date' | 'datetime' {
    switch (fieldType.toLowerCase()) {
      case 'int':
      case 'bigint':
      case 'smallint':
      case 'tinyint':
      case 'decimal':
      case 'numeric':
      case 'float':
      case 'real':
      case 'money':
      case 'smallmoney':
        return 'number';
      case 'bit':
        return 'boolean';
      case 'date':
        return 'date';
      case 'datetime':
      case 'datetime2':
      case 'smalldatetime':
      case 'datetimeoffset':
        return 'datetime';
      default:
        return 'string';
    }
  }

  private initializeColumnStates(): void {
    this._columnStates = this._columns.map((config, index) => ({
      config,
      computedWidth: typeof config.width === 'number' ? config.width : 150,
      sortDirection: config.sortDirection || 'none',
      sortIndex: config.sortIndex || 0,
      filterValue: undefined,
      visible: config.visible !== false,
      order: index
    }));
  }

  // ========================================
  // AG Grid Column Building
  // ========================================

  private buildAgColumnDefs(): void {
    if (this._gridState?.columnSettings?.length && this._entityInfo) {
      this.agColumnDefs = this.buildAgColumnDefsFromGridState(this._gridState.columnSettings);
    } else if (this._columns.length > 0) {
      this.agColumnDefs = this._columns.map(col => this.mapColumnConfigToColDef(col));
    } else if (this._entityInfo) {
      this.agColumnDefs = this.generateAgColumnDefs(this._entityInfo);
    } else {
      this.agColumnDefs = [];
    }

    // Add row number column if enabled
    if (this._showRowNumbers && this.agColumnDefs.length > 0) {
      this.agColumnDefs.unshift({
        headerName: '#',
        field: '__rowNumber',
        width: 60,
        minWidth: 50,
        maxWidth: 80,
        sortable: false,
        resizable: false,
        valueGetter: (params) => params.node ? params.node.rowIndex! + 1 : ''
      });
    }
  }

  private buildAgColumnDefsFromGridState(columnSettings: ViewColumnConfig[]): ColDef[] {
    if (!this._entityInfo) return [];

    const sortedColumns = [...columnSettings].sort((a, b) =>
      (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
    );

    const cols: ColDef[] = [];

    for (const colConfig of sortedColumns) {
      if (colConfig.hidden) continue;

      const field = this._entityInfo.Fields.find(f =>
        f.Name.toLowerCase() === colConfig.Name.toLowerCase()
      );

      if (!field) continue;

      const colDef: ColDef = {
        field: field.Name,
        // Use userDisplayName if set, otherwise fall back to DisplayName or field name
        headerName: colConfig.userDisplayName || colConfig.DisplayName || field.DisplayNameOrName,
        width: colConfig.width || this.estimateColumnWidth(field),
        sortable: this._allowSorting,
        resizable: this._allowColumnResize
      };

      // Add type-specific formatters with optional custom format
      this.applyFieldFormatter(colDef, field, colConfig.format);

      cols.push(colDef);
    }

    return cols;
  }

  private mapColumnConfigToColDef(col: GridColumnConfig): ColDef {
    const colDef: ColDef = {
      field: col.field,
      headerName: col.title || col.field,
      width: typeof col.width === 'number' ? col.width : undefined,
      minWidth: col.minWidth,
      maxWidth: col.maxWidth,
      sortable: col.sortable !== false && this._allowSorting,
      filter: false,
      resizable: col.resizable !== false && this._allowColumnResize,
      hide: col.visible === false
    };

    // Apply field formatter for highlighting and type-specific formatting
    // if we have entity metadata for this field
    if (this._entityInfo) {
      const field = this._entityInfo.Fields.find(f =>
        f.Name.toLowerCase() === col.field.toLowerCase()
      );
      if (field) {
        this.applyFieldFormatter(colDef, field);
      }
    }

    return colDef;
  }

  private generateAgColumnDefs(entity: EntityInfo): ColDef[] {
    const cols: ColDef[] = [];
    let visibleFields = entity.Fields.filter(f => this.shouldShowField(f));

    // Fallback: if no DefaultInView fields are defined, show first 10 non-system fields
    // sorted by importance to give users a reasonable starting point
    if (visibleFields.length === 0) {
      visibleFields = this.getDefaultFieldsFallback(entity);
    }

    // Sort fields by importance for better default ordering
    visibleFields = this.sortFieldsByImportance(visibleFields);

    for (const field of visibleFields) {
      const colDef: ColDef = {
        field: field.Name,
        headerName: field.DisplayNameOrName,
        width: this.estimateColumnWidth(field),
        sortable: this._allowSorting,
        resizable: this._allowColumnResize,
        headerTooltip: this.buildHeaderTooltip(field)
      };

      this.applyFieldFormatter(colDef, field);
      cols.push(colDef);
    }

    return cols;
  }

  /**
   * When no DefaultInView fields are set, fall back to showing the first 10
   * non-system, non-PK fields to give users something reasonable to start with.
   */
  private getDefaultFieldsFallback(entity: EntityInfo): EntityFieldInfo[] {
    return entity.Fields
      .filter(f =>
        !f.Name.startsWith('__mj_') &&
        !(f.IsPrimaryKey && f.SQLFullType?.toLowerCase() === 'uniqueidentifier') &&
        (f.Length <= 500 || f.Length < 0)  // Exclude very long text unless nvarchar(max)
      )
      .slice(0, 10);
  }

  /**
   * Sort fields by importance for better default column ordering.
   * Name fields first, then status/type, then other fields, with system fields last.
   */
  private sortFieldsByImportance(fields: EntityFieldInfo[]): EntityFieldInfo[] {
    return [...fields].sort((a, b) => {
      const priorityA = this.getFieldPriority(a);
      const priorityB = this.getFieldPriority(b);
      return priorityA - priorityB;
    });
  }

  private getFieldPriority(field: EntityFieldInfo): number {
    const nameLower = field.Name.toLowerCase();

    // Name fields first
    if (field.IsNameField) return 0;
    if (nameLower === 'name' || nameLower === 'title') return 1;

    // Status and type fields are important
    if (nameLower === 'status') return 2;
    if (nameLower === 'type' || nameLower === 'category') return 3;

    // Other name-like fields
    if (nameLower.endsWith('name') && !nameLower.endsWith('typename')) return 4;

    // Description fields
    if (nameLower.includes('description')) return 5;

    // Date fields
    if (field.TSType === 'Date') return 50;

    // Foreign keys (usually IDs pointing to other entities)
    if (field.RelatedEntityID) return 60;

    // Numbers
    if (field.TSType === 'number') return 70;

    // Booleans toward the end
    if (field.TSType === 'boolean') return 80;

    // Long text fields at the end
    if ((field.Length > 500 || field.Length < 0)) return 90;

    // System fields last (though they should be filtered out already)
    if (field.Name.startsWith('__mj_')) return 100;

    // Default priority
    return 40;
  }

  /**
   * Build a tooltip for the column header showing field details.
   */
  private buildHeaderTooltip(field: EntityFieldInfo): string {
    const parts: string[] = [];

    // Show internal field name if different from display name
    if (field.DisplayName && field.DisplayName !== field.Name) {
      parts.push(`Field: ${field.Name}`);
    }

    // Show description if available
    if (field.Description) {
      parts.push(field.Description);
    }

    // Show type info
    const typeInfo = field.Type + (field.Length && field.Length > 0 ? `(${field.Length})` : '');
    parts.push(`Type: ${typeInfo}`);

    return parts.join('\n');
  }

  private applyFieldFormatter(colDef: ColDef, field: EntityFieldInfo, customFormat?: ColumnFormat): void {
    // Store type info for use in cell renderer
    const fieldType = field.TSType;
    const fieldNameLower = field.Name.toLowerCase();
    const extendedType = field.ExtendedType?.toLowerCase() || '';
    const vc = this.effectiveVisualConfig;

    // Determine special field types using ExtendedType metadata first, then field name patterns as fallback
    const isCurrency = customFormat?.type === 'currency' ||
                       fieldNameLower.includes('amount') ||
                       fieldNameLower.includes('price') ||
                       fieldNameLower.includes('cost') ||
                       fieldNameLower.includes('total');
    // Use ExtendedType='Email' from metadata, fallback to field name pattern
    const isEmail = extendedType === 'email' ||
                    (!extendedType && fieldNameLower.includes('email'));
    // Use ExtendedType='URL' from metadata, fallback to field name pattern
    const isUrl = extendedType === 'url' ||
                  (!extendedType && (fieldNameLower.includes('url') ||
                                     fieldNameLower.includes('website') ||
                                     fieldNameLower.includes('link')));
    // Use ExtendedType='Tel' from metadata, fallback to field name pattern
    const isPhone = extendedType === 'tel' ||
                    (!extendedType && (fieldNameLower.includes('phone') ||
                                       fieldNameLower.includes('mobile') ||
                                       fieldNameLower.includes('fax')));

    // Check if this is a foreign key field (has a related entity)
    // Also check if this is a virtual display field that corresponds to an FK field
    let isForeignKey = !!field.RelatedEntityID;
    let fkField: EntityFieldInfo | undefined = field;
    let relatedEntityName = isForeignKey ? field.RelatedEntity : undefined;

    // If this field doesn't have RelatedEntityID but is virtual, check for a corresponding FK field
    // Pattern: for a field named "Category", look for "CategoryID" with RelatedEntityID
    if (!isForeignKey && field.IsVirtual && this._entityInfo) {
      const potentialFkFieldName = field.Name + 'ID';
      const correspondingFkField = this._entityInfo.Fields.find(
        f => f.Name.toLowerCase() === potentialFkFieldName.toLowerCase() && f.RelatedEntityID
      );
      if (correspondingFkField) {
        isForeignKey = true;
        fkField = correspondingFkField;
        relatedEntityName = correspondingFkField.RelatedEntity;
      }
    }

    // Apply alignment - use custom format alignment if provided, otherwise default to right for numbers
    const customAlign = customFormat?.align;
    if (customAlign) {
      colDef.cellClass = `cell-align-${customAlign}`;
      colDef.headerClass = `header-align-${customAlign}`;
    } else if (vc.rightAlignNumbers && (fieldType === 'number' || isCurrency)) {
      colDef.cellClass = 'cell-align-right';
      colDef.headerClass = 'header-align-right';
    }

    // Apply custom header style if provided
    if (customFormat?.headerStyle) {
      const headerStyle = this.buildCssStyle(customFormat.headerStyle);
      if (headerStyle) {
        colDef.headerClass = (colDef.headerClass || '') + ' custom-header-style';
        // AG Grid uses headerStyle for inline styles
        (colDef as ColDef & { headerStyle: Record<string, string> }).headerStyle = this.buildStyleObject(customFormat.headerStyle);
      }
    }

    // Use cellRenderer for highlighting support and enhanced formatting
    colDef.cellRenderer = (params: ICellRendererParams) => {
      if (params.value === null || params.value === undefined) {
        return '<span class="cell-empty">—</span>';
      }

      // Handle foreign key fields - render as clickable links
      // Only apply FK rendering if no custom format is specified
      if (isForeignKey && !customFormat && fkField?.RelatedEntityID) {
        // For virtual display fields, we show the display value but link to the FK value
        // For direct FK fields, the value IS the FK value
        const isVirtualDisplay = field.IsVirtual && fkField !== field;
        const displayValue = String(params.value);

        // Get the actual FK value - for virtual fields, look it up from row data
        let fkValue: string;
        if (isVirtualDisplay && params.data) {
          // Get the FK value from the corresponding FK field in the row data
          fkValue = String(params.data[fkField.Name] ?? '');
        } else {
          fkValue = displayValue;
        }

        // Skip if we don't have a valid FK value
        if (!fkValue) {
          return `<span>${HighlightUtil.escapeHtml(displayValue)}</span>`;
        }

        const escapedDisplayValue = HighlightUtil.escapeHtml(displayValue);
        const escapedFieldName = HighlightUtil.escapeHtml(fkField.Name);
        const escapedRelatedEntityId = HighlightUtil.escapeHtml(fkField.RelatedEntityID);
        const escapedRelatedEntityName = relatedEntityName ? HighlightUtil.escapeHtml(relatedEntityName) : '';

        // Build data attributes for the click handler
        const dataAttrs = `data-related-entity-id="${escapedRelatedEntityId}" data-record-id="${fkValue}" data-field-name="${escapedFieldName}"${relatedEntityName ? ` data-related-entity-name="${escapedRelatedEntityName}"` : ''}`;

        // Apply highlighting if filter text is set
        const displayText = this._filterText
          ? HighlightUtil.highlight(displayValue, this._filterText, true)
          : escapedDisplayValue;

        // NOTE: Do NOT add onclick="event.stopPropagation()" here - it prevents AG Grid's cellClicked from firing
        const linkHtml = `<a href="javascript:void(0)" class="cell-link cell-fk-link" ${dataAttrs}>${displayText}</a>`;

        return linkHtml;
      }

      let displayValue = '';
      let extraClass = '';
      let inlineStyle = '';
      let isHtmlContent = false; // Track if displayValue contains HTML (icons, links)

      // Build inline style from custom cell style
      if (customFormat?.cellStyle) {
        inlineStyle = this.buildCssStyle(customFormat.cellStyle);
      }

      // Check if custom format is provided and has a non-auto type
      const useCustomFormat = customFormat && customFormat.type && customFormat.type !== 'auto';

      if (useCustomFormat) {
        // Use custom formatting
        displayValue = this.formatValueWithCustomFormat(params.value, customFormat);
        // Check if formatCustomBoolean returned HTML (icon or checkbox)
        if (customFormat.type === 'boolean' &&
            (customFormat.booleanDisplay === 'icon' || customFormat.booleanDisplay === 'checkbox')) {
          isHtmlContent = true;
        }
      } else {
        // Use default formatting based on field type
        // Boolean formatting
        if (fieldType === 'boolean') {
          if (vc.booleanIcons) {
            const iconClass = params.value
              ? 'fa-solid fa-check cell-boolean-true'
              : 'fa-solid fa-xmark cell-boolean-false';
            displayValue = `<i class="${iconClass}"></i>`;
            isHtmlContent = true;
          } else {
            displayValue = params.value ? 'Yes' : 'No';
          }
        }
        // Date formatting
        else if (fieldType === 'Date') {
          const date = params.value instanceof Date ? params.value : new Date(params.value as string);
          if (isNaN(date.getTime())) {
            displayValue = String(params.value);
          } else if (vc.friendlyDates) {
            displayValue = date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
          } else {
            displayValue = date.toISOString().split('T')[0];
          }
        }
        // Currency formatting
        else if (fieldType === 'number' && isCurrency) {
          const num = Number(params.value);
          displayValue = isNaN(num) ? String(params.value) : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        // Regular number formatting
        else if (fieldType === 'number') {
          const num = Number(params.value);
          displayValue = isNaN(num) ? String(params.value) : num.toLocaleString();
        }
        // Email formatting
        else if (isEmail && vc.clickableEmails) {
          const email = String(params.value);
          const escapedEmail = HighlightUtil.escapeHtml(email);
          if (this._filterText) {
            const highlighted = HighlightUtil.highlight(email, this._filterText, true);
            return this.wrapWithStyle(`<a href="mailto:${escapedEmail}" class="cell-link cell-email" onclick="event.stopPropagation()">${highlighted}</a>`, inlineStyle);
          }
          return this.wrapWithStyle(`<a href="mailto:${escapedEmail}" class="cell-link cell-email" onclick="event.stopPropagation()">${escapedEmail}</a>`, inlineStyle);
        }
        // URL formatting
        else if (isUrl && vc.clickableUrls) {
          let url = String(params.value);
          if (url && !url.startsWith('http')) {
            url = 'https://' + url;
          }
          const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const escapedDisplay = HighlightUtil.escapeHtml(displayUrl);
          if (this._filterText) {
            const highlighted = HighlightUtil.highlight(displayUrl, this._filterText, true);
            return this.wrapWithStyle(`<a href="${HighlightUtil.escapeHtml(url)}" target="_blank" class="cell-link cell-url" onclick="event.stopPropagation()">${highlighted}</a>`, inlineStyle);
          }
          return this.wrapWithStyle(`<a href="${HighlightUtil.escapeHtml(url)}" target="_blank" class="cell-link cell-url" onclick="event.stopPropagation()">${escapedDisplay}</a>`, inlineStyle);
        }
        // Phone formatting
        else if (isPhone) {
          displayValue = String(params.value);
          extraClass = 'cell-phone';
        }
        // Default string formatting
        else {
          displayValue = String(params.value);
        }
      }

      // Build the span with optional style and class
      const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';
      const classAttr = extraClass ? ` class="${extraClass}"` : '';

      // Handle content that's already HTML (icons, etc.)
      if (isHtmlContent) {
        if (inlineStyle) {
          return `<span${styleAttr}>${displayValue}</span>`;
        }
        return displayValue;
      }

      // Apply highlighting if filterText is set
      if (this._filterText && displayValue) {
        return `<span${classAttr}${styleAttr}>${HighlightUtil.highlight(displayValue, this._filterText, true)}</span>`;
      }

      return `<span${classAttr}${styleAttr}>${HighlightUtil.escapeHtml(displayValue)}</span>`;
    };
  }

  /**
   * Helper to wrap content with an inline style span
   */
  private wrapWithStyle(content: string, style: string): string {
    if (!style) return content;
    return `<span style="${style}">${content}</span>`;
  }

  /**
   * Build a CSS style string from a ColumnTextStyle object
   */
  private buildCssStyle(style: ColumnTextStyle): string {
    const parts: string[] = [];
    if (style.bold) parts.push('font-weight: bold');
    if (style.italic) parts.push('font-style: italic');
    if (style.underline) parts.push('text-decoration: underline');
    if (style.color) parts.push(`color: ${style.color}`);
    if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`);
    return parts.join('; ');
  }

  /**
   * Build a style object for AG Grid from a ColumnTextStyle object
   */
  private buildStyleObject(style: ColumnTextStyle): Record<string, string> {
    const obj: Record<string, string> = {};
    if (style.bold) obj['fontWeight'] = 'bold';
    if (style.italic) obj['fontStyle'] = 'italic';
    if (style.underline) obj['textDecoration'] = 'underline';
    if (style.color) obj['color'] = style.color;
    if (style.backgroundColor) obj['backgroundColor'] = style.backgroundColor;
    return obj;
  }

  /**
   * Format a value using custom ColumnFormat settings
   */
  private formatValueWithCustomFormat(value: unknown, format: ColumnFormat): string {
    if (value == null) return '—';

    switch (format.type) {
      case 'number':
        return this.formatCustomNumber(value as number, format);
      case 'currency':
        return this.formatCustomCurrency(value as number, format);
      case 'percent':
        return this.formatCustomPercent(value as number, format);
      case 'date':
      case 'datetime':
        return this.formatCustomDate(value, format);
      case 'boolean':
        return this.formatCustomBoolean(value as boolean, format);
      default:
        return String(value);
    }
  }

  private formatCustomNumber(value: number, format: ColumnFormat): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);

    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: format.decimals ?? 0,
      maximumFractionDigits: format.decimals ?? 0,
      useGrouping: format.thousandsSeparator ?? true
    };
    return new Intl.NumberFormat('en-US', options).format(num);
  }

  private formatCustomCurrency(value: number, format: ColumnFormat): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);

    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: format.currencyCode || 'USD',
      minimumFractionDigits: format.decimals ?? 2,
      maximumFractionDigits: format.decimals ?? 2
    };
    return new Intl.NumberFormat('en-US', options).format(num);
  }

  private formatCustomPercent(value: number, format: ColumnFormat): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);

    const options: Intl.NumberFormatOptions = {
      style: 'percent',
      minimumFractionDigits: format.decimals ?? 0,
      maximumFractionDigits: format.decimals ?? 0
    };
    // Assume value is already a percentage (e.g., 50 = 50%), divide by 100
    return new Intl.NumberFormat('en-US', options).format(num / 100);
  }

  private formatCustomDate(value: unknown, format: ColumnFormat): string {
    const date = value instanceof Date ? value : new Date(value as string);
    if (isNaN(date.getTime())) return String(value);

    // Parse format string - check for weekday variants
    const formatStr = format.dateFormat || 'medium';
    const includeWeekday = formatStr.includes('-weekday');
    const baseFormat = formatStr.replace('-weekday', '') as 'short' | 'medium' | 'long';

    let options: Intl.DateTimeFormatOptions;

    // Intl.DateTimeFormat doesn't allow combining dateStyle with weekday
    // So we must use individual components when weekday is requested
    if (includeWeekday) {
      if (baseFormat === 'short') {
        options = { weekday: 'short', month: 'numeric', day: 'numeric', year: '2-digit' };
      } else if (baseFormat === 'long') {
        options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      } else {
        // medium
        options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      }
      if (format.type === 'datetime') {
        options.hour = 'numeric';
        options.minute = '2-digit';
      }
    } else {
      // No weekday - can use dateStyle shorthand
      options = {
        dateStyle: baseFormat === 'short' ? 'short' : baseFormat === 'long' ? 'long' : 'medium'
      };
      if (format.type === 'datetime') {
        options.timeStyle = 'short';
      }
    }

    return new Intl.DateTimeFormat('en-US', options).format(date);
  }

  private formatCustomBoolean(value: boolean, format: ColumnFormat): string {
    if (format.booleanDisplay === 'icon') {
      const iconClass = value
        ? 'fa-solid fa-check cell-boolean-true'
        : 'fa-solid fa-xmark cell-boolean-false';
      return `<i class="${iconClass}"></i>`;
    }
    if (format.booleanDisplay === 'checkbox') {
      return value
        ? '<i class="fa-regular fa-square-check cell-boolean-true"></i>'
        : '<i class="fa-regular fa-square cell-boolean-false"></i>';
    }
    return value ? (format.trueLabel || 'Yes') : (format.falseLabel || 'No');
  }

  // ========================================
  // AG Grid Row Selection Configuration
  // ========================================

  private updateAgRowSelection(): void {
    switch (this._selectionMode) {
      case 'none':
        this.agRowSelection = { mode: 'singleRow', enableClickSelection: false, checkboxes: false };
        break;
      case 'single':
        this.agRowSelection = { mode: 'singleRow', enableClickSelection: true, checkboxes: false };
        break;
      case 'multiple':
        // enableSelectionWithoutKeys replaces deprecated rowMultiSelectWithClick (as of AG Grid v32.2)
        this.agRowSelection = { mode: 'multiRow', enableClickSelection: true, checkboxes: false, enableSelectionWithoutKeys: true };
        break;
      case 'checkbox':
        this.agRowSelection = {
          mode: 'multiRow',
          enableClickSelection: true,
          checkboxes: true,
          headerCheckbox: true,
          enableSelectionWithoutKeys: true
        };
        break;
    }

    // Update the grid if it's already initialized
    if (this.gridApi) {
      this.gridApi.setGridOption('rowSelection', this.agRowSelection);
    }
  }

  // ========================================
  // Data Loading
  // ========================================

  async loadData(isAutoRefresh: boolean = false): Promise<void> {
    if (this._useExternalData) {
      this.processData();
      return;
    }

    // Check if we have a valid data source via Params
    const hasDataSource = this._params && (
      this._params.ViewID ||
      this._params.ViewName ||
      this._params.ViewEntity ||
      this._params.EntityName
    );

    if (!hasDataSource) {
      return;
    }

    // Check AllowLoad for deferred loading
    if (!this._allowLoad) {
      return;
    }

    // For infinite scroll mode, setup or refresh the datasource
    if (this._paginationMode === 'infinite') {
      if (this.gridApi) {
        if (!this.infiniteDatasource) {
          this.setupInfiniteScroll();
        } else {
          this.refreshInfiniteCache();
        }
      }
      // In infinite mode, the datasource handles loading, so we're done
      return;
    }

    // If a load is already in progress, return the existing promise
    // This prevents redundant API calls when loadData is called multiple times
    if (this._loadDataPromise) {
      return this._loadDataPromise;
    }

    // Wrap the actual loading logic in a promise we can track
    this._loadDataPromise = this.executeLoadData(isAutoRefresh);

    try {
      await this._loadDataPromise;
    } finally {
      this._loadDataPromise = null;
    }
  }

  /**
   * Internal method that performs the actual data loading.
   * Called by loadData() which handles promise deduplication.
   */
  private async executeLoadData(isAutoRefresh: boolean): Promise<void> {
    // Client-side mode - load all data upfront
    const beforeRefreshEvent = new BeforeDataRefreshEventArgs(this, isAutoRefresh);
    this.BeforeDataRefresh.emit(beforeRefreshEvent);
    if (beforeRefreshEvent.cancel) {
      return;
    }

    // Build the RunViewParams - prefer new Params input over legacy inputs
    const runViewParams = this.buildRunViewParams();

    // Create GridRunViewParams for events (backward compatibility)
    const gridParams: GridRunViewParams = {
      entityName: runViewParams.EntityName || this._entityInfo?.Name || '',
      extraFilter: runViewParams.ExtraFilter || '',
      orderBy: runViewParams.OrderBy || '',
      maxRows: runViewParams.MaxRows || 0,
      fields: runViewParams.Fields,
      searchString: runViewParams.UserSearchString || ''
    };

    const beforeLoadEvent = new BeforeDataLoadEventArgs(this, gridParams);
    this.BeforeDataLoad.emit(beforeLoadEvent);
    if (beforeLoadEvent.cancel) {
      return;
    }

    // Apply any modifications from beforeLoadEvent
    if (beforeLoadEvent.modifiedParams) {
      if (beforeLoadEvent.modifiedParams.extraFilter) {
        runViewParams.ExtraFilter = beforeLoadEvent.modifiedParams.extraFilter;
      }
      if (beforeLoadEvent.modifiedParams.orderBy) {
        runViewParams.OrderBy = beforeLoadEvent.modifiedParams.orderBy;
      }
      if (beforeLoadEvent.modifiedParams.maxRows) {
        runViewParams.MaxRows = beforeLoadEvent.modifiedParams.maxRows;
      }
      if (beforeLoadEvent.modifiedParams.fields) {
        runViewParams.Fields = beforeLoadEvent.modifiedParams.fields;
      }
      if (beforeLoadEvent.modifiedParams.searchString) {
        runViewParams.UserSearchString = beforeLoadEvent.modifiedParams.searchString;
      }
    }

    this.loading = true;
    this._aggregatesLoading = true;
    this.errorMessage = '';
    this.cdr.detectChanges();

    const startTime = performance.now();

    try {
      // Build aggregate expressions from config if present
      let aggregateExpressions: AggregateExpression[] | undefined;
      if (this._aggregatesConfig?.expressions?.length) {
        aggregateExpressions = this._aggregatesConfig.expressions
          .filter(agg => agg.enabled !== false && agg.expression)
          .map(agg => ({
            expression: agg.expression,
            alias: agg.id || agg.label || agg.expression
          }));
      }

      const rv = new RunView();
      const result = await rv.RunView<BaseEntity>({
        ...runViewParams,
        ResultType: 'entity_object',
        Aggregates: aggregateExpressions
      });

      const loadTimeMs = performance.now() - startTime;

      if (result.Success) {
        this._allData = result.Results || [];
        this.totalRowCount = result.TotalRowCount || this._allData.length;
        this.processData();

        // Process aggregate results
        this.processAggregateResults(result.AggregateResults, result.AggregateExecutionTime);

        // Reapply sort state to grid after data load to maintain visual indicators
        // Use Promise.resolve() to defer until after Angular's change detection cycle
        // has completed and AG Grid has processed the new row data
        if (this._sortState.length > 0) {
          Promise.resolve().then(() => {
            this.applySortStateToGrid();
          });
        }

        const afterLoadEvent = new AfterDataLoadEventArgs(
          this,
          gridParams,
          true,
          this.totalRowCount,
          this._allData.length,
          loadTimeMs
        );
        this.AfterDataLoad.emit(afterLoadEvent);

        const afterRefreshEvent = new AfterDataRefreshEventArgs(
          this,
          true,
          this.totalRowCount,
          loadTimeMs
        );
        this.AfterDataRefresh.emit(afterRefreshEvent);
      } else {
        this.errorMessage = result.ErrorMessage || 'Failed to load data';

        const afterLoadEvent = new AfterDataLoadEventArgs(
          this,
          gridParams,
          false,
          0,
          0,
          loadTimeMs,
          this.errorMessage
        );
        this.AfterDataLoad.emit(afterLoadEvent);
      }
    } catch (error) {
      const loadTimeMs = performance.now() - startTime;
      this.errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      const afterLoadEvent = new AfterDataLoadEventArgs(
        this,
        gridParams,
        false,
        0,
        0,
        loadTimeMs,
        this.errorMessage
      );
      this.AfterDataLoad.emit(afterLoadEvent);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Builds RunViewParams from the Params input.
   * Requires Params to be set - the grid needs a data source configured.
   */
  private buildRunViewParams(): RunViewParams {
    if (!this._params) {
      throw new Error('Params must be set before loading data');
    }

    const params: RunViewParams = { ...this._params };

    // Apply sort state (may be modified by user interactions)
    const orderBy = this.buildOrderByClause();
    if (orderBy) {
      params.OrderBy = orderBy;
    }

    return params;
  }

  private buildOrderByClause(): string {
    if (this._sortState.length > 0) {
      return this._sortState
        .sort((a, b) => a.index - b.index)
        .map(s => `${s.field} ${s.direction.toUpperCase()}`)
        .join(', ');
    }
    // Fall back to OrderBy from Params if set
    return this._params?.OrderBy || '';
  }

  // ========================================
  // Infinite Scroll Data Source
  // ========================================

  /**
   * Creates and returns an AG Grid IDatasource for infinite scroll mode.
   * This datasource fetches data in pages from the server as the user scrolls.
   */
  private createInfiniteDatasource(): IDatasource {
    return {
      getRows: async (params: IGetRowsParams) => {
        const startRow = params.startRow;
        const endRow = params.endRow;
        const blockSize = endRow - startRow;

        try {
          // Build params with pagination
          const runViewParams = this.buildRunViewParams();
          runViewParams.StartRow = startRow;
          runViewParams.MaxRows = blockSize;

          const rv = new RunView();
          const result = await rv.RunView<BaseEntity>({
            ...runViewParams,
            ResultType: 'entity_object'
          });

          if (result.Success) {
            const entities = result.Results || [];

            // Process entities into row data
            const rowData = entities.map((entity, index) => {
              return this.entityToRowData(entity, startRow + index);
            });

            // Update total row count
            this.totalRowCount = result.TotalRowCount || 0;
            this.cdr.detectChanges();

            // Determine if we've reached the last row
            const lastRow = result.TotalRowCount != null && startRow + entities.length >= result.TotalRowCount
              ? result.TotalRowCount
              : undefined;

            params.successCallback(rowData, lastRow);
          } else {
            this.errorMessage = result.ErrorMessage || 'Failed to load data';
            this.cdr.detectChanges();
            params.failCallback();
          }
        } catch (error) {
          this.errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          this.cdr.detectChanges();
          params.failCallback();
        }
      }
    };
  }

  /**
   * Converts a BaseEntity to AG Grid row data format.
   * This is used by both client and infinite scroll modes for consistent data formatting.
   */
  private entityToRowData(entity: BaseEntity, index: number): Record<string, unknown> {
    const key = this.getRowKey(entity);

    // Store in row data map for later retrieval
    const rowData: GridRowData = {
      key,
      index,
      entity,
      selected: this._selectedKeys.includes(key),
      editing: this._editingRowKey === key,
      dirty: this._pendingChanges.some(c => c.rowKey === key),
      cssClasses: this.computeRowClasses(index, entity)
    };
    this._rowDataMap.set(key, rowData);

    // Build AG Grid row data
    const row: Record<string, unknown> = {
      __pk: key
    };

    if (this._entityInfo) {
      for (const field of this._entityInfo.Fields) {
        row[field.Name] = entity.Get(field.Name);
      }
    }

    return row;
  }

  /**
   * Sets up the grid for infinite scroll mode.
   * Called when PaginationMode is 'infinite'.
   */
  private setupInfiniteScroll(): void {
    if (!this.gridApi) return;

    // Create datasource
    this.infiniteDatasource = this.createInfiniteDatasource();

    // Set datasource on grid
    this.gridApi.setGridOption('datasource', this.infiniteDatasource);
  }

  /**
   * Refreshes the infinite scroll cache.
   * Call this when data source parameters change.
   */
  private refreshInfiniteCache(): void {
    if (!this.gridApi || this._paginationMode !== 'infinite') return;

    // Clear the row data map since we're refreshing
    this._rowDataMap.clear();

    // Purge cache and refresh
    this.gridApi.refreshInfiniteCache();

    // Reapply sort state to grid after refresh to maintain visual indicators
    // Use Promise.resolve() to defer until after AG Grid has processed the cache refresh
    if (this._sortState.length > 0) {
      Promise.resolve().then(() => {
        this.applySortStateToGrid();
      });
    }
  }

  private processData(): void {
    this._rowDataMap.clear();
    const dataSource = this._useExternalData ? this._data : this._allData;

    this.rowData = dataSource.map((entity, index) => {
      const key = this.getRowKey(entity);

      const rowData: GridRowData = {
        key,
        index,
        entity,
        selected: this._selectedKeys.includes(key),
        editing: this._editingRowKey === key,
        dirty: this._pendingChanges.some(c => c.rowKey === key),
        cssClasses: this.computeRowClasses(index, entity)
      };

      this._rowDataMap.set(key, rowData);

      // Build AG Grid row data
      const row: Record<string, unknown> = {
        __pk: key
      };

      if (this._entityInfo) {
        for (const field of this._entityInfo.Fields) {
          row[field.Name] = entity.Get(field.Name);
        }
      }

      return row;
    });

    this.cdr.detectChanges();
  }

  /**
   * Process aggregate results from RunView and emit the AggregatesLoaded event.
   * Builds the value map for easy lookup by expression or id.
   */
  private processAggregateResults(results: AggregateResult[] | undefined, executionTime?: number): void {
    this._aggregatesLoading = false;

    if (!results || results.length === 0) {
      this._aggregateResults = [];
      this._aggregateValues.clear();
      return;
    }

    this._aggregateResults = results;
    this._aggregateValues.clear();

    // Build the values map, keyed by alias (which is set to id or expression)
    for (const result of results) {
      if (!result.error) {
        this._aggregateValues.set(result.alias, result.value);
      }
    }

    // Also map by expression for easy lookup
    for (const result of results) {
      if (!result.error && result.expression !== result.alias) {
        this._aggregateValues.set(result.expression, result.value);
      }
    }

    // Emit the aggregates loaded event
    this.AggregatesLoaded.emit({
      results: this._aggregateResults,
      values: this._aggregateValues,
      executionTime
    });

    this.cdr.detectChanges();
  }

  private getRowKey(entity: BaseEntity): string {
    // Use composite key if available
    if (entity.PrimaryKey) {
      return entity.PrimaryKey.ToConcatenatedString();
    }
    const keyValue = entity.Get(this._keyField);
    return keyValue != null ? String(keyValue) : '';
  }

  private computeRowClasses(index: number, _entity: BaseEntity): string[] {
    const classes: string[] = [];
    if (this._striped && index % 2 === 1) {
      classes.push('grid-row-alt');
    }
    return classes;
  }

  // ========================================
  // AG Grid Event Handlers
  // ========================================

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.updateSelection();

    if (this._sortState.length > 0) {
      this.applySortStateToGrid();
    }

    // Smart column sizing: use our estimated widths but ensure grid fills available space
    // without making columns excessively wide
    this.autoSizeColumnsSmartly(event.api);

    // Setup infinite scroll if in that mode and we have params
    if (this._paginationMode === 'infinite' && this._allowLoad && this._params) {
      this.setupInfiniteScroll();
    }
  }

  /**
   * Smart column auto-sizing that respects our width estimates
   * while ensuring the grid fills available space appropriately
   */
  private autoSizeColumnsSmartly(api: GridApi): void {
    // Get total estimated width from our column definitions
    const totalEstimatedWidth = this.agColumnDefs.reduce((sum, col) => sum + (col.width || 150), 0);

    // Get available width from the grid container
    const gridElement = this.elementRef.nativeElement.querySelector('.mj-ag-grid');
    const availableWidth = gridElement?.clientWidth || 0;

    if (availableWidth > 0 && totalEstimatedWidth < availableWidth) {
      // If our columns are narrower than available space, stretch proportionally
      // but cap individual column growth to prevent excessive widths
      const ratio = availableWidth / totalEstimatedWidth;
      const maxRatio = 1.5; // Don't let columns grow more than 50%

      if (ratio <= maxRatio) {
        // Moderate stretch - use sizeColumnsToFit
        api.sizeColumnsToFit();
      } else {
        // Too much stretch - just use our estimated widths
        // The grid will have some empty space on the right, which is fine
      }
    }
    // If our columns are wider than available space, let the user scroll horizontally
    // (AG Grid handles this automatically)
  }

  onAgRowClicked(event: RowClickedEvent): void {
    if (!this._entityInfo || !event.data) return;

    const pkString = event.data['__pk'] as string;
    const rowData = this._rowDataMap.get(pkString);
    if (!rowData) return;

    // Fire before click event
    const mouseEvent = event.event as MouseEvent;
    const beforeEvent = new BeforeRowClickEventArgs(
      this,
      rowData.entity,
      rowData.index,
      pkString,
      mouseEvent,
      undefined,
      undefined
    );
    this.BeforeRowClick.emit(beforeEvent);
    if (beforeEvent.cancel) return;

    // Fire after click event
    const afterEvent = new AfterRowClickEventArgs(
      this,
      rowData.entity,
      rowData.index,
      pkString,
      mouseEvent,
      undefined,
      undefined
    );
    this.AfterRowClick.emit(afterEvent);

    // Auto-navigate on single click (if enabled and not navigating on double-click only)
    if (this._autoNavigate && !this._navigateOnDoubleClick && this._editMode === 'none') {
      this.emitNavigationRequest(rowData.entity, pkString);
    }
  }

  onAgRowDoubleClicked(event: RowDoubleClickedEvent): void {
    if (!this._entityInfo || !event.data) return;

    const pkString = event.data['__pk'] as string;
    const rowData = this._rowDataMap.get(pkString);
    if (!rowData) return;

    // Fire before double-click event
    const mouseEvent = event.event as MouseEvent;
    const beforeEvent = new BeforeRowDoubleClickEventArgs(
      this,
      rowData.entity,
      rowData.index,
      pkString,
      mouseEvent,
      undefined,
      undefined
    );
    this.BeforeRowDoubleClick.emit(beforeEvent);
    if (beforeEvent.cancel) return;

    // Fire after double-click event
    const afterEvent = new AfterRowDoubleClickEventArgs(
      this,
      rowData.entity,
      rowData.index,
      pkString,
      mouseEvent,
      undefined,
      undefined
    );
    this.AfterRowDoubleClick.emit(afterEvent);

    // Auto-navigate on double-click (if enabled)
    if (this._autoNavigate && this._navigateOnDoubleClick && this._editMode === 'none') {
      this.emitNavigationRequest(rowData.entity, pkString);
    }
  }

  /**
   * Handles cell click events to detect FK link clicks.
   * When a user clicks on a foreign key link, emits ForeignKeyClick event
   * for the parent component to handle navigation.
   */
  onAgCellClicked(event: CellClickedEvent): void {
    // Check if the click was on an FK link
    const target = event.event?.target as HTMLElement;
    if (!target) {
      return;
    }

    // Look for the FK link element (may be the target or a parent)
    const fkLink = target.closest('.cell-fk-link') as HTMLElement;
    if (!fkLink) {
      return;
    }

    // Prevent the row click handler from firing
    event.event?.stopPropagation();

    // Extract FK data from data attributes
    const relatedEntityId = fkLink.dataset['relatedEntityId'];
    const recordId = fkLink.dataset['recordId'];
    const fieldName = fkLink.dataset['fieldName'];
    const relatedEntityName = fkLink.dataset['relatedEntityName'];

    if (relatedEntityId && recordId && fieldName) {
      this.ForeignKeyClick.emit({
        relatedEntityId,
        recordId,
        fieldName,
        relatedEntityName
      });
    } else {
      //console.log('[FK Debug] Missing required data attributes, not emitting');
    }
  }

  /**
   * Emits a navigation request for the given entity record.
   */
  private emitNavigationRequest(entity: BaseEntity, compositeKey: string): void {
    if (!this._entityInfo) return;

    this.NavigationRequested.emit({
      entityInfo: this._entityInfo,
      record: entity,
      compositeKey
    });
  }

  onAgSortChanged(event: AgSortChangedEvent): void {
    if (this.suppressSortEvents) {
      return;
    }

    const sortModel = event.api.getColumnState()
      .filter(col => col.sort)
      .map(col => ({
        field: col.colId,
        direction: col.sort as 'asc' | 'desc',
        index: col.sortIndex ?? 0
      }));

    if (sortModel.length > 0) {
      // Find the column config
      const column = this._columnStates.find(c => c.config.field === sortModel[0].field);

      if (column) {
        // Fire before sort event
        const beforeEvent = new BeforeSortEventArgs(
          this,
          column.config,
          sortModel[0].direction,
          sortModel.length > 1,
          this._sortState
        );
        this.BeforeSort.emit(beforeEvent);
        if (beforeEvent.cancel) {
          // Revert to previous sort state
          this.applySortStateToGrid();
          return;
        }
      }

      this._sortState = sortModel;

      if (column) {
        // Fire after sort event
        const afterEvent = new AfterSortEventArgs(
          this,
          column.config,
          sortModel[0].direction,
          this._sortState
        );
        this.AfterSort.emit(afterEvent);
      }

      // User changed sort - mark as dirty and emit grid state changed
      this._isGridStateDirty = true;
      this.emitGridStateChanged('sort');

      // Determine if we need to reload data from server or can sort client-side
      // Client-side sorting is only possible if we have ALL the data loaded
      if (this._serverSideSorting && !this._useExternalData) {
        this.loadData(true);
      }
      // When using external data, parent receives afterSort event and can reload with new sort order
      // If we have all data, AG Grid handles client-side sorting automatically
    } else {
      this._sortState = [];
      // User cleared sort - mark as dirty and emit grid state changed
      this._isGridStateDirty = true;
      this.emitGridStateChanged('sort');
    }
  }

  onAgSelectionChanged(event: SelectionChangedEvent): void {
    const selectedNodes = event.api.getSelectedNodes();
    const previousSelection = [...this._selectedKeys];
    const newSelection = selectedNodes.map(node => node.data['__pk'] as string);

    // Find newly selected rows
    const addedKeys = newSelection.filter(k => !previousSelection.includes(k));
    const removedKeys = previousSelection.filter(k => !newSelection.includes(k));

    // Handle deselections
    for (const key of removedKeys) {
      const rowData = this._rowDataMap.get(key);
      if (rowData) {
        const beforeEvent = new BeforeRowDeselectEventArgs(
          this,
          rowData.entity,
          rowData.index,
          key,
          this._selectedKeys
        );
        this.BeforeRowDeselect.emit(beforeEvent);
        // Note: Can't cancel AG Grid's selection, but we emit the event
      }
    }

    // Handle selections
    for (const key of addedKeys) {
      const rowData = this._rowDataMap.get(key);
      if (rowData) {
        const beforeEvent = new BeforeRowSelectEventArgs(
          this,
          rowData.entity,
          rowData.index,
          key,
          addedKeys.length > 1,
          this._selectedKeys
        );
        this.BeforeRowSelect.emit(beforeEvent);
        // Note: Can't cancel AG Grid's selection, but we emit the event
      }
    }

    this._selectedKeys = newSelection;
    this.updateRowSelectionState();

    // Fire after events
    for (const key of removedKeys) {
      const rowData = this._rowDataMap.get(key);
      if (rowData) {
        const afterEvent = new AfterRowDeselectEventArgs(
          this,
          rowData.entity,
          rowData.index,
          key,
          this._selectedKeys,
          previousSelection
        );
        this.AfterRowDeselect.emit(afterEvent);
      }
    }

    for (const key of addedKeys) {
      const rowData = this._rowDataMap.get(key);
      if (rowData) {
        const afterEvent = new AfterRowSelectEventArgs(
          this,
          rowData.entity,
          rowData.index,
          key,
          addedKeys.length > 1,
          this._selectedKeys,
          previousSelection
        );
        this.AfterRowSelect.emit(afterEvent);
      }
    }

    this.SelectionChange.emit(this._selectedKeys);
  }

  onAgColumnResized(event: ColumnResizedEvent): void {
    if (event.finished && event.source !== 'api') {
      // User manually resized a column - mark as dirty
      this._isGridStateDirty = true;
      this.emitGridStateChanged('columns');
    }
  }

  onAgColumnMoved(event: ColumnMovedEvent): void {
    if (event.finished && event.source !== 'api') {
      // User manually moved a column - mark as dirty
      this._isGridStateDirty = true;
      this.emitGridStateChanged('columns');
    }
  }

  // ========================================
  // Grid State Management
  // ========================================

  private emitGridStateChanged(changeType: 'columns' | 'sort' | 'filter'): void {
    if (!this.gridApi || !this._entityInfo) return;

    // Only emit and persist if we're dirty (user made actual changes)
    // This prevents emitting stale state during view transitions
    if (!this._isGridStateDirty) {
      return;
    }

    const currentState = this.buildCurrentGridState();

    // Emit the event for external consumers
    this.GridStateChanged.emit({
      gridState: currentState,
      changeType
    });

    // Schedule auto-persist if enabled, but NOT during view transitions
    // (suppressPersist prevents old view's state from being saved to new view)
    if (this._autoPersistState && !this._suppressPersist && this.canEditCurrentView) {
      if (!this.IsDynamicView && this._viewEntity) {
        // Stored view - persist to UserView.GridState (debounced)
        // Track pending state for flush on destroy
        this._pendingViewStateToPersist = currentState;
        this.statePersistSubject.next(currentState);
      } else if (this.IsDynamicView) {
        // Dynamic view - persist to User Settings as defaults (debounced via same subject)
        // Track pending state for flush on destroy
        this._pendingUserDefaultsToPersist = currentState;
        this.userDefaultsPersistSubject.next(currentState);
      }
    }
  }

  /**
   * Persists the grid state to the UserView entity.
   * Only saves if the user has edit permission on the view.
   */
  private async persistGridStateToView(state: ViewGridStateConfig): Promise<void> {
    if (!this._viewEntity || this.isSavingState) {
      return;
    }

    // Check permission before saving
    if (!this._viewEntity.UserCanEdit) {
      this._pendingViewStateToPersist = null; // Clear pending since we can't save anyway
      return;
    }

    try {
      this.isSavingState = true;
      this.pendingStateToSave = state;

      // Build the grid state JSON matching ViewGridState format
      const gridStateJson: ViewGridState = {
        columnSettings: state.columnSettings,
        sortSettings: state.sortSettings,
        aggregates: state.aggregates
      };

      // Update the view entity's GridState
      this._viewEntity.GridState = JSON.stringify(gridStateJson);

      // Update SortState separately if changed
      if (state.sortSettings?.length) {
        this._viewEntity.SortState = JSON.stringify(
          state.sortSettings.map(s => ({
            field: s.field,
            dir: s.dir
          }))
        );
      }

      // Save the view entity
      const success = await this._viewEntity.Save();
      if (!success) {
        console.warn('[entity-data-grid] Failed to save view state:', this._viewEntity.LatestResult?.Message);
      } else {
        // Clear pending state and reset dirty flag after successful save
        this._pendingViewStateToPersist = null;
        this._isGridStateDirty = false;
      }
    } catch (error) {
      console.error('[entity-data-grid] Error persisting grid state:', error);
    } finally {
      this.isSavingState = false;
      this.pendingStateToSave = null;
    }
  }

  private buildCurrentGridState(): ViewGridStateConfig {
    if (!this.gridApi || !this._entityInfo || !this._entityInfo.Fields) {
      return { columnSettings: [], sortSettings: [] };
    }

    const columnState = this.gridApi.getColumnState();
    if (!columnState) {
      return { columnSettings: [], sortSettings: [] };
    }

    // Build lookup maps for existing custom properties to preserve them
    // AG Grid's column state doesn't track our custom format/userDisplayName properties,
    // so we need to carry them over from the current gridState
    const existingFormatsByName = new Map<string, ColumnFormat | undefined>();
    const existingUserDisplayNames = new Map<string, string | undefined>();
    if (this._gridState?.columnSettings) {
      for (const col of this._gridState.columnSettings) {
        const keyLower = col.Name.toLowerCase();
        if (col.format) {
          existingFormatsByName.set(keyLower, col.format);
        }
        if (col.userDisplayName) {
          existingUserDisplayNames.set(keyLower, col.userDisplayName);
        }
      }
    }

    const columnSettings: ViewColumnConfig[] = [];
    // Collect sorted columns with their sortIndex for proper ordering
    const sortedColumns: Array<{ field: string; dir: 'asc' | 'desc'; sortIndex: number }> = [];

    for (let i = 0; i < columnState.length; i++) {
      const col = columnState[i];
      if (col.colId === '__rowNumber') continue; // Skip row number column

      const field = this._entityInfo.Fields.find(f => f.Name === col.colId);

      if (field) {
        const keyLower = field.Name.toLowerCase();
        const colConfig: ViewColumnConfig = {
          ID: field.ID,
          Name: field.Name,
          DisplayName: field.DisplayNameOrName,
          hidden: col.hide ?? false,
          width: col.width ?? undefined,
          orderIndex: i
        };

        // Preserve format from existing gridState if present
        const existingFormat = existingFormatsByName.get(keyLower);
        if (existingFormat) {
          colConfig.format = existingFormat;
        }

        // Preserve userDisplayName from existing gridState if present
        const existingUserDisplayName = existingUserDisplayNames.get(keyLower);
        if (existingUserDisplayName) {
          colConfig.userDisplayName = existingUserDisplayName;
        }

        columnSettings.push(colConfig);
      }

      if (col.sort) {
        sortedColumns.push({
          field: col.colId,
          dir: col.sort as 'asc' | 'desc',
          sortIndex: col.sortIndex ?? 0
        });
      }
    }

    // Sort by sortIndex to maintain correct multi-sort priority order
    sortedColumns.sort((a, b) => a.sortIndex - b.sortIndex);
    const sortSettings: ViewSortConfig[] = sortedColumns.map(s => ({
      field: s.field,
      dir: s.dir
    }));

    // Include current aggregates config in the state
    return {
      columnSettings,
      sortSettings,
      aggregates: this._aggregatesConfig || this._gridState?.aggregates
    };
  }

  private applySortStateToGrid(): void {
    if (!this.gridApi || this._sortState.length === 0) {
      return;
    }

    const currentColumnState = this.gridApi.getColumnState();
    if (!currentColumnState) {
      return;
    }

    this.suppressSortEvents = true;
    try {
      const columnState = currentColumnState.map(col => {
        const sort = this._sortState.find(s => s.field === col.colId);
        return {
          ...col,
          sort: sort ? sort.direction : null,
          sortIndex: sort ? sort.index : null
        };
      });
      this.gridApi.applyColumnState({ state: columnState });
    } finally {
      this.suppressSortEvents = false;
    }
  }

  private updateSelection(): void {
    if (!this.gridApi || this._selectedKeys.length === 0) {
      this.gridApi?.deselectAll();
      return;
    }

    for (const key of this._selectedKeys) {
      const node = this.gridApi.getRowNode(key);
      if (node) {
        node.setSelected(true);
      }
    }
  }

  private updateRowSelectionState(): void {
    for (const rowData of this._rowDataMap.values()) {
      rowData.selected = this._selectedKeys.includes(rowData.key);
    }
    this.cdr.detectChanges();
  }

  // ========================================
  // Selection Public Methods
  // ========================================

  SelectRows(keys: string[], additive: boolean = false): void {
    if (!this.gridApi) return;

    if (!additive) {
      this.gridApi.deselectAll();
    }

    for (const key of keys) {
      const node = this.gridApi.getRowNode(key);
      if (node) {
        node.setSelected(true, !additive);
      }
    }
  }

  DeselectRows(keys: string[]): void {
    if (!this.gridApi) return;

    for (const key of keys) {
      const node = this.gridApi.getRowNode(key);
      if (node) {
        node.setSelected(false);
      }
    }
  }

  SelectAll(): void {
    this.gridApi?.selectAll();
  }

  ClearSelection(): void {
    this.gridApi?.deselectAll();
  }

  GetSelectedRows(): BaseEntity[] {
    return this._selectedKeys
      .map(key => this._rowDataMap.get(key)?.entity)
      .filter((e): e is BaseEntity => e !== undefined);
  }

  IsRowSelected(key: string): boolean {
    return this._selectedKeys.includes(key);
  }

  /**
   * Scrolls the grid to make the specified row visible.
   * @param key The primary key of the row to scroll to
   * @param position Where to position the row: 'top', 'middle', or 'bottom'
   */
  EnsureRowVisible(key: string, position: 'top' | 'middle' | 'bottom' = 'middle'): void {
    if (!this.gridApi) return;

    const node = this.gridApi.getRowNode(key);
    if (node) {
      this.gridApi.ensureNodeVisible(node, position);
    }
  }

  // ========================================
  // Public Methods
  // ========================================

  async Refresh(): Promise<void> {
    await this.loadData(false);
  }

  Clear(): void {
    this._allData = [];
    this._data = [];
    this._rowDataMap.clear();
    this._selectedKeys = [];
    this.rowData = [];
    this.totalRowCount = 0;
    this.cdr.detectChanges();
  }

  GetData(): BaseEntity[] {
    return this._useExternalData ? [...this._data] : [...this._allData];
  }

  GetRowByKey(key: string): BaseEntity | undefined {
    return this._rowDataMap.get(key)?.entity;
  }

  GetRowByIndex(index: number): BaseEntity | undefined {
    const dataSource = this._useExternalData ? this._data : this._allData;
    return dataSource[index];
  }

  GetState(): GridState {
    return {
      columns: this._columnStates.map(c => ({
        field: c.config.field,
        width: c.computedWidth,
        visible: c.visible,
        order: c.order
      })),
      sort: [...this._sortState],
      filters: [...this._filterState],
      selection: [...this._selectedKeys]
    };
  }

  SetState(state: GridState): void {
    for (const colState of state.columns) {
      const column = this._columnStates.find(c => c.config.field === colState.field);
      if (column) {
        column.computedWidth = colState.width;
        column.visible = colState.visible;
        column.order = colState.order;
      }
    }

    this._sortState = [...state.sort];
    for (const sort of this._sortState) {
      const column = this._columnStates.find(c => c.config.field === sort.field);
      if (column) {
        column.sortDirection = sort.direction;
        column.sortIndex = sort.index;
      }
    }

    this._filterState = [...state.filters];
    this._selectedKeys = [...state.selection];
    this.updateRowSelectionState();

    this.buildAgColumnDefs();
    this.cdr.detectChanges();
  }

  ResetState(): void {
    this.initializeColumnStates();
    this._sortState = [];
    this._filterState = [];
    this.ClearSelection();
    this.buildAgColumnDefs();
    this.cdr.detectChanges();
  }

  // ========================================
  // State Persistence
  // ========================================

  private scheduleStateSave(): void {
    if (!this._stateKey) return;
    this.statesSaveSubject.next();
  }

  private async loadPersistedState(): Promise<void> {
    // TODO: Load state from User Settings entity
  }

  // ========================================
  // Toolbar Click Handlers
  // ========================================

  onAddClick(): void {
    // Emit legacy events for backward compatibility
    this.AddRequested.emit();
    this.NewButtonClick.emit();

    // Emit navigation events based on CreateRecordMode
    if (this._entityInfo) {
      if (this._createRecordMode === 'Dialog') {
        this.NewRecordDialogRequested.emit({
          entityInfo: this._entityInfo,
          defaultValues: this._newRecordValues
        });
      } else {
        this.NewRecordTabRequested.emit({
          entityInfo: this._entityInfo,
          defaultValues: this._newRecordValues
        });
      }
    }
  }

  onDeleteClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length > 0) {
      this.DeleteRequested.emit(selectedRows);
      this.DeleteButtonClick.emit(selectedRows);
    }
  }

  onExportClick(): void {
    this.ExportRequested.emit();
    this.ExportButtonClick.emit();
    // Show the export dialog
    this.showExportDialogForCurrentData();
  }

  /**
   * Shows the export dialog for the current grid data
   */
  private showExportDialogForCurrentData(): void {
    const data = this.getExportData();
    const columns = this.getExportColumns();
    const fileName = this.getDefaultExportFileName();

    this.exportDialogConfig = {
      data,
      columns,
      defaultFileName: fileName,
      availableFormats: ['excel', 'csv', 'json'],
      defaultFormat: 'excel',
      showSamplingOptions: true,
      defaultSamplingMode: 'all',
      dialogTitle: `Export ${this._entityInfo?.Name || 'Data'}`
    };
    this.showExportDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Handle export dialog close
   */
  onExportDialogClosed(result: ExportDialogResult): void {
    this.showExportDialog = false;
    this.exportDialogConfig = null;
    this.cdr.detectChanges();
  }

  /**
   * Export grid data directly without showing dialog.
   * Use this for programmatic export with specific options.
   * @param options Export options (format, sampling, etc.)
   * @param download If true, automatically downloads the file. Default true.
   * @returns Export result with data buffer and metadata
   */
  async Export(options?: Partial<ExportOptions>, download: boolean = true): Promise<ExportResult> {
    const data = this.getExportData();
    const columns = this.getExportColumns();
    const fileName = options?.fileName || this.getDefaultExportFileName();

    const exportOptions: Partial<ExportOptions> = {
      format: 'excel',
      fileName,
      columns,
      includeHeaders: true,
      ...options
    };

    const result = await this.exportService.export(data, exportOptions);

    if (result.success && download) {
      this.exportService.downloadResult(result);
    }

    return result;
  }

  /**
   * Export to Excel format directly (convenience method)
   * @param download If true, automatically downloads the file. Default true.
   */
  async ExportToExcel(download: boolean = true): Promise<ExportResult> {
    return this.Export({ format: 'excel' }, download);
  }

  /**
   * Export to CSV format directly (convenience method)
   * @param download If true, automatically downloads the file. Default true.
   */
  async ExportToCSV(download: boolean = true): Promise<ExportResult> {
    return this.Export({ format: 'csv' }, download);
  }

  /**
   * Export to JSON format directly (convenience method)
   * @param download If true, automatically downloads the file. Default true.
   */
  async ExportToJSON(download: boolean = true): Promise<ExportResult> {
    return this.Export({ format: 'json' }, download);
  }

  /**
   * Get the current grid data formatted for export
   */
  private getExportData(): ExportData {
    // Convert BaseEntity[] to plain objects for export
    return this.rowData.map(row => {
      if (row instanceof BaseEntity) {
        return row.GetAll();
      }
      return row as Record<string, unknown>;
    });
  }

  /**
   * Get column definitions for export based on current grid columns
   */
  private getExportColumns(): ExportColumn[] {
    if (!this._entityInfo) {
      // Fallback: use AG Grid column definitions
      return this.agColumnDefs
        .filter(col => col.field && !col.hide)
        .map(col => ({
          name: col.field as string,
          displayName: (col.headerName || col.field) as string
        }));
    }

    // Use entity field info for better column metadata
    return this._columns
      .filter(col => col.visible !== false)
      .map(col => {
        const field = this._entityInfo?.Fields.find(f => f.Name === col.field);
        return {
          name: col.field,
          displayName: col.title || field?.DisplayName || col.field,
          dataType: this.mapFieldTypeToExportType(field?.Type),
          width: typeof col.width === 'number' ? col.width : undefined
        };
      });
  }

  /**
   * Map MemberJunction field types to export column types
   */
  private mapFieldTypeToExportType(fieldType?: string): ExportColumn['dataType'] {
    if (!fieldType) return 'string';

    const type = fieldType.toLowerCase();
    if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('numeric')) {
      return 'number';
    }
    if (type.includes('date') || type.includes('time')) {
      return 'date';
    }
    if (type.includes('bit') || type.includes('bool')) {
      return 'boolean';
    }
    if (type.includes('money') || type.includes('currency')) {
      return 'currency';
    }
    return 'string';
  }

  /**
   * Generate default file name for export
   */
  private getDefaultExportFileName(): string {
    const entityName = this._entityInfo?.Name || 'export';
    const timestamp = new Date().toISOString().slice(0, 10);
    return `${entityName}_${timestamp}`;
  }

  onRefreshClick(): void {
    this.RefreshButtonClick.emit();
    this.Refresh();
  }

  onCompareClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length >= 2) {
      // Emit legacy event for backward compatibility
      this.CompareButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.CompareRecordsRequested.emit({
          entityInfo: this._entityInfo,
          records: selectedRows
        });
      }
    }
  }

  onMergeClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length >= 2) {
      // Emit legacy event for backward compatibility
      this.MergeButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.MergeRecordsRequested.emit({
          entityInfo: this._entityInfo,
          records: selectedRows
        });
      }
    }
  }

  onAddToListClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length > 0) {
      // Emit legacy event for backward compatibility
      this.AddToListButtonClick.emit(selectedRows);

      // Emit new structured event with record IDs for list management
      if (this._entityInfo) {
        const recordIds = selectedRows.map(r => {
          return r.PrimaryKey?.ToConcatenatedString() || String(r.Get(this._keyField));
        });
        this.AddToListRequested.emit({
          entityInfo: this._entityInfo,
          records: selectedRows,
          recordIds
        });
      }
    }
  }

  onDuplicateSearchClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length >= 2) {
      // Emit legacy event for backward compatibility
      this.DuplicateSearchButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.DuplicateSearchRequested.emit({
          entityInfo: this._entityInfo,
          records: selectedRows
        });
      }
    }
  }

  onCommunicationClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length > 0) {
      // Emit legacy event for backward compatibility
      this.CommunicationButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.CommunicationRequested.emit({
          entityInfo: this._entityInfo,
          records: selectedRows,
          viewParams: this._params
        });
      }
    }
  }

  onColumnChooserClick(): void {
    // TODO: Implement column chooser dialog
  }

  /**
   * Handles entity action click from the overflow menu
   */
  onEntityActionClick(action: EntityActionConfig): void {
    if (!this._entityInfo) return;

    this.EntityActionRequested.emit({
      entityInfo: this._entityInfo,
      action,
      selectedRecords: this.GetSelectedRows()
    });
  }

  /**
   * Checks if an entity action is currently enabled based on selection requirements
   */
  isEntityActionEnabled(action: EntityActionConfig): boolean {
    if (!action.requiresSelection) return true;

    const selectedCount = this._selectedKeys.length;
    if (selectedCount === 0) return false;

    if (action.minSelectedRecords && selectedCount < action.minSelectedRecords) return false;
    if (action.maxSelectedRecords && selectedCount > action.maxSelectedRecords) return false;

    return true;
  }

  // ========================================
  // Overflow Menu Methods
  // ========================================

  toggleOverflowMenu(): void {
    this.showOverflowMenu = !this.showOverflowMenu;
    this.cdr.detectChanges();

    // Add click outside listener when menu is open
    if (this.showOverflowMenu) {
      setTimeout(() => {
        document.addEventListener('click', this.handleOutsideClick);
      }, 0);
    } else {
      document.removeEventListener('click', this.handleOutsideClick);
    }
  }

  closeOverflowMenu(): void {
    this.showOverflowMenu = false;
    document.removeEventListener('click', this.handleOutsideClick);
    this.cdr.detectChanges();
  }

  private handleOutsideClick = (): void => {
    this.closeOverflowMenu();
  };

  // Overflow menu visibility helpers
  get hasOverflowMenuItems(): boolean {
    return this.showExportInOverflow ||
           this.showColumnChooserInOverflow ||
           (this._showEntityActionButtons && this._entityActions.length > 0) ||
           this.hasSelectionDependentOverflowActions;
  }

  get showExportInOverflow(): boolean {
    // Export is in overflow when it's not shown as a primary button
    return !this.ShowExportButton && !!this.ToolbarConfig.showExport;
  }

  get showColumnChooserInOverflow(): boolean {
    return this.AllowColumnToggle && !this.ToolbarConfig.showColumnChooser;
  }

  get hasSelectionDependentOverflowActions(): boolean {
    return this.showCommunicationInOverflow;
  }

  get showCommunicationInOverflow(): boolean {
    // Communication is in overflow when it's not shown as a primary button
    return !this.ShowCommunicationButton && this.HasSelection;
  }

  // ========================================
  // Toolbar Button State Helpers
  // ========================================

  get HasSelection(): boolean {
    return this._selectedKeys.length > 0;
  }

  get HasMultipleSelection(): boolean {
    return this._selectedKeys.length >= 2;
  }

  // ========================================
  // CSS Helpers
  // ========================================

  get gridContainerClasses(): string[] {
    const classes = ['mj-grid-container'];
    classes.push(`grid-lines-${this._gridLines}`);
    if (this._striped) classes.push('grid-striped');

    // Add visual config classes
    const vc = this.effectiveVisualConfig;
    classes.push(`header-style-${vc.headerStyle}`);
    if (vc.headerShadow) classes.push('header-shadow');
    if (vc.alternateRows) classes.push(`alternate-rows-${vc.alternateRowContrast}`);
    if (vc.hoverTransitions) classes.push('hover-transitions');
    classes.push(`cell-padding-${vc.cellPadding}`);
    if (vc.checkboxStyle !== 'default') classes.push(`checkbox-style-${vc.checkboxStyle}`);

    return classes;
  }

  /**
   * Apply visual configuration by setting CSS custom properties
   */
  private applyVisualConfig(): void {
    const vc = this.effectiveVisualConfig;
    const el = this.elementRef.nativeElement;

    // Set CSS custom properties for dynamic values
    if (vc.headerBackground) {
      el.style.setProperty('--grid-header-bg', vc.headerBackground);
    }
    if (vc.headerTextColor) {
      el.style.setProperty('--grid-header-text', vc.headerTextColor);
    }
    if (vc.selectionIndicatorColor) {
      el.style.setProperty('--grid-selection-indicator-color', vc.selectionIndicatorColor);
    }
    if (vc.selectionIndicatorWidth) {
      el.style.setProperty('--grid-selection-indicator-width', `${vc.selectionIndicatorWidth}px`);
    }
    if (vc.selectionBackground) {
      el.style.setProperty('--grid-row-selected-bg', vc.selectionBackground);
    }
    if (vc.checkboxColor) {
      el.style.setProperty('--grid-checkbox-color', vc.checkboxColor);
    }
    if (vc.borderRadius !== undefined) {
      el.style.setProperty('--grid-border-radius', `${vc.borderRadius}px`);
    }
    if (vc.accentColor) {
      el.style.setProperty('--grid-accent-color', vc.accentColor);
      el.style.setProperty('--grid-sort-indicator-color', vc.accentColor);
    }
    if (vc.hoverTransitionDuration) {
      el.style.setProperty('--grid-hover-transition', `${vc.hoverTransitionDuration}ms`);
    }

    // Rebuild column defs if formatting options changed
    if (this._entityInfo) {
      this.buildAgColumnDefs();
    }
  }

  get gridHeightStyle(): string {
    if (typeof this._height === 'number') {
      return `${this._height}px`;
    }
    return this._height === 'auto' ? '100%' : 'fit-content';
  }

  // ========================================
  // Toolbar Button Helpers
  // ========================================

  isButtonVisible(button: GridToolbarButton): boolean {
    if (button.visible === undefined) return true;
    if (typeof button.visible === 'boolean') return button.visible;
    if (typeof button.visible === 'function') return button.visible();
    return true;
  }

  isButtonDisabled(button: GridToolbarButton): boolean {
    if (button.disabled === undefined) return false;
    if (typeof button.disabled === 'boolean') return button.disabled;
    if (typeof button.disabled === 'function') return button.disabled();
    return false;
  }

  onToolbarButtonClick(button: GridToolbarButton): void {
    if (button.onClick) {
      button.onClick();
    }
  }

  // ========================================
  // Public Getters
  // ========================================

  get VisibleRows(): GridRowData[] {
    return Array.from(this._rowDataMap.values());
  }

  get VisibleColumnStates(): ColumnRuntimeState[] {
    return this._columnStates
      .filter(c => c.visible)
      .sort((a, b) => a.order - b.order);
  }
}

