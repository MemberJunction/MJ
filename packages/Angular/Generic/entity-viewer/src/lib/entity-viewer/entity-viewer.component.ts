import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, NgZone, ViewContainerRef, ComponentRef, reflectComponentType } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { EntityInfo, EntityFieldInfo, RunView, LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJUserViewEntityExtended, UserInfoEngine } from '@memberjunction/core-entities';
import { buildCompositeKey, buildPkString } from '../utils/record.util';
import { PageChangeEvent } from '@memberjunction/ng-pagination';
import {
  EntityViewerConfig,
  DEFAULT_VIEWER_CONFIG,
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  SortState,
  PaginationState,
  ViewGridState
} from '../types';
import { IViewTypeDescriptor, IViewRenderer, ViewTypeEngine, ViewDataRequest, ViewRelatedRecordNavigation } from '../view-types';

/**
 * A single entry in the view-type switcher, built from the {@link ViewTypeEngine} registry
 * (`MJ: View Types`). Every view type is a dynamic-mounted plug-in implementing `IViewRenderer`;
 * the container has zero knowledge of any specific view type — it mounts the descriptor's
 * `RendererComponent` and feeds it the generic contract.
 */
export interface ViewModeOption {
  /**
   * Stable key for this option — the descriptor's `Name` (== `MJ: View Types.DriverClass`),
   * e.g. "GridViewType", "ClusterViewType". Used as the `@for` track key and to identify the
   * active option.
   */
  key: string;
  /**
   * Always `null` — retained on the interface only so any external reader doesn't break. Every
   * view type is now dynamic-mounted; there is no legacy built-in render mode.
   */
  mode: null;
  /** User-facing label. */
  label: string;
  /** Font Awesome icon class. */
  icon: string;
  /** Always `true` — every view type is dynamic-mounted via the descriptor's RendererComponent. */
  isDynamic: boolean;
  /** The resolved descriptor (carries the RendererComponent + PropSheetComponent). */
  descriptor: IViewTypeDescriptor;
  /** The `MJ: View Types` row ID — for ViewTypeID persistence + per-view-type config keying. */
  viewTypeId: string;
}

/**
 * Event payload for the view-type change lifecycle. Emitted (cancelable) via
 * {@link EntityViewerComponent.BeforeViewTypeChange} and (notification) via
 * {@link EntityViewerComponent.AfterViewTypeChange}. A handler may set `Cancel = true` on the
 * *Before* event to veto the switch (mirrors the grid's `BeforeRowClick` / `BeforeCellEdit`
 * cancelable pattern).
 */
export interface ViewTypeChangeEventArgs {
  /** The `MJ: View Types` row ID being switched to. */
  ViewTypeID: string;
  /** The descriptor `DriverClass` / Name being switched to (e.g. "ClusterViewType"). */
  DriverClass: string;
  /** The `MJ: View Types` row ID being switched FROM (null on the first selection). */
  PreviousViewTypeID: string | null;
  /** Set to true in a {@link EntityViewerComponent.BeforeViewTypeChange} handler to veto the switch. */
  Cancel: boolean;
}

/**
 * Event payload for the per-view-type configuration change lifecycle.
 */
export interface ViewTypeConfigChangeEventArgs {
  /** The `MJ: View Types` row ID whose config changed. */
  ViewTypeID: string;
  /** The new configuration payload (shape owned by the plug-in). */
  Config: Record<string, unknown>;
  /** Set to true in a {@link EntityViewerComponent.BeforeViewTypeConfigChange} handler to veto. */
  Cancel: boolean;
}

/**
 * Where the entity viewer persists view-type/render-state when {@link EntityViewerComponent.AutoSaveView}
 * is enabled:
 * - `'record'` — onto the loaded `UserView` row (shared; everyone who opens that view sees it).
 * - `'user-settings'` — per-user via `UserInfoEngine` (the default-view case, or a personal layer).
 * - `'none'` — nothing to persist to (no view + settings disabled).
 */
export type ViewPersistenceTarget = 'record' | 'user-settings' | 'none';

