import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectorRef,
  ViewChild
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { EntityInfo, LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  MJUserViewEntityExtended,
  UserInfoEngine,
  UserViewEngine,
  ViewGridState,
  MJUserViewEntity_IGridState,
  MJUserViewEntity_IGridColumnSetting,
  MJUserViewEntity_IGridSortSetting,
  MJUserViewEntity_ISortStateItem
} from '@memberjunction/core-entities';
import { CompositeFilterDescriptor, FilterFieldInfo } from '@memberjunction/ng-filter-builder';

import {
  RecordSelectedEvent,
  RecordOpenedEvent,
  ViewConfigSummary,
  QuickSaveEvent,
  QuickSaveAdvancedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  EntityViewerConfig,
  SortState,
  SortDirection
} from '../types';
import { EntityViewerComponent } from '../entity-viewer/entity-viewer.component';
import { ViewRelatedRecordNavigation } from '../view-types';
import { ViewSelectorComponent, ViewSelectedEvent, SaveViewRequestedEvent } from '../view-selector/view-selector.component';
import { ViewConfigPanelComponent, ViewSaveEvent } from '../view-config-panel/view-config-panel.component';
import { SharedViewAction } from '../shared-view-warning-dialog/shared-view-warning-dialog.component';
import { DuplicateViewEvent } from '../duplicate-view-dialog/duplicate-view-dialog.component';

/**
 * Generic cancelable event payload used by the workspace's `Before…` lifecycle outputs.
 * Mirrors the house pattern (`CancelableEvent<T>` in `@memberjunction/ng-clustering` and the
 * grid's `BeforeRowClick`): a handler sets `Cancel = true` on the args object to veto the
 * default operation that would otherwise follow.
 *
 * @typeParam T - the shape of the operation-specific payload carried on {@link Data}.
 */
export interface WorkspaceCancelableEvent<T = unknown> {
  /** The operation payload (e.g. the view being saved / deleted). */
  Data: T;
  /** Set to `true` in a `Before…` handler to cancel the pending operation. */
  Cancel: boolean;
}

/**
 * Payload describing a view save about to occur / that just occurred. Emitted via
 * {@link ViewWorkspaceComponent.BeforeViewSave} (wrapped in {@link WorkspaceCancelableEvent})
 * and {@link ViewWorkspaceComponent.AfterViewSave}.
 */
export interface ViewSaveOperation {
  /** The view entity being saved (the new record when creating, the existing record when updating). */
  View: MJUserViewEntityExtended;
  /** True when this save created a brand-new view; false when it updated an existing one. */
  IsNew: boolean;
}

/**
 * Payload describing a view delete that just occurred, emitted via
 * {@link ViewWorkspaceComponent.AfterViewDelete}.
 */
export interface ViewDeleteOperation {
  /** The `MJ: User Views` row ID that was deleted. */
  ViewID: string;
  /** The name of the deleted view (captured before deletion). */
  ViewName: string;
}

