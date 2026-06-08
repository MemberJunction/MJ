import { Component, Input, Output, EventEmitter, ViewEncapsulation, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { EntityInfo, RunViewParams, LogError } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageChangeEvent } from '@memberjunction/ng-pagination';
import { ExportDialogConfig, ExportDialogResult } from '@memberjunction/ng-export-service';
import { ExportColumn, ExportData } from '@memberjunction/export-engine';
import { ListManagementDialogConfig, ListManagementResult } from '@memberjunction/ng-list-management';
import { IViewRenderer, ViewDataRequest, ViewRelatedRecordNavigation } from '../view-type.contracts';
import { ViewGridState } from '../../types';
import { GridSelectionMode, GridToolbarConfig, ForeignKeyClickEvent } from '../../entity-data-grid/models/grid-types';
import { AfterRowClickEventArgs, AfterRowDoubleClickEventArgs, AfterSortEventArgs } from '../../entity-data-grid/events/grid-events';
import { GridStateChangedEvent } from '../../types';
import { buildPkString, buildCompositeKey } from '../../utils/record.util';
import { EntityDataGridComponent } from '../../entity-data-grid/entity-data-grid.component';

/**
 * Opaque per-view configuration for the Grid view type.
 * -----------------------------------------------------
 * This is the blob the host persists verbatim against the active `ViewTypeID` and never
 * inspects (see {@link IViewRenderer.configChanged}). The renderer seeds the
 * `<mj-entity-data-grid>` bindings from these fields, applying sensible defaults when a
 * field is absent (see {@link GridViewRendererComponent}). It is intentionally a plain,
 * fully-serializable shape — every field is optional so an empty `{}` is a valid config.
 */
export interface GridViewConfig {
  /**
   * Persisted grid state (columns/widths/order/sort) from a User View. Mutated in place when
   * the grid emits sort or generic grid-state changes, then surfaced via `configChanged` so the
   * host persists it. Fed straight into `[GridState]`.
   */
  gridState?: ViewGridState;
  /** Whether the grid's own toolbar is shown. Defaults to `true` when absent. */
  showToolbar?: boolean;
  /** The grid toolbar configuration. Fed into `[ToolbarConfig]`. */
  toolbarConfig?: GridToolbarConfig;
  /** Row selection mode. Defaults to `'checkbox'` when absent. */
  selectionMode?: GridSelectionMode;
  /** Whether the "Add to List" button is shown. Defaults to `true` when absent. */
  showAddToListButton?: boolean;
  /** Whether the pager is shown. Defaults to `true` when absent. */
  showPager?: boolean;
  /** Page size for the grid's pager. Falls back to the `pageSize` input when absent. */
  pageSize?: number;
  /**
   * Explicit RunViewParams for the grid's data source. When absent the renderer builds a minimal
   * dynamic-view params object from {@link entity}. Fed into `[Params]`.
   */
  params?: RunViewParams;
}

