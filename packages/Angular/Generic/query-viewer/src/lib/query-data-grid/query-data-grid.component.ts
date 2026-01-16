import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
    ElementRef,
    ViewChild
} from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { RunQuery, RunQueryParams, Metadata, QueryInfo, QueryFieldInfo } from '@memberjunction/core';
import { RunQueryResult } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
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
    GridOptions
} from 'ag-grid-community';
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
import {
    QueryGridSelectionMode,
    QueryGridColumnConfig,
    QueryGridSortState,
    QueryGridState,
    QueryGridVisualConfig,
    DEFAULT_QUERY_VISUAL_CONFIG,
    QueryRowClickEvent,
    QueryEntityLinkClickEvent,
    QueryGridStateChangedEvent,
    QuerySelectionChangedEvent,
    QueryExportOptions,
    buildColumnsFromQueryFields,
    getQueryGridStateKey
} from './models/query-grid-types';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * A data grid component for displaying query results with full interactivity.
 * Features:
 * - Client-side sorting with multi-column support
 * - Column resizing, reordering, and visibility toggle
 * - Entity linking for columns with SourceEntityID
 * - State persistence to User Settings
 * - Export to Excel/CSV
 * - Row selection (single, multiple, checkbox modes)
 *
 * @example
 * ```html
 * <mj-query-data-grid
 *   [queryInfo]="query"
 *   [data]="queryResults"
 *   [selectionMode]="'multiple'"
 *   (entityLinkClick)="onEntityLinkClick($event)">
 * </mj-query-data-grid>
 * ```
 */