/**
 * EntityViewerComponent - Full-featured composite component for viewing entity data
 *
 * This component provides a complete data viewing experience with:
 * - Switchable grid (AG Grid) and card views
 * - Server-side filtering with UserSearchString
 * - Server-side pagination with StartRow/MaxRows
 * - Server-side sorting with OrderBy
 * - Selection handling with configurable behavior
 * - Loading, empty, and error states
 * - Beautiful pagination UI with "Load More" pattern
 *
 * @example
 * ```html
 * <!-- Basic usage - loads data automatically -->
 * <mj-entity-viewer
 *   [Entity]="selectedEntity"
 *   (RecordSelected)="onRecordSelected($event)"
 *   (RecordOpened)="onRecordOpened($event)">
 * </mj-entity-viewer>
 *
 * <!-- With external state control (like Data Explorer) -->
 * <mj-entity-viewer
 *   [Entity]="selectedEntity"
 *   [ViewTypeID]="state.viewTypeId"
 *   [FilterText]="state.filterText"
 *   [SelectedRecordID]="state.selectedRecordId"
 *   (RecordSelected)="onRecordSelected($event)"
 *   (RecordOpened)="onRecordOpened($event)">
 * </mj-entity-viewer>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-entity-viewer',
  templateUrl: './entity-viewer.component.html',
  styleUrls: ['./entity-viewer.component.css'],
  host: {
    'style': 'display: block; height: 100%;'
  }
})
export class EntityViewerComponent extends BaseAngularComponent implements OnInit, OnDestroy  {
  /**
   * Safety cap on the number of records loaded when a plug-in renderer asks the container to
   * load the full set (via a {@link ViewDataRequest} with `loadAll: true`). Prevents unbounded
   * queries on very large entities. Generic — not tied to any specific view type.
   */
  private static readonly LOAD_ALL_MAX_RECORDS = 10000;

  // ========================================
  // INPUTS (using getter/setter pattern)
  // ========================================

  private _entity: EntityInfo | null = null;
  private _records: Record<string, unknown>[] | null = null;
  private _config: Partial<EntityViewerConfig> = {};
  private _filterText: string | null = null;
  private _sortState: SortState | null = null;
  private _viewEntity: MJUserViewEntityExtended | null = null;
  private _initialized = false;

  /**
   * When true, the next {@link LoadData} loads the full record set (up to
   * {@link LOAD_ALL_MAX_RECORDS}) instead of paginating. Set generically from a plug-in's
   * {@link ViewDataRequest} (`loadAll`) — never from any view-type check.
   */
  private _loadAllRecords = false;

  /** Whether a deferred reload has been queued via deferReload() */
  private _reloadDeferred = false;

  /**
   * The entity to display records for
   */
  @Input()
  get Entity(): EntityInfo | null {
    return this._entity;
  }
  set Entity(value: EntityInfo | null) {
    const previousEntity = this._entity;
    this._entity = value;

    const entityChanged = !!(this._initialized && value && previousEntity && !UUIDsEqual(value.ID, previousEntity.ID));

    // On a real entity change, drop per-entity state BEFORE we recompute view types + re-seed config,
    // so the new entity starts clean:
    //  - The per-view-type config map (grid columnSettings, timeline date field, …) is per-ENTITY.
    //    Keeping the old entity's config applies its columnSettings to the new entity, so only fields
    //    common to both survive (e.g. just Name/Description) — the "no/too-few columns" symptom.
    //  - The loaded UserView record belongs to the old entity; clear it so re-seeding reads the new
    //    entity's saved view / per-user default-view setting.
    //  - Sort state references old-entity fields and would produce an invalid ORDER BY.
    if (entityChanged) {
      if (this._viewEntity && value && !UUIDsEqual(this._viewEntity.EntityID, value.ID)) {
        this._viewEntity = null;
      }
      this.viewTypeConfigById.clear();
      this.InternalSortState = null;
      // Throw out the cached plug-in instances — they belong to the previous entity. The next
      // selection rebuilds them fresh for the new entity (correct columns / date fields / geo).
      this.clearDynamicRendererCache();
    }

    // Recompute available view types for the new entity from the registry (if loaded). This also
    // re-seeds the per-view-type config from the NEW entity's saved view / default-view setting
    // (now that the stale map was cleared above). Falls back silently when the registry has no data.
    this.refreshAvailableViewTypes();

    if (this._initialized) {

      if (value && !this._records) {
        // Reset state for new entity - synchronously clear all data and force change detection
        // before starting the async load to prevent stale data display
        this.resetPaginationState();
        this.InternalRecords = [];
        this.TotalRecordCount = 0;
        this.FilteredRecordCount = 0;
        this.cdr.detectChanges();
        // Defer the actual load so all input bindings (viewEntity, gridState, etc.)
        // complete before we fire the RunView — prevents duplicate loads with stale state
        this.deferReload();
      } else if (!value) {
        this.InternalRecords = [];
        this.TotalRecordCount = 0;
        this.FilteredRecordCount = 0;
        this.resetPaginationState();
        this.cdr.detectChanges();
      }

      // The cache was thrown out above, so re-create the active view type FRESH for the new entity
      // (unless refreshAvailableViewTypes already re-selected because the active type became
      // unavailable). This rebuilds columns / date fields / geo cleanly; records flow in via the
      // deferred reload. The container stays generic — it re-creates whatever plug-in is active
      // without knowing what it is.
      if (entityChanged && !this.dynamicRendererRef) {
        const activeOption = this.AvailableViewTypes.find(o => o.key === this.ActiveViewTypeKey) ?? this.AvailableViewTypes[0];
        if (activeOption) {
          this.ActiveViewTypeKey = activeOption.key;
          this.ActiveDynamicOption = activeOption;
          this.selectDynamicRenderer(activeOption);
        }
      }
    }
  }

  /**
   * Convenience input: the entity to display by **name**. Resolved internally to an `EntityInfo`
   * via the active provider and applied through the {@link entity} setter. Use this OR `[entity]`
   * OR `[EntityID]` — whichever is most convenient for the consumer.
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
   * Convenience input: the entity to display by **ID**. Resolved internally to an `EntityInfo`
   * and applied through the {@link entity} setter.
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
   * Convenience input: load and display a saved view by its `MJ: User Views` **ID**. The viewer
   * loads the record via the active provider and applies it through the {@link viewEntity} setter
   * (which also resolves the entity if `[entity]`/`[EntityName]`/`[EntityID]` weren't supplied).
   */
  @Input()
  set ViewID(value: string | null) {
    if (value) {
      void this.loadViewById(value);
    }
  }

  /**
   * Pre-loaded records (optional - if not provided, component loads data)
   */
  @Input()
  get Records(): Record<string, unknown>[] | null {
    return this._records;
  }
  set Records(value: Record<string, unknown>[] | null) {
    this._records = value;

    if (value) {
      this.InternalRecords = value;
      this.TotalRecordCount = value.length;
      this.FilteredRecordCount = value.length;
      this.pushDynamicRendererInputs();
    }
  }

  /**
   * Configuration options for the viewer
   */
  @Input()
  get Config(): Partial<EntityViewerConfig> {
    return this._config;
  }
  set Config(value: Partial<EntityViewerConfig>) {
    this._config = value;
    this.applyConfig();
  }

  /**
   * Currently selected record ID (primary key string)
   */
  @Input()
  get SelectedRecordID(): string | null {
    return this._selectedRecordId;
  }
  set SelectedRecordID(value: string | null) {
    this._selectedRecordId = value;
    this.pushDynamicRendererInputs();
  }
  private _selectedRecordId: string | null = null;

  /**
   * External filter text - allows parent to control filter
   * Supports two-way binding: [(filterText)]="state.filterText"
   */
  @Input()
  get FilterText(): string | null {
    return this._filterText;
  }
  set FilterText(value: string | null) {
    const oldFilter = this.DebouncedFilterText;
    this._filterText = value;

    const newFilter = value ?? '';
    this.InternalFilterText = newFilter;
    this.DebouncedFilterText = newFilter;

    if (this._initialized) {
      // If server-side filtering and filter changed, reload from page 1
      // Keep existing records visible during refresh for better UX
      if (this.EffectiveConfig.serverSideFiltering && newFilter !== oldFilter && !this._records) {
        this.resetPaginationState(false);
        this.LoadData();
      } else {
        this.updateFilteredCount();
      }
      this.cdr.detectChanges();
    }
  }

  /**
   * External sort state - allows parent to control sorting
   */
  @Input()
  get SortState(): SortState | null {
    return this._sortState;
  }
  set SortState(value: SortState | null) {
    const oldSort = this.InternalSortState;
    this._sortState = value;

    if (value !== null) {
      this.InternalSortState = value;

      if (this._initialized) {
        // If sort changed and using server-side sorting, reload
        // Keep existing records visible during refresh for better UX
        if (this.EffectiveConfig.serverSideSorting && !this._records) {
          const sortChanged = !oldSort || !value ||
            oldSort.field !== value.field ||
            oldSort.direction !== value.direction;

          if (sortChanged) {
            this.resetPaginationState(false);
            this.LoadData();
          }
        }
      }
    }
  }

  /**
   * Optional User View entity that provides view configuration
   * When provided, the component will use the view's WhereClause, GridState, SortState, etc.
   * The view's filter is additive - UserSearchString is applied ON TOP of the view's WhereClause
   */
  @Input()
  get ViewEntity(): MJUserViewEntityExtended | null {
    return this._viewEntity;
  }
  set ViewEntity(value: MJUserViewEntityExtended | null) {
    const previousViewId = this._viewEntity?.ID ?? null;
    const nextViewId = value?.ID ?? null;
    const viewChanged = this._initialized && previousViewId !== nextViewId;
    this._viewEntity = value;

    // A changed view (including default↔saved and saved↔different) is a new data context: throw out
    // the cached plug-in instances + per-view-type config so they rebuild/re-seed from the new view.
    if (viewChanged) {
      this.viewTypeConfigById.clear();
      this.clearDynamicRendererCache();
    }

    // Re-resolve available view types + the initial view type/config from the new view record
    // (self-contained: the viewer reads ViewTypeID + DisplayState.viewTypeConfigs off the record).
    this.refreshAvailableViewTypes();

    // If the cache was thrown out but refreshAvailableViewTypes didn't re-select (active type still
    // valid), re-create the active view type fresh for the new view.
    if (viewChanged && !this.dynamicRendererRef) {
      const activeOption = this.AvailableViewTypes.find(o => o.key === this.ActiveViewTypeKey) ?? this.AvailableViewTypes[0];
      if (activeOption) {
        this.ActiveViewTypeKey = activeOption.key;
        this.ActiveDynamicOption = activeOption;
        this.selectDynamicRenderer(activeOption);
      }
    }

    if (this._initialized && this._entity && !this._records) {
      // Apply view's sort state if available, then defer the reload.
      // Deferring ensures all sibling input bindings (gridState, etc.) are
      // updated before we fire the RunView — prevents duplicate loads.
      this.applySortStateFromView(value);
      this.resetPaginationState();
      this.deferReload();
    }
  }

  /**
   * Grid state configuration from a User View
   * Controls column visibility, widths, order, and sort settings
   */
  @Input() GridState: ViewGridState | null = null;

  /**
   * Whether to render the Recycle Bin chip in the viewer header.
   * The chip auto-hides itself when the entity has no deleted records,
   * doesn't track changes, or the user lacks Delete permission — so it
   * stays out of the way on entities where it's not relevant.
   * @default true
   */
  @Input() ShowRecycleBin: boolean = true;

  // ========================================
  // OUTPUTS
  // ========================================

  /**
   * Emitted when a record is selected (single click)
   */
  @Output() RecordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when a record should be opened (double-click or open button)
   */
  @Output() RecordOpened = new EventEmitter<RecordOpenedEvent>();

  /**
   * Emitted when data is loaded
   */
  @Output() DataLoaded = new EventEmitter<DataLoadedEvent>();

  /**
   * Emitted when filter text changes (for two-way binding)
   */
  @Output() FilterTextChange = new EventEmitter<string>();

  /**
   * Emitted when filtered count changes
   */
  @Output() FilteredCountChanged = new EventEmitter<FilteredCountChangedEvent>();

  /**
   * NAVIGATION request bubbled up from a plug-in renderer to open a *related* record on a
   * (possibly different) entity — e.g. a grid foreign-key drill-through. Routing lives in the
   * outer app, so this is one of the few signals that legitimately bubbles up. The container
   * forwards it untouched.
   */
  @Output() OpenRelatedRecordRequested = new EventEmitter<ViewRelatedRecordNavigation>();

  /**
   * NAVIGATION request bubbled up from a plug-in renderer to create a new record of the current
   * entity (e.g. a grid's "New" button). Opening the create form is a routing concern owned by
   * the outer app; the container forwards it without acting on it.
   */
  @Output() CreateRecordRequested = new EventEmitter<void>();

  /**
   * The initial/active view type to open in, by `MJ: View Types` row ID. Hosts that persist
   * the selection (e.g. Explorer's `UserView.ViewTypeID`) bind this so the viewer opens in the
   * saved type — built-in OR plug-in. Applied once the registry resolves; later user switches
   * emit {@link viewTypeChange} for the host to persist.
   */
  @Input()
  set ViewTypeID(value: string | null) {
    this._initialViewTypeId = value;
    // If options are already loaded, apply immediately; otherwise refreshAvailableViewTypes will.
    if (value && this.AvailableViewTypes.length > 0) {
      const opt = this.AvailableViewTypes.find(o => o.viewTypeId === value);
      if (opt && opt.key !== this.ActiveViewTypeKey) {
        this.applyViewTypeSelection(opt, false);
      }
    }
  }
  get ViewTypeID(): string | null {
    return this._initialViewTypeId;
  }
  private _initialViewTypeId: string | null = null;

  // ========================================
  // INTERNAL STATE
  // ========================================

  /**
   * The view-type options shown in the switcher, sourced from {@link ViewTypeEngine}
   * (the `MJ: View Types` registry), filtered by each descriptor's availability predicate.
   * Every option is a dynamic-mounted plug-in.
   */
  public AvailableViewTypes: ViewModeOption[] = [];

  /** Whether the registry (ViewTypeEngine) successfully sourced the available view types. */
  public ViewTypesFromRegistry: boolean = false;

  /**
   * The currently-active view type's stable key (descriptor Name). Null until the registry resolves.
   */
  public ActiveViewTypeKey: string | null = null;

  /**
   * The currently-active view type's option (the plug-in being mounted). Null until the
   * registry resolves / a type is selected. Drives the dynamic-mount host in the template.
   */
  public ActiveDynamicOption: ViewModeOption | null = null;

  /** True once a plug-in view type is mounted (drives the dynamic host's visibility). */
  public get IsDynamicViewActive(): boolean {
    return this.ActiveDynamicOption !== null;
  }

  /** Whether the view-type dropdown menu is currently open. */
  public ViewTypeDropdownOpen = false;

  /**
   * Per-view-type configuration payloads, keyed by `MJ: View Types` row ID. Seeded from
   * {@link viewTypeConfigsInput} and updated as plug-in renderers emit config changes;
   * handed to each dynamic renderer on mount.
   */
  private viewTypeConfigById = new Map<string, Record<string, unknown>>();

  /**
   * Per-view-type configuration provided by the host (e.g. Explorer reading
   * `UserView.DisplayState.viewTypeConfigs`). The active type is controlled separately via
   * the `viewMode` / ViewTypeID inputs; this carries only the config payloads.
   */
  @Input()
  set ViewTypeConfigs(value: Array<{ viewTypeId: string; config: Record<string, unknown> }> | null) {
    this.viewTypeConfigById.clear();
    for (const entry of value ?? []) {
      if (entry?.viewTypeId) {
        this.viewTypeConfigById.set(entry.viewTypeId, entry.config ?? {});
      }
    }
    if (this.dynamicRendererRef && this.ActiveDynamicOption) {
      this.pushDynamicRendererInputs();
    }
  }

  /**
   * When true, the viewer persists view-type/config changes itself — to the loaded `UserView`
   * record (when a `ViewEntity`/`ViewID` is present) or to per-user User Settings (the default-view
   * case). When false (the default), the viewer only emits the `Before…`/`After…` events and the
   * consumer is responsible for persistence. Persistence is provider-based (generic-safe) — never
   * routing, which stays with the host app.
   */
  @Input() AutoSaveView: boolean = false;

  /**
   * Emitted (cancelable) BEFORE the active view type changes. A handler may set
   * `args.Cancel = true` to veto the switch. Fires for both built-in and plug-in types.
   */
  @Output() BeforeViewTypeChange = new EventEmitter<ViewTypeChangeEventArgs>();

  /**
   * Emitted AFTER the active view type has changed (and, when {@link AutoSaveView} is on, after
   * it has been persisted). Notification only.
   */
  @Output() AfterViewTypeChange = new EventEmitter<ViewTypeChangeEventArgs>();

  /**
   * Emitted (cancelable) BEFORE a plug-in renderer's configuration change is applied/persisted.
   */
  @Output() BeforeViewTypeConfigChange = new EventEmitter<ViewTypeConfigChangeEventArgs>();

  /**
   * Emitted AFTER a plug-in renderer's configuration change has been applied (and persisted when
   * {@link AutoSaveView} is on).
   */
  @Output() AfterViewTypeConfigChange = new EventEmitter<ViewTypeConfigChangeEventArgs>();

  /** Anchor for dynamically-mounted plug-in view renderers. */
  @ViewChild('dynamicViewHost', { read: ViewContainerRef }) private dynamicViewHost?: ViewContainerRef;

  /** The currently-ACTIVE (visible) plug-in renderer, if any. */
  private dynamicRendererRef: ComponentRef<IViewRenderer> | null = null;

  /** Input names the active plug-in declares (from `reflectComponentType`), used to push only the
   *  generic inputs it accepts. Mirrors the active cache entry's input set. */
  private dynamicInputNames = new Set<string>();

  /**
   * Cache of mounted plug-in renderer instances for the CURRENT data context (entity + view),
   * keyed by `MJ: View Types` row ID. Switching view types within the same entity+view SHOWS/HIDES
   * cached instances (preserving their state — e.g. a computed cluster scatter, grid scroll) instead
   * of destroy/recreate. The whole cache is destroyed + rebuilt only when the data context changes:
   * entity change, or view (record / ViewID, including default↔saved) change. See
   * {@link clearDynamicRendererCache}.
   */
  private dynamicRendererCache = new Map<string, { ref: ComponentRef<IViewRenderer>; inputs: Set<string> }>();

  public InternalFilterText: string = '';
  public DebouncedFilterText: string = '';
  public IsLoading: boolean = false;
  public LoadingMessage: string = 'Loading...';
  public InternalRecords: Record<string, unknown>[] = [];
  public TotalRecordCount: number = 0;
  public FilteredRecordCount: number = 0;

  /** Track which records matched on hidden (non-visible) fields */
  public HiddenFieldMatches = new Map<string, string>();

  /** Current sort state */
  public InternalSortState: SortState | null = null;

  /** Pagination state */
  public Pagination: PaginationState = {
    currentPage: 0,
    pageSize: 100,
    totalRecords: 0,
    hasMore: false,
    isLoading: false
  };

  private destroy$ = new Subject<void>();
  private filterInput$ = new Subject<string>();

  /** Track if this is the first load (vs. load more) */
  private isInitialLoad: boolean = true;

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
  super();}

  // ========================================
  // PUBLIC METHODS
  // ========================================

  /**
   * Hook retained for hosts (e.g. the workspace) that call this before switching views/entities.
   * View-type-specific persistence (e.g. a grid's live column/sort state) is now owned by the
   * mounted plug-in renderer, so the container has nothing to flush — this is a no-op.
   */
  public EnsurePendingChangesSaved(): void {
    // no-op: plug-in renderers own their own pending-state persistence
  }

  // ========================================
  // COMPUTED PROPERTIES
  // ========================================

  /**
   * Get the effective entity - uses entity input if provided, otherwise derives from viewEntity
   * This allows callers to provide just a viewEntity without explicitly setting the entity input.
   * Uses fallback resolution when ViewEntityInfo is not available.
   */
  get EffectiveEntity(): EntityInfo | null {
    if (this.Entity) {
      return this.Entity;
    }
    // Auto-derive from viewEntity if available
    if (this.ViewEntity) {
      return this.getEntityInfoFromViewEntity(this.ViewEntity);
    }
    return null;
  }

  /**
   * Gets EntityInfo from a ViewEntity with multiple fallback strategies.
   * Priority: 1) ViewEntityInfo property (set by Load)
   *           2) Entity name lookup (virtual field)
   *           3) EntityID lookup
   * Returns null if entity cannot be determined.
   */
  private getEntityInfoFromViewEntity(viewEntity: MJUserViewEntityExtended): EntityInfo | null {
    // First try: ViewEntityInfo is the preferred source (set by MJUserViewEntityExtended.Load)
    if (viewEntity.ViewEntityInfo) {
      return viewEntity.ViewEntityInfo;
    }

    const md = this.ProviderToUse;

    // Second try: Look up by Entity name (virtual field that returns entity name)
    if (viewEntity.Entity) {
      const entityByName = md.Entities.find(e => e.Name === viewEntity.Entity);
      if (entityByName) {
        return entityByName;
      }
    }

    // Third try: Look up by EntityID
    if (viewEntity.EntityID) {
      const entityById = md.Entities.find(e => UUIDsEqual(e.ID, viewEntity.EntityID));
      if (entityById) {
        return entityById;
      }
    }

    console.warn(`[EntityViewer] Could not determine entity for view "${viewEntity.Name}" (ID: ${viewEntity.ID})`);
    return null;
  }

  /**
   * Get the effective filter text (external or internal)
   */
  get EffectiveFilterText(): string {
    return this.FilterText ?? this.InternalFilterText;
  }

  /**
   * Get the effective sort state (external or internal)
   */
  get EffectiveSortState(): SortState | null {
    return this.SortState ?? this.InternalSortState;
  }

  /**
   * Get merged configuration with defaults
   */
  get EffectiveConfig(): Required<EntityViewerConfig> {
    return { ...DEFAULT_VIEWER_CONFIG, ...this.Config };
  }

  /**
   * Get the records to display (external or internal)
   */
  get DisplayRecords(): Record<string, unknown>[] {
    return this.Records ?? this.InternalRecords;
  }

  /**
   * Get filtered records - when using server-side filtering, records are already filtered
   * When using client-side filtering, apply filter locally
   */
  get FilteredRecords(): Record<string, unknown>[] {
    const records = this.DisplayRecords;

    // If server-side filtering is enabled, records are already filtered
    if (this.EffectiveConfig.serverSideFiltering) {
      return records;
    }

    // Client-side filtering fallback
    const filterText = this.DebouncedFilterText?.trim().toLowerCase();
    this.HiddenFieldMatches.clear();

    if (!filterText || !this.Entity) {
      return records;
    }

    const visibleFields = this.getVisibleFieldNames();

    return records.filter(record => {
      const matchResult = this.recordMatchesFilter(record, filterText, visibleFields);
      if (matchResult.matches && matchResult.matchedField && !matchResult.matchedInVisibleField) {
        const recordKey = buildPkString(record, this.Entity!);
        this.HiddenFieldMatches.set(recordKey, matchResult.matchedField);
      }
      return matchResult.matches;
    });
  }

  /**
   * Check if a record matches the filter text (client-side)
   */
  private recordMatchesFilter(
    record: Record<string, unknown>,
    filterText: string,
    visibleFields: Set<string>
  ): { matches: boolean; matchedField: string | null; matchedInVisibleField: boolean } {
    if (!this.Entity) return { matches: true, matchedField: null, matchedInVisibleField: false };

    let matchedField: string | null = null;
    let matchedInVisibleField = false;

    for (const field of this.Entity.Fields) {
      if (!this.shouldSearchField(field)) continue;

      const value = record[field.Name];
      if (value == null) continue;

      const stringValue = String(value).toLowerCase();
      if (this.matchesSearchTerm(stringValue, filterText)) {
        matchedField = field.Name;
        if (visibleFields.has(field.Name)) {
          matchedInVisibleField = true;
          break;
        }
      }
    }

    return {
      matches: matchedField !== null,
      matchedField,
      matchedInVisibleField
    };
  }

  /**
   * Determine if a field should be included in search
   */
  private shouldSearchField(field: EntityFieldInfo): boolean {
    if (field.Name.startsWith('__mj_')) return false;
    if (field.TSType === 'Date') return false;
    if (field.SQLFullType?.trim().toLowerCase() === 'uniqueidentifier') return false;
    return true;
  }

  /**
   * Check if a value matches the search term (supports SQL-style % wildcards)
   */
  private matchesSearchTerm(value: string, searchTerm: string): boolean {
    if (!searchTerm.includes('%')) {
      return value.includes(searchTerm);
    }

    const fragments = searchTerm.split('%').filter(s => s.length > 0);
    if (fragments.length === 0) return true;

    let searchStartIndex = 0;
    for (const fragment of fragments) {
      const foundIndex = value.indexOf(fragment, searchStartIndex);
      if (foundIndex === -1) return false;
      searchStartIndex = foundIndex + fragment.length;
    }
    return true;
  }

  /**
   * Get set of field names that are visible in the current view
   */
  private getVisibleFieldNames(): Set<string> {
    const visible = new Set<string>();
    if (!this.Entity) return visible;

    for (const field of this.Entity.Fields) {
      if (field.DefaultInView === true) {
        visible.add(field.Name);
      }
    }

    if (this.Entity.NameField) {
      visible.add(this.Entity.NameField.Name);
    }

    return visible;
  }

  /**
   * Check if a record matched on a hidden field
   */
  public HasHiddenFieldMatch(record: Record<string, unknown>): boolean {
    if (!this.DebouncedFilterText || !this.Entity) return false;
    return this.HiddenFieldMatches.has(buildPkString(record, this.Entity));
  }

  /**
   * Get the name of the hidden field that matched for display
   */
  public GetHiddenMatchFieldName(record: Record<string, unknown>): string {
    if (!this.Entity) return '';
    const fieldName = this.HiddenFieldMatches.get(buildPkString(record, this.Entity));
    if (!fieldName || !this.Entity) return '';
    const field = this.Entity.Fields.find(f => f.Name === fieldName);
    return field ? field.DisplayNameOrName : fieldName;
  }

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================

  ngOnInit(): void {
    this.applyConfig();
    this.setupFilterDebounce();

    // Initialize debounced filter from external filter text if provided
    if (this.FilterText !== null) {
      this.DebouncedFilterText = this.FilterText;
    }

    // Initialize sort state from config
    if (this.EffectiveConfig.defaultSortField) {
      this.InternalSortState = {
        field: this.EffectiveConfig.defaultSortField,
        direction: this.EffectiveConfig.defaultSortDirection ?? 'asc'
      };
    }

    // Mark as initialized - setters will now trigger data loading
    this._initialized = true;

    // Load the view-type registry and source the available-modes list from it.
    // Fire-and-forget: until it resolves (or if it fails), the template uses the
    // hardcoded fallback switcher, so behavior is unchanged on un-seeded systems.
    void this.ensureViewTypesLoaded();

    // If viewEntity was set before initialization, extract its sort state now.
    // The viewEntity setter skips this when _initialized is false.
    if (this._viewEntity) {
      this.applySortStateFromView(this._viewEntity);
    }

    // If entity was set before initialization, load data now.
    // Use deferReload so all inputs are settled before the first RunView.
    if (this._entity && !this._records) {
      this.deferReload();
    }
  }

  /**
   * Defers a data reload to a microtask so that all Angular input bindings
   * (entity, viewEntity, gridState, etc.) complete before we fire a RunView.
   * Multiple calls within the same change detection cycle collapse into one load.
   */
  private deferReload(): void {
    if (this._reloadDeferred) {
      return; // already queued or in-flight
    }
    this._reloadDeferred = true;
    Promise.resolve().then(async () => {
      try {
        if (this._initialized && this._entity && !this._records) {
          await this.LoadData();
        }
      } finally {
        // Clear only after loadData fully completes (including the async RunView).
        // This prevents any re-entry via deferReload() during the entire load cycle.
        this._reloadDeferred = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.clearDynamicRendererCache();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========================================
  // CONFIGURATION
  // ========================================

  /**
   * Extracts sort state from a view entity, checking ViewSortInfo first then
   * falling back to GridState.sortSettings. Resets internalSortState if the
   * view has no sort defined (prevents stale sort from a previous view).
   */
  private applySortStateFromView(view: MJUserViewEntityExtended | null): void {
    if (!view) {
      this.InternalSortState = null;
      return;
    }

    // Priority 1: SortState column (via ViewSortInfo)
    const viewSortInfo = view.ViewSortInfo;
    if (viewSortInfo && viewSortInfo.length > 0) {
      this.InternalSortState = {
        field: viewSortInfo[0].field,
        direction: viewSortInfo[0].direction?.toLowerCase() === 'desc' ? 'desc' : 'asc'
      };
      return;
    }

    // Priority 2: GridState.sortSettings (sort may only be stored here)
    if (view.GridState) {
      const gridState = view.GridStateObject;
      if (gridState?.sortSettings && gridState.sortSettings.length > 0) {
        const firstSort = gridState.sortSettings[0];
        this.InternalSortState = {
          field: firstSort.field,
          direction: firstSort.dir === 'desc' ? 'desc' : 'asc'
        };
        return;
      }
    }

    // No sort defined — reset to prevent stale sort from previous view
    this.InternalSortState = null;
  }

  private applyConfig(): void {
    const config = this.EffectiveConfig;
    this.Pagination.pageSize = config.pageSize;
  }

  private setupFilterDebounce(): void {
    this.filterInput$
      .pipe(
        debounceTime(this.EffectiveConfig.filterDebounceMs),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(filterText => {
        const oldFilter = this.DebouncedFilterText;
        this.DebouncedFilterText = filterText;
        this.FilterTextChange.emit(filterText);

        // If server-side filtering and filter changed, reload from page 1
        // Keep existing records visible during refresh for better UX
        if (this.EffectiveConfig.serverSideFiltering && filterText !== oldFilter && !this.Records) {
          this.resetPaginationState(false);
          this.LoadData();
        } else {
          this.updateFilteredCount();
        }
        this.pushDynamicRendererInputs();   // client-side filter changed — refresh a mounted plug-in
        this.cdr.detectChanges();
      });
  }

  /**
   * Update the filtered record count and emit event
   */
  private updateFilteredCount(): void {
    const newCount = this.FilteredRecords.length;
    if (this.FilteredRecordCount !== newCount) {
      this.FilteredRecordCount = newCount;
      this.FilteredCountChanged.emit({
        filteredCount: newCount,
        totalCount: this.TotalRecordCount
      });
    }
  }

  /**
   * Reset pagination state for a fresh load.
   * When clearRecords is true (default), clears all record data - use for entity switches.
   * When clearRecords is false, keeps existing records visible during refresh - use for sort/filter changes.
   */
  private resetPaginationState(clearRecords: boolean = true): void {
    this.Pagination = {
      currentPage: 0,
      pageSize: this.EffectiveConfig.pageSize,
      totalRecords: clearRecords ? 0 : this.Pagination.totalRecords,
      hasMore: false,
      isLoading: false
    };
    if (clearRecords) {
      this.InternalRecords = [];
      this.TotalRecordCount = 0;
      this.FilteredRecordCount = 0;
    }
    this.isInitialLoad = true;
  }

  // ========================================
  // DATA LOADING
  // ========================================

  // Sequence counter for tracking load requests and detecting stale responses
  private _loadSequence = 0;
  // Flag: a reload was requested while a load was already in progress
  private _pendingReload = false;

  /**
   * Load data for the current entity with server-side filtering/sorting/pagination
   */
  public async LoadData(): Promise<void> {
    const entity = this.EffectiveEntity;
    if (!entity) {
      this.InternalRecords = [];
      this.TotalRecordCount = 0;
      this.FilteredRecordCount = 0;
      return;
    }

    // Increment sequence to track this load request
    const loadId = ++this._loadSequence;

    // If a load is already in progress, set a flag so we reload once the current
    // load completes. We can't use deferReload() here because the microtask would
    // fire while isLoading is still true, causing an infinite loop.
    if (this.IsLoading) {
      this._pendingReload = true;
      return;
    }

    this.IsLoading = true;
    this.Pagination.isLoading = true;
    this.LoadingMessage = `Loading ${entity.Name}...`;
    this.cdr.detectChanges();

    const startTime = Date.now();
    const config = this.EffectiveConfig;

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Build OrderBy clause
      // Priority: 1) External/internal sort state  2) View's OrderByClause
      //           3) GridState.sortSettings (saved user defaults)  4) undefined
      let orderBy: string | undefined;
      const sortState = this.EffectiveSortState;
      if (config.serverSideSorting && sortState?.field && sortState.direction) {
        orderBy = `${sortState.field} ${sortState.direction.toUpperCase()}`;
      } else if (this.ViewEntity?.OrderByClause) {
        orderBy = this.ViewEntity.OrderByClause;
      } else if (this.GridState?.sortSettings?.length) {
        orderBy = this.GridState.sortSettings
          .map(s => `${s.field} ${(s.dir || 'asc').toUpperCase()}`)
          .join(', ');
      }

      // When a plug-in renderer has asked the container to load the full set (via a generic
      // ViewDataRequest with loadAll:true), load all records up to the safety cap and skip
      // pagination. Otherwise use standard page-based pagination. This is fully view-type-agnostic
      // — the container never inspects which plug-in is mounted.
      const maxRows = this._loadAllRecords ? EntityViewerComponent.LOAD_ALL_MAX_RECORDS : config.pageSize;
      const startRow = this._loadAllRecords ? 0 : this.Pagination.currentPage * config.pageSize;

      // Build ExtraFilter from view's WhereClause if available
      // The view's WhereClause is the "business filter" - UserSearchString is additive
      const extraFilter = this.ViewEntity?.WhereClause || undefined;

      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entity.Name,
        ResultType: 'simple',
        // Load the FULL field set. The container is a generic plug-in host: different view types need
        // different fields (the grid shows its columns, but Timeline needs the date field, Map needs
        // lat/long, etc.). It cannot restrict to any one plug-in's columns, so it fetches all fields and
        // lets each plug-in pick what it needs. (Omitting `Fields` on a 'simple' RunView returns all
        // entity fields.) Previously this used `computeFieldsList(entity, GridState)` — correct when the
        // host WAS the grid, but it dropped `__mj_*` date fields, leaving Timeline with "no events".
        MaxRows: maxRows,
        StartRow: startRow,
        OrderBy: orderBy,
        ExtraFilter: extraFilter,
        // Only use UserSearchString for regular text search, NOT for smart filters
        // Smart filters generate WhereClause via AI on the server, so the prompt text should not be passed as UserSearchString
        UserSearchString: config.serverSideFiltering && !this.ViewEntity?.SmartFilterEnabled
          ? this.DebouncedFilterText || undefined
          : undefined
      });

      // Check if this load is still the current one (detect stale responses)
      if (loadId !== this._loadSequence) {
        return;
      }

      if (result.Success) {

        // Always replace records (page-based navigation, not accumulation)
        this.InternalRecords = result.Results;

        this.TotalRecordCount = result.TotalRowCount;
        this.FilteredRecordCount = this.InternalRecords.length;

        // Update pagination state
        this.Pagination.totalRecords = result.TotalRowCount;
        this.Pagination.hasMore = false; // No longer used with page-based paging

        this.DataLoaded.emit({
          totalRowCount: result.TotalRowCount,
          loadedRowCount: this.InternalRecords.length,
          loadTime: Date.now() - startTime,
          records: this.InternalRecords
        });

        this.FilteredCountChanged.emit({
          filteredCount: this.InternalRecords.length,
          totalCount: result.TotalRowCount
        });
      } else {
        if (this.isInitialLoad) {
          this.InternalRecords = [];
        }
        this.TotalRecordCount = 0;
        this.FilteredRecordCount = 0;
      }
    } catch (error) {
      if (this.isInitialLoad) {
        this.InternalRecords = [];
      }
      this.TotalRecordCount = 0;
      this.FilteredRecordCount = 0;
    } finally {
      // Use ngZone.run() to ensure state changes trigger change detection.
      // With es2022 native async/await + zone.js 0.16, the await resumes
      // outside Angular's zone, so detectChanges() alone may not flush properly.
      this.ngZone.run(() => {
        this.IsLoading = false;
        this.Pagination.isLoading = false;
        this.isInitialLoad = false;
        this.pushDynamicRendererInputs();   // keep a mounted plug-in renderer in sync with new data
        this.cdr.detectChanges();
      });

      // If a reload was requested while we were loading, trigger it now.
      // isLoading is false at this point so loadData() won't re-enter the pending path.
      if (this._pendingReload) {
        this._pendingReload = false;
        this.resetPaginationState();
        this.LoadData();
      }
    }
  }

  /**
   * Handle page change from PaginationComponent
   */
  public OnPageChange(event: PageChangeEvent): void {
    this.Pagination.currentPage = event.PageNumber - 1; // Convert 1-based to 0-based
    this.isInitialLoad = true; // Treat page navigation as a fresh load for loading state
    this.LoadData();
  }

  /**
   * Refresh data (re-load from server, starting at page 1)
   * Keeps existing records visible during refresh for better UX
   */
  public Refresh(): void {
    if (!this.Records) {
      this.resetPaginationState(false);
      this.LoadData();
    }
  }

  // ========================================
  // VIEW MODE
  // ========================================

  /**
   * Loads the ViewTypeEngine once, then recomputes the available view types for the
   * current entity. Fire-and-forget from lifecycle/setters — failures simply leave the
   * switcher empty until the registry is available.
   */
  private async ensureViewTypesLoaded(): Promise<void> {
    try {
      const provider = this.ProviderToUse;
      await ViewTypeEngine.Instance.Config(false, provider?.CurrentUser, provider ?? undefined);
      // Let plug-in descriptors (e.g. Cluster) preload availability data before predicates run.
      await ViewTypeEngine.Instance.EnsureAvailabilityData(provider ?? undefined);
      this.refreshAvailableViewTypes();
    } catch {
      // Engine unavailable / not seeded — leave the switcher empty.
      this.ViewTypesFromRegistry = false;
    }
  }

  /**
   * Recomputes {@link AvailableViewTypes} from the registry for the current entity. Every
   * available view type is a dynamic-mounted plug-in. Reconciles the active selection when the
   * previously-active type is no longer available (e.g. the entity changed).
   */
  private refreshAvailableViewTypes(): void {
    const entity = this.EffectiveEntity;
    if (!entity) {
      this.AvailableViewTypes = [];
      this.ViewTypesFromRegistry = false;
      return;
    }
    // Self-contained config seeding: pull per-view-type config from the loaded view record or
    // the per-user default-view setting when the consumer didn't supply it via [ViewTypeConfigs].
    this.seedViewTypeConfigsIfEmpty();

    let rows: Array<{ ViewType: { ID: string }; Descriptor: IViewTypeDescriptor }> = [];
    try {
      rows = ViewTypeEngine.Instance.GetAvailableViewTypeRows(entity, this.ProviderToUse ?? undefined);
    } catch {
      rows = [];
    }

    const options: ViewModeOption[] = [];
    for (const { ViewType, Descriptor } of rows) {
      options.push({
        key: Descriptor.Name,
        mode: null,                    // every view type is dynamic-mounted
        label: Descriptor.DisplayName,
        icon: Descriptor.Icon ?? '',
        isDynamic: true,
        descriptor: Descriptor,
        viewTypeId: ViewType.ID,
      });
    }

    this.AvailableViewTypes = options;
    this.ViewTypesFromRegistry = options.length > 0;

    // Keep the active key valid: if the previously-active type is no longer available
    // (entity changed), select — in priority order — the resolved initial ViewTypeID
    // (explicit input → loaded view record → per-user default-view setting), then the first
    // available type.
    if (options.length > 0 && !options.some(o => o.key === this.ActiveViewTypeKey)) {
      const desiredId = this.resolveInitialViewTypeId();
      const desired = desiredId ? options.find(o => o.viewTypeId === desiredId) : undefined;
      const fallback = desired ?? options[0];
      this.applyViewTypeSelection(fallback, false);
    }

    this.cdr.detectChanges();
  }

  /**
   * Returns the switcher option for the active view type (for the current-type chip in the
   * switcher), or null before the registry resolves.
   */
  get ActiveViewTypeOption(): ViewModeOption | null {
    return this.AvailableViewTypes.find(o => o.key === this.ActiveViewTypeKey) ?? null;
  }

  /**
   * Selects a view type from the switcher. Built-in types route to {@link setViewMode}
   * (preserving the rich grid/cards/timeline/map integration); plug-in types are
   * dynamic-mounted via the descriptor's RendererComponent. Emits {@link viewTypeChange}
   * so hosts can persist `UserView.ViewTypeID`.
   */
  SelectViewType(option: ViewModeOption): void {
    this.ViewTypeDropdownOpen = false;
    this.applyViewTypeSelection(option, true);
  }

  /**
   * Selects a view type by its `MJ: View Types` row ID. This is the entry point used by external
   * chrome (e.g. the workspace toolbar's {@link ViewTypeSwitcherComponent}) that surfaces the
   * switcher outside the viewer's own header. Resolves the matching available option and applies
   * it through the same lifecycle as a header-driven switch (cancelable events + persistence).
   * No-op when the ID isn't an available view type or is already active.
   *
   * @param viewTypeId the `MJ: View Types` row ID to switch to.
   */
  public SelectViewTypeById(viewTypeId: string | null): void {
    if (!viewTypeId) {
      return;
    }
    const option = this.AvailableViewTypes.find(o => o.viewTypeId === viewTypeId);
    if (option && option.key !== this.ActiveViewTypeKey) {
      this.applyViewTypeSelection(option, true);
    }
  }

  /**
   * The `MJ: View Types` row ID of the currently-active view type, or null before the registry
   * resolves. Lets external chrome (the workspace toolbar switcher) reflect the viewer's active
   * type without reaching into the viewer's internal {@link ViewModeOption}s.
   */
  public get ActiveViewTypeId(): string | null {
    return this.ActiveViewTypeOption?.viewTypeId ?? null;
  }

  /**
   * Applies a view-type selection. `emit` is true for user-initiated switches (fires the
   * cancelable {@link BeforeViewTypeChange}, persists when {@link AutoSaveView} is on, then fires
   * {@link AfterViewTypeChange}) and false for internal reconciliation (no events, no persist).
   *
   * Every view type is a dynamic-mounted plug-in: this tears down the previous renderer and mounts
   * the selected descriptor's `RendererComponent`. The container resets its generic load mode (a
   * fresh plug-in that needs the full set will re-request it via `dataRequest({loadAll:true})`) and
   * reloads page-based data when the active type changes.
   */
  private applyViewTypeSelection(option: ViewModeOption, emit: boolean): void {
    const previousViewTypeId = this.ActiveViewTypeOption?.viewTypeId ?? null;

    if (emit) {
      const before: ViewTypeChangeEventArgs = {
        ViewTypeID: option.viewTypeId,
        DriverClass: option.key,
        PreviousViewTypeID: previousViewTypeId,
        Cancel: false,
      };
      this.BeforeViewTypeChange.emit(before);
      if (before.Cancel) {
        return; // a handler vetoed the switch — leave the switcher unchanged
      }
    }

    const typeChanged = this.ActiveViewTypeKey !== option.key;
    this.ActiveViewTypeKey = option.key;
    this.ActiveDynamicOption = option;
    this.selectDynamicRenderer(option);

    // On a real type switch, drop any prior load-all mode and reload page-based data so the newly
    // mounted plug-in starts from the standard paginated set. A plug-in needing everything (e.g. a
    // map) re-asks via dataRequest on its own init. Skip the reload for the initial reconciliation
    // (no prior type) — the regular entity/view data-load path already handles the first load.
    if (typeChanged && previousViewTypeId !== null && this._loadAllRecords && !this._records) {
      this._loadAllRecords = false;
      this.resetPaginationState(false);
      this.LoadData();
    }

    if (emit) {
      if (this.AutoSaveView) {
        void this.persistActiveViewType(option);
      }
      this.AfterViewTypeChange.emit({
        ViewTypeID: option.viewTypeId,
        DriverClass: option.key,
        PreviousViewTypeID: previousViewTypeId,
        Cancel: false,
      });
    }
    this.cdr.detectChanges();
  }

  // ========================================
  // VIEW-TYPE PERSISTENCE (provider-based; never routing)
  // ========================================

  /**
   * Where view-type/config persists when {@link AutoSaveView} is on: a loaded `UserView` record,
   * per-user User Settings (the default-view case), or nowhere.
   */
  private persistenceTarget(): ViewPersistenceTarget {
    if (this._viewEntity?.ID) {
      return 'record';
    }
    if (this.EffectiveEntity) {
      return 'user-settings';
    }
    return 'none';
  }

  /** Persist the active view-type selection to the resolved target. */
  private async persistActiveViewType(option: ViewModeOption): Promise<void> {
    const target = this.persistenceTarget();
    if (target === 'record') {
      const ve = this._viewEntity!;
      ve.ViewTypeID = option.viewTypeId;
      await this.saveViewEntity(ve);
    } else if (target === 'user-settings') {
      this.saveDefaultViewSetting();
    }
  }

  /** Persist a per-view-type config change to the resolved target. */
  private async persistViewTypeConfig(viewTypeId: string): Promise<void> {
    const target = this.persistenceTarget();
    if (target === 'record') {
      const ve = this._viewEntity!;
      const displayState = ve.DisplayStateObject ?? { defaultMode: 'grid' };
      const configs = (displayState.viewTypeConfigs ?? []).filter(c => c.viewTypeId !== viewTypeId);
      configs.push({ viewTypeId, config: this.viewTypeConfigById.get(viewTypeId) ?? {} });
      displayState.viewTypeConfigs = configs;
      ve.DisplayStateObject = displayState;
      await this.saveViewEntity(ve);
    } else if (target === 'user-settings') {
      this.saveDefaultViewSetting();
    }
  }

  /** Save the loaded view record, logging (not throwing) on failure. */
  private async saveViewEntity(viewEntity: MJUserViewEntityExtended): Promise<void> {
    const saved = await viewEntity.Save();
    if (!saved) {
      LogError(`EntityViewer: failed to persist view: ${viewEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }

  /** User Settings key for this entity's per-user default-view state. */
  private defaultViewSettingKey(): string | null {
    const entity = this.EffectiveEntity;
    return entity ? `mj.entityViewer.${entity.ID.toLowerCase()}.view` : null;
  }

  /** Persist the per-user default-view state (active view type + per-type configs) to User Settings. */
  private saveDefaultViewSetting(): void {
    const key = this.defaultViewSettingKey();
    if (!key) {
      return;
    }
    const payload = {
      viewTypeId: this.ActiveViewTypeOption?.viewTypeId ?? null,
      viewTypeConfigs: this.serializeViewTypeConfigs(),
    };
    UserInfoEngine.Instance.SetSettingDebounced(key, JSON.stringify(payload));
  }

  /** Convert the in-memory per-view-type config map to the persisted array shape. */
  private serializeViewTypeConfigs(): Array<{ viewTypeId: string; config: Record<string, unknown> }> {
    return Array.from(this.viewTypeConfigById.entries()).map(([viewTypeId, config]) => ({ viewTypeId, config }));
  }

  /**
   * Resolve which view type the viewer should open in, in priority order:
   * explicit `ViewTypeID` input → the loaded `UserView` record's `ViewTypeID` → the per-user
   * default-view setting (User Settings). Returns null to let the caller fall back to the legacy
   * mode / first available type. This is how the viewer is self-contained for both the saved-view
   * and default-view cases without the consumer wiring anything.
   */
  private resolveInitialViewTypeId(): string | null {
    if (this._initialViewTypeId) {
      return this._initialViewTypeId;
    }
    if (this._viewEntity?.ViewTypeID) {
      return this._viewEntity.ViewTypeID;
    }
    return this.readDefaultViewSetting()?.viewTypeId ?? null;
  }

  /**
   * Load a saved view by ID via the active provider and apply it through the {@link viewEntity}
   * setter. Backs the {@link ViewID} convenience input. Logs (does not throw) on failure.
   */
  private async loadViewById(viewId: string): Promise<void> {
    const provider = this.ProviderToUse;
    if (!provider) {
      return;
    }
    const view = await provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', provider.CurrentUser);
    const loaded = await view.Load(viewId);
    if (loaded) {
      this.ViewEntity = view;
    } else {
      LogError(`EntityViewer: failed to load view ${viewId}: ${view.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  }

  /** Read the per-user default-view setting for the current entity (or null). */
  private readDefaultViewSetting(): { viewTypeId: string | null; viewTypeConfigs?: Array<{ viewTypeId: string; config: Record<string, unknown> }> } | null {
    const key = this.defaultViewSettingKey();
    if (!key) {
      return null;
    }
    const raw = UserInfoEngine.Instance.GetSetting(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Seed the in-memory per-view-type config map from the available sources when the consumer
   * hasn't supplied them via the {@link ViewTypeConfigs} input: the loaded `UserView` record's
   * `DisplayState.viewTypeConfigs` (saved-view case) or the per-user default-view setting.
   * Only seeds when the map is empty, so an explicit input always wins.
   */
  private seedViewTypeConfigsIfEmpty(): void {
    if (this.viewTypeConfigById.size > 0) {
      return;
    }
    const fromRecord = this._viewEntity?.DisplayStateObject?.viewTypeConfigs;
    const source = fromRecord ?? this.readDefaultViewSetting()?.viewTypeConfigs ?? [];
    for (const entry of source) {
      if (entry?.viewTypeId) {
        this.viewTypeConfigById.set(entry.viewTypeId, entry.config ?? {});
      }
    }
  }

  // ========================================
  // DYNAMIC (PLUG-IN) VIEW RENDERER MOUNTING
  // ========================================

  /**
   * Makes `option`'s plug-in the ACTIVE view: reuses its cached instance when present (preserving
   * state), otherwise creates it. All other cached instances are hidden (kept mounted). The container
   * has zero knowledge of which plug-in this is — it only knows the {@link IViewRenderer} contract.
   */
  private selectDynamicRenderer(option: ViewModeOption): void {
    const host = this.dynamicViewHost;
    if (!host || !option.descriptor.RendererComponent) {
      return;
    }

    // Hide every cached instance; the active one is shown below. Hidden instances stay mounted so
    // their state survives a round-trip (e.g. switch Grid → Cluster → Grid without re-clustering).
    for (const entry of this.dynamicRendererCache.values()) {
      this.setRendererVisible(entry.ref, false);
    }

    let entry = this.dynamicRendererCache.get(option.viewTypeId);
    if (!entry) {
      entry = this.createDynamicRenderer(option);
    }
    this.dynamicRendererRef = entry.ref;
    this.dynamicInputNames = entry.inputs;
    this.setRendererVisible(entry.ref, true);
    this.pushDynamicRendererInputs();
    entry.ref.changeDetectorRef.detectChanges();
  }

  /**
   * Creates a plug-in renderer instance, wires its generic outputs, captures its declared inputs,
   * and caches it by `MJ: View Types` row ID. (Does not show/activate it — {@link selectDynamicRenderer}
   * does that.)
   */
  private createDynamicRenderer(option: ViewModeOption): { ref: ComponentRef<IViewRenderer>; inputs: Set<string> } {
    const host = this.dynamicViewHost!;
    const componentType = option.descriptor.RendererComponent;
    const ref = host.createComponent<IViewRenderer>(componentType as never);

    // Capture the set of input names this plug-in actually declares, so we only push the generic
    // inputs it accepts. A lean plug-in (e.g. Timeline/Cards) won't declare grid-only inputs like
    // `totalRecordCount`/`page` — calling `setInput` for those logs NG0303 in dev (the log fires
    // before the throw, so a try/catch can't suppress it). Pre-checking with the reflected metadata
    // keeps the console clean and the container plug-in-agnostic.
    const inputs = new Set<string>(reflectComponentType(componentType)?.inputs.map(i => i.templateName) ?? []);

    // Wire the generic IViewRenderer outputs. All are optional on lean plug-ins, so guard each
    // with `?.`. Only navigation (record open / related-record / create) bubbles to the outer app;
    // config and dataRequest are generic plug-in↔container coordination.
    const inst = ref.instance;
    inst.recordSelected?.pipe(takeUntil(this.destroy$)).subscribe((r: unknown) => this.onDynamicRecordSelected(r));
    inst.recordOpened?.pipe(takeUntil(this.destroy$)).subscribe((r: unknown) => this.onDynamicRecordOpened(r));
    inst.configChanged
      ?.pipe(takeUntil(this.destroy$))
      .subscribe((cfg: unknown) => this.onDynamicConfigChanged(option.viewTypeId, (cfg ?? {}) as Record<string, unknown>));
    inst.openRelatedRecordRequested
      ?.pipe(takeUntil(this.destroy$))
      .subscribe((nav: ViewRelatedRecordNavigation) => this.OpenRelatedRecordRequested.emit(nav));
    inst.createRecordRequested
      ?.pipe(takeUntil(this.destroy$))
      .subscribe(() => this.CreateRecordRequested.emit());
    inst.dataRequest
      ?.pipe(takeUntil(this.destroy$))
      .subscribe((req: ViewDataRequest) => this.onDynamicDataRequest(req));

    const created = { ref, inputs };
    this.dynamicRendererCache.set(option.viewTypeId, created);
    return created;
  }

  /** Toggle a cached renderer's host element visibility without destroying it (preserves state). */
  private setRendererVisible(ref: ComponentRef<IViewRenderer>, visible: boolean): void {
    const el = ref.location.nativeElement as HTMLElement | undefined;
    if (el) {
      el.style.display = visible ? '' : 'none';
    }
  }

  /**
   * Destroys ALL cached plug-in instances and clears the host. Called when the data context changes
   * (entity change / view (record / ViewID) change) so the next selection rebuilds fresh. NOT called
   * on a plain view-type switch within the same context — that path reuses cached instances.
   */
  private clearDynamicRendererCache(): void {
    for (const entry of this.dynamicRendererCache.values()) {
      entry.ref.destroy();
    }
    this.dynamicRendererCache.clear();
    this.dynamicRendererRef = null;
    this.dynamicInputNames = new Set<string>();
    this.dynamicViewHost?.clear();
  }

  /**
   * Pushes the current generic data-context into the mounted plug-in renderer via `setInput`.
   * Every input is part of the generic {@link IViewRenderer} contract; lean plug-ins may not declare
   * all of them, so each `setInput` is wrapped in try/catch (Angular throws on undeclared inputs).
   */
  private pushDynamicRendererInputs(): void {
    const ref = this.dynamicRendererRef;
    const option = this.ActiveDynamicOption;
    if (!ref || !option) {
      return;
    }
    this.setDynamicInput(ref, 'entity', this.EffectiveEntity);
    this.setDynamicInput(ref, 'provider', this.ProviderToUse);
    this.setDynamicInput(ref, 'Provider', this.Provider);
    this.setDynamicInput(ref, 'records', this.FilteredRecords);
    this.setDynamicInput(ref, 'selectedRecordId', this.SelectedRecordID);
    this.setDynamicInput(ref, 'filterText', this.DebouncedFilterText);
    this.setDynamicInput(ref, 'config', this.viewTypeConfigById.get(option.viewTypeId) ?? {});
    this.setDynamicInput(ref, 'totalRecordCount', this.TotalRecordCount);
    this.setDynamicInput(ref, 'page', this.Pagination.currentPage + 1);
    this.setDynamicInput(ref, 'pageSize', this.Pagination.pageSize);
    this.setDynamicInput(ref, 'isLoading', this.IsLoading);
  }

  /**
   * Guarded `setInput`: lean plug-ins implement only the core contract, so we only set an input the
   * mounted plug-in actually declares (per {@link dynamicInputNames}, captured at mount via
   * `reflectComponentType`). This avoids NG0303 dev errors for optional inputs the plug-in omits and
   * keeps the container plug-in-agnostic.
   */
  private setDynamicInput(ref: ComponentRef<IViewRenderer>, name: string, value: unknown): void {
    if (this.dynamicInputNames.has(name)) {
      ref.setInput(name, value);
    }
  }

  private onDynamicRecordSelected(record: unknown): void {
    const entity = this.EffectiveEntity;
    if (entity && record) {
      const row = record as Record<string, unknown>;
      this.RecordSelected.emit({ record: row, entity, compositeKey: buildCompositeKey(row, entity) });
    }
  }

  private onDynamicRecordOpened(record: unknown): void {
    const entity = this.EffectiveEntity;
    if (entity && record) {
      const row = record as Record<string, unknown>;
      this.RecordOpened.emit({ record: row, entity, compositeKey: buildCompositeKey(row, entity) });
    }
  }

  private onDynamicConfigChanged(viewTypeId: string, config: Record<string, unknown>): void {
    const before: ViewTypeConfigChangeEventArgs = { ViewTypeID: viewTypeId, Config: config, Cancel: false };
    this.BeforeViewTypeConfigChange.emit(before);
    if (before.Cancel) {
      return;
    }
    this.viewTypeConfigById.set(viewTypeId, config);
    if (this.AutoSaveView) {
      void this.persistViewTypeConfig(viewTypeId);
    }
    this.AfterViewTypeConfigChange.emit({ ViewTypeID: viewTypeId, Config: config, Cancel: false });
  }

  /**
   * Honors a generic {@link ViewDataRequest} from the mounted plug-in. Fully view-type-agnostic —
   * the container applies whatever is present (sort / page / pageSize / loadAll) against its
   * existing generic data-loading path. No per-view-type branching.
   */
  private onDynamicDataRequest(req: ViewDataRequest): void {
    if (!req || this._records) {
      // Nothing to do when records are externally supplied (no internal RunView to retrigger).
      return;
    }

    // loadAll → switch the data loader into full-set mode (replaces the old map-specific branch).
    if (req.loadAll === true && !this._loadAllRecords) {
      this._loadAllRecords = true;
      this.resetPaginationState(false);
      this.LoadData();
      return;
    }
    if (req.loadAll === false && this._loadAllRecords) {
      this._loadAllRecords = false;
      this.resetPaginationState(false);
      this.LoadData();
      return;
    }

    // sort → set the host's internal sort state and reload via the server-side-sort path.
    if (req.sort) {
      const first = req.sort.length > 0 ? req.sort[0] : null;
      const newSort: SortState | null = first ? { field: first.field, direction: first.direction } : null;
      const oldSort = this.InternalSortState;
      this.InternalSortState = newSort;
      const sortChanged = !oldSort || !newSort ||
        oldSort.field !== newSort.field || oldSort.direction !== newSort.direction;
      if (this.EffectiveConfig.serverSideSorting && sortChanged) {
        this.resetPaginationState(false);
        this.LoadData();
      }
      return;
    }

    // page / pageSize → load that page via the existing pager path.
    if (req.pageSize != null && req.pageSize !== this.Pagination.pageSize) {
      this.Pagination.pageSize = req.pageSize;
    }
    if (req.page != null) {
      this.OnPageChange({ PageNumber: req.page, PageSize: req.pageSize ?? this.Pagination.pageSize } as PageChangeEvent);
    }
  }

  // ========================================
  // FILTERING
  // ========================================

  /**
   * Handle filter input change
   */
  OnFilterChange(value: string): void {
    this.InternalFilterText = value;
    this.filterInput$.next(value);
  }

  /**
   * Clear the filter
   */
  ClearFilter(): void {
    this.InternalFilterText = '';
    this.filterInput$.next('');
    this.cdr.detectChanges();
  }
}