/**
 * GridViewRendererComponent
 * -------------------------
 * The Grid **view type** renderer — a fully self-contained {@link IViewRenderer} adapter that hosts
 * the existing {@link EntityDataGridComponent} (`<mj-entity-data-grid>`) inside the entity-viewer's
 * pluggable view-type system. It is the dynamic-mounted plug-in that the `GridViewType` descriptor
 * points at.
 *
 * **Architectural intent — the container knows nothing about grids, and grid *features* never bubble
 * up.** The host (entity-viewer) binds only the generic {@link IViewRenderer} surface: the core
 * inputs (`entity` / `provider` / `records` / `selectedRecordId` / `filterText` / `config`), the
 * generic data-context inputs (`totalRecordCount` / `page` / `pageSize` / `isLoading`), and a small
 * set of generic outputs. There is **no opaque `hostAction` channel** — everything a grid does is
 * resolved through one of these three categories:
 *
 *   1. **Self-contained (owned end-to-end by this wrapper via Generic dialogs — never bubbles up):**
 *      - **Export** → hosts `<mj-export-dialog>` ({@link ExportServiceModule}). On `(ExportButtonClick)`
 *        the wrapper builds {@link ExportColumn}s from the visible grid columns + {@link ExportData}
 *        from its own {@link records}, then opens the dialog. The dialog downloads the file itself.
 *      - **Add to List** → hosts `<mj-list-management-dialog>` ({@link ListManagementModule}). On
 *        `(AddToListRequested)` the wrapper builds a {@link ListManagementDialogConfig} from the
 *        entity + selected records and opens the dialog.
 *      - **Delete** → hosts the Generic `<mj-ev-confirm-dialog>` (from {@link EntityViewerModule}).
 *        On `(DeleteButtonClick)` the wrapper confirms, deletes via the MJ entity layer, then
 *        re-requests data so the host reloads the current page.
 *      - **Refresh** → on `(RefreshButtonClick)` the wrapper re-emits {@link dataRequest} so the host
 *        reloads. No feature event leaves the wrapper.
 *      - **Selection** → kept INTERNAL; it only drives the wrapper's own add-to-list. Never bubbles.
 *
 *   2. **Navigation (the ONLY legitimate upward signals — routing lives in the outer app):**
 *      - Row double-click → {@link recordOpened}.
 *      - Foreign-key cell click `(ForeignKeyClick)` → {@link openRelatedRecordRequested}.
 *      - New button `(NewButtonClick)` → {@link createRecordRequested}.
 *
 *   3. **Container ↔ plug-in generic coordination (NOT outer-app signals):**
 *      - Sort `(AfterSort)` → {@link dataRequest} (`sort`) + persisted into `config.gridState` via
 *        {@link configChanged}.
 *      - Pager `(PageChange)` → {@link dataRequest} (`page` / `pageSize`).
 *      - Generic grid-state `(GridStateChanged)` → merged into `config.gridState` + {@link configChanged}.
 *
 * **Seeding the grid from `config` with defaults:** absent config fields fall back to sensible
 * defaults so a brand-new view (`config === {}`) renders a fully-functional grid — toolbar on,
 * checkbox selection, add-to-list on, pager on. The grid never loads its own data
 * (`[AllowLoad]="false"`) — the host owns the fetch.
 *
 * This is an NgModule-declared (`standalone: false`) component, declared in `EntityViewerModule`.
 * It renders `<mj-entity-data-grid>` + the Generic `<mj-export-dialog>` / `<mj-list-management-dialog>`
 * / `<mj-ev-confirm-dialog>` straight from the module's compilation scope (the module imports
 * `ExportServiceModule` + `ListManagementModule` and declares the grid + confirm dialog) — so there's
 * no `imports` array and, crucially, no self-import of `EntityViewerModule`: the module loads the
 * view-type descriptors, which reference these wrappers, so a wrapper importing the module back would
 * form a runtime import cycle (NG0919).
 *
 * Inputs use the camelCase names mandated by the {@link IViewRenderer} contract (the host binds them
 * by those exact names via `setInput`), rather than MJ's usual PascalCase for public members —
 * mirroring the Cards and Cluster renderers.
 */