@Component({
    selector: 'mj-query-data-grid',
    templateUrl: './query-data-grid.component.html',
    styleUrls: ['./query-data-grid.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
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
export class QueryDataGridComponent implements OnInit, OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    private _queryInfo: QueryInfo | null = null;
    /**
     * The QueryInfo metadata for the query being displayed.
     * Used to derive column configurations and entity linking.
     */
    @Input()
    set queryInfo(value: QueryInfo | null) {
        const previous = this._queryInfo;
        this._queryInfo = value;
        if (value && value !== previous) {
            this.onQueryInfoChanged();
        }
    }
    get queryInfo(): QueryInfo | null {
        return this._queryInfo;
    }

    private _data: Record<string, unknown>[] = [];
    /**
     * The query result data to display in the grid.
     */
    @Input()
    set data(value: Record<string, unknown>[]) {
        this._data = value || [];
        if (this.gridApi) {
            this.gridApi.setGridOption('rowData', this._data);
        }
        this.cdr.markForCheck();
    }
    get data(): Record<string, unknown>[] {
        return this._data;
    }

    /**
     * Selection mode for the grid
     */
    @Input() selectionMode: QueryGridSelectionMode = 'single';

    /**
     * Whether to show the toolbar
     */
    @Input() showToolbar: boolean = true;

    /**
     * Whether to show row count in toolbar
     */
    @Input() showRowCount: boolean = true;

    /**
     * Whether to show selection count in toolbar
     */
    @Input() showSelectionCount: boolean = true;

    /**
     * Whether to show export button
     */
    @Input() showExport: boolean = true;

    /**
     * Whether to show refresh button
     */
    @Input() showRefresh: boolean = true;

    /**
     * Whether to allow sorting
     */
    @Input() allowSorting: boolean = true;

    /**
     * Whether to allow column resizing
     */
    @Input() allowColumnResize: boolean = true;

    /**
     * Whether to allow column reordering
     */
    @Input() allowColumnReorder: boolean = true;

    /**
     * Visual configuration
     */
    @Input() visualConfig: QueryGridVisualConfig = {};

    /**
     * External loading state - when true, shows loading overlay
     */
    @Input() isLoading: boolean = false;

    /**
     * Height of the grid container
     */
    @Input() height: string = '100%';

    /**
     * Initial grid state (for restoring from persistence)
     */
    @Input() initialGridState: QueryGridState | null = null;

    /**
     * Whether to automatically persist grid state (column widths, order, sort) to User Settings
     */
    @Input() persistState: boolean = true;

    // ========================================
    // Outputs
    // ========================================

    /**
     * Fired when a row is clicked
     */
    @Output() rowClick = new EventEmitter<QueryRowClickEvent>();

    /**
     * Fired when a row is double-clicked
     */
    @Output() rowDoubleClick = new EventEmitter<QueryRowClickEvent>();

    /**
     * Fired when an entity link is clicked
     */
    @Output() entityLinkClick = new EventEmitter<QueryEntityLinkClickEvent>();

    /**
     * Fired when selection changes
     */
    @Output() selectionChange = new EventEmitter<QuerySelectionChangedEvent>();

    /**
     * Fired when grid state changes (for persistence)
     */
    @Output() gridStateChange = new EventEmitter<QueryGridStateChangedEvent>();

    /**
     * Fired when refresh is requested
     */
    @Output() refreshRequest = new EventEmitter<void>();

    // ========================================
    // Internal State
    // ========================================

    public gridApi: GridApi | null = null;
    public columnDefs: ColDef[] = [];
    public columns: QueryGridColumnConfig[] = [];
    public sortState: QueryGridSortState[] = [];
    public selectedRows: Record<string, unknown>[] = [];
    public theme = themeAlpine;

    private destroy$ = new Subject<void>();
    private stateChangeSubject = new Subject<QueryGridStateChangedEvent>();
    private statePersistSubject = new Subject<QueryGridState>();
    private _mergedVisualConfig: Required<QueryGridVisualConfig> = DEFAULT_QUERY_VISUAL_CONFIG;

    // Grid options
    public gridOptions: GridOptions = {
        animateRows: true,
        rowHeight: 36,
        headerHeight: 40,
        suppressCellFocus: false,
        enableCellTextSelection: true,
        ensureDomOrder: true,
        suppressRowClickSelection: false,
        rowMultiSelectWithClick: false
    };

    /** Default column settings - enables sorting, resizing */
    public defaultColDef: ColDef = {
        sortable: true,
        resizable: true,
        minWidth: 80
    };

    constructor(
        private cdr: ChangeDetectorRef,
        private elementRef: ElementRef,
        private exportService: ExportService
    ) {
        // Debounce state changes for persistence
        this.stateChangeSubject.pipe(
            debounceTime(500),
            takeUntil(this.destroy$)
        ).subscribe(event => {
            this.gridStateChange.emit(event);
            // Also persist to User Settings if enabled
            if (this.persistState && this._queryInfo) {
                this.statePersistSubject.next(event.state);
            }
        });

        // Debounce state persistence to User Settings
        this.statePersistSubject.pipe(
            debounceTime(1000),
            takeUntil(this.destroy$)
        ).subscribe(state => {
            this.persistGridState(state);
        });
    }

    ngOnInit(): void {
        this._mergedVisualConfig = { ...DEFAULT_QUERY_VISUAL_CONFIG, ...this.visualConfig };
        this.applyVisualConfig();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Grid Setup
    // ========================================

    public onGridReady(event: GridReadyEvent): void {
        this.gridApi = event.api;

        // Apply initial data if available
        if (this._data.length > 0) {
            this.gridApi.setGridOption('rowData', this._data);
        }

        // Apply initial state if provided
        if (this.initialGridState) {
            this.applyGridState(this.initialGridState);
        }

        // Auto-size columns initially
        setTimeout(() => {
            if (this.gridApi) {
                this.gridApi.autoSizeAllColumns();
            }
        }, 100);
    }

    private onQueryInfoChanged(): void {
        if (!this._queryInfo) {
            this.columns = [];
            this.columnDefs = [];
            return;
        }

        // Build columns from query fields
        this.columns = buildColumnsFromQueryFields(this._queryInfo.Fields);

        // Apply initial state if provided via prop (takes precedence)
        if (this.initialGridState) {
            this.applyColumnStateFromGridState(this.initialGridState);
        } else {
            // Otherwise try to load from User Settings
            this.loadPersistedState();
        }

        // Build AG Grid column definitions
        this.buildColumnDefs();

        this.cdr.markForCheck();
    }

    private applyColumnStateFromGridState(state: QueryGridState): void {
        if (!state.columns) return;

        for (const colState of state.columns) {
            const column = this.columns.find(c => c.field === colState.field);
            if (column) {
                if (colState.width !== undefined) column.width = colState.width;
                column.visible = colState.visible;
                column.order = colState.order;
                column.pinned = colState.pinned || null;
            }
        }

        // Apply sort state
        if (state.sort) {
            this.sortState = [...state.sort];
        }

        // Re-sort columns by order
        this.columns.sort((a, b) => a.order - b.order);
    }

    private buildColumnDefs(): void {
        const visibleColumns = this.columns.filter(c => c.visible);

        // Add checkbox column if needed
        const defs: ColDef[] = [];

        if (this.selectionMode === 'checkbox') {
            defs.push({
                headerName: '',
                field: '__checkbox',
                width: 50,
                minWidth: 50,
                maxWidth: 50,
                checkboxSelection: true,
                headerCheckboxSelection: true,
                pinned: 'left',
                suppressSizeToFit: true,
                sortable: false,
                filter: false,
                resizable: false
            });
        }

        // Add data columns
        for (const col of visibleColumns) {
            const colDef: ColDef = {
                field: col.field,
                headerName: col.title,
                width: col.width,
                minWidth: col.minWidth,
                maxWidth: col.maxWidth,
                sortable: this.allowSorting && col.sortable,
                resizable: this.allowColumnResize && col.resizable,
                pinned: col.pinned || undefined,
                flex: col.flex,
                cellStyle: this.getCellStyle(col),
                headerClass: this.getHeaderClass(col),
                comparator: (a, b) => this.defaultComparator(a, b, col)
            };

            // Add entity link cell renderer if applicable
            if (col.isEntityLink && col.targetEntityName) {
                colDef.cellRenderer = (params: ICellRendererParams) =>
                    this.renderEntityLinkCell(params, col);
                // Add custom header with entity icon and column name
                colDef.headerComponentParams = {
                    template: this.getEntityLinkHeaderTemplate(col)
                };
            } else {
                // Apply type-specific formatting
                colDef.valueFormatter = (params) => this.formatCellValue(params.value, col);
            }

            defs.push(colDef);
        }

        this.columnDefs = defs;

        // Apply to grid if ready
        if (this.gridApi) {
            this.gridApi.setGridOption('columnDefs', this.columnDefs);
        }
    }

    // ========================================
    // Cell Rendering
    // ========================================

    private getCellStyle(col: QueryGridColumnConfig): Record<string, string> {
        const style: Record<string, string> = {};

        if (col.align === 'right') {
            style['text-align'] = 'right';
            style['justify-content'] = 'flex-end';
        } else if (col.align === 'center') {
            style['text-align'] = 'center';
            style['justify-content'] = 'center';
        }

        return style;
    }

    private getHeaderClass(col: QueryGridColumnConfig): string {
        const classes: string[] = [];

        if (col.align === 'right') {
            classes.push('header-right');
        } else if (col.align === 'center') {
            classes.push('header-center');
        }

        return classes.join(' ');
    }

    private formatCellValue(value: unknown, col: QueryGridColumnConfig): string {
        if (value === null || value === undefined) {
            return '';
        }

        const baseType = col.sqlBaseType.toLowerCase();

        // Boolean formatting
        if (baseType === 'bit') {
            if (this._mergedVisualConfig.booleanIcons) {
                return value ? '✓' : '✗';
            }
            return value ? 'Yes' : 'No';
        }

        // Date formatting
        if (['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(baseType)) {
            const date = new Date(value as string);
            if (isNaN(date.getTime())) return String(value);

            if (this._mergedVisualConfig.friendlyDates) {
                if (baseType === 'date') {
                    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                }
                return date.toLocaleString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit'
                });
            }
            return date.toISOString();
        }

        // Number formatting
        if (['int', 'bigint', 'smallint', 'tinyint'].includes(baseType)) {
            return Number(value).toLocaleString();
        }

        if (['decimal', 'numeric', 'float', 'real'].includes(baseType)) {
            return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        }

        if (['money', 'smallmoney'].includes(baseType)) {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
        }

        return String(value);
    }

    private renderEntityLinkCell(params: ICellRendererParams, col: QueryGridColumnConfig): HTMLElement {
        const container = document.createElement('div');
        container.className = 'entity-link-cell';

        if (params.value === null || params.value === undefined) {
            return container;
        }

        const link = document.createElement('a');
        link.href = 'javascript:void(0)';
        link.className = 'entity-link';
        link.textContent = String(params.value);
        link.title = `Open ${col.targetEntityName} record`;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.entityLinkClick.emit({
                entityName: col.targetEntityName!,
                recordId: String(params.value),
                column: col,
                rowData: params.data
            });
        });

        container.appendChild(link);

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-arrow-up-right-from-square entity-link-icon';
        container.appendChild(icon);

        return container;
    }

    /**
     * Generates header template HTML with entity icon from metadata
     * Shows: [Entity Icon] Column Name [Sort Icons]
     */
    private getEntityLinkHeaderTemplate(col: QueryGridColumnConfig): string {
        // Use the target entity's icon from metadata, fallback to generic icons
        const entityIcon = col.targetEntityIcon || (col.isPrimaryKey ? 'fa-solid fa-key' : 'fa-solid fa-link');
        const tooltip = col.isPrimaryKey
            ? `Primary key - links to ${col.targetEntityName}`
            : `Foreign key - links to ${col.targetEntityName}`;
        // Escape the title for safe HTML insertion
        const escapedTitle = col.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        return `
            <div class="ag-cell-label-container" role="presentation">
                <span ref="eMenu" class="ag-header-icon ag-header-cell-menu-button" aria-hidden="true"></span>
                <div ref="eLabel" class="ag-header-cell-label" role="presentation">
                    <i class="${entityIcon} entity-header-icon" style="color: #5c6bc0; margin-right: 6px; font-size: 12px;" title="${tooltip}"></i>
                    <span ref="eText" class="ag-header-cell-text">${escapedTitle}</span>
                    <span ref="eFilter" class="ag-header-icon ag-header-label-icon ag-filter-icon" aria-hidden="true"></span>
                    <span ref="eSortOrder" class="ag-header-icon ag-header-label-icon ag-sort-order" aria-hidden="true"></span>
                    <span ref="eSortAsc" class="ag-header-icon ag-header-label-icon ag-sort-ascending-icon" aria-hidden="true"></span>
                    <span ref="eSortDesc" class="ag-header-icon ag-header-label-icon ag-sort-descending-icon" aria-hidden="true"></span>
                    <span ref="eSortNone" class="ag-header-icon ag-header-label-icon ag-sort-none-icon" aria-hidden="true"></span>
                </div>
            </div>
        `;
    }

    private defaultComparator(a: unknown, b: unknown, col: QueryGridColumnConfig): number {
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;

        const baseType = col.sqlBaseType.toLowerCase();

        // Numeric comparison
        if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(baseType)) {
            return Number(a) - Number(b);
        }

        // Date comparison
        if (['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(baseType)) {
            return new Date(a as string).getTime() - new Date(b as string).getTime();
        }

        // String comparison (case-insensitive)
        return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
    }

    // ========================================
    // Event Handlers
    // ========================================

    public onRowClicked(event: RowClickedEvent): void {
        const clickEvent: QueryRowClickEvent = {
            rowData: event.data,
            rowIndex: event.rowIndex!,
            mouseEvent: event.event as MouseEvent
        };
        this.rowClick.emit(clickEvent);
    }

    public onRowDoubleClicked(event: RowDoubleClickedEvent): void {
        const clickEvent: QueryRowClickEvent = {
            rowData: event.data,
            rowIndex: event.rowIndex!,
            mouseEvent: event.event as MouseEvent
        };
        this.rowDoubleClick.emit(clickEvent);
    }

    public onSelectionChanged(event: SelectionChangedEvent): void {
        if (!this.gridApi) return;

        this.selectedRows = this.gridApi.getSelectedRows();
        const selectedIndices: number[] = [];

        this.gridApi.forEachNode((node, index) => {
            if (node.isSelected()) {
                selectedIndices.push(index);
            }
        });

        this.selectionChange.emit({
            selectedIndices,
            selectedRows: this.selectedRows
        });

        this.cdr.markForCheck();
    }

    public onSortChanged(event: AgSortChangedEvent): void {
        if (!this.gridApi) return;

        const columnState = this.gridApi.getColumnState();
        const newSortState: QueryGridSortState[] = [];

        columnState
            .filter(cs => cs.sort)
            .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0))
            .forEach((cs, index) => {
                newSortState.push({
                    field: cs.colId,
                    direction: cs.sort as 'asc' | 'desc',
                    index
                });
            });

        this.sortState = newSortState;
        this.emitStateChange('sort');
    }

    public onColumnResized(event: ColumnResizedEvent): void {
        if (!event.finished || !event.column) return;

        const field = event.column.getColId();
        const column = this.columns.find(c => c.field === field);
        if (column) {
            column.width = event.column.getActualWidth();
            this.emitStateChange('column-resize');
        }
    }

    public onColumnMoved(event: ColumnMovedEvent): void {
        if (!this.gridApi || !event.finished) return;

        // Update column order from grid state
        const columnState = this.gridApi.getColumnState();
        columnState.forEach((cs, index) => {
            const column = this.columns.find(c => c.field === cs.colId);
            if (column) {
                column.order = index;
            }
        });

        this.emitStateChange('column-move');
    }

    // ========================================
    // State Management
    // ========================================

    private emitStateChange(changeType: 'column-resize' | 'column-move' | 'column-visibility' | 'sort'): void {
        const state = this.getGridState();
        this.stateChangeSubject.next({ state, changeType });
    }

    public getGridState(): QueryGridState {
        return {
            columns: this.columns.map(c => ({
                field: c.field,
                width: c.width,
                visible: c.visible,
                order: c.order,
                pinned: c.pinned
            })),
            sort: this.sortState
        };
    }

    public applyGridState(state: QueryGridState): void {
        this.applyColumnStateFromGridState(state);
        this.buildColumnDefs();

        // Apply sort state to grid
        if (this.gridApi && state.sort.length > 0) {
            const columnState = state.sort.map(s => ({
                colId: s.field,
                sort: s.direction,
                sortIndex: s.index
            }));
            this.gridApi.applyColumnState({ state: columnState });
        }
    }

    /**
     * Loads persisted grid state from User Settings
     */
    private loadPersistedState(): void {
        if (!this.persistState || !this._queryInfo) return;

        try {
            const settingKey = getQueryGridStateKey(this._queryInfo.ID);
            const savedState = UserInfoEngine.Instance.GetSetting(settingKey);

            if (savedState) {
                const state = JSON.parse(savedState) as QueryGridState;
                this.applyGridState(state);
            }
        } catch (error) {
            console.error('[query-data-grid] Failed to load persisted state:', error);
        }
    }

    /**
     * Persists grid state to User Settings
     */
    private async persistGridState(state: QueryGridState): Promise<void> {
        if (!this.persistState || !this._queryInfo) return;

        try {
            const settingKey = getQueryGridStateKey(this._queryInfo.ID);
            await UserInfoEngine.Instance.SetSetting(settingKey, JSON.stringify(state));
        } catch (error) {
            console.error('[query-data-grid] Failed to persist grid state:', error);
        }
    }

    // ========================================
    // Visual Config
    // ========================================

    private applyVisualConfig(): void {
        const el = this.elementRef.nativeElement;

        // Apply CSS variables
        if (this._mergedVisualConfig.accentColor) {
            el.style.setProperty('--grid-accent-color', this._mergedVisualConfig.accentColor);
        }
        if (this._mergedVisualConfig.selectionIndicatorColor) {
            el.style.setProperty('--grid-selection-indicator', this._mergedVisualConfig.selectionIndicatorColor);
        }
        if (this._mergedVisualConfig.selectionBackground) {
            el.style.setProperty('--grid-selection-bg', this._mergedVisualConfig.selectionBackground);
        }

        // Apply alternate row contrast
        let altRowAlpha = '0.03';
        switch (this._mergedVisualConfig.alternateRowContrast) {
            case 'subtle': altRowAlpha = '0.02'; break;
            case 'medium': altRowAlpha = '0.04'; break;
            case 'strong': altRowAlpha = '0.06'; break;
        }
        el.style.setProperty('--grid-alt-row-alpha', altRowAlpha);
    }

    // ========================================
    // Export Dialog
    // ========================================

    public showExportDialog: boolean = false;
    public exportDialogConfig: ExportDialogConfig | null = null;

    // ========================================
    // Toolbar Actions
    // ========================================

    public refresh(): void {
        this.refreshRequest.emit();
    }

    /**
     * Opens the export dialog with current grid data
     */
    public openExportDialog(): void {
        if (!this._data.length) return;

        const data = this.getExportData();
        const columns = this.getExportColumns();
        const fileName = this._queryInfo?.Name || 'query-export';

        this.exportDialogConfig = {
            data,
            columns,
            defaultFileName: fileName,
            availableFormats: ['excel', 'csv', 'json'],
            defaultFormat: 'excel',
            showSamplingOptions: true,
            defaultSamplingMode: 'all',
            dialogTitle: `Export ${this._queryInfo?.Name || 'Query Results'}`
        };
        this.showExportDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle export dialog close
     */
    public onExportDialogClosed(result: ExportDialogResult): void {
        this.showExportDialog = false;
        this.exportDialogConfig = null;
        this.cdr.detectChanges();
    }

    /**
     * Export grid data directly without showing dialog
     */
    public async export(options?: Partial<ExportOptions>, download: boolean = true): Promise<ExportResult> {
        const data = this.getExportData();
        const columns = this.getExportColumns();
        const fileName = options?.fileName || this._queryInfo?.Name || 'query-export';

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
     * Get the current grid data formatted for export
     */
    private getExportData(): ExportData {
        // Use selected rows if any, otherwise all data
        const rows = this.selectedRows.length > 0 ? this.selectedRows : this._data;
        return rows as ExportData;
    }

    /**
     * Get column definitions for export based on current grid columns
     */
    private getExportColumns(): ExportColumn[] {
        return this.columns
            .filter(c => c.visible)
            .map(c => ({
                name: c.field,
                displayName: c.title,
                type: this.mapSqlTypeToExportType(c.sqlBaseType)
            }));
    }

    private mapSqlTypeToExportType(sqlType: string): 'string' | 'number' | 'boolean' | 'date' {
        const baseType = sqlType.toLowerCase();
        if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney'].includes(baseType)) {
            return 'number';
        }
        if (['bit'].includes(baseType)) {
            return 'boolean';
        }
        if (['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset'].includes(baseType)) {
            return 'date';
        }
        return 'string';
    }

    public clearSelection(): void {
        if (this.gridApi) {
            this.gridApi.deselectAll();
        }
    }

    // ========================================
    // Public API
    // ========================================

    public getSelectedRows(): Record<string, unknown>[] {
        return this.selectedRows;
    }

    public get rowCount(): number {
        return this._data.length;
    }

    public get selectionCount(): number {
        return this.selectedRows.length;
    }

    // ========================================
    // AG Grid Configuration
    // ========================================

    public getRowSelectionConfig(): RowSelectionOptions | undefined {
        if (this.selectionMode === 'none') {
            return undefined;
        }

        return {
            mode: this.selectionMode === 'single' ? 'singleRow' : 'multiRow',
            enableClickSelection: true,
            checkboxes: this.selectionMode === 'checkbox'
        };
    }

    public getRowId = (params: GetRowIdParams): string => {
        // Use data index as ID since query results don't have a guaranteed unique key
        // We use JSON stringify on a subset of the data to create a deterministic key
        const data = params.data as Record<string, unknown>;
        if (!data) return String(Math.random());

        // Try to find a unique identifier in the data
        // Common patterns: ID, Id, id, RowNumber, __row_index
        const idFields = ['ID', 'Id', 'id', 'RowNumber', 'RowNum', '__row_index'];
        for (const field of idFields) {
            if (data[field] !== undefined && data[field] !== null) {
                return String(data[field]);
            }
        }

        // Fallback: use first few fields to create a hash-like key
        const keys = Object.keys(data).slice(0, 3);
        return keys.map(k => String(data[k] ?? '')).join('_');
    };
}
