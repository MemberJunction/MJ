import { Component, Input, Output, EventEmitter, ViewEncapsulation, ViewChild, ChangeDetectorRef, OnDestroy, inject } from '@angular/core';
import { EntityInfo, RunViewParams, LogError, CompositeKey, RunView, RecordMergeRequest } from '@memberjunction/core';
import {
  RecordComparisonService,
  type FieldComparison,
  type MergeConfig,
  type MergeConfirmedEvent,
} from '@memberjunction/ng-record-merge';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { PageChangeEvent } from '@memberjunction/ng-pagination';
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
 *   1. **Self-contained (owned end-to-end — never bubbles up):**
 *      - **Export** → owned entirely by `<mj-entity-data-grid>` itself (its `onExportClick` opens its
 *        OWN export dialog with format/sampling via `ExportService`). This wrapper does NOT host an
 *        export dialog — doing so produced two stacked dialogs.
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
 * It renders `<mj-entity-data-grid>` + the Generic `<mj-list-management-dialog>` / `<mj-ev-confirm-dialog>`
 * straight from the module's compilation scope (the module imports `ListManagementModule` and declares
 * the grid + confirm dialog; the grid component brings its own export dialog) — so there's
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
      [ExportDataProvider]="exportDataProvider"
      [Params]="effectiveParams"
      [FilterText]="filterText ?? ''"
      [GridState]="config.gridState ?? null"
      [Height]="'auto'"
      [AllowLoad]="false"
      [AutoLoadEntityActions]="AutoLoadEntityActions"
      [ShowToolbar]="effectiveShowToolbar"
      [ShowSearch]="effectiveShowSearch"
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
      (AddToListRequested)="onAddToListRequested($event)"
      (ForeignKeyClick)="onForeignKeyClick($event)"
      (PageChange)="onPageChange($event)"
      (ManageColumnsRequested)="configureRequested.emit()"
      [ShowMergeButton]="effectiveShowMergeButton"
      (MergeRecordsRequested)="onMergeRequested($event)"
    >
    </mj-entity-data-grid>

    <!-- NOTE: Export is NOT handled here — mj-entity-data-grid hosts its OWN export dialog
         (its onExportClick opens it with formats/sampling via ExportService). Adding a second
         dialog here produced two stacked export dialogs. The grid owns export self-contained. -->

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

    <!-- Self-contained merge panel (Generic) — owned by this wrapper, never bubbles up.
         Lives inside the @if so the panel rebuilds its comparison (ngOnInit) per request. -->
    @if (mergeState) {
      <mj-dialog [Visible]="true" Size="lg" [Closeable]="!mergeState.IsMerging" (Close)="onMergeCancelled()">
        <div class="mj-ev-merge-survivor" role="radiogroup" aria-label="Record to keep">
          <span>Keep</span>
          <button type="button" mjButton size="sm" role="radio"
            [variant]="mergeState.Config.SurvivorSide === 'left' ? 'primary' : 'secondary'"
            [attr.aria-checked]="mergeState.Config.SurvivorSide === 'left'"
            [disabled]="mergeState.IsMerging"
            (click)="onSurvivorChange('left')">{{ mergeState.Config.LeftLabel }}</button>
          <button type="button" mjButton size="sm" role="radio"
            [variant]="mergeState.Config.SurvivorSide === 'right' ? 'primary' : 'secondary'"
            [attr.aria-checked]="mergeState.Config.SurvivorSide === 'right'"
            [disabled]="mergeState.IsMerging"
            (click)="onSurvivorChange('right')">{{ mergeState.Config.RightLabel }}</button>
          <span class="mj-ev-merge-survivor-note">{{ mergeLoserLabel }} will be deleted; its linked records move to the record you keep.</span>
        </div>
        <mj-record-merge-panel
          [Fields]="mergeState.Fields"
          [Config]="mergeState.Config"
          [MergeEnabled]="!mergeState.IsMerging"
          [IsMerging]="mergeState.IsMerging"
          (MergeConfirmed)="onMergeConfirmed($event)"
          (MergeCancelled)="onMergeCancelled()"
        >
        </mj-record-merge-panel>
        @if (mergeState.DependencyNote) {
          <p class="mj-ev-merge-deps">{{ mergeState.DependencyNote }}</p>
        }
      </mj-dialog>
    }
    @if (mergeNotice) {
      <div class="mj-ev-merge-notice" role="status">
        <span class="mj-ev-merge-notice-text">{{ mergeNotice }}</span>
        <button type="button" class="mj-ev-merge-notice-dismiss" (click)="onDismissMergeNotice()" title="Dismiss" aria-label="Dismiss">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .mj-ev-merge-survivor {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
      }

      .mj-ev-merge-survivor-note {
        color: var(--mj-text-muted);
      }

      .mj-ev-merge-deps {
        margin: 0;
        font-size: var(--mj-text-xs);
        color: var(--mj-text-muted);
      }

      .mj-ev-merge-notice {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1001;
        padding: 8px 14px;
        border: 1px solid var(--mj-border-subtle);
        border-radius: var(--mj-radius-md);
        background: var(--mj-bg-surface-elevated);
        color: var(--mj-text-primary);
        font-size: var(--mj-text-sm);
        box-shadow: var(--mj-shadow-md);
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .mj-ev-merge-notice-dismiss {
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 0 2px;
        cursor: pointer;
        color: var(--mj-text-muted);
        font-size: var(--mj-text-sm);
        line-height: 1;
      }

      .mj-ev-merge-notice-dismiss:hover {
        color: var(--mj-text-primary);
      }
    `,
  ],
})
export class GridViewRendererComponent extends BaseAngularComponent implements IViewRenderer<GridViewConfig>, OnDestroy {
  /** Change detection ref used to flush dialog visibility toggles driven by grid events. */
  private cdr = inject(ChangeDetectorRef);

  // ---- IViewRenderer core inputs (camelCase per the host contract) ----

  /** The entity whose records are being rendered. Used to build default params + resolve selection. */
  @Input() entity: EntityInfo | null = null;

  /** The records to render (already loaded / filtered / paged by the host). Fed into `[Data]`. */
  @Input() records: Record<string, unknown>[] = [];

  /**
   * Optional full-result-set fetcher supplied by the host, forwarded to the grid's ExportDataProvider
   * so exports cover every matching row rather than just the loaded page (bug C1).
   */
  @Input() exportDataProvider: (() => Promise<Record<string, unknown>[]>) | null = null;

  /** Primary-key string of the currently selected record, if any. */
  @Input() selectedRecordId: string | null = null;

  /** Active filter text — passed through for the grid's cell highlighting. */
  @Input() filterText: string | null = null;

  /** Opaque per-view configuration. Seeds the grid bindings; mutated + re-emitted on grid changes. */
  @Input() config: GridViewConfig = {};

  /**
   * When true (default), the grid self-loads the entity's active EntityActions and shows them — buttons
   * appear only for entities that actually have actions (data-driven). Actions whose invocation names a
   * `RuntimeUXDriverClass` mount that interactive driver (e.g. the Record Process runner) in-place.
   */
  @Input() AutoLoadEntityActions = true;

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
   * Ask the host to open this view's configuration UI. Raised when the grid emits
   * `ManageColumnsRequested` (its "Manage Columns" toolbar affordance). Part of the generic
   * {@link IViewRenderer} contract; the container forwards it to the workspace, which opens the
   * config panel (Columns tab) — the canonical column editor.
   */
  @Output() configureRequested = new EventEmitter<void>();

  /**
   * NAVIGATION: open a related record on a (possibly different) entity from a foreign-key cell click.
   * Routing lives in the outer app, so this is one of the few signals that legitimately bubbles up.
   */
  @Output() openRelatedRecordRequested = new EventEmitter<ViewRelatedRecordNavigation>();

  /** NAVIGATION: create a new record of the current entity (grid "New" button). Bubbles up for routing. */
  @Output() createRecordRequested = new EventEmitter<void>();

  /**
   * Reference to the hosted grid. Currently only retained for parity / future selection resolution;
   * selection is mapped from the {@link records} input rather than read from the grid, per contract.
   */
  @ViewChild('grid') protected grid?: EntityDataGridComponent;

  /**
   * IMPERATIVE export entry point ({@link IViewRenderer.exportRecords}). Lets the host trigger
   * an export programmatically (ultimately for the AI agent) by delegating to the hosted grid's
   * self-contained {@link EntityDataGridComponent.Export} (which downloads the file). The grid's
   * toolbar export button remains the interactive path; this is the no-UI equivalent.
   *
   * @param format optional output format; the grid defaults to 'excel' when omitted.
   * @returns true when the export succeeded, false when the grid isn't ready or the export failed.
   */
  async exportRecords(format?: 'csv' | 'excel' | 'json'): Promise<boolean> {
    if (!this.grid) {
      return false;
    }
    const result = await this.grid.Export(format ? { format } : undefined, true);
    return !!result?.success;
  }

  // ================================================================
  // Self-contained dialog state (never surfaced to the host)
  // ================================================================
  // NOTE: Export has no state here — mj-entity-data-grid owns its export dialog.

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

  /**
   * Grid search defaults OFF when hosted in entity-viewer. The container already owns
   * `filterText` ("Filter records..."). Opt in with `toolbarConfig.showSearch: true`.
   */
  get effectiveShowSearch(): boolean {
    return this.config.toolbarConfig?.showSearch ?? false;
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
  // Export: handled entirely by mj-entity-data-grid (its onExportClick opens its own export dialog
  // via ExportService). This wrapper intentionally does NOT host an export dialog — doing so produced
  // two stacked dialogs. Nothing to do here.
  // ================================================================

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
   * Build the record-id strings used by list membership matching, in the compact form `MJ: List Details`
   * stores in `RecordID`: the bare value for a single-column primary key (whatever the column is called),
   * or the full `Field1|Value1||Field2|Value2` segment for a composite key. The entity is arbitrary, so the
   * key is built from all of its primary-key columns rather than assuming a single `ID`.
   */
  private buildRawRecordIds(records: Record<string, unknown>[], entity: EntityInfo): string[] {
    if (entity.PrimaryKeys.length === 0) {
      return [];
    }
    return records
      .map((record) => CompositeKey.FromEntityRecord(entity, record).ToCompactURLSegment())
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
  // Record merge
  // ================================================================

  /**
   * The in-flight merge, or null when the panel is closed. Holds everything the panel needs
   * plus the dependency preview, so the panel itself stays a pure presentation component.
   */
  protected mergeState: {
    Config: MergeConfig;
    Fields: FieldComparison[];
    IsMerging: boolean;
    DependencyNote: string | null;
    /** The entity and the two records' real keys — the Config only carries their serialized form. */
    Entity: EntityInfo;
    Keys: [CompositeKey, CompositeKey];
  } | null = null;

  /** A one-line status shown under the grid — why a merge was refused, or how one ended. */
  protected mergeNotice: string | null = null;

  /** Auto-dismiss timer for {@link mergeNotice}; cleared whenever the notice is replaced. */
  private mergeNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * How long a merge notice stays up before dismissing itself. The banner is fixed-position over
   * the whole application, so leaving it until the next merge pins it across navigation and every
   * other record the user visits afterwards.
   */
  private static readonly MERGE_NOTICE_TIMEOUT_MS = 8000;

  private readonly comparison = inject(RecordComparisonService);

  ngOnDestroy(): void {
    // The notice's auto-dismiss outlives the view otherwise, and fires detectChanges on a
    // destroyed component.
    if (this.mergeNoticeTimer) {
      clearTimeout(this.mergeNoticeTimer);
      this.mergeNoticeTimer = null;
    }
  }

  /** Dismiss the merge notice from its own close button. */
  onDismissMergeNotice(): void {
    this.setMergeNotice(null);
    this.cdr.detectChanges();
  }

  /**
   * Set (or clear) the merge notice, replacing any pending auto-dismiss. Every write to
   * `mergeNotice` goes through here so a notice cannot outlive its timer or strand an old one.
   */
  private setMergeNotice(message: string | null): void {
    if (this.mergeNoticeTimer) {
      clearTimeout(this.mergeNoticeTimer);
      this.mergeNoticeTimer = null;
    }
    this.mergeNotice = message;
    if (message) {
      this.mergeNoticeTimer = setTimeout(() => {
        this.mergeNoticeTimer = null;
        this.mergeNotice = null;
        this.cdr.detectChanges();
      }, GridViewRendererComponent.MERGE_NOTICE_TIMEOUT_MS);
    }
  }

  /**
   * Show the Merge button only where merging can actually succeed: the entity opts in and the
   * user can both update the survivor and delete the loser.
   */
  protected get effectiveShowMergeButton(): boolean {
    const entity = this.entity;
    const user = this.ProviderToUse?.CurrentUser;
    if (!entity?.AllowRecordMerge || !user) return false;
    const permissions = entity.GetUserPermisions(user);
    return !!permissions && permissions.CanUpdate && permissions.CanDelete;
  }

  /** The record that will be deleted, named so the user sees the choice before confirming. */
  protected get mergeLoserLabel(): string {
    const config = this.mergeState?.Config;
    if (!config) return '';
    return config.SurvivorSide === 'left' ? config.RightLabel : config.LeftLabel;
  }

  /**
   * The grid asked to merge the selected rows. Compare them, preview what will move, and open
   * the panel — nothing is written until the user confirms.
   */
  async onMergeRequested(event: { entityInfo: EntityInfo; records: Record<string, unknown>[] }): Promise<void> {
    this.setMergeNotice(null);
    try {
      await this.prepareMerge(event);
    } catch (err) {
      // A transport failure in any pre-flight query must not leave the user with nothing.
      this.setMergeNotice(`Could not prepare the merge: ${err instanceof Error ? err.message : String(err)}`);
      this.cdr.detectChanges();
    }
  }

  /** The user chose which record survives; differing fields default to that record's values. */
  onSurvivorChange(side: 'left' | 'right'): void {
    if (!this.mergeState || this.mergeState.IsMerging) return;
    this.mergeState.Config = { ...this.mergeState.Config, SurvivorSide: side };
    for (const field of this.mergeState.Fields) {
      if (!field.IsReadOnly) field.SelectedSide = side;
    }
    this.cdr.detectChanges();
  }

  private async prepareMerge(event: { entityInfo: EntityInfo; records: Record<string, unknown>[] }): Promise<void> {
    const entity = event.entityInfo ?? this.entity;
    if (!entity) return;

    // The merge panel is two-sided by construction, so n > 2 has nowhere to render.
    if (event.records.length !== 2) {
      this.setMergeNotice('Select exactly two records to merge.');
      this.cdr.detectChanges();
      return;
    }

    // Composite-key safe: the grid renders arbitrary entities, so never assume one key column.
    const keys = event.records.map(r => CompositeKey.FromEntityRecord(entity, r)) as [CompositeKey, CompositeKey];
    if (keys.some(k => k.KeyValuePairs.length === 0 || k.KeyValuePairs.some(kv => kv.Value == null || kv.Value === ''))) {
      this.setMergeNotice('Could not read the primary key of the selected records.');
      this.cdr.detectChanges();
      return;
    }
    // The merge panel's config is string-keyed, so keys travel through it as compact segments.
    const [left, right] = keys.map(k => k.ToCompactURLSegment());

    // Subtype records: the merge re-points only the keys that target this entity, then the loser's
    // delete follows the shared key into the parent row, whose own references never moved.
    if (entity.ParentID) {
      this.setMergeNotice(`${entity.DisplayName} records extend a parent type; merging subtype records is not supported yet.`);
      this.cdr.detectChanges();
      return;
    }
    const childRows = await this.hasIsAChildRows(entity, keys);
    if (childRows === null) {
      this.setMergeNotice('Could not verify whether the selected records have subtype rows, so the merge was not started.');
      this.cdr.detectChanges();
      return;
    }
    if (childRows) {
      this.setMergeNotice(
        `${entity.DisplayName} records that another app extends (shared-key subtype rows) cannot be merged yet — ` +
        'the merge would collide on the shared key. Merge them from the extending app instead.',
      );
      this.cdr.detectChanges();
      return;
    }

    const result = await this.comparison.GetRecordComparison(
      {
        EntityName: entity.Name,
        Keys: keys.map(k => ({
          KeyValuePairs: k.KeyValuePairs.map(kv => ({ FieldName: kv.FieldName, Value: String(kv.Value) })),
        })),
      },
      this.ProviderToUse,
    );
    if (!result.Success || !result.Output) {
      this.setMergeNotice(result.ErrorMessage ?? 'Could not compare the selected records.');
      this.cdr.detectChanges();
      return;
    }

    this.mergeState = {
      Config: {
        EntityName: entity.Name,
        LeftRecordID: left,
        RightRecordID: right,
        SurvivorSide: 'left',
        LeftLabel: this.labelFor(event.records[0], entity, keys[0]),
        RightLabel: this.labelFor(event.records[1], entity, keys[1]),
      },
      Fields: result.Output.Fields.map(delta => ({
        FieldName: delta.FieldName,
        DisplayLabel: delta.DisplayName,
        LeftValue: delta.Cells[0]?.Value,
        RightValue: delta.Cells[1]?.Value,
        HasConflict: delta.Differs,
        SelectedSide: 'left' as const,
        // What the ORM will refuse to write — keys, AllowUpdateAPI = 0, timestamps. A field the
        // metadata does not know cannot be written either.
        IsReadOnly: entity.FieldByName(delta.FieldName)?.ReadOnly ?? true,
        DataType: 'string',
      })),
      IsMerging: false,
      DependencyNote: await this.describeDependencies(entity, keys),
      Entity: entity,
      Keys: keys,
    };
    this.cdr.detectChanges();
  }

  /** The user confirmed: merge, then reload the page so the loser disappears from the grid. */
  async onMergeConfirmed(event: MergeConfirmedEvent): Promise<void> {
    if (!this.mergeState) return;
    this.mergeState.IsMerging = true;
    this.cdr.detectChanges();

    const survivorIsLeft = event.Config.SurvivorSide === 'left';
    const [leftKey, rightKey] = this.mergeState.Keys;
    const survivor = survivorIsLeft ? leftKey : rightKey;
    const loser = survivorIsLeft ? rightKey : leftKey;

    const request = new RecordMergeRequest();
    request.EntityName = event.Config.EntityName;
    request.SurvivingRecordCompositeKey = survivor;
    request.RecordsToMerge = [loser];
    request.FieldMap = this.buildFieldMap(event, survivorIsLeft);

    try {
      const result = await this.ProviderToUse.MergeRecords(request);
      this.mergeState = null;
      this.setMergeNotice(result.Success ? 'Records merged.' : `Merge failed: ${result.OverallStatus}`);
      if (result.Success) {
        this.dataRequest.emit(this.currentPageDataRequest());
      }
    } catch (err) {
      this.mergeState = null;
      this.setMergeNotice(`Merge failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.cdr.detectChanges();
  }

  /** Merge cancelled → close the panel, write nothing. */
  onMergeCancelled(): void {
    this.mergeState = null;
    this.cdr.detectChanges();
  }

  /**
   * Fields whose resolution has to travel, and only those: the survivor already holds the value
   * for any field resolved to its own side.
   *
   * The distinction that matters is "the user did not change this" versus "the user chose the
   * blank side". Both arrive as an absent value, so deciding from the value alone drops a real
   * resolution — the survivor silently keeps its old value on the one operation where someone is
   * reconciling two records field by field, and the loser is gone afterwards. So the skip is
   * decided from WHICH SIDE was chosen, and a chosen blank is written through as null.
   */
  private buildFieldMap(event: MergeConfirmedEvent, survivorIsLeft: boolean): { FieldName: string; Value: unknown }[] {
    const map: { FieldName: string; Value: unknown }[] = [];
    for (const field of event.ResolvedFields) {
      if (field.IsReadOnly || !field.HasConflict) continue;
      // Resolved to the survivor's own side — nothing to write, whatever the value is.
      if (field.SelectedSide !== 'custom' && (field.SelectedSide === 'left') === survivorIsLeft) continue;
      const chosen =
        field.SelectedSide === 'custom'
          ? field.CustomValue
          : (survivorIsLeft ? field.RightValue : field.LeftValue);
      // A chosen blank is a clear, not a no-op. Normalize undefined to null so the transport
      // carries an explicit value rather than an absent one.
      map.push({ FieldName: field.FieldName, Value: chosen === undefined ? null : chosen });
    }
    return map;
  }

  /**
   * True when any of these records has a row in an IS-A child entity, null when that could not be
   * determined (a child view the user cannot read answers `Success: false`, which must not pass
   * for "no rows"). `MergeRecords` has no subtype handling: the child rows share the parent's key,
   * so merging would collide. Refuse rather than half-merge.
   */
  private async hasIsAChildRows(entity: EntityInfo, keys: ReadonlyArray<CompositeKey>): Promise<boolean | null> {
    const children = entity.ChildEntities;
    if (children.length === 0) return false;

    // An IS-A child shares its parent's key SEMANTICALLY; nothing requires it to share the column
    // NAME. `CompositeKey.ToWhereClause()` emits the parent's names, so filtering a child view
    // with it fails wherever the names differ — and a failed probe refuses the merge, which would
    // disable merge for that entity permanently. Pair each key's values onto the child's own PK
    // columns instead, the way the platform's own child discovery does
    // (SQLServerDataProvider.BuildChildDiscoverySQL).
    const probes = children
      .map(child => ({ child, filter: this.buildChildKeyFilter(child, keys) }))
      .filter((probe): probe is { child: EntityInfo; filter: string } => probe.filter !== null);
    if (probes.length === 0) return false;

    const results = await RunView.FromMetadataProvider(this.ProviderToUse).RunViews(
      probes.map(({ child, filter }) => ({
        EntityName: child.Name,
        ExtraFilter: filter,
        Fields: child.PrimaryKeys.map(f => f.Name),
        ResultType: 'simple' as const,
        MaxRows: 1,
      })),
    );
    if (results.some(r => !r.Success)) return null;
    return results.some(r => r.Results.length > 0);
  }

  /**
   * `(childPk = v1) OR (childPk = v2)` against one child entity, built from the parent's key
   * VALUES and the child's own key COLUMN NAMES, paired positionally because an IS-A child shares
   * its parent's key by design. Null when the child's key arity differs, which means it does not
   * share the key and cannot hold a subtype row for these records.
   */
  private buildChildKeyFilter(child: EntityInfo, keys: ReadonlyArray<CompositeKey>): string | null {
    const childPkFields = child.PrimaryKeys;
    if (childPkFields.length === 0 || keys.some(k => k.KeyValuePairs.length !== childPkFields.length)) {
      return null;
    }
    const clauses = keys.map(key =>
      childPkFields
        .map((field, i) => `[${field.Name}] = '${String(key.KeyValuePairs[i].Value ?? '').replace(/'/g, "''")}'`)
        .join(' AND '),
    );
    return clauses.map(c => `(${c})`).join(' OR ');
  }

  /**
   * How many linked records will move to the survivor — the thing users most want to know.
   *
   * Indexes `counts[0]` / `counts[1]` directly: `onMergeRequested` refuses anything other than
   * exactly two records before reaching here, and the merge panel's config is two-sided by
   * construction, so this is only ever called with a pair. Widen both together.
   */
  private async describeDependencies(entity: EntityInfo, keys: ReadonlyArray<CompositeKey>): Promise<string | null> {
    try {
      const counts = await Promise.all(
        keys.map(key => this.ProviderToUse.GetRecordDependencies(entity.Name, key)),
      );
      return `Linked records that would move to the survivor: ${counts[0].length} on the left, ${counts[1].length} on the right.`;
    } catch (err) {
      LogError(`Could not load merge dependencies for ${entity.Name}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** A human label for a row — its name field when it has one, else its key. */
  private labelFor(row: Record<string, unknown>, entity: EntityInfo, key: CompositeKey): string {
    const nameField = entity.NameField?.Name;
    const name = nameField ? String(row[nameField] ?? '') : '';
    return name || key.ToCompactURLSegment();
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
    const match = this.ProviderToUse.Entities.find((e) => UUIDsEqual(e.ID, entityId));
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
