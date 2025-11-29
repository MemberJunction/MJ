import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
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
  ICellRendererParams
} from 'ag-grid-community';
import { GridColumnDef, RecordSelectedEvent, RecordOpenedEvent } from '../types';
import { HighlightUtil } from '../utils/highlight.util';

// Register AG Grid modules (required for v34+)
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * EntityGridComponent - AG Grid based table view for entity records
 *
 * This component provides a lightweight, customizable grid view for displaying
 * entity records. It uses AG Grid Community edition for high-performance rendering.
 *
 * @example
 * ```html
 * <mj-entity-grid
 *   [entity]="selectedEntity"
 *   [records]="filteredRecords"
 *   [selectedRecordId]="selectedId"
 *   (recordSelected)="onRecordSelected($event)"
 *   (recordOpened)="onRecordOpened($event)">
 * </mj-entity-grid>
 * ```
 */
@Component({
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
   * The records to display in the grid
   */
  @Input() records: BaseEntity[] = [];

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
   * Emitted when a record is selected (single click)
   */
  @Output() recordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when a record should be opened (double click)
   */
  @Output() recordOpened = new EventEmitter<RecordOpenedEvent>();

  /** AG Grid column definitions */
  public columnDefs: ColDef[] = [];

  /** AG Grid row data */
  public rowData: Record<string, unknown>[] = [];

  /** AG Grid API reference */
  private gridApi: GridApi | null = null;

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
    this.buildColumnDefs();
    this.buildRowData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] || changes['columns']) {
      this.buildColumnDefs();
    }

    if (changes['records']) {
      this.buildRowData();
    }

    if (changes['selectedRecordId'] && this.gridApi) {
      this.updateSelection();
    }

    // When filter text changes, refresh the grid to update highlighting
    if (changes['filterText'] && this.gridApi) {
      this.gridApi.refreshCells({ force: true });
    }
  }

  /**
   * Handle AG Grid ready event
   */
  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.updateSelection();

    // Auto-size columns to fit content
    event.api.sizeColumnsToFit();
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
   * Build AG Grid column definitions from entity metadata or custom columns
   */
  private buildColumnDefs(): void {
    if (this.columns.length > 0) {
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
    if (field.Name.startsWith('__mj_')) return false;

    // Skip primary key if it's a GUID (usually not useful to display)
    if (field.IsPrimaryKey && field.SQLFullType?.toLowerCase() === 'uniqueidentifier') {
      return false;
    }

    // Prefer DefaultInView fields
    if (field.DefaultInView === true) return true;

    // Skip large text fields by default
    if (field.Length > 500) return false;

    return true;
  }

  /**
   * Estimate appropriate column width based on field type
   */
  private estimateColumnWidth(field: EntityFieldInfo): number {
    if (field.TSType === 'boolean') return 100;
    if (field.TSType === 'number') return 120;
    if (field.TSType === 'Date') return 150;
    if (field.Name.toLowerCase().includes('id')) return 100;
    if (field.Name.toLowerCase().includes('email')) return 200;
    if (field.Name.toLowerCase().includes('name')) return 180;

    // Default based on length
    const charWidth = 8;
    const padding = 20;
    const estimatedWidth = Math.min(Math.max(field.Length * charWidth / 2, 100), 300) + padding;

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
      const fieldNameLower = field.Name.toLowerCase();
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

    this.rowData = this.records.map(record => {
      const row: Record<string, unknown> = {
        __pk: record.PrimaryKey.ToConcatenatedString()
      };

      // Copy all field values
      for (const field of this.entity!.Fields) {
        row[field.Name] = record.Get(field.Name);
      }

      return row;
    });
  }

  /**
   * Update grid selection to match selectedRecordId
   */
  private updateSelection(): void {
    if (!this.gridApi || !this.selectedRecordId) {
      this.gridApi?.deselectAll();
      return;
    }

    const node = this.gridApi.getRowNode(this.selectedRecordId);
    if (node) {
      node.setSelected(true);
    }
  }

  /**
   * Find a record by its primary key string
   */
  private findRecordByPk(pkString: string): BaseEntity | undefined {
    return this.records.find(r => r.PrimaryKey.ToConcatenatedString() === pkString);
  }

}