@Component({
  standalone: false,
  selector: 'mj-grid-view-renderer',
  encapsulation: ViewEncapsulation.None,
  template: `
    <mj-entity-data-grid
      #grid
      [Provider]="Provider"
      [Data]="records"
      [Params]="effectiveParams"
      [FilterText]="filterText ?? ''"
      [GridState]="config.gridState ?? null"
      [Height]="'auto'"
      [AllowLoad]="false"
      [ShowToolbar]="effectiveShowToolbar"
      [ToolbarConfig]="config.toolbarConfig ?? {}"
      [SelectionMode]="effectiveSelectionMode"
      [ShowAddToListButton]="effectiveShowAddToListButton"
      [ShowPager]="effectiveShowPager"
      [PageSize]="effectivePageSize"
      [TotalRowCount]="totalRecordCount ?? 0"
      [PagerPageNumber]="page ?? 1"
      (AfterRowClick)="onAfterRowClick($event)"
      (AfterRowDoubleClick)="onAfterRowDoubleClick($event)"
      (AfterSort)="onAfterSort($event)"
      (GridStateChanged)="onGridStateChanged($event)"
      (SelectionChange)="onSelectionChange($event)"
      (NewButtonClick)="onNewButtonClick()"
      (RefreshButtonClick)="onRefreshButtonClick()"
      (DeleteButtonClick)="onDeleteButtonClick($event)"
      (ExportButtonClick)="onExportButtonClick()"
      (AddToListRequested)="onAddToListRequested($event)"
      (ForeignKeyClick)="onForeignKeyClick($event)"
      (PageChange)="onPageChange($event)"
    >
    </mj-entity-data-grid>

    <!-- Self-contained Export dialog (Generic) — owned by this wrapper, never bubbles up. -->
    <mj-export-dialog [visible]="showExportDialog" [config]="exportDialogConfig" (closed)="onExportDialogClosed($event)"> </mj-export-dialog>

    <!-- Self-contained Add-to-List dialog (Generic) — owned by this wrapper, never bubbles up. -->
    @if (listManagementConfig) {
      <mj-list-management-dialog
        [Provider]="Provider"
        [visible]="showListManagementDialog"
        [config]="listManagementConfig"
        (complete)="onListManagementComplete($event)"
        (cancel)="onListManagementCancel()"
      >
      </mj-list-management-dialog>
    }

    <!-- Self-contained Delete confirmation (Generic) — owned by this wrapper, never bubbles up. -->
    <mj-ev-confirm-dialog
      [IsOpen]="showDeleteConfirm"
      Title="Delete Records"
      [Message]="deleteConfirmMessage"
      DetailMessage="This action cannot be undone."
      ConfirmText="Delete"
      ConfirmStyle="danger"
      Icon="fa-solid fa-trash"
      (Confirmed)="onDeleteConfirmed()"
      (Cancelled)="onDeleteCancelled()"
    >
    </mj-ev-confirm-dialog>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
})
export class GridViewRendererComponent extends BaseAngularComponent implements IViewRenderer<GridViewConfig> {
  /** Change detection ref used to flush dialog visibility toggles driven by grid events. */
  private cdr = inject(ChangeDetectorRef);

  // ---- IViewRenderer core inputs (camelCase per the host contract) ----

  /** The entity whose records are being rendered. Used to build default params + resolve selection. */
  @Input() entity: EntityInfo | null = null;

  /** The records to render (already loaded / filtered / paged by the host). Fed into `[Data]`. */
  @Input() records: Record<string, unknown>[] = [];

  /** Primary-key string of the currently selected record, if any. */
  @Input() selectedRecordId: string | null = null;

  /** Active filter text — passed through for the grid's cell highlighting. */
  @Input() filterText: string | null = null;

  /** Opaque per-view configuration. Seeds the grid bindings; mutated + re-emitted on grid changes. */
  @Input() config: GridViewConfig = {};

  // ---- IViewRenderer generic data-context inputs ----

  /** Total record count across all pages, for the grid's pager. Fed into `[TotalRowCount]`. */
  @Input() totalRecordCount?: number;

  /** One-based current page the host is showing. Fed into `[PagerPageNumber]` (already 1-based). */
  @Input() page?: number;

  /** Page size the host is using — fallback when `config.pageSize` is absent. */
  @Input() pageSize?: number;

  /** Whether the host is currently (re)loading the record set. Accepted per contract; unused here. */
  @Input() isLoading?: boolean;

  // ---- IViewRenderer outputs (generic + navigation channels only) ----

  /** Emitted when a row is single-clicked — payload is the raw record object (host builds the key). */
  @Output() recordSelected = new EventEmitter<unknown>();

  /** Emitted when a row is double-clicked — payload is the raw record object (host builds the key). */
  @Output() recordOpened = new EventEmitter<unknown>();

  /** Emitted when this renderer mutates its opaque {@link config} (sort / grid-state persistence). */
  @Output() configChanged = new EventEmitter<GridViewConfig>();

  /** Generic data-access channel: ask the host to re-load with different sort / page. */
  @Output() dataRequest = new EventEmitter<ViewDataRequest>();

  /**
   * NAVIGATION: open a related record on a (possibly different) entity from a foreign-key cell click.
   * Routing lives in the outer app, so this is one of the few signals that legitimately bubbles up.
   */
  @Output() openRelatedRecordRequested = new EventEmitter<ViewRelatedRecordNavigation>();

  /** NAVIGATION: create a new record of the current entity (grid "New" button). Bubbles up for routing. */
  @Output() createRecordRequested = new EventEmitter<void>();

  /**
   * Optional notification before an export proceeds. Self-contained — export works without any parent
   * involvement; this is a courtesy hook for hosts that want to observe the action.
   */
  @Output() BeforeExport = new EventEmitter<void>();

  /**
   * Optional notification after an export dialog closes. Carries the dialog's {@link ExportDialogResult}
   * (including whether the user actually exported). Self-contained — purely informational.
   */
  @Output() AfterExport = new EventEmitter<ExportDialogResult>();

  /**
   * Reference to the hosted grid. Currently only retained for parity / future selection resolution;
   * selection is mapped from the {@link records} input rather than read from the grid, per contract.
   */
  @ViewChild('grid') protected grid?: EntityDataGridComponent;

  // ================================================================
  // Self-contained dialog state (never surfaced to the host)
  // ================================================================

  /** Whether the export dialog is visible. Toggled internally by {@link onExportButtonClick}. */
  protected showExportDialog = false;

  /** Config fed into `<mj-export-dialog>`. Built from {@link records} + visible grid columns. */
  protected exportDialogConfig: ExportDialogConfig | null = null;

  /** Whether the add-to-list dialog is visible. Toggled internally by {@link onAddToListRequested}. */
  protected showListManagementDialog = false;

  /** Config fed into `<mj-list-management-dialog>`. Built from the entity + selected records. */
  protected listManagementConfig: ListManagementDialogConfig | null = null;

  /** Whether the delete-confirmation dialog is visible. Toggled internally by {@link onDeleteButtonClick}. */
  protected showDeleteConfirm = false;

  /** Records staged for deletion while the confirm dialog is open. */
  private pendingDeleteRecords: Record<string, unknown>[] = [];

  /** Dynamic message for the delete-confirmation dialog (reflects the staged record count). */
  protected deleteConfirmMessage = 'Are you sure you want to delete the selected records?';

  // ================================================================
  // Effective binding accessors — seed grid inputs from config + defaults
  // ================================================================

  /** Effective toolbar visibility — defaults to `true` when not set in config. */
  get effectiveShowToolbar(): boolean {
    return this.config.showToolbar ?? true;
  }

  /** Effective selection mode — defaults to `'checkbox'` when not set in config. */
  get effectiveSelectionMode(): GridSelectionMode {
    return this.config.selectionMode ?? 'checkbox';
  }

  /** Effective add-to-list button visibility — defaults to `true` when not set in config. */
  get effectiveShowAddToListButton(): boolean {
    return this.config.showAddToListButton ?? true;
  }

  /** Effective pager visibility — defaults to `true` when not set in config. */
  get effectiveShowPager(): boolean {
    return this.config.showPager ?? true;
  }

  /** Effective page size — config wins, else the generic `pageSize` input, else the grid's own default. */
  get effectivePageSize(): number {
    return this.config.pageSize ?? this.pageSize ?? 100;
  }

  /**
   * Effective RunViewParams for the grid. Uses `config.params` when supplied; otherwise builds a
   * minimal dynamic-view params object from {@link entity}. Returns `null` when no entity is known
   * yet (the grid renders empty until the host provides one).
   */
  get effectiveParams(): RunViewParams | null {
    if (this.config.params) {
      return this.config.params;
    }
    if (this.entity) {
      return { EntityName: this.entity.Name };
    }
    return null;
  }

  // ================================================================
  // Navigation + generic coordination output mapping
  // ================================================================

  /**
   * Row single-click → {@link recordSelected}. Extracts the raw record (`event.row`) so the host
   * builds the composite key itself, matching the other renderers.
   */
  onAfterRowClick(event: AfterRowClickEventArgs): void {
    if (event.row) {
      this.recordSelected.emit(event.row);
    }
  }

  /** Row double-click → {@link recordOpened} (NAVIGATION), emitting the raw record object. */
  onAfterRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
    if (event.row) {
      this.recordOpened.emit(event.row);
    }
  }

  /**
   * Sort change → both generic coordination channels:
   *  1. {@link dataRequest} with the generic `sort` shape so the host re-loads with a new OrderBy.
   *  2. persists the sort into `config.gridState.sortSettings` and emits {@link configChanged} so
   *     the grid's sort survives view reloads via the opaque config channel.
   */
  onAfterSort(event: AfterSortEventArgs): void {
    const sort = (event.newSortState ?? []).map((s) => ({ field: s.field, direction: s.direction }));
    this.dataRequest.emit({ sort });

    const gridState: ViewGridState = { ...(this.config.gridState ?? {}) };
    gridState.sortSettings = (event.newSortState ?? []).map((s) => ({ field: s.field, dir: s.direction }));
    this.config = { ...this.config, gridState };
    this.configChanged.emit(this.config);
  }

  /**
   * Generic grid-state change (column resize / reorder / visibility) → merge the grid's updated
   * {@link ViewGridState} into the opaque config and emit {@link configChanged}; the host persists
   * the blob verbatim. No `dataRequest` here — column changes don't alter the loaded record set.
   */
  onGridStateChanged(event: GridStateChangedEvent): void {
    this.config = { ...this.config, gridState: event.gridState };
    this.configChanged.emit(this.config);
  }

  /**
   * Selection change → kept INTERNAL. The grid drives its own add-to-list from the selection, so the
   * wrapper has no need to surface it. We intentionally do not bubble selection anywhere.
   */
  onSelectionChange(_selectedKeys: string[]): void {
    // No-op: selection is internal to the grid + this wrapper's add-to-list. It never bubbles up.
  }

  /**
   * Foreign-key link click → {@link openRelatedRecordRequested} (NAVIGATION). Maps the grid's
   * {@link ForeignKeyClickEvent} (which carries the related entity + the FK value) onto the generic
   * {@link ViewRelatedRecordNavigation} the container forwards to the outer app for routing. The
   * related entity name is taken from the event when present, else resolved from the metadata by ID.
   */
  onForeignKeyClick(event: ForeignKeyClickEvent): void {
    const entityName = event.relatedEntityName ?? this.resolveEntityNameById(event.relatedEntityId);
    if (!entityName) {
      return;
    }
    this.openRelatedRecordRequested.emit({ entityName, recordKey: event.recordId });
  }

  /** New button → {@link createRecordRequested} (NAVIGATION) — opening the create form is routing. */
  onNewButtonClick(): void {
    this.createRecordRequested.emit();
  }

  /**
   * Pager navigation → generic {@link dataRequest}. Maps the grid's {@link PageChangeEvent}
   * (`PageNumber` is already 1-based, `PageSize`) onto the generic `{ page, pageSize }` shape the
   * host honors against its own RunView.
   */
  onPageChange(event: PageChangeEvent): void {
    this.dataRequest.emit({ page: event.PageNumber, pageSize: event.PageSize });
  }

  // ================================================================
  // Self-contained: Refresh
  // ================================================================

  /**
   * Refresh button → re-emit {@link dataRequest} so the host reloads the current page. This is
   * generic container ↔ plug-in coordination (a data-access request), NOT a feature event surfaced
   * to the outer app.
   */
  onRefreshButtonClick(): void {
    this.dataRequest.emit(this.currentPageDataRequest());
  }

  // ================================================================
  // Self-contained: Export (hosts <mj-export-dialog>)
  // ================================================================

  /**
   * Export button → build the export {@link ExportColumn}s + {@link ExportData} from THIS wrapper's
   * {@link records} input and its `config.gridState`, then open the Generic export dialog. The dialog
   * handles format/sampling selection and downloads the file itself — nothing bubbles up.
   */
  onExportButtonClick(): void {
    if (!this.entity) {
      return;
    }
    this.BeforeExport.emit();

    const columns = this.buildExportColumns();
    const data = this.buildExportData();
    const fileName = `${this.entity.Name}_${new Date().toISOString().split('T')[0]}`;

    this.exportDialogConfig = {
      data,
      columns,
      defaultFileName: fileName,
      availableFormats: ['excel', 'csv', 'json'],
      defaultFormat: 'excel',
      showSamplingOptions: true,
      defaultSamplingMode: 'all',
      dialogTitle: `Export ${this.entity.Name}`,
    };
    this.showExportDialog = true;
    this.cdr.detectChanges();
  }

  /** Export dialog closed → tear down state and surface the (informational) {@link AfterExport} hook. */
  onExportDialogClosed(result: ExportDialogResult): void {
    this.showExportDialog = false;
    this.exportDialogConfig = null;
    this.AfterExport.emit(result);
    this.cdr.detectChanges();
  }

  /**
   * Build the export columns from the current grid state's visible columns when available, falling
   * back to the entity's non-virtual fields. Mirrors the construction the legacy host did in
   * `data-explorer-dashboard`'s `getExportColumns()`, adapted to this wrapper's inputs.
   */
  private buildExportColumns(): ExportColumn[] {
    const entity = this.entity;
    if (!entity) {
      return [];
    }

    // Priority 1: current grid state's column settings (reflects what the user actually sees).
    const columnSettings = this.config.gridState?.columnSettings;
    if (columnSettings && columnSettings.length > 0) {
      return columnSettings
        .filter((col) => col.hidden !== true)
        .map((col) => {
          const field = entity.Fields.find((f) => f.Name === col.Name);
          return {
            name: col.Name,
            displayName: col.DisplayName || col.Name,
            dataType: this.mapFieldTypeToExportType(field?.Type),
          };
        });
    }

    // Priority 2: all non-virtual fields.
    return entity.Fields.filter((f) => !f.IsVirtual).map((f) => ({
      name: f.Name,
      displayName: f.DisplayNameOrName,
      dataType: this.mapFieldTypeToExportType(f.Type),
    }));
  }

  /**
   * Build the export data straight from the loaded {@link records}. The grid is host-fed, so the
   * wrapper exports exactly the records it was given (already filtered / sorted / paged by the host).
   */
  private buildExportData(): ExportData {
    return this.records;
  }

  /**
   * Map a MemberJunction field type string onto an {@link ExportColumn} data-type hint. Mirrors the
   * legacy host's `mapFieldTypeToExportType()`.
   */
  private mapFieldTypeToExportType(fieldType?: string): ExportColumn['dataType'] {
    if (!fieldType) {
      return 'string';
    }
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

  // ================================================================
  // Self-contained: Add to List (hosts <mj-list-management-dialog>)
  // ================================================================

  /**
   * Add-to-list button → build a {@link ListManagementDialogConfig} from the entity + the records the
   * grid supplied, then open the Generic list-management dialog. The dialog persists membership
   * changes itself — nothing bubbles up. Mirrors the config construction the legacy host did in
   * `data-explorer-dashboard`'s `onAddToListRequested()`.
   */
  onAddToListRequested(event: { entityInfo: EntityInfo; records: Record<string, unknown>[]; recordIds: string[] }): void {
    const entity = event.entityInfo ?? this.entity;
    if (!entity || !event.records || event.records.length === 0) {
      return;
    }

    const recordDisplayNames = event.records.map((record) => this.getRecordDisplayName(record, entity));
    const recordIds = this.buildRawRecordIds(event.records, entity);
    if (recordIds.length === 0) {
      return;
    }

    const recordCount = event.records.length;
    const dialogTitle = recordCount === 1 ? `Manage Lists for "${recordDisplayNames[0]}"` : `Add ${recordCount} Records to List`;

    this.listManagementConfig = {
      mode: 'manage',
      entityId: entity.ID,
      entityName: entity.Name,
      recordIds,
      recordDisplayNames,
      allowCreate: true,
      allowRemove: recordCount === 1,
      showMembership: recordCount === 1,
      dialogTitle,
    };
    this.showListManagementDialog = true;
    this.cdr.detectChanges();
  }

  /** List-management dialog completed (membership changes applied) → tear down state. */
  onListManagementComplete(_result: ListManagementResult): void {
    this.showListManagementDialog = false;
    this.listManagementConfig = null;
    this.cdr.detectChanges();
  }

  /** List-management dialog cancelled → tear down state. */
  onListManagementCancel(): void {
    this.showListManagementDialog = false;
    this.listManagementConfig = null;
    this.cdr.detectChanges();
  }

  /**
   * Resolve a human-friendly display name for a record using the entity's NameField, falling back to
   * the composite-key string. Mirrors the legacy host's display-name resolution.
   */
  private getRecordDisplayName(record: Record<string, unknown>, entity: EntityInfo): string {
    if (entity.NameField) {
      const nameValue = record[entity.NameField.Name];
      if (nameValue != null) {
        return String(nameValue);
      }
    }
    return buildPkString(record, entity) || 'Unknown';
  }

  /**
   * Build the list of RAW primary-key values (not concatenated composite-key strings) used by list
   * membership matching. Mirrors the legacy host, which deliberately extracts the first PK field's
   * raw value so it matches how List Details store records.
   */
  private buildRawRecordIds(records: Record<string, unknown>[], entity: EntityInfo): string[] {
    const pkFieldName = entity.PrimaryKeys[0]?.Name;
    if (!pkFieldName) {
      return [];
    }
    return records
      .map((record) => {
        const value = record[pkFieldName];
        return value == null ? '' : String(value);
      })
      .filter((id) => id !== '');
  }

  // ================================================================
  // Self-contained: Delete (hosts <mj-ev-confirm-dialog> + MJ entity layer)
  // ================================================================

  /**
   * Delete button → stage the records and open the Generic confirm dialog. The actual delete happens
   * in {@link onDeleteConfirmed} after the user confirms — nothing bubbles up.
   */
  onDeleteButtonClick(records: Record<string, unknown>[]): void {
    if (!records || records.length === 0) {
      return;
    }
    this.pendingDeleteRecords = records;
    const count = records.length;
    this.deleteConfirmMessage = count === 1 ? 'Are you sure you want to delete this record?' : `Are you sure you want to delete these ${count} records?`;
    this.showDeleteConfirm = true;
    this.cdr.detectChanges();
  }

  /**
   * Delete confirmed → delete each staged record through the MJ entity layer
   * (`ProviderToUse.GetEntityObject(name, compositeKey, user)` → `Delete`), checking the boolean
   * result and surfacing failures via {@link LogError}. After deletion, re-request the current page
   * so the host reloads. Self-contained — no feature event leaves the wrapper.
   */
  async onDeleteConfirmed(): Promise<void> {
    this.showDeleteConfirm = false;
    const entity = this.entity;
    const records = this.pendingDeleteRecords;
    this.pendingDeleteRecords = [];

    if (!entity || records.length === 0) {
      return;
    }

    let anyDeleted = false;
    const provider = this.ProviderToUse;
    const user = provider.CurrentUser;

    for (const record of records) {
      const key = buildCompositeKey(record, entity);
      try {
        // The (name, key, user) overload instantiates AND loads in one call (throws if it can't load).
        const obj = await provider.GetEntityObject(entity.Name, key, user);
        const deleted = await obj.Delete();
        if (deleted) {
          anyDeleted = true;
        } else {
          LogError(`Delete failed: ${obj.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
      } catch (err) {
        LogError(`Delete failed for ${entity.Name} (${key.ToString()}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (anyDeleted) {
      // Re-request the current page so the host reloads the (now smaller) record set.
      this.dataRequest.emit(this.currentPageDataRequest());
    }
    this.cdr.detectChanges();
  }

  /** Delete cancelled → discard the staged records and close the confirm dialog. */
  onDeleteCancelled(): void {
    this.showDeleteConfirm = false;
    this.pendingDeleteRecords = [];
    this.cdr.detectChanges();
  }

  // ================================================================
  // Helpers
  // ================================================================

  /** Build a {@link ViewDataRequest} that re-requests the host's current page/pageSize, if known. */
  private currentPageDataRequest(): ViewDataRequest {
    const req: ViewDataRequest = {};
    if (this.page != null) {
      req.page = this.page;
    }
    const ps = this.config.pageSize ?? this.pageSize;
    if (ps != null) {
      req.pageSize = ps;
    }
    return req;
  }

  /**
   * Resolve an entity's name from its ID via the active provider's metadata. Used when a foreign-key
   * click event omits the related entity name and only carries its ID.
   */
  private resolveEntityNameById(entityId: string): string | null {
    if (!entityId) {
      return null;
    }
    const match = this.ProviderToUse.Entities.find((e) => e.ID === entityId);
    return match ? match.Name : null;
  }
}

/**
 * Tree-shaking guard. Force-references this renderer so bundlers (ESBuild/Vite) don't drop the
 * component in builds that only mount it dynamically via the ClassFactory/descriptor. Mirrors the
 * Cards/Cluster renderers' load guards; the parent wires this into a barrel/module load path.
 */
export function LoadGridViewRenderer(): void {
  // no-op; presence prevents tree-shaking of this component
}
