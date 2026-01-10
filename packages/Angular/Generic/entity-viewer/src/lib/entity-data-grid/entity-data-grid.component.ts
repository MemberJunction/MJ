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
import { BaseEntity, RunView, RunViewParams, Metadata, EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { UserViewEntityExtended, ViewInfo, ViewGridState } from '@memberjunction/core-entities';
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
  EntityActionConfig
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
    if (value !== previousValue) {
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
  // Legacy Data Source Inputs (Deprecated - use Params instead)
  // ========================================

  private _entityName: string = '';
  /**
   * Entity name to display data for.
   * Setting this triggers a data reload.
   */
  @Input()
  set entityName(value: string) {
    const previousValue = this._entityName;
    this._entityName = value;
    if (value && value !== previousValue) {
      this.onEntityNameChanged();
    }
  }
  get entityName(): string {
    return this._entityName;
  }

  private _extraFilter: string = '';
  /**
   * Additional filter to apply to the RunView query
   */
  @Input()
  set extraFilter(value: string) {
    const previousValue = this._extraFilter;
    this._extraFilter = value || '';
    if (value !== previousValue && this._autoRefresh) {
      this.scheduleRefresh();
    }
  }
  get extraFilter(): string {
    return this._extraFilter;
  }

  private _searchString: string = '';
  /**
   * User search string for text search across fields
   */
  @Input()
  set searchString(value: string) {
    const previousValue = this._searchString;
    this._searchString = value || '';
    if (value !== previousValue && this._autoRefresh) {
      this.scheduleRefresh();
    }
  }
  get searchString(): string {
    return this._searchString;
  }

  private _orderBy: string = '';
  /**
   * Order by clause for sorting
   */
  @Input()
  set orderBy(value: string) {
    const previousValue = this._orderBy;
    this._orderBy = value || '';
    if (value !== previousValue && this._autoRefresh) {
      this.scheduleRefresh();
    }
  }
  get orderBy(): string {
    return this._orderBy;
  }

  private _maxRows: number = 0;
  /**
   * Maximum rows to fetch (0 = no limit)
   */
  @Input()
  set maxRows(value: number) {
    const previousValue = this._maxRows;
    this._maxRows = value;
    if (value !== previousValue && this._autoRefresh) {
      this.scheduleRefresh();
    }
  }
  get maxRows(): number {
    return this._maxRows;
  }

  private _fields: string[] = [];
  /**
   * Fields to retrieve (empty = all fields)
   */
  @Input()
  set fields(value: string[]) {
    this._fields = value || [];
  }
  get fields(): string[] {
    return this._fields;
  }

  private _data: BaseEntity[] = [];
  /**
   * Pre-loaded data (bypass RunView, use provided data)
   */
  @Input()
  set data(value: BaseEntity[]) {
    const hadData = this._data.length > 0;
    this._data = value || [];
    this._useExternalData = this._data.length > 0;
    if (this._useExternalData || hadData) {
      this.processData();
    }
  }
  get data(): BaseEntity[] {
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
  set columns(value: GridColumnConfig[]) {
    this._columns = value || [];
    if (this._columns.length > 0) {
      this.initializeColumnStates();
      this.buildAgColumnDefs();
    }
  }
  get columns(): GridColumnConfig[] {
    return this._columns;
  }

  private _gridState: ViewGridStateConfig | null = null;
  /**
   * Grid state from a User View - controls columns, widths, order, sort
   * When provided, this takes precedence over auto-generated columns
   */
  @Input()
  set gridState(value: ViewGridStateConfig | null) {
    const previousValue = this._gridState;
    this._gridState = value;
    if (value !== previousValue) {
      this.onGridStateChanged();
    }
  }
  get gridState(): ViewGridStateConfig | null {
    return this._gridState;
  }

  private _allowColumnReorder: boolean = true;
  @Input()
  set allowColumnReorder(value: boolean) {
    this._allowColumnReorder = value;
  }
  get allowColumnReorder(): boolean {
    return this._allowColumnReorder;
  }

  private _allowColumnResize: boolean = true;
  @Input()
  set allowColumnResize(value: boolean) {
    this._allowColumnResize = value;
  }
  get allowColumnResize(): boolean {
    return this._allowColumnResize;
  }

  private _allowColumnToggle: boolean = true;
  @Input()
  set allowColumnToggle(value: boolean) {
    this._allowColumnToggle = value;
  }
  get allowColumnToggle(): boolean {
    return this._allowColumnToggle;
  }

  private _showHeader: boolean = true;
  @Input()
  set showHeader(value: boolean) {
    this._showHeader = value;
  }
  get showHeader(): boolean {
    return this._showHeader;
  }

  // ========================================
  // Sorting & Filtering Inputs
  // ========================================

  private _allowSorting: boolean = true;
  @Input()
  set allowSorting(value: boolean) {
    this._allowSorting = value;
  }
  get allowSorting(): boolean {
    return this._allowSorting;
  }

  private _allowMultiSort: boolean = true;
  @Input()
  set allowMultiSort(value: boolean) {
    this._allowMultiSort = value;
  }
  get allowMultiSort(): boolean {
    return this._allowMultiSort;
  }

  private _serverSideSorting: boolean = true;
  /**
   * Whether sorting is handled server-side
   * When true, sort changes trigger a new data load
   */
  @Input()
  set serverSideSorting(value: boolean) {
    this._serverSideSorting = value;
  }
  get serverSideSorting(): boolean {
    return this._serverSideSorting;
  }

  private _allowColumnFilters: boolean = false;
  @Input()
  set allowColumnFilters(value: boolean) {
    this._allowColumnFilters = value;
  }
  get allowColumnFilters(): boolean {
    return this._allowColumnFilters;
  }

  private _showSearch: boolean = true;
  @Input()
  set showSearch(value: boolean) {
    this._showSearch = value;
  }
  get showSearch(): boolean {
    return this._showSearch;
  }

  // ========================================
  // Selection Inputs
  // ========================================

  private _selectionMode: GridSelectionMode = 'single';
  @Input()
  set selectionMode(value: GridSelectionMode) {
    this._selectionMode = value;
    this.updateAgRowSelection();
    if (value === 'none') {
      this.ClearSelection();
    }
  }
  get selectionMode(): GridSelectionMode {
    return this._selectionMode;
  }

  private _selectedKeys: string[] = [];
  @Input()
  set selectedKeys(value: string[]) {
    this._selectedKeys = value || [];
    this.updateRowSelectionState();
  }
  get selectedKeys(): string[] {
    return this._selectedKeys;
  }

  private _keyField: string = 'ID';
  @Input()
  set keyField(value: string) {
    this._keyField = value || 'ID';
  }
  get keyField(): string {
    return this._keyField;
  }

  // ========================================
  // Editing Inputs
  // ========================================

  private _editMode: GridEditMode = 'none';
  @Input()
  set editMode(value: GridEditMode) {
    this._editMode = value;
  }
  get editMode(): GridEditMode {
    return this._editMode;
  }

  private _allowAdd: boolean = false;
  @Input()
  set allowAdd(value: boolean) {
    this._allowAdd = value;
  }
  get allowAdd(): boolean {
    return this._allowAdd;
  }

  private _allowDelete: boolean = false;
  @Input()
  set allowDelete(value: boolean) {
    this._allowDelete = value;
  }
  get allowDelete(): boolean {
    return this._allowDelete;
  }

  // ========================================
  // Display Inputs
  // ========================================

  private _height: number | 'auto' | 'fit-content' = 'auto';
  @Input()
  set height(value: number | 'auto' | 'fit-content') {
    this._height = value;
  }
  get height(): number | 'auto' | 'fit-content' {
    return this._height;
  }

  private _rowHeight: number = 40;
  @Input()
  set rowHeight(value: number) {
    this._rowHeight = value;
  }
  get rowHeight(): number {
    return this._rowHeight;
  }

  private _virtualScroll: boolean = true;
  @Input()
  set virtualScroll(value: boolean) {
    this._virtualScroll = value;
  }
  get virtualScroll(): boolean {
    return this._virtualScroll;
  }

  private _showRowNumbers: boolean = false;
  @Input()
  set showRowNumbers(value: boolean) {
    this._showRowNumbers = value;
    this.buildAgColumnDefs();
  }
  get showRowNumbers(): boolean {
    return this._showRowNumbers;
  }

  private _striped: boolean = true;
  @Input()
  set striped(value: boolean) {
    this._striped = value;
  }
  get striped(): boolean {
    return this._striped;
  }

  private _gridLines: GridLinesMode = 'horizontal';
  @Input()
  set gridLines(value: GridLinesMode) {
    this._gridLines = value;
  }
  get gridLines(): GridLinesMode {
    return this._gridLines;
  }

  // ========================================
  // Toolbar Inputs
  // ========================================

  private _showToolbar: boolean = true;
  @Input()
  set showToolbar(value: boolean) {
    this._showToolbar = value;
  }
  get showToolbar(): boolean {
    return this._showToolbar;
  }

  private _toolbarConfig: GridToolbarConfig = {};
  @Input()
  set toolbarConfig(value: GridToolbarConfig) {
    this._toolbarConfig = value || {};
  }
  get toolbarConfig(): GridToolbarConfig {
    return this._toolbarConfig;
  }

  // ========================================
  // State Inputs
  // ========================================

  private _stateKey: string = '';
  @Input()
  set stateKey(value: string) {
    this._stateKey = value || '';
    if (this._stateKey) {
      this.loadPersistedState();
    }
  }
  get stateKey(): string {
    return this._stateKey;
  }

  private _autoRefresh: boolean = true;
  @Input()
  set autoRefresh(value: boolean) {
    this._autoRefresh = value;
  }
  get autoRefresh(): boolean {
    return this._autoRefresh;
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
  set refreshDebounce(value: number) {
    this._refreshDebounce = value;
  }
  get refreshDebounce(): number {
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
  set filterText(value: string) {
    const previousValue = this._filterText;
    this._filterText = value || '';
    if (value !== previousValue) {
      this.onFilterTextChanged();
    }
  }
  get filterText(): string {
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
  set showNewButton(value: boolean) {
    this._showNewButton = value;
  }
  get showNewButton(): boolean {
    return this._showNewButton;
  }

  private _showRefreshButton: boolean = true;
  /**
   * Show the "Refresh" button in toolbar
   */
  @Input()
  set showRefreshButton(value: boolean) {
    this._showRefreshButton = value;
  }
  get showRefreshButton(): boolean {
    return this._showRefreshButton;
  }

  private _showExportButton: boolean = true;
  /**
   * Show the "Export to Excel" button in toolbar
   */
  @Input()
  set showExportButton(value: boolean) {
    this._showExportButton = value;
  }
  get showExportButton(): boolean {
    return this._showExportButton;
  }

  private _showDeleteButton: boolean = false;
  /**
   * Show the "Delete" button in toolbar (deletes selected rows)
   */
  @Input()
  set showDeleteButton(value: boolean) {
    this._showDeleteButton = value;
  }
  get showDeleteButton(): boolean {
    return this._showDeleteButton;
  }

  private _showCompareButton: boolean = false;
  /**
   * Show the "Compare" button in toolbar (compare selected records)
   */
  @Input()
  set showCompareButton(value: boolean) {
    this._showCompareButton = value;
  }
  get showCompareButton(): boolean {
    return this._showCompareButton;
  }

  private _showMergeButton: boolean = false;
  /**
   * Show the "Merge" button in toolbar (merge selected records)
   */
  @Input()
  set showMergeButton(value: boolean) {
    this._showMergeButton = value;
  }
  get showMergeButton(): boolean {
    return this._showMergeButton;
  }

  private _showAddToListButton: boolean = false;
  /**
   * Show the "Add to List" button in toolbar
   */
  @Input()
  set showAddToListButton(value: boolean) {
    this._showAddToListButton = value;
  }
  get showAddToListButton(): boolean {
    return this._showAddToListButton;
  }

  private _showDuplicateSearchButton: boolean = false;
  /**
   * Show the "Search for Duplicates" button in toolbar
   */
  @Input()
  set showDuplicateSearchButton(value: boolean) {
    this._showDuplicateSearchButton = value;
  }
  get showDuplicateSearchButton(): boolean {
    return this._showDuplicateSearchButton;
  }

  private _showCommunicationButton: boolean = false;
  /**
   * Show the "Send Message" button in toolbar (if entity supports communication)
   */
  @Input()
  set showCommunicationButton(value: boolean) {
    this._showCommunicationButton = value;
  }
  get showCommunicationButton(): boolean {
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
      this.loadEntityActionsRequested.emit({ entityInfo: this._entityInfo });
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
  // Event Outputs
  // ========================================

  // Row Selection
  @Output() beforeRowSelect = new EventEmitter<BeforeRowSelectEventArgs>();
  @Output() afterRowSelect = new EventEmitter<AfterRowSelectEventArgs>();
  @Output() beforeRowDeselect = new EventEmitter<BeforeRowDeselectEventArgs>();
  @Output() afterRowDeselect = new EventEmitter<AfterRowDeselectEventArgs>();
  @Output() selectionChange = new EventEmitter<string[]>();

  // Row Click
  @Output() beforeRowClick = new EventEmitter<BeforeRowClickEventArgs>();
  @Output() afterRowClick = new EventEmitter<AfterRowClickEventArgs>();
  @Output() beforeRowDoubleClick = new EventEmitter<BeforeRowDoubleClickEventArgs>();
  @Output() afterRowDoubleClick = new EventEmitter<AfterRowDoubleClickEventArgs>();

  // Editing
  @Output() beforeCellEdit = new EventEmitter<BeforeCellEditEventArgs>();
  @Output() afterCellEditBegin = new EventEmitter<AfterCellEditBeginEventArgs>();
  @Output() beforeCellEditCommit = new EventEmitter<BeforeCellEditCommitEventArgs>();
  @Output() afterCellEditCommit = new EventEmitter<AfterCellEditCommitEventArgs>();
  @Output() beforeCellEditCancel = new EventEmitter<BeforeCellEditCancelEventArgs>();
  @Output() afterCellEditCancel = new EventEmitter<AfterCellEditCancelEventArgs>();
  @Output() beforeRowSave = new EventEmitter<BeforeRowSaveEventArgs>();
  @Output() afterRowSave = new EventEmitter<AfterRowSaveEventArgs>();
  @Output() beforeRowDelete = new EventEmitter<BeforeRowDeleteEventArgs>();
  @Output() afterRowDelete = new EventEmitter<AfterRowDeleteEventArgs>();

  // Data Loading
  @Output() beforeDataLoad = new EventEmitter<BeforeDataLoadEventArgs>();
  @Output() afterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();
  @Output() beforeDataRefresh = new EventEmitter<BeforeDataRefreshEventArgs>();
  @Output() afterDataRefresh = new EventEmitter<AfterDataRefreshEventArgs>();

  // Sorting
  @Output() beforeSort = new EventEmitter<BeforeSortEventArgs>();
  @Output() afterSort = new EventEmitter<AfterSortEventArgs>();

  // Column Management
  @Output() beforeColumnReorder = new EventEmitter<BeforeColumnReorderEventArgs>();
  @Output() afterColumnReorder = new EventEmitter<AfterColumnReorderEventArgs>();
  @Output() beforeColumnResize = new EventEmitter<BeforeColumnResizeEventArgs>();
  @Output() afterColumnResize = new EventEmitter<AfterColumnResizeEventArgs>();
  @Output() beforeColumnVisibilityChange = new EventEmitter<BeforeColumnVisibilityChangeEventArgs>();
  @Output() afterColumnVisibilityChange = new EventEmitter<AfterColumnVisibilityChangeEventArgs>();

  // Grid State
  @Output() gridStateChanged = new EventEmitter<GridStateChangedEvent>();

  // Toolbar Actions (legacy names)
  @Output() addRequested = new EventEmitter<void>();
  @Output() deleteRequested = new EventEmitter<BaseEntity[]>();
  @Output() exportRequested = new EventEmitter<void>();

  // Predefined Toolbar Button Events
  @Output() newButtonClick = new EventEmitter<void>();
  @Output() refreshButtonClick = new EventEmitter<void>();
  @Output() exportButtonClick = new EventEmitter<void>();
  @Output() deleteButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() compareButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() mergeButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() addToListButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() duplicateSearchButtonClick = new EventEmitter<BaseEntity[]>();
  @Output() communicationButtonClick = new EventEmitter<BaseEntity[]>();

  // Navigation Events
  /**
   * Emitted when a row is clicked/double-clicked and AutoNavigate is enabled.
   * Parent components should handle this to open the entity record.
   */
  @Output() navigationRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    record: BaseEntity;
    compositeKey: string;
  }>();

  /**
   * Emitted when the "New" button is clicked and CreateRecordMode is 'Dialog'.
   * Parent components should handle this to show a new record dialog.
   */
  @Output() newRecordDialogRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    defaultValues: Record<string, unknown>;
  }>();

  /**
   * Emitted when the "New" button is clicked and CreateRecordMode is 'Tab'.
   * Parent components should handle this to open a new record in a tab.
   */
  @Output() newRecordTabRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    defaultValues: Record<string, unknown>;
  }>();

  // Dialog Request Events (for Explorer-specific dialogs)
  /**
   * Emitted when Compare Records functionality is requested.
   * Parent components should handle this to show the compare dialog.
   */
  @Output() compareRecordsRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
  }>();

  /**
   * Emitted when Merge Records functionality is requested.
   * Parent components should handle this to show the merge dialog.
   */
  @Output() mergeRecordsRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
  }>();

  /**
   * Emitted when Communication/Send Message functionality is requested.
   * Parent components should handle this to show the communication dialog.
   */
  @Output() communicationRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
    viewParams: RunViewParams | null;
  }>();

  /**
   * Emitted when duplicate search functionality is requested.
   * Parent components should handle this to show the duplicate search results.
   */
  @Output() duplicateSearchRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
  }>();

  /**
   * Emitted when the Add to List button is clicked.
   * Parent components should handle this to show the list management dialog.
   */
  @Output() addToListRequested = new EventEmitter<{
    entityInfo: EntityInfo;
    records: BaseEntity[];
    recordIds: string[];
  }>();

  // Entity Action Events
  /**
   * Emitted when entity actions need to be loaded.
   * Parent components should load actions and set the EntityActions input.
   */
  @Output() loadEntityActionsRequested = new EventEmitter<{
    entityInfo: EntityInfo;
  }>();

  /**
   * Emitted when an entity action is selected for execution.
   * Parent components should handle the action execution.
   */
  @Output() entityActionRequested = new EventEmitter<{
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

  /** AG Grid theme (v34+) */
  public agGridTheme = themeAlpine;

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
   * True if using a dynamic view (EntityName in Params) rather than a stored view.
   * False if using ViewID, ViewName, or ViewEntity in Params.
   */
  public get IsDynamicView(): boolean {
    if (!this._params) return true; // Legacy mode is considered dynamic
    // A stored view is one that has ViewID, ViewName, or ViewEntity
    return !this._params.ViewID && !this._params.ViewName && !this._params.ViewEntity;
  }

  // Loading state
  loading: boolean = false;
  errorMessage: string = '';
  totalRowCount: number = 0;

  // Cleanup
  private destroy$ = new Subject<void>();
  private refreshSubject = new Subject<void>();
  private statesSaveSubject = new Subject<void>();
  private statePersistSubject = new Subject<ViewGridStateConfig>();

  // Persist state tracking
  private pendingStateToSave: ViewGridStateConfig | null = null;
  private isSavingState: boolean = false;

  // Overflow menu state
  public showOverflowMenu: boolean = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef
  ) {}

  // ========================================
  // Lifecycle Hooks
  // ========================================

  ngOnInit(): void {
    this.setupRefreshDebounce();
    this.setupStatePersistDebounce();
    this.updateAgRowSelection();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  private scheduleRefresh(): void {
    this.refreshSubject.next();
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

    // Don't load if AllowLoad is false (deferred loading)
    if (!this._allowLoad) {
      return;
    }

    try {
      // If using a stored view, load the view entity first
      if (this._params.ViewEntity) {
        // ViewEntity was provided directly
        this._viewEntity = this._params.ViewEntity as UserViewEntityExtended;
        this._entityInfo = this._viewEntity.ViewEntityInfo;
        this.applyViewEntitySettings();
      } else if (this._params.ViewID) {
        // Load view entity by ID
        this._viewEntity = await ViewInfo.GetViewEntity(this._params.ViewID);
        this._entityInfo = this._viewEntity.ViewEntityInfo;
        this.applyViewEntitySettings();
      } else if (this._params.ViewName) {
        // Load view entity by name
        this._viewEntity = await ViewInfo.GetViewEntityByName(this._params.ViewName);
        this._entityInfo = this._viewEntity.ViewEntityInfo;
        this.applyViewEntitySettings();
      } else if (this._params.EntityName) {
        // Dynamic view - just get entity metadata
        this._viewEntity = null;
        const md = new Metadata();
        this._entityInfo = md.Entities.find(e => e.Name === this._params!.EntityName) || null;
      }

      // Generate columns if not already set
      if (this._columns.length === 0 && this._entityInfo) {
        this.generateColumnsFromMetadata();
      }

      // Load data if auto-refresh is enabled
      if (this._autoRefreshOnParamsChange) {
        await this.loadData(false);
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load view';
      this.cdr.detectChanges();
    }
  }

  /**
   * Applies settings from a loaded ViewEntity (column configuration, sort state, etc.)
   */
  private applyViewEntitySettings(): void {
    if (!this._viewEntity) return;

    // Apply grid state from view entity (columns, sort)
    if (this._viewEntity.GridState) {
      try {
        const gridState = JSON.parse(this._viewEntity.GridState) as ViewGridState;
        if (gridState.columnSettings?.length) {
          this._gridState = {
            columnSettings: gridState.columnSettings,
            sortSettings: gridState.sortSettings || []
          };
        }
      } catch (e) {
        console.warn('Failed to parse view GridState:', e);
      }
    }

    // Apply sort state from view entity
    const sortInfo = this._viewEntity.ViewSortInfo;
    if (sortInfo?.length) {
      this._sortState = sortInfo.map((s, index) => ({
        field: s.field,
        direction: s.direction?.toLowerCase() === 'desc' ? 'desc' : 'asc',
        index
      }));
    }
  }

  private async onEntityNameChanged(): Promise<void> {
    const md = new Metadata();
    this._entityInfo = md.Entities.find(e => e.Name === this._entityName) || null;

    if (this._columns.length === 0 && this._entityInfo) {
      this.generateColumnsFromMetadata();
    }

    await this.loadData(false);
  }

  private onGridStateChanged(): void {
    if (this._gridState && this._entityInfo) {
      this.buildAgColumnDefs();

      // Apply sort if present
      if (this._gridState.sortSettings?.length && this.gridApi) {
        const sortSetting = this._gridState.sortSettings[0];
        this._sortState = [{
          field: sortSetting.field,
          direction: sortSetting.dir,
          index: 0
        }];
        this.applySortStateToGrid();
      }
    }
  }

  private onFilterTextChanged(): void {
    // Rebuild column defs to update cell renderers with new filter text
    this.buildAgColumnDefs();

    // Refresh cells to apply highlighting
    if (this.gridApi) {
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

  private shouldShowField(field: EntityFieldInfo): boolean {
    if (field.Name.startsWith('__mj_')) return false;
    if (field.IsPrimaryKey && field.SQLFullType?.toLowerCase() === 'uniqueidentifier') {
      return false;
    }
    if (field.DefaultInView === true) return true;
    if (field.Length > 500) return false;
    return true;
  }

  private estimateColumnWidth(field: EntityFieldInfo): number {
    const fieldNameLower = field.Name.toLowerCase();
    const displayNameLower = (field.DisplayName || field.Name).toLowerCase();

    // Fixed-width types
    if (field.TSType === 'boolean') return 80;
    if (field.TSType === 'Date') return 120;

    // Numeric fields - compact
    if (field.TSType === 'number') {
      if (fieldNameLower.includes('year') || fieldNameLower.includes('age')) return 80;
      if (fieldNameLower.includes('amount') || fieldNameLower.includes('price') || fieldNameLower.includes('total')) return 120;
      return 100;
    }

    // ID fields - compact
    if (fieldNameLower.endsWith('id') && field.Length <= 50) return 80;

    // Email - needs more space
    if (fieldNameLower.includes('email')) return 220;

    // Phone numbers
    if (fieldNameLower.includes('phone') || fieldNameLower.includes('mobile') || fieldNameLower.includes('fax')) return 130;

    // Name fields - medium width
    if (fieldNameLower.includes('name') || fieldNameLower.includes('title')) {
      if (fieldNameLower === 'firstname' || fieldNameLower === 'lastname' || fieldNameLower === 'first name' || fieldNameLower === 'last name') return 120;
      return 160;
    }

    // Location fields
    if (fieldNameLower.includes('city')) return 120;
    if (fieldNameLower.includes('state') || fieldNameLower.includes('country')) return 100;
    if (fieldNameLower.includes('zip') || fieldNameLower.includes('postal')) return 90;
    if (fieldNameLower.includes('address')) return 200;

    // Date-like strings
    if (fieldNameLower.includes('date') || fieldNameLower.includes('time')) return 120;

    // Status/Type fields - usually short values
    if (fieldNameLower.includes('status') || fieldNameLower.includes('type') || fieldNameLower.includes('category')) return 110;

    // Code/abbreviation fields
    if (fieldNameLower.includes('code') || fieldNameLower.includes('abbr')) return 100;

    // Long text fields - limit width, they'll truncate
    if (field.Length > 500) return 150;
    if (field.Length > 200) return 180;

    // Default: estimate based on field length but with tighter bounds
    const estimatedChars = Math.min(field.Length, 50);
    const charWidth = 7;
    const padding = 24;
    return Math.min(Math.max(estimatedChars * charWidth / 2 + padding, 80), 200);
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
        headerName: colConfig.DisplayName || field.DisplayNameOrName,
        width: colConfig.width || this.estimateColumnWidth(field),
        sortable: this._allowSorting,
        resizable: this._allowColumnResize
      };

      // Add type-specific formatters
      this.applyFieldFormatter(colDef, field);

      cols.push(colDef);
    }

    return cols;
  }

  private mapColumnConfigToColDef(col: GridColumnConfig): ColDef {
    return {
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
  }

  private generateAgColumnDefs(entity: EntityInfo): ColDef[] {
    const cols: ColDef[] = [];
    const visibleFields = entity.Fields.filter(f => this.shouldShowField(f));

    for (const field of visibleFields) {
      const colDef: ColDef = {
        field: field.Name,
        headerName: field.DisplayNameOrName,
        width: this.estimateColumnWidth(field),
        sortable: this._allowSorting,
        resizable: this._allowColumnResize
      };

      this.applyFieldFormatter(colDef, field);
      cols.push(colDef);
    }

    return cols;
  }

  private applyFieldFormatter(colDef: ColDef, field: EntityFieldInfo): void {
    // Store type info for use in cell renderer
    const fieldType = field.TSType;
    const fieldNameLower = field.Name.toLowerCase();
    const isCurrency = fieldNameLower.includes('amount') ||
                       fieldNameLower.includes('price') ||
                       fieldNameLower.includes('cost') ||
                       fieldNameLower.includes('total');

    // Use cellRenderer for highlighting support
    colDef.cellRenderer = (params: ICellRendererParams) => {
      let displayValue = '';

      if (params.value === null || params.value === undefined) {
        displayValue = '';
      } else if (fieldType === 'Date') {
        const date = params.value instanceof Date ? params.value : new Date(params.value as string);
        if (isNaN(date.getTime())) {
          displayValue = String(params.value);
        } else {
          displayValue = date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        }
      } else if (fieldType === 'boolean') {
        displayValue = params.value ? 'Yes' : 'No';
      } else if (fieldType === 'number' && isCurrency) {
        const num = Number(params.value);
        displayValue = isNaN(num) ? String(params.value) : `$${num.toLocaleString()}`;
      } else {
        displayValue = String(params.value);
      }

      // Apply highlighting if filterText is set
      if (this._filterText && displayValue) {
        return HighlightUtil.highlight(displayValue, this._filterText, true);
      }

      return HighlightUtil.escapeHtml(displayValue);
    };
  }

  // ========================================
  // AG Grid Row Selection Configuration
  // ========================================

  private updateAgRowSelection(): void {
    switch (this._selectionMode) {
      case 'none':
        this.agRowSelection = { mode: 'singleRow', enableClickSelection: false };
        break;
      case 'single':
        this.agRowSelection = { mode: 'singleRow' };
        break;
      case 'multiple':
        this.agRowSelection = { mode: 'multiRow' };
        break;
      case 'checkbox':
        this.agRowSelection = {
          mode: 'multiRow',
          checkboxes: true,
          headerCheckbox: true
        };
        break;
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

    // Check if we have a valid data source
    const hasParamsDataSource = this._params && (
      this._params.ViewID ||
      this._params.ViewName ||
      this._params.ViewEntity ||
      this._params.EntityName
    );
    const hasLegacyDataSource = this._entityName;

    if (!hasParamsDataSource && !hasLegacyDataSource) {
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

    // Client-side mode - load all data upfront
    const beforeRefreshEvent = new BeforeDataRefreshEventArgs(this, isAutoRefresh);
    this.beforeDataRefresh.emit(beforeRefreshEvent);
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
    this.beforeDataLoad.emit(beforeLoadEvent);
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
    this.errorMessage = '';
    this.cdr.detectChanges();

    const startTime = performance.now();

    try {
      const rv = new RunView();
      const result = await rv.RunView<BaseEntity>({
        ...runViewParams,
        ResultType: 'entity_object'
      });

      const loadTimeMs = performance.now() - startTime;

      if (result.Success) {
        this._allData = result.Results || [];
        this.totalRowCount = result.TotalRowCount || this._allData.length;
        this.processData();

        const afterLoadEvent = new AfterDataLoadEventArgs(
          this,
          gridParams,
          true,
          this.totalRowCount,
          this._allData.length,
          loadTimeMs
        );
        this.afterDataLoad.emit(afterLoadEvent);

        const afterRefreshEvent = new AfterDataRefreshEventArgs(
          this,
          true,
          this.totalRowCount,
          loadTimeMs
        );
        this.afterDataRefresh.emit(afterRefreshEvent);
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
        this.afterDataLoad.emit(afterLoadEvent);
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
      this.afterDataLoad.emit(afterLoadEvent);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Builds RunViewParams from either the new Params input or legacy inputs.
   * Preference is given to Params when both are provided.
   */
  private buildRunViewParams(): RunViewParams {
    // If using new Params input, start with that
    if (this._params) {
      const params: RunViewParams = { ...this._params };

      // Apply sort state (may be modified by user interactions)
      const orderBy = this.buildOrderByClause();
      if (orderBy) {
        params.OrderBy = orderBy;
      }

      return params;
    }

    // Legacy mode - build from individual inputs
    return {
      EntityName: this._entityName,
      ExtraFilter: this._extraFilter || undefined,
      OrderBy: this.buildOrderByClause() || undefined,
      MaxRows: this._maxRows || undefined,
      Fields: this._fields.length > 0 ? this._fields : undefined,
      UserSearchString: this._searchString || undefined
    };
  }

  private buildOrderByClause(): string {
    if (this._sortState.length > 0) {
      return this._sortState
        .sort((a, b) => a.index - b.index)
        .map(s => `${s.field} ${s.direction.toUpperCase()}`)
        .join(', ');
    }
    return this._orderBy;
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
    if (this._paginationMode === 'infinite' && this._allowLoad && (this._params || this._entityName)) {
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
    this.beforeRowClick.emit(beforeEvent);
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
    this.afterRowClick.emit(afterEvent);

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
    this.beforeRowDoubleClick.emit(beforeEvent);
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
    this.afterRowDoubleClick.emit(afterEvent);

    // Auto-navigate on double-click (if enabled)
    if (this._autoNavigate && this._navigateOnDoubleClick && this._editMode === 'none') {
      this.emitNavigationRequest(rowData.entity, pkString);
    }
  }

  /**
   * Emits a navigation request for the given entity record.
   */
  private emitNavigationRequest(entity: BaseEntity, compositeKey: string): void {
    if (!this._entityInfo) return;

    this.navigationRequested.emit({
      entityInfo: this._entityInfo,
      record: entity,
      compositeKey
    });
  }

  onAgSortChanged(event: AgSortChangedEvent): void {
    if (this.suppressSortEvents) return;

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
        this.beforeSort.emit(beforeEvent);
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
        this.afterSort.emit(afterEvent);
      }

      // Emit grid state changed
      this.emitGridStateChanged('sort');

      // Reload data if server-side sorting
      if (this._serverSideSorting) {
        this.loadData(true);
      }
    } else {
      this._sortState = [];
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
        this.beforeRowDeselect.emit(beforeEvent);
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
        this.beforeRowSelect.emit(beforeEvent);
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
        this.afterRowDeselect.emit(afterEvent);
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
        this.afterRowSelect.emit(afterEvent);
      }
    }

    this.selectionChange.emit(this._selectedKeys);
  }

  onAgColumnResized(event: ColumnResizedEvent): void {
    if (event.finished && event.source !== 'api') {
      this.emitGridStateChanged('columns');
    }
  }

  onAgColumnMoved(event: ColumnMovedEvent): void {
    if (event.finished && event.source !== 'api') {
      this.emitGridStateChanged('columns');
    }
  }

  // ========================================
  // Grid State Management
  // ========================================

  private emitGridStateChanged(changeType: 'columns' | 'sort' | 'filter'): void {
    if (!this.gridApi || !this._entityInfo) return;

    const currentState = this.buildCurrentGridState();

    // Always emit the event for external consumers
    this.gridStateChanged.emit({
      gridState: currentState,
      changeType
    });

    // Schedule auto-persist for stored views if enabled
    if (this._autoPersistState && !this.IsDynamicView && this._viewEntity) {
      this.statePersistSubject.next(currentState);
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
      console.log('User does not have edit permission on this view - state not persisted');
      return;
    }

    try {
      this.isSavingState = true;
      this.pendingStateToSave = state;

      // Build the grid state JSON matching ViewGridState format
      const gridStateJson: ViewGridState = {
        columnSettings: state.columnSettings,
        sortSettings: state.sortSettings
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
        console.warn('Failed to save view state:', this._viewEntity.LatestResult?.Message);
      }
    } catch (error) {
      console.error('Error persisting grid state:', error);
    } finally {
      this.isSavingState = false;
      this.pendingStateToSave = null;
    }
  }

  private buildCurrentGridState(): ViewGridStateConfig {
    if (!this.gridApi || !this._entityInfo) {
      return { columnSettings: [], sortSettings: [] };
    }

    const columnState = this.gridApi.getColumnState();
    const columnSettings: ViewColumnConfig[] = [];
    const sortSettings: ViewSortConfig[] = [];

    for (let i = 0; i < columnState.length; i++) {
      const col = columnState[i];
      if (col.colId === '__rowNumber') continue; // Skip row number column

      const field = this._entityInfo.Fields.find(f => f.Name === col.colId);

      if (field) {
        columnSettings.push({
          ID: field.ID,
          Name: field.Name,
          DisplayName: field.DisplayNameOrName,
          hidden: col.hide ?? false,
          width: col.width ?? undefined,
          orderIndex: i
        });
      }

      if (col.sort) {
        sortSettings.push({
          field: col.colId,
          dir: col.sort as 'asc' | 'desc'
        });
      }
    }

    return { columnSettings, sortSettings };
  }

  private applySortStateToGrid(): void {
    if (!this.gridApi || this._sortState.length === 0) return;

    this.suppressSortEvents = true;
    try {
      const columnState = this.gridApi.getColumnState().map(col => {
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
    this.addRequested.emit();
    this.newButtonClick.emit();

    // Emit navigation events based on CreateRecordMode
    if (this._entityInfo) {
      if (this._createRecordMode === 'Dialog') {
        this.newRecordDialogRequested.emit({
          entityInfo: this._entityInfo,
          defaultValues: this._newRecordValues
        });
      } else {
        this.newRecordTabRequested.emit({
          entityInfo: this._entityInfo,
          defaultValues: this._newRecordValues
        });
      }
    }
  }

  onDeleteClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length > 0) {
      this.deleteRequested.emit(selectedRows);
      this.deleteButtonClick.emit(selectedRows);
    }
  }

  onExportClick(): void {
    this.exportRequested.emit();
    this.exportButtonClick.emit();
  }

  onRefreshClick(): void {
    this.refreshButtonClick.emit();
    this.Refresh();
  }

  onCompareClick(): void {
    const selectedRows = this.GetSelectedRows();
    if (selectedRows.length >= 2) {
      // Emit legacy event for backward compatibility
      this.compareButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.compareRecordsRequested.emit({
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
      this.mergeButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.mergeRecordsRequested.emit({
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
      this.addToListButtonClick.emit(selectedRows);

      // Emit new structured event with record IDs for list management
      if (this._entityInfo) {
        const recordIds = selectedRows.map(r => {
          return r.PrimaryKey?.ToConcatenatedString() || String(r.Get(this._keyField));
        });
        this.addToListRequested.emit({
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
      this.duplicateSearchButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.duplicateSearchRequested.emit({
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
      this.communicationButtonClick.emit(selectedRows);

      // Emit new structured event for Explorer dialogs
      if (this._entityInfo) {
        this.communicationRequested.emit({
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

    this.entityActionRequested.emit({
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
    return !this.showExportButton && !!this.toolbarConfig.showExport;
  }

  get showColumnChooserInOverflow(): boolean {
    return this.allowColumnToggle && !this.toolbarConfig.showColumnChooser;
  }

  get hasSelectionDependentOverflowActions(): boolean {
    return this.showCommunicationInOverflow;
  }

  get showCommunicationInOverflow(): boolean {
    // Communication is in overflow when it's not shown as a primary button
    return !this.showCommunicationButton && this.HasSelection;
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
    return classes;
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
