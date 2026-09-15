import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ViewChild
} from '@angular/core';
import { Metadata, EntityInfo, CompositeKey, BaseEntity, RunViewParams } from '@memberjunction/core';
import { MJListEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import {
  AfterRowClickEventArgs,
  AfterRowDoubleClickEventArgs,
  AfterDataLoadEventArgs,
  GridToolbarConfig,
  GridSelectionMode,
  EntityDataGridComponent
} from '@memberjunction/ng-entity-viewer';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
/**
 * Event emitted when a row is clicked in the list detail grid
 */
export interface ListGridRowClickedEvent {
  entityId: string;
  entityName: string;
  compositeKey: CompositeKey;
  record: Record<string, unknown>;
}

/**
 * ListDetailGridComponent - Displays records from a List using mj-entity-data-grid
 *
 * This component wraps the modern mj-entity-data-grid component to display
 * records that belong to a specific List. It uses a subquery filter to fetch
 * only records whose IDs are in the List Details for the given ListID.
 *
 * @example
 * ```html
 * <mj-list-detail-grid
 *   [listId]="selectedList.ID"
 *   [autoNavigate]="true"
 *   (rowClicked)="onRecordSelected($event)">
 * </mj-list-detail-grid>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-list-detail-grid',
  templateUrl: './ng-list-detail-grid.component.html',
  styleUrls: ['./ng-list-detail-grid.component.css']
})
export class ListDetailGridComponent extends BaseAngularComponent implements OnInit, OnChanges {
  /**
   * The List ID to display records for.
   * When set, the component loads the list entity and builds a filter
   * to show only records that are in this list.
   */
  @Input() ListId: string | null = null;

  /** @deprecated Use {@link ListId}. */
  @Input() set listId(value: string | null) {
    this.ListId = value;
  }
  /** @deprecated Use {@link ListId}. */
  get listId(): string | null {
    return this.ListId;
  }

  /**
   * Optional: The List entity object if already loaded.
   * If provided, avoids an extra database call to load the list.
   */
  @Input() ListEntity: MJListEntity | null = null;

  /** @deprecated Use {@link ListEntity}. */
  @Input() set listEntity(value: MJListEntity | null) {
    this.ListEntity = value;
  }
  /** @deprecated Use {@link ListEntity}. */
  get listEntity(): MJListEntity | null {
    return this.ListEntity;
  }

  /**
   * Whether to auto-navigate to the record when double-clicked.
   * Defaults to true.
   */
  @Input() AutoNavigate: boolean = true;

  /** @deprecated Use {@link AutoNavigate}. */
  @Input() set autoNavigate(value: boolean) {
    this.AutoNavigate = value;
  }
  /** @deprecated Use {@link AutoNavigate}. */
  get autoNavigate(): boolean {
    return this.AutoNavigate;
  }

  /**
   * Height of the grid. Can be a number (pixels), 'auto', or 'fit-content'.
   * Defaults to 'auto'.
   */
  @Input() height: number | 'auto' | 'fit-content' = 'auto';

  /**
   * Show the grid toolbar.
   * Defaults to true.
   */
  @Input() ShowToolbar: boolean = true;

  /** @deprecated Use {@link ShowToolbar}. */
  @Input() set showToolbar(value: boolean) {
    this.ShowToolbar = value;
  }
  /** @deprecated Use {@link ShowToolbar}. */
  get showToolbar(): boolean {
    return this.ShowToolbar;
  }

  /**
   * Selection mode for the grid.
   * Defaults to 'single'.
   */
  @Input() selectionMode: GridSelectionMode = 'single';

  /**
   * Emitted when a row is clicked (single click).
   */
  @Output() RowClicked = new EventEmitter<ListGridRowClickedEvent>();

  /**
   * @deprecated Use {@link RowClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (rowClicked) keeps working. Must stay AFTER RowClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() rowClicked = this.RowClicked;

  /**
   * Emitted when a row is double-clicked.
   */
  @Output() RowDoubleClicked = new EventEmitter<ListGridRowClickedEvent>();

  /**
   * @deprecated Use {@link RowDoubleClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (rowDoubleClicked) keeps working. Must stay AFTER RowDoubleClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() rowDoubleClicked = this.RowDoubleClicked;

  /**
   * Emitted when the grid data is loaded.
   */
  @Output() DataLoaded = new EventEmitter<{ totalCount: number }>();

  /**
   * @deprecated Use {@link DataLoaded}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (dataLoaded) keeps working. Must stay AFTER DataLoaded: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() dataLoaded = this.DataLoaded;

  /**
   * Emitted when row selection changes (for checkbox mode).
   */
  @Output() SelectionChange = new EventEmitter<string[]>();

  /**
   * @deprecated Use {@link SelectionChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (selectionChange) keeps working. Must stay AFTER SelectionChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() selectionChange = this.SelectionChange;

  /**
   * Custom toolbar configuration. If not provided, uses default.
   */
  @Input() ToolbarConfig: GridToolbarConfig | null = null;

  /** @deprecated Use {@link ToolbarConfig}. */
  @Input() set toolbarConfig(value: GridToolbarConfig | null) {
    this.ToolbarConfig = value;
  }
  /** @deprecated Use {@link ToolbarConfig}. */
  get toolbarConfig(): GridToolbarConfig | null {
    return this.ToolbarConfig;
  }

  // ViewChild to access the underlying EDG component
  @ViewChild('entityDataGrid') entityDataGrid: EntityDataGridComponent | undefined;

  // Internal state
  EntityInfo: EntityInfo | null = null;

  /** @deprecated Use {@link EntityInfo}. */
  get entityInfo(): EntityInfo | null {
    return this.EntityInfo;
  }
  /** @deprecated Use {@link EntityInfo}. */
  set entityInfo(value: EntityInfo | null) {
    this.EntityInfo = value;
  }
  GridParams: RunViewParams | null = null;

  /** @deprecated Use {@link GridParams}. */
  get gridParams(): RunViewParams | null {
    return this.GridParams;
  }
  /** @deprecated Use {@link GridParams}. */
  set gridParams(value: RunViewParams | null) {
    this.GridParams = value;
  }
  isLoading: boolean = false;
  ListLoaded: boolean = false;

  /** @deprecated Use {@link ListLoaded}. */
  get listLoaded(): boolean {
    return this.ListLoaded;
  }
  /** @deprecated Use {@link ListLoaded}. */
  set listLoaded(value: boolean) {
    this.ListLoaded = value;
  }
  SelectedKeys: string[] = [];

  /** @deprecated Use {@link SelectedKeys}. */
  get selectedKeys(): string[] {
    return this.SelectedKeys;
  }
  /** @deprecated Use {@link SelectedKeys}. */
  set selectedKeys(value: string[]) {
    this.SelectedKeys = value;
  }
  TotalRowCount: number = 0;

  /** @deprecated Use {@link TotalRowCount}. */
  get totalRowCount(): number {
    return this.TotalRowCount;
  }
  /** @deprecated Use {@link TotalRowCount}. */
  set totalRowCount(value: number) {
    this.TotalRowCount = value;
  }

  // Default toolbar configuration - minimal for list display
  private defaultToolbarConfig: GridToolbarConfig = {
    showSearch: true,
    showRefresh: true,
    showAdd: false,
    showDelete: false,
    showExport: true,
    showRowCount: true,
    showSelectionCount: true
  };

  /**
   * Get the effective toolbar config (custom or default)
   */
  get EffectiveToolbarConfig(): GridToolbarConfig {
    return this.ToolbarConfig || this.defaultToolbarConfig;
  }

  /** @deprecated Use {@link EffectiveToolbarConfig}. */
  get effectiveToolbarConfig(): GridToolbarConfig {
    return this.EffectiveToolbarConfig;
  }

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    super();}

  ngOnInit(): void {
    if (this.ListId || this.ListEntity) {
      this.loadList();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['listId'] || changes['listEntity']) {
      this.loadList();
    }
  }

  /**
   * Build the SQL filter to select records that are in the given list.
   * For single PK entities, uses a simple IN clause.
   * For composite PK entities, uses a JOIN that concatenates PK columns to match the RecordID format.
   */
  private buildListFilter(entityInfo: EntityInfo, listDetailsSchema: string, listId: string): string {
    const primaryKeys = entityInfo.PrimaryKeys;

    if (primaryKeys.length === 1) {
      // Simple case: single primary key
      // Use a simple IN clause matching the first PK field
      const pkField = primaryKeys[0].Name;
      return `${pkField} IN (SELECT RecordID FROM ${listDetailsSchema}.vwListDetails WHERE ListID = '${listId}')`;
    } else {
      // Composite key case: need to JOIN and match concatenated key format
      // RecordID format is "Field1|Value1||Field2|Value2" (using CompositeKey delimiters)
      // Build SQL expression that concatenates the PK fields in the same format
      // Build the concatenation expression for the entity's PK columns
      // Format: Field1 + '|' + CAST(Value1 AS NVARCHAR(MAX)) + '||' + Field2 + '|' + CAST(Value2 AS NVARCHAR(MAX))
      const concatParts = primaryKeys.map((pk, index) => {
        const fieldNameLiteral = `'${pk.Name}|'`;
        const fieldValue = `CAST([${pk.Name}] AS NVARCHAR(MAX))`;
        if (index === 0) {
          return `${fieldNameLiteral} + ${fieldValue}`;
        } else {
          return `'||' + ${fieldNameLiteral} + ${fieldValue}`;
        }
      });
      const compositeKeyExpr = concatParts.join(' + ');

      // Use EXISTS with a subquery that matches the concatenated key against RecordID
      return `EXISTS (
        SELECT 1 FROM ${listDetailsSchema}.vwListDetails ld
        WHERE ld.ListID = '${listId}'
        AND ld.RecordID = (${compositeKeyExpr})
      )`;
    }
  }

  /**
   * Load the list entity and set up the grid params with filter
   */
  private async loadList(): Promise<void> {
    // Reset state
    this.ListLoaded = false;
    this.GridParams = null;

    if (!this.ListId && !this.ListEntity) {
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      let list: MJListEntity | null = this.ListEntity;

      // Load the list entity if not provided
      if (!list && this.ListId) {
        list = await md.GetEntityObject<MJListEntity>('MJ: Lists');
        await list.Load(this.ListId);
      }

      if (!list) {
        console.error('Failed to load list');
        return;
      }

      // Get the entity info for this list
      const entityInfo = md.EntityByID(list.EntityID);
      if (!entityInfo) {
        console.error(`Entity not found for ID: ${list.EntityID}`);
        return;
      }

      this.EntityInfo = entityInfo;

      // Get the List Details entity info to get the correct schema name
      const listDetailsEntityInfo = md.EntityByName('MJ: List Details');
      if (!listDetailsEntityInfo) {
        console.error('List Details entity not found in metadata');
        return;
      }

      // Build the subquery filter to get records in this list
      // Uses the primary key field(s) of the entity and the schema from List Details entity
      const schema = listDetailsEntityInfo.SchemaName;
      const extraFilter = this.buildListFilter(entityInfo, schema, list.ID);

      // The grid filter is a cross-entity subquery into `vwListDetails`
      // (`ID IN (SELECT RecordID FROM vwListDetails WHERE ListID='…')`).
      // The server's RunView cache fingerprints by the OUTER entity, so a
      // mutation on `MJ: List Details` doesn't invalidate this query's
      // cached result — the grid would otherwise serve stale rows until a
      // server restart. `BypassCache: true` makes the server skip both
      // the cache lookup and the write for this query.
      this.GridParams = {
        EntityName: entityInfo.Name,
        ExtraFilter: extraFilter,
        ResultType: 'entity_object',
        BypassCache: true
      };

      this.ListLoaded = true;
    } catch (error) {
      console.error('Error loading list:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle row click event from the grid
   */
  OnRowClick(event: AfterRowClickEventArgs): void {
    if (!this.EntityInfo || !event.row) return;

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(this.EntityInfo, event.row);

    this.RowClicked.emit({
      entityId: this.EntityInfo.ID,
      entityName: this.EntityInfo.Name,
      compositeKey,
      record: event.row
    });
  }

  /** @deprecated Use {@link OnRowClick}. */
  onRowClick(event: AfterRowClickEventArgs): void {
    return this.OnRowClick(event);
  }

  /**
   * Handle row double-click event from the grid
   */
  OnRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
    if (!this.EntityInfo || !event.row) return;

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(this.EntityInfo, event.row);

    this.RowDoubleClicked.emit({
      entityId: this.EntityInfo.ID,
      entityName: this.EntityInfo.Name,
      compositeKey,
      record: event.row
    });

    // Auto-navigate if enabled - use SharedService for proper tab-based navigation
    if (this.AutoNavigate) {
      this.sharedService.OpenEntityRecord(this.EntityInfo.Name, compositeKey);
    }
  }

  /** @deprecated Use {@link OnRowDoubleClick}. */
  onRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
    return this.OnRowDoubleClick(event);
  }

  /**
   * Handle data loaded event from the grid
   */
  OnDataLoaded(event: AfterDataLoadEventArgs): void {
    this.TotalRowCount = event.totalRowCount;
    this.DataLoaded.emit({ totalCount: event.totalRowCount });
  }

  /** @deprecated Use {@link OnDataLoaded}. */
  onDataLoaded(event: AfterDataLoadEventArgs): void {
    return this.OnDataLoaded(event);
  }

  /**
   * Handle selection change from the grid
   */
  OnSelectionChange(keys: string[]): void {
    this.SelectedKeys = keys;
    this.SelectionChange.emit(keys);
  }

  /** @deprecated Use {@link OnSelectionChange}. */
  onSelectionChange(keys: string[]): void {
    return this.OnSelectionChange(keys);
  }

  /**
   * Refresh the grid data
   */
  Refresh(): void {
    // Re-trigger load to refresh data
    this.loadList();
  }

  /** @deprecated Use {@link Refresh}. */
  refresh(): void {
    return this.Refresh();
  }

  /**
   * Get the currently selected entity objects
   */
  GetSelectedRows(): Record<string, unknown>[] {
    if (this.entityDataGrid) {
      return this.entityDataGrid.GetSelectedRows();
    }
    return [];
  }

  /** @deprecated Use {@link GetSelectedRows}. */
  getSelectedRows(): Record<string, unknown>[] {
    return this.GetSelectedRows();
  }

  /**
   * Clear all selections
   */
  ClearSelection(): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.ClearSelection();
    }
    this.SelectedKeys = [];
  }

  /** @deprecated Use {@link ClearSelection}. */
  clearSelection(): void {
    return this.ClearSelection();
  }

  /**
   * Select specific rows by key
   */
  SelectRows(keys: string[], additive: boolean = false): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.SelectRows(keys, additive);
    }
  }

  /** @deprecated Use {@link SelectRows}. */
  selectRows(keys: string[], additive: boolean = false): void {
    return this.SelectRows(keys, additive);
  }

  /**
   * Select all rows
   */
  SelectAll(): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.SelectAll();
    }
  }

  /** @deprecated Use {@link SelectAll}. */
  selectAll(): void {
    return this.SelectAll();
  }

  /**
   * Get the total row count
   */
  get RowCount(): number {
    return this.TotalRowCount;
  }

  /** @deprecated Use {@link RowCount}. */
  get rowCount(): number {
    return this.RowCount;
  }

  /**
   * Get the selected row count
   */
  get SelectedCount(): number {
    return this.SelectedKeys.length;
  }

  /** @deprecated Use {@link SelectedCount}. */
  get selectedCount(): number {
    return this.SelectedCount;
  }

  /**
   * Trigger the export dialog
   */
  export(): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.onExportClick();
    }
  }
}
