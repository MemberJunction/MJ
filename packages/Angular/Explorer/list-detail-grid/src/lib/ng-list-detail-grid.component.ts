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
import { ListEntity } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';
import {
  AfterRowClickEventArgs,
  AfterRowDoubleClickEventArgs,
  AfterDataLoadEventArgs,
  GridToolbarConfig,
  GridSelectionMode,
  EntityDataGridComponent
} from '@memberjunction/ng-entity-viewer';

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
export class ListDetailGridComponent implements OnInit, OnChanges {
  /**
   * The List ID to display records for.
   * When set, the component loads the list entity and builds a filter
   * to show only records that are in this list.
   */
  @Input() listId: string | null = null;

  /**
   * Optional: The List entity object if already loaded.
   * If provided, avoids an extra database call to load the list.
   */
  @Input() listEntity: ListEntity | null = null;

  /**
   * Whether to auto-navigate to the record when double-clicked.
   * Defaults to true.
   */
  @Input() autoNavigate: boolean = true;

  /**
   * Height of the grid. Can be a number (pixels), 'auto', or 'fit-content'.
   * Defaults to 'auto'.
   */
  @Input() height: number | 'auto' | 'fit-content' = 'auto';

  /**
   * Show the grid toolbar.
   * Defaults to true.
   */
  @Input() showToolbar: boolean = true;

  /**
   * Selection mode for the grid.
   * Defaults to 'single'.
   */
  @Input() selectionMode: GridSelectionMode = 'single';

  /**
   * Emitted when a row is clicked (single click).
   */
  @Output() rowClicked = new EventEmitter<ListGridRowClickedEvent>();

  /**
   * Emitted when a row is double-clicked.
   */
  @Output() rowDoubleClicked = new EventEmitter<ListGridRowClickedEvent>();

  /**
   * Emitted when the grid data is loaded.
   */
  @Output() dataLoaded = new EventEmitter<{ totalCount: number }>();

  /**
   * Emitted when row selection changes (for checkbox mode).
   */
  @Output() selectionChange = new EventEmitter<string[]>();

  /**
   * Custom toolbar configuration. If not provided, uses default.
   */
  @Input() toolbarConfig: GridToolbarConfig | null = null;

  // ViewChild to access the underlying EDG component
  @ViewChild('entityDataGrid') entityDataGrid: EntityDataGridComponent | undefined;

  // Internal state
  entityInfo: EntityInfo | null = null;
  gridParams: RunViewParams | null = null;
  isLoading: boolean = false;
  listLoaded: boolean = false;
  selectedKeys: string[] = [];
  totalRowCount: number = 0;

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
  get effectiveToolbarConfig(): GridToolbarConfig {
    return this.toolbarConfig || this.defaultToolbarConfig;
  }

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (this.listId || this.listEntity) {
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
    this.listLoaded = false;
    this.gridParams = null;

    if (!this.listId && !this.listEntity) {
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();
      let list: ListEntity | null = this.listEntity;

      // Load the list entity if not provided
      if (!list && this.listId) {
        list = await md.GetEntityObject<ListEntity>('Lists');
        await list.Load(this.listId);
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

      this.entityInfo = entityInfo;

      // Get the List Details entity info to get the correct schema name
      const listDetailsEntityInfo = md.EntityByName('List Details');
      if (!listDetailsEntityInfo) {
        console.error('List Details entity not found in metadata');
        return;
      }

      // Build the subquery filter to get records in this list
      // Uses the primary key field(s) of the entity and the schema from List Details entity
      const schema = listDetailsEntityInfo.SchemaName;
      const extraFilter = this.buildListFilter(entityInfo, schema, list.ID);

      // Create the RunViewParams for the grid
      this.gridParams = {
        EntityName: entityInfo.Name,
        ExtraFilter: extraFilter,
        ResultType: 'entity_object'
      };

      this.listLoaded = true;
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
  onRowClick(event: AfterRowClickEventArgs): void {
    if (!this.entityInfo || !event.row) return;

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(this.entityInfo, event.row);

    this.rowClicked.emit({
      entityId: this.entityInfo.ID,
      entityName: this.entityInfo.Name,
      compositeKey,
      record: event.row
    });
  }

  /**
   * Handle row double-click event from the grid
   */
  onRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
    if (!this.entityInfo || !event.row) return;

    const compositeKey = new CompositeKey();
    compositeKey.LoadFromEntityInfoAndRecord(this.entityInfo, event.row);

    this.rowDoubleClicked.emit({
      entityId: this.entityInfo.ID,
      entityName: this.entityInfo.Name,
      compositeKey,
      record: event.row
    });

    // Auto-navigate if enabled - use SharedService for proper tab-based navigation
    if (this.autoNavigate) {
      this.sharedService.OpenEntityRecord(this.entityInfo.Name, compositeKey);
    }
  }

  /**
   * Handle data loaded event from the grid
   */
  onDataLoaded(event: AfterDataLoadEventArgs): void {
    this.totalRowCount = event.totalRowCount;
    this.dataLoaded.emit({ totalCount: event.totalRowCount });
  }

  /**
   * Handle selection change from the grid
   */
  onSelectionChange(keys: string[]): void {
    this.selectedKeys = keys;
    this.selectionChange.emit(keys);
  }

  /**
   * Refresh the grid data
   */
  refresh(): void {
    // Re-trigger load to refresh data
    this.loadList();
  }

  /**
   * Get the currently selected entity objects
   */
  getSelectedRows(): Record<string, unknown>[] {
    if (this.entityDataGrid) {
      return this.entityDataGrid.GetSelectedRows();
    }
    return [];
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.ClearSelection();
    }
    this.selectedKeys = [];
  }

  /**
   * Select specific rows by key
   */
  selectRows(keys: string[], additive: boolean = false): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.SelectRows(keys, additive);
    }
  }

  /**
   * Select all rows
   */
  selectAll(): void {
    if (this.entityDataGrid) {
      this.entityDataGrid.SelectAll();
    }
  }

  /**
   * Get the total row count
   */
  get rowCount(): number {
    return this.totalRowCount;
  }

  /**
   * Get the selected row count
   */
  get selectedCount(): number {
    return this.selectedKeys.length;
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
