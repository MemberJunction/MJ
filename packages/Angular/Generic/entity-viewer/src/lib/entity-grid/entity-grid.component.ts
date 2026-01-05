import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityFieldInfo, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
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
  ICellRendererParams,
  SortChangedEvent as AgSortChangedEvent,
  ColumnResizedEvent,
  ColumnMovedEvent,
  ColumnState
} from 'ag-grid-community';
import { GridColumnDef, RecordSelectedEvent, RecordOpenedEvent, SortState, SortChangedEvent, SortDirection, ViewGridStateConfig, ViewColumnConfig, ViewSortConfig, GridStateChangedEvent } from '../types';
import { HighlightUtil } from '../utils/highlight.util';

// Register AG Grid modules (required for v34+)
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * EntityGridComponent - AG Grid based table view for entity records
 *
 * This component provides a lightweight, customizable grid view for displaying
 * entity records. It uses AG Grid Community edition for high-performance rendering.
 *
 * Supports two modes:
 * 1. Parent-managed data: Records are passed in via [records] input
 * 2. Standalone: Component loads its own data with pagination
 *
 * @example
 * ```html
 * <mj-entity-grid
 *   [entity]="selectedEntity"
 *   [records]="filteredRecords"
 *   [selectedRecordId]="selectedId"
 *   [sortState]="currentSort"
 *   [serverSideSorting]="true"
 *   (recordSelected)="onRecordSelected($event)"
 *   (recordOpened)="onRecordOpened($event)"
 *   (sortChanged)="onSortChanged($event)">
 * </mj-entity-grid>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-entity-grid',
  templateUrl: './entity-grid.component.html',
  styleUrls: ['./entity-grid.component.css']
})
export class EntityGridComponent implements OnInit, OnChanges {
  /**
   * The entity metadata for the records being displayed
   */
  @Input() entity: EntityInfo | null = null;

  /**
   * The records to display in the grid (optional - component can load its own)
   */
  @Input() records: BaseEntity[] | null = null;

  /**
   * The currently selected record's primary key string
   */
  @Input() selectedRecordId: string | null = null;

  /**
   * Custom column definitions (optional - auto-generated if not provided)
   */
  @Input() columns: GridColumnDef[] = [];

  /**
   * Height of the grid (CSS value)
   * @default '100%'
   */
  @Input() height: string = '100%';

  /**
   * Whether to enable row selection
   * @default true
   */
  @Input() enableSelection: boolean = true;

  /**
   * Filter text for highlighting matches in cells
   * Supports SQL-style % wildcards
   */
  @Input() filterText: string = '';

  /**
   * Current sort state (for external control)
   */
  @Input() sortState: SortState | null = null;

  /**
   * Whether sorting is handled server-side
   * When true, sort changes emit events but don't sort locally
   * @default true
   */
  @Input() serverSideSorting: boolean = true;

  /**
   * Page size for standalone data loading
   * @default 100
   */
  @Input() pageSize: number = 100;

  /**
   * Grid state from a User View - controls columns, widths, order, sort
   * When provided, this takes precedence over auto-generated columns
   */
  @Input() gridState: ViewGridStateConfig | null = null;

  /**
   * Emitted when a record is selected (single click)
   */
  @Output() recordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when a record should be opened (double click)
   */
  @Output() recordOpened = new EventEmitter<RecordOpenedEvent>();

  /**
   * Emitted when sort state changes
   */
  @Output() sortChanged = new EventEmitter<SortChangedEvent>();

  /**
   * Emitted when grid state changes (column resize, reorder, etc.)
   */
  @Output() gridStateChanged = new EventEmitter<GridStateChangedEvent>();

  /** AG Grid column definitions */
  public columnDefs: ColDef[] = [];

  /** AG Grid row data */
  public rowData: Record<string, unknown>[] = [];

  /** AG Grid API reference */
  private gridApi: GridApi | null = null;

  /** Internal records when loading standalone */
  private internalRecords: BaseEntity[] = [];

  /** Track if we're in standalone mode (no external records provided) */
  private standaloneMode: boolean = false;

  /** Loading state for standalone mode */
  public isLoading: boolean = false;

  /** Suppress sort changed events during programmatic sort updates */
  private suppressSortEvents: boolean = false;

  /** Default column settings */
  public defaultColDef: ColDef = {
    sortable: true,
    filter: false,  // Filtering is handled at the parent level
    resizable: true,
    minWidth: 80
  };

  /** AG Grid theme (v34+) */
  public theme = themeAlpine;

  /** Row selection configuration (v34+ object-based API) */
  public rowSelection: RowSelectionOptions = {
    mode: 'singleRow'
  };

  /** Get row ID function for AG Grid */
  public getRowId = (params: GetRowIdParams<Record<string, unknown>>) => params.data['__pk'] as string;

  ngOnInit(): void {
    this.standaloneMode = this.records === null;
    this.buildColumnDefs();

    if (this.standaloneMode && this.entity) {
      this.loadData();
    } else {
      this.buildRowData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] || changes['columns'] || changes['gridState']) {
      this.buildColumnDefs();
    }

    if (changes['entity'] && this.standaloneMode && this.entity) {
      this.loadData();
    }

    if (changes['records']) {
      this.standaloneMode = this.records === null;
      if (!this.standaloneMode) {
        this.buildRowData();
      }
    }

    if (changes['selectedRecordId'] && this.gridApi) {
      this.updateSelection();
    }

    // When filter text changes, refresh the grid to update highlighting
    if (changes['filterText'] && this.gridApi) {
      this.gridApi.refreshCells({ force: true });
    }

    // Handle external sort state changes
    if (changes['sortState'] && this.gridApi && this.sortState) {
      this.applySortStateToGrid();
    }

    // Handle gridState changes - apply sort if present
    if (changes['gridState'] && this.gridApi && this.gridState?.sortSettings?.length) {
      const sortSetting = this.gridState.sortSettings[0];
      this.sortState = {
        field: sortSetting.field,
        direction: sortSetting.dir
      };
      this.applySortStateToGrid();
    }
  }

  /**
   * Get effective records (external or internal)
   */
  private get effectiveRecords(): BaseEntity[] {
    return this.records ?? this.internalRecords;
  }

  /**
   * Load data in standalone mode
   */
  private async loadData(): Promise<void> {
    if (!this.entity) return;

    this.isLoading = true;

    try {
      const rv = new RunView();

      // Build OrderBy from sort state
      let orderBy: string | undefined;
      if (this.sortState?.field && this.sortState.direction) {
        orderBy = `${this.sortState.field} ${this.sortState.direction.toUpperCase()}`;
      }

      const result = await rv.RunView({
        EntityName: this.entity.Name ?? undefined,
        ResultType: 'entity_object',
        MaxRows: this.pageSize,
        OrderBy: orderBy
      });

      if (result.Success) {
        this.internalRecords = result.Results;
        this.buildRowData();
      }
    } catch (error) {
      console.error('Error loading grid data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Handle AG Grid ready event
   */
  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.updateSelection();

    // Apply initial sort state if provided
    if (this.sortState) {
      this.applySortStateToGrid();
    }

    // Auto-size columns to fit content
    event.api.sizeColumnsToFit();
  }

  /**
   * Handle AG Grid sort changed event
   */
  onGridSortChanged(event: AgSortChangedEvent): void {
    if (this.suppressSortEvents) return;

    const sortModel = event.api.getColumnState()
      .filter(col => col.sort)
      .map(col => ({ field: col.colId, direction: col.sort as SortDirection }));

    if (sortModel.length > 0) {
      const newSort: SortState = {
        field: sortModel[0].field,
        direction: sortModel[0].direction
      };
      this.sortChanged.emit({ sort: newSort });

      // Also emit as grid state change
      this.emitGridStateChanged('sort');

      // If in standalone mode and server-side sorting, reload data
      if (this.standaloneMode && this.serverSideSorting) {
        // The parent should handle this, but if standalone, reload
        this.loadData();
      }
    } else {
      this.sortChanged.emit({ sort: null });
    }
  }

  /**
   * Handle column resized event
   */
  onColumnResized(event: ColumnResizedEvent): void {
    // Only emit on finished (not during drag)
    if (event.finished && event.source !== 'api') {
      this.emitGridStateChanged('columns');
    }
  }

  /**
   * Handle column moved event
   */
  onColumnMoved(event: ColumnMovedEvent): void {
    // Only emit when the drag is finished
    if (event.finished && event.source !== 'api') {
      this.emitGridStateChanged('columns');
    }
  }

  /**
   * Emit grid state changed event with current column/sort state
   */
  private emitGridStateChanged(changeType: 'columns' | 'sort' | 'filter'): void {
    if (!this.gridApi || !this.entity) return;

    const currentState = this.buildCurrentGridState();
    this.gridStateChanged.emit({
      gridState: currentState,
      changeType
    });
  }

  /**
   * Build current grid state from AG Grid's column state
   */
  private buildCurrentGridState(): ViewGridStateConfig {
    if (!this.gridApi || !this.entity) {
      return { columnSettings: [], sortSettings: [] };
    }

    const columnState = this.gridApi.getColumnState();
    const columnSettings: ViewColumnConfig[] = [];
    const sortSettings: ViewSortConfig[] = [];

    for (let i = 0; i < columnState.length; i++) {
      const col = columnState[i];
      const field = this.entity.Fields.find(f => f.Name === col.colId);

      if (field?.Name) {
        columnSettings.push({
          ID: field.ID ?? undefined,
          Name: field.Name,
          DisplayName: field.DisplayNameOrName,
          hidden: col.hide ?? false,
          width: col.width ?? undefined,
          orderIndex: i
        });
      }

      // Capture sort settings
      if (col.sort) {
        sortSettings.push({
          field: col.colId,
          dir: col.sort as 'asc' | 'desc'
        });
      }
    }

    return { columnSettings, sortSettings };
  }

  /**
   * Apply external sort state to the grid
   */
  private applySortStateToGrid(): void {
    if (!this.gridApi || !this.sortState) return;

    this.suppressSortEvents = true;
    try {
      const columnState = this.gridApi.getColumnState().map(col => ({
        ...col,
        sort: col.colId === this.sortState!.field ? this.sortState!.direction : null,
        sortIndex: col.colId === this.sortState!.field ? 0 : null
      }));
      this.gridApi.applyColumnState({ state: columnState });
    } finally {
      this.suppressSortEvents = false;
    }
  }

  /**
   * Handle row click event
   */
  onRowClicked(event: RowClickedEvent): void {
    if (!this.entity || !event.data) return;

    const record = this.findRecordByPk(event.data['__pk'] as string);
    if (!record) return;

    this.recordSelected.emit({
      record,
      entity: this.entity,
      compositeKey: record.PrimaryKey
    });
  }

  /**
   * Handle row double-click event
   */
  onRowDoubleClicked(event: RowDoubleClickedEvent): void {
    if (!this.entity || !event.data) return;

    const record = this.findRecordByPk(event.data['__pk'] as string);
    if (!record) return;

    this.recordOpened.emit({
      record,
      entity: this.entity,
      compositeKey: record.PrimaryKey
    });
  }

  /**
   * Build AG Grid column definitions from gridState, custom columns, or entity metadata
   * Priority: gridState > custom columns > auto-generated
   */
  private buildColumnDefs(): void {
    if (this.gridState?.columnSettings && this.gridState.columnSettings.length > 0 && this.entity) {
      // Use gridState column configuration (from User View)
      this.columnDefs = this.buildColumnDefsFromGridState(this.gridState.columnSettings);
    } else if (this.columns.length > 0) {
      // Use custom column definitions
      this.columnDefs = this.columns.map(col => this.mapCustomColumnDef(col));
    } else if (this.entity) {
      // Auto-generate from entity metadata
      this.columnDefs = this.generateColumnDefs(this.entity);
    } else {
      this.columnDefs = [];
    }
  }

  /**
   * Build column definitions from gridState column settings
   */
  private buildColumnDefsFromGridState(columnSettings: ViewColumnConfig[]): ColDef[] {
    if (!this.entity) return [];

    // Sort by orderIndex
    const sortedColumns = [...columnSettings].sort((a, b) =>
      (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
    );

    const cols: ColDef[] = [];

    for (const colConfig of sortedColumns) {
      // Skip hidden columns
      if (colConfig.hidden) continue;

      // Find the corresponding entity field
      const field = this.entity.Fields.find(f =>
        f.Name && f.Name.toLowerCase() === colConfig.Name.toLowerCase()
      );

      if (!field || !field.Name) continue;

      const colDef: ColDef = {
        field: field.Name,
        headerName: colConfig.DisplayName || field.DisplayNameOrName,
        width: colConfig.width || this.estimateColumnWidth(field),
        sortable: true,
        resizable: true
      };

      // For string fields, use a cell renderer that supports highlighting
      if (field.TSType === 'string') {
        colDef.cellRenderer = (params: ICellRendererParams) => this.highlightCellRenderer(params);
      } else {
        // For non-string fields, use value formatter
        colDef.valueFormatter = this.getValueFormatter(field);
      }

      cols.push(colDef);
    }

    return cols;
  }

  /**
   * Map custom column definition to AG Grid ColDef
   */
  private mapCustomColumnDef(col: GridColumnDef): ColDef {
    return {
      field: col.field,
      headerName: col.headerName,
      width: col.width,
      minWidth: col.minWidth,
      maxWidth: col.maxWidth,
      sortable: col.sortable ?? true,
      filter: false,  // Filtering handled at parent level
      resizable: col.resizable ?? true,
      hide: col.hide ?? false
    };
  }

  /**
   * Auto-generate column definitions from entity metadata
   */
  private generateColumnDefs(entity: EntityInfo): ColDef[] {
    const cols: ColDef[] = [];

    // Filter fields to show
    const visibleFields = entity.Fields.filter(f => this.shouldShowField(f));

    for (const field of visibleFields) {
      if (!field.Name) continue;

      const colDef: ColDef = {
        field: field.Name,
        headerName: field.DisplayNameOrName,
        width: this.estimateColumnWidth(field),
        sortable: true,
        resizable: true
      };

      // For string fields, use a cell renderer that supports highlighting
      if (field.TSType === 'string') {
        colDef.cellRenderer = (params: ICellRendererParams) => this.highlightCellRenderer(params);
      } else {
        // For non-string fields, use value formatter
        colDef.valueFormatter = this.getValueFormatter(field);
      }

      cols.push(colDef);
    }

    return cols;
  }

  /**
   * Cell renderer that highlights matching text
   * Uses HighlightUtil which only highlights if the text actually matches the pattern
   */
  private highlightCellRenderer(params: ICellRendererParams): string {
    const value = params.value;
    if (value === null || value === undefined) return '';

    const text = String(value);
    return HighlightUtil.highlight(text, this.filterText, true);
  }

  /**
   * Determine if a field should be shown in the grid
   */
  private shouldShowField(field: EntityFieldInfo): boolean {
    // Skip internal MJ fields
    if (field.Name && field.Name.startsWith('__mj_')) return false;

    // Skip primary key if it's a GUID (usually not useful to display)
    if (field.IsPrimaryKey && field.SQLFullType?.toLowerCase() === 'uniqueidentifier') {
      return false;
    }

    // Prefer DefaultInView fields
    if (field.DefaultInView === true) return true;

    // Skip large text fields by default
    if (field.Length && field.Length > 500) return false;

    return true;
  }

  /**
   * Estimate appropriate column width based on field type
   */
  private estimateColumnWidth(field: EntityFieldInfo): number {
    if (field.TSType === 'boolean') return 100;
    if (field.TSType === 'number') return 120;
    if (field.TSType === 'Date') return 150;
    if (field.Name && field.Name.toLowerCase().includes('id')) return 100;
    if (field.Name && field.Name.toLowerCase().includes('email')) return 200;
    if (field.Name && field.Name.toLowerCase().includes('name')) return 180;

    // Default based on length
    const charWidth = 8;
    const padding = 20;
    const estimatedWidth = Math.min(Math.max((field.Length ?? 100) * charWidth / 2, 100), 300) + padding;

    return estimatedWidth;
  }

  /**
   * Get value formatter for a field based on its type
   */
  private getValueFormatter(field: EntityFieldInfo): ((params: { value: unknown }) => string) | undefined {
    if (field.TSType === 'Date') {
      return (params: { value: unknown }) => {
        if (!params.value) return '';
        const date = params.value instanceof Date ? params.value : new Date(params.value as string);
        if (isNaN(date.getTime())) return String(params.value);
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      };
    }

    if (field.TSType === 'boolean') {
      return (params: { value: unknown }) => {
        if (params.value === null || params.value === undefined) return '';
        return params.value ? 'Yes' : 'No';
      };
    }

    if (field.TSType === 'number') {
      const fieldNameLower = field.Name?.toLowerCase() ?? '';
      const isCurrency = fieldNameLower.includes('amount') ||
                         fieldNameLower.includes('price') ||
                         fieldNameLower.includes('cost') ||
                         fieldNameLower.includes('total');

      if (isCurrency) {
        return (params: { value: unknown }) => {
          if (params.value === null || params.value === undefined) return '';
          const num = Number(params.value);
          if (isNaN(num)) return String(params.value);
          return `$${num.toLocaleString()}`;
        };
      }
    }

    return undefined;
  }

  /**
   * Build row data from entity records
   */
  private buildRowData(): void {
    if (!this.entity) {
      this.rowData = [];
      return;
    }

    const records = this.effectiveRecords;
    this.rowData = records.map(record => {
      const row: Record<string, unknown> = {
        __pk: record.PrimaryKey.ToConcatenatedString()
      };

      // Copy all field values
      for (const field of this.entity!.Fields) {
        if (field.Name) {
          row[field.Name] = record.Get(field.Name);
        }
      }

      return row;
    });
  }

  /**
   * Update grid selection to match selectedRecordId and scroll to the selected row
   */
  private updateSelection(): void {
    if (!this.gridApi || !this.selectedRecordId) {
      this.gridApi?.deselectAll();
      return;
    }

    const node = this.gridApi.getRowNode(this.selectedRecordId);
    if (node) {
      node.setSelected(true);
      // Scroll the selected row into view (middle of viewport if possible)
      this.gridApi.ensureNodeVisible(node, 'middle');
    }
  }

  /**
   * Find a record by its primary key string
   */
  private findRecordByPk(pkString: string): BaseEntity | undefined {
    return this.effectiveRecords.find(r => r.PrimaryKey.ToConcatenatedString() === pkString);
  }
}