/**
 * `mj-view-workspace` — the reusable "browse an entity's data across saved views" workspace.
 *
 * This composite component orchestrates the full saved-view lifecycle (select / save / save-as-new /
 * rename / duplicate / delete / revert / quick-save / save-defaults) on top of an entity's data, by
 * composing the existing Generic lego components in this package:
 *
 * - {@link ViewSelectorComponent} — the saved-view dropdown.
 * - {@link EntityViewerComponent} — the data renderer (grid / cards / timeline / map / plug-ins).
 * - {@link ViewConfigPanelComponent} — the slide-in column/sort/filter configuration panel.
 * - `mj-view-type-switcher` — the toolbar dropdown for switching the active view type.
 * - `mj-quick-save-dialog`, `mj-duplicate-view-dialog`, `mj-shared-view-warning-dialog`,
 *   `mj-ev-confirm-dialog` — the focused modals.
 *
 * It is the generic extraction of what `DataExplorerDashboardComponent` does today, **minus routing,
 * URL/query-param sync, and the Explorer state service**. Anything that requires app-level routing is
 * emitted as an event ({@link OpenRecordRequested}, {@link OpenViewInTabRequested},
 * {@link CreateNewRecordRequested}) for the host to handle — this component never imports `Router`.
 *
 * ## Persistence model
 * - When {@link AutoSaveView} is `true`, the workspace persists view CRUD itself via the
 *   `MJUserViewEntityExtended` BaseEntity (`.Save()` / `.Delete()`) and `UserInfoEngine` for the
 *   per-user default-view settings, firing the cancelable `Before…` events and notification `After…`
 *   events around each operation.
 * - When {@link AutoSaveView} is `false` (the default), the workspace performs no persistence — it
 *   emits the change-request events ({@link SaveViewRequested}, {@link DeleteViewRequested},
 *   {@link DuplicateViewRequested}, etc.) and the host is responsible for persisting and feeding back
 *   the updated view via the `[SelectedView]` input.
 *
 * State is held in plain component fields — there is no state-management service.
 *
 * @example
 * ```html
 * <mj-view-workspace
 *   [EntityName]="'Accounts'"
 *   [AutoSaveView]="true"
 *   (OpenRecordRequested)="navService.openRecord($event.entity, $event.record)"
 *   (OpenViewInTabRequested)="navService.openView($event)"
 *   (CreateNewRecordRequested)="navService.newRecord($event)">
 * </mj-view-workspace>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-view-workspace',
  templateUrl: './view-workspace.component.html',
  styleUrls: ['./view-workspace.component.css']
})
export class ViewWorkspaceComponent extends BaseAngularComponent implements OnInit {
  // ========================================
  // INPUTS
  // ========================================

  private _entity: EntityInfo | null = null;
  private _initialized = false;

  /**
   * The entity whose data this workspace browses. May be supplied directly, or resolved from
   * {@link EntityName} / {@link EntityID}. When it changes the selected view and config panel reset.
   */
  @Input()
  get Entity(): EntityInfo | null {
    return this._entity;
  }
  set Entity(value: EntityInfo | null) {
    const previous = this._entity;
    this._entity = value;
    if (this._initialized && value && (!previous || !UUIDsEqual(value.ID, previous.ID))) {
      this.resetForEntityChange();
    }
  }

  /**
   * Convenience input: resolve {@link Entity} by entity **name** via the active provider.
   * Use this OR {@link Entity} OR {@link EntityID}.
   */
  @Input()
  set EntityName(value: string | null) {
    if (!value) {
      return;
    }
    const resolved = this.ProviderToUse?.EntityByName(value) ?? null;
    if (resolved) {
      this.Entity = resolved;
    }
  }

  /**
   * Convenience input: resolve {@link Entity} by entity **ID** via the active provider.
   * Use this OR {@link Entity} OR {@link EntityName}.
   */
  @Input()
  set EntityID(value: string | null) {
    if (!value) {
      return;
    }
    const resolved = this.ProviderToUse?.Entities.find(e => UUIDsEqual(e.ID, value)) ?? null;
    if (resolved) {
      this.Entity = resolved;
    }
  }

  /**
   * When `true`, the workspace persists view CRUD itself (BaseEntity `.Save()`/`.Delete()` plus
   * `UserInfoEngine` for the default-view settings) and fires the cancelable `Before…` / notification
   * `After…` events around each persistence operation. When `false` (the default) the workspace only
   * emits the change-request events and the host persists. Persistence is provider-based and
   * generic-safe — it never performs routing.
   */
  @Input() AutoSaveView: boolean = false;

  /**
   * The currently-selected view. Hosts that own persistence (when {@link AutoSaveView} is `false`)
   * feed the loaded view back in here after handling a save/select request. Bound two-way friendly:
   * the workspace emits {@link SelectedViewChange} whenever the selection changes internally.
   */
  @Input()
  get SelectedView(): MJUserViewEntityExtended | null {
    return this.currentViewEntity;
  }
  set SelectedView(value: MJUserViewEntityExtended | null) {
    this.currentViewEntity = value;
    this.currentGridState = value ? this.parseViewGridState(value) : this.loadUserDefaultGridState();
    this.viewModified = false;
  }

  // ----- Host-driven passthrough inputs (forwarded to the inner entity-viewer) -----
  //
  // These let a host (e.g. the Explorer DataExplorer dashboard) own the chrome — filter box, record
  // selection — while the workspace owns the saved-view lifecycle. All view-type-specific chrome
  // (grid toolbar, timeline date/orientation, map render mode) is now self-contained in each plug-in
  // renderer, so the workspace no longer forwards any of it.

  /**
   * The free-text filter to apply to the inner viewer. When a host owns the filter box it binds
   * this (typically a debounced value); the workspace's {@link filterText} field tracks it.
   */
  @Input()
  get FilterText(): string {
    return this.filterText;
  }
  set FilterText(value: string) {
    this.filterText = value ?? '';
  }

  /**
   * The composite-key string of the record to highlight in the inner viewer. When a host owns
   * record selection (e.g. via a detail panel) it binds this; the workspace's
   * {@link selectedRecordId} field tracks it.
   */
  @Input()
  get SelectedRecordId(): string | null {
    return this.selectedRecordId;
  }
  set SelectedRecordId(value: string | null) {
    this.selectedRecordId = value;
  }

  /** Partial {@link EntityViewerConfig} forwarded to the inner viewer (toolbar/pagination/etc.). */
  @Input() ViewerConfig: Partial<EntityViewerConfig> | null = null;

  // ========================================
  // OUTPUTS — routing / host concerns (this component never routes)
  // ========================================

  /**
   * Emitted when the user opens a record (double-click / open). The host performs the navigation.
   */
  @Output() OpenRecordRequested = new EventEmitter<{ entity: EntityInfo; record: Record<string, unknown> }>();

  /**
   * Emitted when the user asks to open the current view in its own tab. Carries the `MJ: User Views`
   * row ID. The host performs the navigation.
   */
  @Output() OpenViewInTabRequested = new EventEmitter<string>();

  /**
   * Emitted when the user asks to create a new record for the current entity — either from the
   * selector or bubbled up from a plug-in renderer's "New" button. The host opens the form.
   */
  @Output() CreateNewRecordRequested = new EventEmitter<EntityInfo>();

  /**
   * NAVIGATION request bubbled up from a plug-in renderer (via the inner viewer) to open a *related*
   * record on a (possibly different) entity — e.g. a grid foreign-key drill-through. The host routes.
   */
  @Output() OpenRelatedRecordRequested = new EventEmitter<ViewRelatedRecordNavigation>();

  /**
   * Emitted when a record is selected (single click) in the viewer.
   */
  @Output() RecordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when the selected view changes (selection, save, delete). Notification only.
   */
  @Output() ViewSelected = new EventEmitter<MJUserViewEntityExtended | null>();

  /**
   * Two-way-binding companion for {@link SelectedView}.
   */
  @Output() SelectedViewChange = new EventEmitter<MJUserViewEntityExtended | null>();

  // ----- Forwarded inner-viewer events (the generic, view-type-agnostic ones) -----
  //
  // The workspace owns the inner entity-viewer; it re-emits the viewer's generic signals (filter,
  // data-load, counts) so a host can drive Explorer-only concerns (URL sync, detail panel). All
  // view-type-specific feature events (grid selection/add-to-list, map state, grid state) are now
  // self-contained in the plug-in renderers and no longer bubble through the workspace.

  /**
   * Emitted when the inner viewer's filter text changes (two-way friendly with {@link FilterText}).
   */
  @Output() FilterTextChanged = new EventEmitter<string>();

  /**
   * Emitted when the inner viewer finishes loading data — carries counts, timing and the records.
   */
  @Output() DataLoaded = new EventEmitter<DataLoadedEvent>();

  /**
   * Emitted when the inner viewer's filtered/total counts change.
   */
  @Output() FilteredCountChanged = new EventEmitter<FilteredCountChangedEvent>();

  // ----- Persistence lifecycle events -----

  /**
   * Emitted (cancelable) BEFORE a view save is persisted. A handler may set `Cancel = true` to veto.
   * Only fires when {@link AutoSaveView} is `true`.
   */
  @Output() BeforeViewSave = new EventEmitter<WorkspaceCancelableEvent<ViewSaveOperation>>();

  /**
   * Emitted AFTER a view save has been persisted. Notification only.
   */
  @Output() AfterViewSave = new EventEmitter<ViewSaveOperation>();

  /**
   * Emitted (cancelable) BEFORE a view delete is persisted. A handler may set `Cancel = true` to veto.
   * Only fires when {@link AutoSaveView} is `true`.
   */
  @Output() BeforeViewDelete = new EventEmitter<WorkspaceCancelableEvent<MJUserViewEntityExtended>>();

  /**
   * Emitted AFTER a view delete has been persisted. Notification only.
   */
  @Output() AfterViewDelete = new EventEmitter<ViewDeleteOperation>();

  // ----- Change-request events (the host persists when AutoSaveView is false) -----

  /**
   * Emitted when the user requests a save and {@link AutoSaveView} is `false`. The host persists.
   */
  @Output() SaveViewRequested = new EventEmitter<ViewSaveEvent>();

  /**
   * Emitted when the user requests a delete and {@link AutoSaveView} is `false`. The host persists.
   */
  @Output() DeleteViewRequested = new EventEmitter<MJUserViewEntityExtended>();

  /**
   * Emitted when the user requests a duplicate and {@link AutoSaveView} is `false`. The host persists.
   * Carries the source view ID and the chosen name for the copy.
   */
  @Output() DuplicateViewRequested = new EventEmitter<{ sourceViewId: string; newName: string }>();

  /**
   * Emitted when the user saves per-user default view settings and {@link AutoSaveView} is `false`.
   */
  @Output() SaveDefaultsRequested = new EventEmitter<ViewSaveEvent>();

  // ========================================
  // CHILD COMPONENT REFERENCES
  // ========================================

  /** Reference to the view selector (for reloading the view list after CRUD). */
  @ViewChild(ViewSelectorComponent) protected viewSelectorRef?: ViewSelectorComponent;

  /** Reference to the entity viewer (for flushing pending grid changes + reloading data). */
  @ViewChild(EntityViewerComponent) protected entityViewerRef?: EntityViewerComponent;

  /** Reference to the config panel (for building summaries + canEdit checks). */
  @ViewChild(ViewConfigPanelComponent) protected viewConfigPanelRef?: ViewConfigPanelComponent;

  // ========================================
  // INTERNAL STATE (plain fields — no state service)
  // ========================================

  /** The currently selected view entity (null = the default/unsaved view). */
  public currentViewEntity: MJUserViewEntityExtended | null = null;

  /** The currently selected view ID (null = default view). */
  public selectedViewId: string | null = null;

  /** Live grid state (column widths / order / sort / aggregates) reflecting user interaction. */
  public currentGridState: ViewGridState | null = null;

  /** Whether the current view has unsaved modifications. */
  public viewModified: boolean = false;

  /** The current free-text filter. */
  public filterText: string = '';

  /** The currently selected record's composite-key string (for grid highlight). */
  public selectedRecordId: string | null = null;

  /** Records loaded by the viewer, kept for config-panel sample data. */
  public loadedRecords: Record<string, unknown>[] = [];

  /** Whether a save operation is in progress (drives the saving spinners). */
  public isSavingView: boolean = false;

  // ----- Dialog / panel open flags -----

  /** Whether the slide-in config panel is open. */
  public isConfigPanelOpen: boolean = false;

  /** Whether the quick-save dialog is open. */
  public showQuickSaveDialog: boolean = false;

  /** Whether the duplicate-view dialog is open. */
  public showDuplicateDialog: boolean = false;

  /** Whether the shared-view warning dialog is open. */
  public showSharedViewWarning: boolean = false;

  /** Whether the config panel opens in "save as new" mode. */
  public defaultSaveAsNew: boolean = false;

  // ----- Pending state carried across dialogs -----

  /** Summary shown in the quick-save dialog. */
  public quickSaveSummary: ViewConfigSummary | null = null;

  /** Summary shown in the duplicate-view dialog. */
  public duplicateSummary: ViewConfigSummary | null = null;

  /** Source view name shown in the duplicate-view dialog. */
  public duplicateSourceViewName: string = '';

  /** The view ID being duplicated. */
  private duplicateTargetViewId: string | null = null;

  /** A quick-save event held while the shared-view warning is shown. */
  private pendingQuickSaveEvent: QuickSaveEvent | null = null;

  /** Pre-populated name carried from quick-save dialog into the config panel. */
  public pendingNewViewName: string = '';

  /** Pre-populated description carried from quick-save dialog into the config panel. */
  public pendingNewViewDescription: string = '';

  /** Pre-populated sharing preference carried from quick-save dialog into the config panel. */
  public pendingNewViewIsShared: boolean = false;

  // ----- Filter dialog (rendered at workspace level for full width) -----

  /** Whether the full-width filter dialog is open. */
  public isFilterDialogOpen: boolean = false;

  /** The filter state currently being edited in the filter dialog. */
  public filterDialogState: CompositeFilterDescriptor | null = null;

  /** The filter fields available in the filter dialog. */
  public filterDialogFields: FilterFieldInfo[] = [];

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  // ========================================
  // LIFECYCLE
  // ========================================

  /** Initializes the workspace and loads the per-user default grid state for the entity. */
  ngOnInit(): void {
    this._initialized = true;
    if (this._entity && !this.currentViewEntity) {
      this.currentGridState = this.loadUserDefaultGridState();
    }
  }

  /** Resets all view/selection state when the bound entity changes to a different entity. */
  private resetForEntityChange(): void {
    this.currentViewEntity = null;
    this.selectedViewId = null;
    this.viewModified = false;
    this.selectedRecordId = null;
    this.currentGridState = this.loadUserDefaultGridState();
    this.closeAllDialogs();
    this.cdr.detectChanges();
  }

  /** Closes every dialog/panel — used on entity change. */
  private closeAllDialogs(): void {
    this.isConfigPanelOpen = false;
    this.showQuickSaveDialog = false;
    this.showDuplicateDialog = false;
    this.showSharedViewWarning = false;
    this.isFilterDialogOpen = false;
  }

  // ========================================
  // VIEW-TYPE SWITCHER (lifted into the toolbar)
  // ========================================

  /**
   * Drive the inner entity-viewer to switch to the chosen view type. The toolbar-level
   * {@link ViewTypeSwitcherComponent} emits the selection; we route it to the viewer's
   * {@link EntityViewerComponent.SelectViewTypeById} (its existing lifecycle: cancelable events
   * + persistence). The viewer's own header switcher is suppressed via Config, so this is the
   * single switcher in the workspace.
   */
  public onToolbarViewTypeSelected(event: { viewTypeId: string; driverClass: string }): void {
    this.entityViewerRef?.SelectViewTypeById(event.viewTypeId);
    this.cdr.detectChanges();
  }

  /**
   * The active view type's `MJ: View Types` row ID, read from the inner viewer for the toolbar
   * switcher's active highlight. Safe to read in the template — it reflects the viewer's own
   * resolved state rather than driving it.
   */
  get activeViewTypeId(): string | null {
    return this.entityViewerRef?.ActiveViewTypeId ?? null;
  }

  /**
   * The Config forwarded to the inner viewer. Merges the host-supplied {@link ViewerConfig} but
   * always forces `showViewModeToggle: false` so the view-type switcher appears only once — in the
   * workspace toolbar, not duplicated in the viewer's own header.
   */
  get innerViewerConfig(): Partial<EntityViewerConfig> {
    return { ...(this.ViewerConfig ?? {}), showViewModeToggle: false };
  }

  // ========================================
  // VIEW SELECTION
  // ========================================

  /**
   * Handle a view selection from the selector dropdown. Applies the view's grid state and filter,
   * resets the modified flag, and notifies the host. (Generalized from DataExplorer.onViewSelected.)
   */
  public onViewSelected(event: ViewSelectedEvent): void {
    this.entityViewerRef?.EnsurePendingChangesSaved();

    this.currentViewEntity = event.View;
    this.selectedViewId = event.ViewID;
    this.viewModified = false;
    this.filterText = '';

    this.currentGridState = event.View
      ? this.parseViewGridState(event.View)
      : this.loadUserDefaultGridState();

    this.ViewSelected.emit(event.View);
    this.SelectedViewChange.emit(event.View);
    this.cdr.detectChanges();
  }

  /** Handle filter text change from the viewer — re-emit so the host can sync its filter box / URL. */
  public onFilterTextChanged(filterText: string): void {
    this.filterText = filterText;
    this.FilterTextChanged.emit(filterText);
  }

  /** Track loaded records so the config panel has sample data, and re-emit the full event. */
  public onDataLoaded(event: DataLoadedEvent): void {
    this.loadedRecords = event.records;
    this.DataLoaded.emit(event);
  }

  /** Re-emit the inner viewer's filtered-count change for the host. */
  public onFilteredCountChanged(event: FilteredCountChangedEvent): void {
    this.FilteredCountChanged.emit(event);
  }

  // ========================================
  // RECORD SELECTION / OPENING / NAVIGATION (emit for host)
  // ========================================

  /** Handle a record single-click — track selection and re-emit for the host. */
  public onRecordSelected(event: RecordSelectedEvent): void {
    this.selectedRecordId = event.compositeKey.ToConcatenatedString();
    this.RecordSelected.emit(event);
  }

  /** Handle a record open (double-click) — emit for the host to route to the record. */
  public onRecordOpened(event: RecordOpenedEvent): void {
    if (event.record) {
      this.OpenRecordRequested.emit({ entity: event.entity, record: event.record });
    }
  }

  /**
   * Handle a plug-in renderer's request (via the inner viewer) to open a related record on a
   * (possibly different) entity — re-emit for the host to route.
   */
  public onOpenRelatedRecordRequested(nav: ViewRelatedRecordNavigation): void {
    this.OpenRelatedRecordRequested.emit(nav);
  }

  /**
   * Handle a plug-in renderer's request (via the inner viewer) to create a new record of the
   * current entity (e.g. a grid's "New" button) — re-emit for the host to open the form.
   */
  public onCreateRecordRequested(): void {
    if (this._entity) {
      this.CreateNewRecordRequested.emit(this._entity);
    }
  }

  // ========================================
  // VIEW SELECTOR ACTIONS
  // ========================================

  /** Handle the selector's "open in tab" request — emit for the host to route. */
  public onOpenInTabRequested(viewId: string): void {
    this.OpenViewInTabRequested.emit(viewId);
  }

  /** Handle the selector's "create new record" request — emit for the host. */
  public onCreateNewRecordRequested(): void {
    if (this._entity) {
      this.CreateNewRecordRequested.emit(this._entity);
    }
  }

  /** Handle the selector's "configure view" request — open the config panel. */
  public onConfigureViewRequested(): void {
    this.defaultSaveAsNew = false;
    this.isConfigPanelOpen = true;
    this.cdr.detectChanges();
  }

  // ========================================
  // PROGRAMMATIC GRID CONTROL (passthrough to the inner entity viewer)
  // ========================================
  // Thin public passthroughs so a parent (e.g. the Data Explorer dashboard driving
  // the AI agent) can page/sort the grid and read its live pagination/sort state
  // without reaching into the protected child reference. All return null/false when
  // the viewer isn't mounted yet (e.g. at the home level before an entity is selected).

  /** Live pagination/sort snapshot from the inner viewer, or null when not mounted. */
  public GetGridState(): { CurrentPage: number; PageSize: number; TotalRecords: number; TotalPages: number; Sort: SortState | null } | null {
    const v = this.entityViewerRef;
    if (!v) {
      return null;
    }
    return {
      CurrentPage: v.CurrentPageNumber,
      PageSize: v.CurrentPageSize,
      TotalRecords: v.TotalRecords,
      TotalPages: v.TotalPageCount,
      Sort: v.CurrentSortState,
    };
  }

  /** Navigate to a 1-based page on the inner grid. Returns the page applied, or null. */
  public GoToPage(pageNumber: number): number | null {
    return this.entityViewerRef?.GoToPageNumber(pageNumber) ?? null;
  }

  /** Advance the inner grid to the next page. Returns the new 1-based page, or null. */
  public NextPage(): number | null {
    return this.entityViewerRef?.NextPage() ?? null;
  }

  /** Move the inner grid to the previous page. Returns the new 1-based page, or null. */
  public PreviousPage(): number | null {
    return this.entityViewerRef?.PreviousPage() ?? null;
  }

  /** Set the inner grid's server-side page size (reloads from page 1). Returns the size applied, or null. */
  public SetPageSize(pageSize: number): number | null {
    return this.entityViewerRef?.SetServerPageSize(pageSize) ?? null;
  }

  /** Apply a server-side sort to the inner grid. Returns true when applied, false otherwise. */
  public SetSort(field: string, direction: SortDirection): boolean {
    return this.entityViewerRef?.ApplySort(field, direction) ?? false;
  }

  /**
   * Programmatically select a record in the inner grid — highlights the row and emits
   * {@link RecordSelected} for the host (the no-UI equivalent of a user row-click). Returns
   * false when the viewer isn't mounted or has no entity context. The record must be one of
   * the loaded rows; the host resolves it (e.g. from {@link loadedRecords}).
   */
  public SelectRecord(record: Record<string, unknown>): boolean {
    return this.entityViewerRef?.SelectRecord(record) ?? false;
  }

  /**
   * Export the current view's records via the inner viewer's active renderer. Returns false
   * when the viewer isn't mounted or the active view type doesn't support export. The grid
   * renderer downloads the file itself.
   */
  public async ExportRecords(format?: 'csv' | 'excel' | 'json'): Promise<boolean> {
    return this.entityViewerRef ? this.entityViewerRef.ExportRecords(format) : false;
  }

  /** Handle the selector's "save view" request — open the config panel in the requested mode. */
  public onSaveViewRequested(event: SaveViewRequestedEvent): void {
    this.defaultSaveAsNew = event.SaveAsNew || false;
    this.isConfigPanelOpen = true;
    this.cdr.detectChanges();
  }

  // ========================================
  // CONFIG PANEL
  // ========================================

  /** Close the config panel and clear any pending new-view carry-over state. */
  public onCloseConfigPanel(): void {
    this.isConfigPanelOpen = false;
    this.clearPendingNewViewState();
    this.cdr.detectChanges();
  }

  /** Reset the carry-over state used when continuing a new-view flow into the config panel. */
  private clearPendingNewViewState(): void {
    this.pendingNewViewName = '';
    this.pendingNewViewDescription = '';
    this.pendingNewViewIsShared = false;
    this.defaultSaveAsNew = false;
  }

  // ----- Filter dialog -----

  /** Open the full-width filter dialog from the config panel's request. */
  public onOpenFilterDialogRequest(event: { filterState: CompositeFilterDescriptor; filterFields: FilterFieldInfo[] }): void {
    this.filterDialogState = event.filterState;
    this.filterDialogFields = event.filterFields;
    this.isFilterDialogOpen = true;
    this.cdr.detectChanges();
  }

  /** Close the filter dialog. */
  public onCloseFilterDialog(): void {
    this.isFilterDialogOpen = false;
    this.cdr.detectChanges();
  }

  /** Apply a filter from the dialog — the config panel picks it up via `externalFilterState`. */
  public onFilterApplied(filter: CompositeFilterDescriptor): void {
    this.filterDialogState = filter;
    this.isFilterDialogOpen = false;
    this.cdr.detectChanges();
  }

  // ========================================
  // SAVE VIEW
  // ========================================

  /**
   * Handle a save from the config panel. When {@link AutoSaveView}, persists the view itself
   * (create-new or update) via the BaseEntity; otherwise emits {@link SaveViewRequested} for the host.
   * (Faithful generalization of DataExplorer.onSaveView, minus routing/state-service/notifications.)
   */
  public async onSaveView(event: ViewSaveEvent): Promise<void> {
    if (!this._entity) {
      return;
    }

    if (!this.AutoSaveView) {
      this.SaveViewRequested.emit(event);
      this.isConfigPanelOpen = false;
      this.clearPendingNewViewState();
      this.cdr.detectChanges();
      return;
    }

    this.isSavingView = true;
    this.cdr.detectChanges();

    const isNew = event.SaveAsNew || !this.currentViewEntity;
    const success = isNew
      ? await this.persistNewView(event)
      : await this.persistExistingView(event);

    if (success) {
      this.isConfigPanelOpen = false;
      this.clearPendingNewViewState();
      await this.viewSelectorRef?.LoadViews();
      await this.entityViewerRef?.LoadData();
    }

    this.isSavingView = false;
    this.cdr.detectChanges();
  }

  /**
   * Create and persist a brand-new view from the save event. Fires the cancelable
   * {@link BeforeViewSave} before saving and {@link AfterViewSave} after success.
   */
  private async persistNewView(event: ViewSaveEvent): Promise<boolean> {
    const provider = this.ProviderToUse;
    const newView = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', provider.CurrentUser);
    newView.Name = event.Name || 'Custom';
    newView.Description = event.Description;
    newView.EntityID = this._entity!.ID;
    newView.UserID = provider.CurrentUser.ID;
    newView.IsShared = event.IsShared;
    newView.IsDefault = false;

    const gridState = this.buildGridState(event);
    if (gridState) {
      newView.GridStateObject = gridState;
    }
    const sortState = this.buildSortState(event);
    if (sortState) {
      newView.SortStateObject = sortState;
    }
    newView.SmartFilterEnabled = event.SmartFilterEnabled;
    newView.SmartFilterPrompt = event.SmartFilterPrompt;
    newView.FilterState = this.buildFilterStateJson(event);

    const before: WorkspaceCancelableEvent<ViewSaveOperation> = { Data: { View: newView, IsNew: true }, Cancel: false };
    this.BeforeViewSave.emit(before);
    if (before.Cancel) {
      return false;
    }

    const saved = await newView.Save();
    if (!saved) {
      LogError(`[ViewWorkspace] Failed to create view: ${newView.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return false;
    }

    // Keep the UserViewEngine cache in sync with the DB write so the subsequent LoadViews()
    // reflects the just-created view (otherwise it reads a stale cache and the view is missing).
    await UserViewEngine.Instance.RefreshCache();

    this.currentViewEntity = newView;
    this.selectedViewId = newView.ID;
    this.viewModified = false;
    this.currentGridState = this.parseViewGridState(newView);
    this.ViewSelected.emit(newView);
    this.SelectedViewChange.emit(newView);
    this.AfterViewSave.emit({ View: newView, IsNew: true });
    return true;
  }

  /**
   * Update and persist the currently-selected view from the save event. Fires the cancelable
   * {@link BeforeViewSave} before saving and {@link AfterViewSave} after success.
   */
  private async persistExistingView(event: ViewSaveEvent): Promise<boolean> {
    const view = this.currentViewEntity!;
    view.Name = event.Name;
    view.Description = event.Description;
    view.IsShared = event.IsShared;

    const gridState = this.buildGridState(event);
    if (gridState) {
      view.GridStateObject = gridState;
    }
    const sortState = this.buildSortState(event);
    if (sortState) {
      view.SortStateObject = sortState;
    }
    view.SmartFilterEnabled = event.SmartFilterEnabled;
    view.SmartFilterPrompt = event.SmartFilterPrompt;
    view.FilterState = this.buildFilterStateJson(event);

    const before: WorkspaceCancelableEvent<ViewSaveOperation> = { Data: { View: view, IsNew: false }, Cancel: false };
    this.BeforeViewSave.emit(before);
    if (before.Cancel) {
      return false;
    }

    const saved = await view.Save();
    if (!saved) {
      LogError(`[ViewWorkspace] Failed to update view: ${view.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return false;
    }

    // Keep the UserViewEngine cache in sync with the DB write so the subsequent LoadViews()
    // reflects the updated view.
    await UserViewEngine.Instance.RefreshCache();

    this.viewModified = false;
    this.currentGridState = this.parseViewGridState(view);
    this.AfterViewSave.emit({ View: view, IsNew: false });
    return true;
  }

  /**
   * Handle saving per-user default view settings from the config panel. When {@link AutoSaveView},
   * persists to `UserInfoEngine`; otherwise emits {@link SaveDefaultsRequested}.
   * (Generalized from DataExplorer.onSaveDefaultViewSettings.)
   */
  public async onSaveDefaultViewSettings(event: ViewSaveEvent): Promise<void> {
    if (!this._entity) {
      return;
    }

    if (!this.AutoSaveView) {
      this.SaveDefaultsRequested.emit(event);
      this.isConfigPanelOpen = false;
      this.cdr.detectChanges();
      return;
    }

    this.isSavingView = true;
    this.cdr.detectChanges();

    const gridState = this.buildGridState(event);
    if (gridState) {
      gridState.sortSettings = this.buildGridSortSettings(event) ?? gridState.sortSettings;
      const settingKey = `default-view-setting/${this._entity.Name}`;
      const saved = await UserInfoEngine.Instance.SetSetting(settingKey, JSON.stringify(gridState));
      if (saved) {
        this.currentGridState = {
          columnSettings: gridState.columnSettings as ViewGridState['columnSettings'],
          sortSettings: gridState.sortSettings as ViewGridState['sortSettings'],
          aggregates: gridState.aggregates
        };
        this.cdr.detectChanges();
        this.entityViewerRef?.Refresh();
      } else {
        LogError('[ViewWorkspace] Failed to save default view settings');
      }
    }

    this.isConfigPanelOpen = false;
    this.isSavingView = false;
    this.cdr.detectChanges();
  }

  // ========================================
  // DELETE VIEW
  // ========================================

  /**
   * Handle a delete from the config panel. When {@link AutoSaveView}, persists the delete itself
   * (firing cancelable {@link BeforeViewDelete} / notification {@link AfterViewDelete}); otherwise
   * emits {@link DeleteViewRequested}. (Generalized from DataExplorer.onDeleteView.)
   */
  public async onDeleteView(): Promise<void> {
    if (!this.currentViewEntity) {
      return;
    }

    if (!this.AutoSaveView) {
      this.DeleteViewRequested.emit(this.currentViewEntity);
      this.isConfigPanelOpen = false;
      this.cdr.detectChanges();
      return;
    }

    const view = this.currentViewEntity;
    const viewId = view.ID;
    const viewName = view.Name;

    const before: WorkspaceCancelableEvent<MJUserViewEntityExtended> = { Data: view, Cancel: false };
    this.BeforeViewDelete.emit(before);
    if (before.Cancel) {
      return;
    }

    const deleted = await view.Delete();
    if (!deleted) {
      LogError(`[ViewWorkspace] Failed to delete view: ${view.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return;
    }

    // Keep the UserViewEngine cache in sync with the DB delete so the subsequent LoadViews()
    // no longer returns the removed view.
    await UserViewEngine.Instance.RefreshCache();

    this.currentViewEntity = null;
    this.selectedViewId = null;
    this.viewModified = false;
    this.isConfigPanelOpen = false;
    this.currentGridState = this.loadUserDefaultGridState();
    await this.viewSelectorRef?.LoadViews();
    this.ViewSelected.emit(null);
    this.SelectedViewChange.emit(null);
    this.AfterViewDelete.emit({ ViewID: viewId, ViewName: viewName });
    this.cdr.detectChanges();
  }

  // ========================================
  // QUICK SAVE
  // ========================================

  /**
   * Handle a quick-save request from the selector (F-001). Builds a summary from the config panel
   * and opens the quick-save dialog. (Generalized from DataExplorer.onQuickSaveRequested.)
   */
  public onQuickSaveRequested(saveAsNew: boolean): void {
    this.defaultSaveAsNew = saveAsNew;
    this.quickSaveSummary = this.viewConfigPanelRef?.BuildSummary() ?? null;
    this.showQuickSaveDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Handle the quick-save dialog's save. Intercepts updates to a shared view with the shared-view
   * warning; otherwise executes the save. (Generalized from DataExplorer.onQuickSave.)
   */
  public async onQuickSave(event: QuickSaveEvent): Promise<void> {
    this.showQuickSaveDialog = false;

    if (!event.SaveAsNew && this.currentViewEntity?.IsShared) {
      this.pendingQuickSaveEvent = event;
      this.showSharedViewWarning = true;
      this.cdr.detectChanges();
      return;
    }

    await this.executeQuickSave(event);
  }

  /** Build a `ViewSaveEvent` from a `QuickSaveEvent` and delegate to {@link onSaveView}. */
  private async executeQuickSave(event: QuickSaveEvent): Promise<void> {
    const viewSaveEvent: ViewSaveEvent = {
      Name: event.Name,
      Description: event.Description,
      IsShared: event.IsShared,
      SaveAsNew: event.SaveAsNew,
      Columns: [],
      SortField: null,
      SortDirection: 'asc',
      SortItems: [],
      SmartFilterEnabled: false,
      SmartFilterPrompt: '',
      FilterState: this.filterDialogState ?? null,
      AggregatesConfig: null
    };
    await this.onSaveView(viewSaveEvent);
  }

  /** Handle the shared-view warning action (update / save-as-copy / cancel). */
  public async onSharedViewAction(action: SharedViewAction): Promise<void> {
    this.showSharedViewWarning = false;
    const event = this.pendingQuickSaveEvent;
    this.pendingQuickSaveEvent = null;
    if (!event) {
      return;
    }

    if (action === 'update-shared') {
      await this.executeQuickSave(event);
    } else if (action === 'save-as-copy') {
      await this.executeQuickSave({ ...event, SaveAsNew: true, IsShared: false });
    }
    this.cdr.detectChanges();
  }

  /** Handle the shared-view warning cancel. */
  public onSharedViewWarningCancel(): void {
    this.showSharedViewWarning = false;
    this.pendingQuickSaveEvent = null;
    this.cdr.detectChanges();
  }

  /** Handle the quick-save dialog close. */
  public onQuickSaveClose(): void {
    this.showQuickSaveDialog = false;
    this.cdr.detectChanges();
  }

  /** Handle "open advanced" from the quick-save dialog — carry data into the config panel. */
  public onQuickSaveOpenAdvanced(event: QuickSaveAdvancedEvent): void {
    this.pendingNewViewName = event.Name;
    this.pendingNewViewDescription = event.Description;
    this.pendingNewViewIsShared = event.IsShared;
    this.defaultSaveAsNew = true;
    this.showQuickSaveDialog = false;
    this.isConfigPanelOpen = true;
    this.cdr.detectChanges();
  }

  // ========================================
  // DUPLICATE VIEW
  // ========================================

  /**
   * Handle a duplicate request (F-005). Opens the duplicate dialog so the user names the copy.
   * (Generalized from DataExplorer.onDuplicateView.)
   */
  public onDuplicateViewRequested(viewId?: string): void {
    const targetId = viewId || this.currentViewEntity?.ID;
    if (!targetId || !this._entity) {
      return;
    }

    const allViews = [...(this.viewSelectorRef?.MyViews ?? []), ...(this.viewSelectorRef?.SharedViews ?? [])];
    const viewItem = allViews.find(v => v.id === targetId);
    this.duplicateTargetViewId = targetId;
    this.duplicateSourceViewName = viewItem?.name || this.currentViewEntity?.Name || 'View';
    this.duplicateSummary = this.buildDuplicateSummary(viewItem?.entity ?? this.currentViewEntity);
    this.showDuplicateDialog = true;
    this.cdr.detectChanges();
  }

  /** Build a {@link ViewConfigSummary} from a view entity for the duplicate dialog. */
  private buildDuplicateSummary(view: MJUserViewEntityExtended | null): ViewConfigSummary | null {
    if (!view) {
      return null;
    }
    let columnCount = 0;
    let filterCount = 0;
    let sortCount = 0;

    try {
      const gridState = view.GridStateObject;
      if (gridState?.columnSettings && Array.isArray(gridState.columnSettings)) {
        columnCount = gridState.columnSettings.filter((c: MJUserViewEntity_IGridColumnSetting) => !c.hidden).length;
      }
    } catch {
      /* ignore parse errors */
    }
    try {
      const filterState = view.FilterStateObject;
      if (filterState?.filters?.length) {
        filterCount = filterState.filters.length;
      }
    } catch {
      /* ignore parse errors */
    }
    try {
      const sortState = view.SortStateObject;
      if (Array.isArray(sortState)) {
        sortCount = sortState.length;
      }
    } catch {
      /* ignore parse errors */
    }

    return {
      ColumnCount: columnCount,
      FilterCount: filterCount,
      SortCount: sortCount,
      SmartFilterActive: view.SmartFilterEnabled || false,
      SmartFilterPrompt: view.SmartFilterPrompt || '',
      AggregateCount: 0
    };
  }

  /**
   * Handle the duplicate dialog confirmation. When {@link AutoSaveView}, loads the source view,
   * copies its config into a new personal view, and persists it; otherwise emits
   * {@link DuplicateViewRequested}. (Generalized from DataExplorer.onDuplicateConfirmed.)
   */
  public async onDuplicateConfirmed(event: DuplicateViewEvent): Promise<void> {
    this.showDuplicateDialog = false;
    const targetId = this.duplicateTargetViewId;
    this.duplicateTargetViewId = null;
    if (!targetId || !this._entity) {
      return;
    }

    if (!this.AutoSaveView) {
      this.DuplicateViewRequested.emit({ sourceViewId: targetId, newName: event.Name });
      return;
    }

    await this.persistDuplicate(targetId, event.Name);
  }

  /** Load the source view, copy its config into a new personal view, and persist it. */
  private async persistDuplicate(sourceViewId: string, newName: string): Promise<void> {
    const provider = this.ProviderToUse;
    const sourceView = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', provider.CurrentUser);
    const loaded = await sourceView.Load(sourceViewId);
    if (!loaded) {
      LogError(`[ViewWorkspace] Could not load view to duplicate: ${sourceView.LatestResult?.CompleteMessage ?? 'not found'}`);
      return;
    }

    const newView = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', provider.CurrentUser);
    newView.Name = newName;
    newView.Description = sourceView.Description || '';
    newView.EntityID = sourceView.EntityID;
    newView.UserID = provider.CurrentUser.ID;
    newView.IsShared = false;
    newView.IsDefault = false;
    newView.GridState = sourceView.GridState;
    newView.FilterState = sourceView.FilterState;
    newView.SortState = sourceView.SortState;
    newView.SmartFilterEnabled = sourceView.SmartFilterEnabled || false;
    newView.SmartFilterPrompt = sourceView.SmartFilterPrompt || '';

    const saved = await newView.Save();
    if (!saved) {
      LogError(`[ViewWorkspace] Failed to duplicate view: ${newView.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      return;
    }

    // Keep the UserViewEngine cache in sync with the DB write so the subsequent LoadViews()
    // reflects the duplicated view.
    await UserViewEngine.Instance.RefreshCache();

    await this.viewSelectorRef?.LoadViews();
    this.AfterViewSave.emit({ View: newView, IsNew: true });
  }

  /** Handle the duplicate dialog cancel. */
  public onDuplicateCancel(): void {
    this.showDuplicateDialog = false;
    this.duplicateTargetViewId = null;
    this.cdr.detectChanges();
  }

  /** Handle duplicate triggered from the config panel — duplicate the selected view. */
  public onDuplicateFromPanel(): void {
    if (this.currentViewEntity?.ID) {
      this.isConfigPanelOpen = false;
      this.onDuplicateViewRequested(this.currentViewEntity.ID);
    }
  }

  // ========================================
  // REVERT
  // ========================================

  /**
   * Handle a revert request (F-007). Re-parses the saved view's grid state, clears the modified
   * flag, and reloads. (Generalized from DataExplorer.onRevertView.)
   */
  public async onRevertView(): Promise<void> {
    if (!this.currentViewEntity) {
      return;
    }
    const gridState = this.parseViewGridState(this.currentViewEntity);
    if (gridState) {
      this.currentGridState = gridState;
    }
    this.viewModified = false;
    await this.entityViewerRef?.LoadData();
    this.cdr.detectChanges();
  }

  // ========================================
  // GRID/SORT/FILTER STATE BUILDERS
  // (Generalized from DataExplorer — no state-service / selectedEntity coupling.)
  // ========================================

  /**
   * Build a `GridState` (Kendo-compatible) from the save event. Priority: explicit columns from the
   * config panel → live grid state → entity `DefaultInView` fields. Returns null when no columns.
   */
  private buildGridState(event: ViewSaveEvent): MJUserViewEntity_IGridState | null {
    let columnSettings: MJUserViewEntity_IGridColumnSetting[];

    if (event.Columns.length > 0) {
      columnSettings = event.Columns.map((col, idx) => ({
        ID: col.fieldId,
        Name: col.fieldName,
        DisplayName: col.displayName,
        userDisplayName: col.userDisplayName,
        hidden: false,
        width: col.width || undefined,
        orderIndex: idx,
        format: col.format
      }));
    } else if (this.currentGridState?.columnSettings && this.currentGridState.columnSettings.length > 0) {
      columnSettings = this.currentGridState.columnSettings;
    } else if (this._entity) {
      columnSettings = this._entity.Fields
        .filter(f => f.DefaultInView)
        .map((f, idx) => ({
          ID: f.ID,
          Name: f.Name,
          DisplayName: f.DisplayNameOrName,
          hidden: false,
          width: f.DefaultColumnWidth || undefined,
          orderIndex: idx
        }));
      if (columnSettings.length === 0) {
        return null;
      }
    } else {
      return null;
    }

    const sortSettings = this.buildGridSortSettings(event);
    let aggregates = event.AggregatesConfig ?? undefined;
    if (!aggregates && this.currentGridState?.aggregates) {
      aggregates = this.currentGridState.aggregates;
    }

    return { columnSettings, sortSettings, aggregates };
  }

  /** Build grid sort settings (`{field, dir}[]`) from the save event, falling back to live state. */
  private buildGridSortSettings(event: ViewSaveEvent): MJUserViewEntity_IGridSortSetting[] | undefined {
    if (event.SortItems && event.SortItems.length > 0) {
      return event.SortItems.map(item => ({ field: item.field, dir: item.direction }));
    }
    if (event.SortField) {
      return [{ field: event.SortField, dir: event.SortDirection }];
    }
    if (this.currentGridState?.sortSettings && this.currentGridState.sortSettings.length > 0) {
      return this.currentGridState.sortSettings;
    }
    return undefined;
  }

  /** Build a `SortState` (`{field, direction}[]`) from the save event. Returns null when no sort. */
  private buildSortState(event: ViewSaveEvent): MJUserViewEntity_ISortStateItem[] | null {
    if (event.SortItems && event.SortItems.length > 0) {
      return event.SortItems.map(item => ({ field: item.field, direction: item.direction }));
    }
    if (event.SortField) {
      return [{ field: event.SortField, direction: event.SortDirection }];
    }
    return null;
  }

  /** Serialize the filter state to JSON, defaulting to an empty Kendo filter. */
  private buildFilterStateJson(event: ViewSaveEvent): string {
    return event.FilterState
      ? JSON.stringify(event.FilterState)
      : JSON.stringify({ logic: 'and', filters: [] });
  }

  // ========================================
  // GRID STATE PARSE / DEFAULTS
  // ========================================

  /**
   * Parse a view's `GridState` into a {@link ViewGridState}, validating columns/sorts against the
   * current entity to avoid stale fields from a previous entity. Returns null when no valid columns.
   */
  private parseViewGridState(view: MJUserViewEntityExtended): ViewGridState | null {
    if (!view.GridState) {
      return null;
    }
    try {
      const parsed = view.GridStateObject;
      if (parsed && Array.isArray(parsed.columnSettings)) {
        const validColumns = this._entity
          ? parsed.columnSettings.filter(
              (col: MJUserViewEntity_IGridColumnSetting) => this._entity!.Fields.some(f => f.Name === col.Name)
            )
          : parsed.columnSettings;
        const validSorts = this._entity
          ? (parsed.sortSettings || []).filter(
              (s: MJUserViewEntity_IGridSortSetting) => this._entity!.Fields.some(f => f.Name === s.field)
            )
          : parsed.sortSettings || [];

        if (validColumns.length > 0) {
          return {
            columnSettings: validColumns,
            sortSettings: validSorts,
            aggregates: parsed.aggregates || undefined
          };
        }
      }
      return null;
    } catch (error) {
      LogError(`[ViewWorkspace] Failed to parse GridState: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Load the per-user default grid state for the current entity from `UserInfoEngine`, validating
   * columns/sorts against the entity. Returns null when none saved.
   */
  private loadUserDefaultGridState(): ViewGridState | null {
    if (!this._entity) {
      return null;
    }
    try {
      const settingKey = `default-view-setting/${this._entity.Name}`;
      const savedState = UserInfoEngine.Instance.GetSetting(settingKey);
      if (savedState) {
        const gridState = JSON.parse(savedState);
        if (gridState && Array.isArray(gridState.columnSettings)) {
          const validColumns = gridState.columnSettings.filter(
            (col: { Name: string }) => this._entity!.Fields.some(f => f.Name === col.Name)
          );
          const validSorts = (gridState.sortSettings || []).filter(
            (s: { field: string }) => this._entity!.Fields.some(f => f.Name === s.field)
          );
          if (validColumns.length > 0) {
            return { columnSettings: validColumns, sortSettings: validSorts };
          }
        }
      }
    } catch (error) {
      LogError(`[ViewWorkspace] Failed to load user default grid state: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}
