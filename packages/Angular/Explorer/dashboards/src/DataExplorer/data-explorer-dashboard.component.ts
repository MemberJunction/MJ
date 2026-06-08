import { Component, OnInit, OnDestroy, ChangeDetectorRef, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ElementRef, ViewChild, NgZone } from '@angular/core';

import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BaseDashboard, NavigationService } from '@memberjunction/ng-shared';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { EntityInfo, RunView, EntityFieldTSType, ApplicationInfo } from '@memberjunction/core';
// CompositeKey is used via buildCompositeKey from ng-entity-viewer
import { MJApplicationEntityEntity, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import {
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  EntityViewerConfig,
  NavigateToRelatedEvent,
  ViewWorkspaceComponent,
  ViewRelatedRecordNavigation,
  buildCompositeKey,
  buildPkString
} from '@memberjunction/ng-entity-viewer';
import { MJUserViewEntityExtended, UserViewEngine } from '@memberjunction/core-entities';
import { ExplorerStateService } from './services/explorer-state.service';
import { DataExplorerState, DataExplorerFilter, BreadcrumbItem, DataExplorerDeepLink, RecentRecordAccess, FavoriteRecord, AppEntityGroup } from './models/explorer-state.interface';
import { OpenRecordEvent, SelectRecordEvent } from './components/navigation-panel/navigation-panel.component';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';

/**
 * Data Explorer Dashboard - Power user interface for exploring data across entities
 * Combines card-based browsing with grid views and relationship visualization
 *
 * Uses mj-entity-viewer composite component for the main content area,
 * which handles data loading, filtering, and view mode switching.
 */
@Component({
  standalone: false,
  selector: 'mj-data-explorer-dashboard',
  templateUrl: './data-explorer-dashboard.component.html',
  styleUrls: ['./data-explorer-dashboard.component.css'],
  animations: [
    trigger('slideInLeft', [
      transition(':enter', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate('200ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(-100%)', opacity: 0 }))
      ])
    ])
  ]
})
@RegisterClass(BaseDashboard, 'DataExplorer')
export class DataExplorerDashboardComponent extends BaseDashboard implements OnInit, OnDestroy, OnChanges {
  protected override destroy$ = new Subject<void>();
  private metadata = this.ProviderToUse;

  /** Reference to the filter input for keyboard shortcuts */
  @ViewChild('filterInput') filterInputRef: ElementRef<HTMLInputElement> | undefined;

  /** Reference to the view workspace (owns view CRUD + the inner data renderer) */
  @ViewChild(ViewWorkspaceComponent) viewWorkspaceRef: ViewWorkspaceComponent | undefined;

  /**
   * Optional filter to constrain which entities are shown in the explorer.
   * Can filter by applicationId, schemaNames, or explicit entityNames.
   */
  @Input() entityFilter: DataExplorerFilter | null = null;

  /**
   * Optional deep link to navigate to a specific entity/record on load.
   * Parsed from URL query parameters (e.g., ?entity=Users&record=123)
   */
  @Input() deepLink: DataExplorerDeepLink | null = null;

  /**
   * Optional context name to display in the header instead of "Data Explorer".
   * Use this to customize the explorer for specific applications (e.g., "CRM", "Association Demo").
   */
  @Input() contextName: string | null = null;

  /**
   * Optional context icon (Font Awesome class) to display in the header.
   * Use this alongside contextName for a fully customized header (e.g., "fa-solid fa-users" for CRM).
   */
  @Input() contextIcon: string | null = null;

  /**
   * Initial query params forwarded from the resource wrapper.
   * On hard refresh, the shell delivers params to the wrapper (which has Data.Configuration.queryParams),
   * not to this inner dashboard component. This input bridges that gap.
   */
  @Input() initialQueryParams: Record<string, string> = {};

  /**
   * Emitted when the display title should change (entity selected, record opened, etc.)
   */
  @Output() DisplayNameChanged = new EventEmitter<string>();

  // State
  public state: DataExplorerState;

  // Entity data - all entities available to the user
  private allEntities: EntityInfo[] = [];
  // Filtered entities based on entityFilter
  public entities: EntityInfo[] = [];
  // Application entity groups for the home view (Concept D)
  public appEntityGroups: AppEntityGroup[] = [];
  // Entity IDs for the current application (loaded when applicationId filter is set)
  private applicationEntityIds: Set<string> = new Set();
  public selectedEntity: EntityInfo | null = null;

  // Record counts (updated by mj-entity-viewer)
  public totalRecordCount = 0;
  public filteredRecordCount = 0;

  // Selected record for detail panel
  public selectedRecord: Record<string, unknown> | null = null;
  // Entity info for the detail panel (may differ from selectedEntity when viewing FK/related records)
  public detailPanelEntity: EntityInfo | null = null;
  // Currently loaded records from mj-entity-viewer (for back/forward navigation lookup)
  private loadedRecords: Record<string, unknown>[] = [];

  // Currently selected view entity (for view data loading)
  public selectedViewEntity: MJUserViewEntityExtended | null = null;

  // Live filter text (what the user sees in the input, updates immediately)
  public liveFilterText: string = '';
  // Debounced filter text (synced with mj-entity-viewer, updates after delay)
  public debouncedFilterText: string = '';
  private filterInput$ = new Subject<string>();

  // Entity filter text for home screen
  public entityFilterText: string = '';

  // Breadcrumbs for navigation display
  public breadcrumbs: BreadcrumbItem[] = [];

  // Loading state for entities
  public isLoadingEntities: boolean = true;

  // Recent records from User Record Logs
  public recentRecords: RecentRecordAccess[] = [];

  // Favorite records from User Favorites (non-entity favorites)
  public favoriteRecords: FavoriteRecord[] = [];

  // Loading state for home screen sections
  public isLoadingRecentRecords: boolean = true;

  // Entity filter for recent records (null = show all, string = filter by entityId)
  public recentRecordsEntityFilter: string | null = null;

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Data Explorer"
  }

  // ========================================
  // Concept D: Application Groups + Search-First
  // ========================================

  /**
   * Get app entity groups filtered by current entityFilterText and homeViewMode.
   * When searching, auto-expands groups that contain matches.
   */
  get filteredAppEntityGroups(): AppEntityGroup[] {
    const filterText = this.entityFilterText.toLowerCase().trim();
    const showFavoritesOnly = this.state.homeViewMode === 'favorites';

    return this.appEntityGroups
      .map(group => this.filterGroupEntities(group, filterText, showFavoritesOnly))
      .filter(group => group.entities.length > 0);
  }

  /**
   * Filter a single group's entities by text and favorites mode.
   * Returns a new group with filtered entities and auto-expansion when searching.
   */
  private filterGroupEntities(
    group: AppEntityGroup,
    filterText: string,
    showFavoritesOnly: boolean
  ): AppEntityGroup {
    let filtered = group.entities;

    if (showFavoritesOnly) {
      filtered = filtered.filter(e => this.isEntityFavorited(e));
    }

    if (filterText) {
      filtered = filtered.filter(e =>
        e.Name.toLowerCase().includes(filterText) ||
        e.DisplayNameOrName.toLowerCase().includes(filterText) ||
        (e.Description && e.Description.toLowerCase().includes(filterText))
      );
    }

    return {
      ...group,
      entities: filtered,
      isExpanded: filterText ? true : group.isExpanded
    };
  }

  /**
   * Get a flat filtered entity list for single-application mode.
   * Used when entityFilter.applicationId is set, bypassing app grouping.
   */
  get flatFilteredEntities(): EntityInfo[] {
    let result = this.entities;

    if (this.state.homeViewMode === 'favorites') {
      result = result.filter(e => this.isEntityFavorited(e));
    }

    const filterText = this.entityFilterText.toLowerCase().trim();
    if (filterText) {
      result = result.filter(e =>
        e.Name.toLowerCase().includes(filterText) ||
        e.DisplayNameOrName.toLowerCase().includes(filterText) ||
        (e.Description && e.Description.toLowerCase().includes(filterText))
      );
    }

    return result;
  }

  /**
   * Total count of entities matching current filters (across all groups or flat list)
   */
  get filteredEntityCount(): number {
    if (this.entityFilter?.applicationId) {
      return this.flatFilteredEntities.length;
    }
    return this.filteredAppEntityGroups.reduce((sum, g) => sum + g.entities.length, 0);
  }

  /**
   * Count of applications that have at least one visible entity
   */
  get applicationCount(): number {
    return this.appEntityGroups.filter(g => g.entities.length > 0).length;
  }

  /**
   * Get recent entities for home screen display (max 5)
   */
  get recentEntities(): EntityInfo[] {
    return this.state.recentEntityAccesses
      .slice(0, 5)
      .map(r => this.entities.find(e => UUIDsEqual(e.ID, r.entityId)))
      .filter((e): e is EntityInfo => e !== undefined);
  }

  /**
   * Get favorite entities for home screen display
   */
  get favoriteEntities(): EntityInfo[] {
    return this.state.favoriteEntities
      .map(f => this.entities.find(e => UUIDsEqual(e.ID, f.entityId)))
      .filter((e): e is EntityInfo => e !== undefined);
  }

  /**
   * Recent records limited to 3 for the quick access panel
   */
  get quickAccessRecentRecords(): RecentRecordAccess[] {
    return this.recentRecords.slice(0, 3);
  }

  /**
   * Recent entities limited to 3 for the quick access panel
   */
  get quickAccessRecentEntities(): EntityInfo[] {
    return this.recentEntities.slice(0, 3);
  }

  /**
   * Favorite records limited to 3 for the quick access panel
   */
  get quickAccessFavoriteRecords(): FavoriteRecord[] {
    return this.favoriteRecords.slice(0, 3);
  }

  /**
   * Check if a quick access section is expanded
   */
  public isQuickAccessSectionExpanded(sectionId: string): boolean {
    return this.state.quickAccessSections[sectionId] !== false;
  }

  /**
   * Get unique entities from recent records for the filter strip.
   * Returns up to 5 entities, sorted by frequency in the recent records.
   */
  get uniqueRecentRecordEntities(): { entityId: string; entityName: string; icon: string; count: number }[] {
    const entityCounts = new Map<string, { entityId: string; entityName: string; count: number }>();

    for (const record of this.recentRecords) {
      const existing = entityCounts.get(record.entityId);
      if (existing) {
        existing.count++;
      } else {
        entityCounts.set(record.entityId, {
          entityId: record.entityId,
          entityName: record.entityName,
          count: 1
        });
      }
    }

    // Convert to array, sort by count (descending), take first 5
    return Array.from(entityCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(e => ({
        ...e,
        icon: this.getEntityIconById(e.entityId)
      }));
  }

  /**
   * Check if we should show the entity filter strip for recent records.
   * Only show when there are 2+ unique entities.
   */
  get showRecentRecordsEntityFilter(): boolean {
    return this.uniqueRecentRecordEntities.length >= 2;
  }

  /**
   * Get filtered recent records based on entity filter.
   */
  get filteredRecentRecords(): RecentRecordAccess[] {
    if (!this.recentRecordsEntityFilter) {
      return this.recentRecords;
    }
    return this.recentRecords.filter(r => r.entityId === this.recentRecordsEntityFilter);
  }

  /**
   * Set the entity filter for recent records
   */
  public setRecentRecordsEntityFilter(entityId: string | null): void {
    this.recentRecordsEntityFilter = entityId;
  }

  /**
   * Get the display title for the header.
   * Priority: contextName > entityFilter.applicationName > "Data Explorer"
   */
  get displayTitle(): string {
    return this.contextName || this.entityFilter?.applicationName || 'Data Explorer';
  }

  /**
   * Get the display icon for the header (when at home level).
   * Returns contextIcon if provided, otherwise null.
   */
  get displayIcon(): string | null {
    return this.contextIcon;
  }

  /**
   * Configuration for mj-entity-viewer composite component
   * Hides the built-in header since we have a custom header in the dashboard
   * Uses server-side pagination with 100 records per page (default)
   */
  public viewerConfig: Partial<EntityViewerConfig> = {
    showFilter: false,        // We have our own filter in the dashboard header
    showViewModeToggle: true,  // Use the viewer's metadata-driven view-type dropdown (no legacy header toggle)
    showRecordCount: false,   // We show count in the dashboard header
    showPagination: true,     // Show the pagination UI with "Load More" button
    serverSideFiltering: true, // Use RunView's UserSearchString for filtering
    serverSideSorting: true,  // Use RunView's OrderBy for sorting
    height: '100%'
  };

  constructor(
    public stateService: ExplorerStateService,
    private cdr: ChangeDetectorRef,
    private recentAccessService: RecentAccessService,
    private ngZone: NgZone
  ) {
    super();
    this.state = this.stateService.CurrentState;
  }

  async ngOnInit(): Promise<void> {
    super.ngOnInit();
    try {
    // Ensure UserInfoEngine is configured before we try to access user settings
    // This prevents race conditions where we try to load default view settings
    // before the user settings have been loaded from the server
    await UserInfoEngine.Instance.Config(false);

    // Read initial query params — prefer params forwarded from the resource wrapper
    // (which has Data.Configuration.queryParams from the shell), then fall back to
    // this component's own GetQueryParams() for cases where the dashboard is used standalone.
    const wrapperParams = this.initialQueryParams && Object.keys(this.initialQueryParams).length > 0
      ? this.initialQueryParams
      : null;
    const ownParams = this.GetQueryParams();
    const rawParams = wrapperParams || (Object.keys(ownParams).length > 0 ? ownParams : {});

    const urlState = this.buildDeepLinkFromParams(rawParams);

    // Set context for state service (enables context-specific settings)
    this.stateService.Provider = this.ProviderToUse;
    await this.stateService.setContext(this.entityFilter);
    this.state = this.stateService.CurrentState;

    // User search text starts empty - it's separate from smart filter
    this.liveFilterText = '';
    this.debouncedFilterText = '';

    // Load available entities (async to support applicationId filter)
    // Pass urlState so we don't restore persisted entity if URL specifies one
    await this.loadEntities(urlState);

    // Apply URL state after entities are loaded
    if (urlState) {
      await this.applyUrlState(urlState);
    } else if (this.deepLink) {
      await this.applyDeepLink(this.deepLink);
    }

    // Subscribe to state changes
    this.stateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const entityChanged = state.selectedEntityName !== this.state.selectedEntityName;

        this.state = state;

        // When entity changes, clear user search text and update title
        if (entityChanged) {
          this.liveFilterText = '';
          this.debouncedFilterText = '';
          this.emitDisplayName();
        }

        this.onStateChanged();

        // Update URL query params to reflect current state (for deep linking)
        this.pushCurrentStateToUrl();

        this.cdr.detectChanges();
      });

    // Subscribe to breadcrumb changes
    this.stateService.Breadcrumbs
      .pipe(takeUntil(this.destroy$))
      .subscribe(breadcrumbs => {
        this.breadcrumbs = breadcrumbs;
        this.cdr.detectChanges();
      });

    // Setup debounced filter - 500ms delay allows comfortable typing before triggering search
    // IMPORTANT: Do NOT call setSmartFilterPrompt here. Updating the state service triggers
    // URL updates (via pushCurrentStateToUrl → UpdateQueryParams), which in turn can trigger
    // OnQueryParamsChanged, which would clear the filter text. The debouncedFilterText flows
    // directly to the entity-viewer via [filterText] binding — no state service involvement needed.
    this.filterInput$
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(filterText => {
        this.debouncedFilterText = filterText;
        this.cdr.detectChanges();
      });

    // Subscribe to recent records changes
    this.stateService.RecentRecords
      .pipe(takeUntil(this.destroy$))
      .subscribe(records => {
        this.recentRecords = records;
        this.isLoadingRecentRecords = false;
        this.cdr.detectChanges();
      });

    // Subscribe to favorite records changes
    this.stateService.FavoriteRecords
      .pipe(takeUntil(this.destroy$))
      .subscribe(records => {
        this.favoriteRecords = records;
        this.cdr.detectChanges();
      });

    // Push initial state to URL (covers deepLink and persisted state)
    this.pushCurrentStateToUrl();
    } catch (err) {
      // Never let a setup failure hang the app loading screen — log it and still signal completion.
      console.error('[DataExplorer] ngOnInit setup failed (signaling load complete anyway):', err);
    } finally {
      // ALWAYS notify load complete — the loading screen waits on this; a thrown/awaited error before
      // it would otherwise hang the screen forever on a direct-URL (deep-link) refresh.
      this.NotifyLoadComplete();
    }
  }

  /**
   * Handle keyboard shortcuts
   * "/" or Cmd+K focuses the filter input
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    // Skip if user is typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape to blur the input
      if (event.key === 'Escape') {
        (target as HTMLInputElement).blur();
      }
      return;
    }

    // "/" to focus filter
    if (event.key === '/') {
      event.preventDefault();
      this.focusFilterInput();
      return;
    }

    // Cmd+K or Ctrl+K to focus filter
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.focusFilterInput();
      return;
    }

    // View management shortcuts (only when an entity is selected). These delegate to the
    // view workspace, which now owns the full saved-view lifecycle.
    if (this.selectedEntity && (event.metaKey || event.ctrlKey)) {
      // Ctrl+S / Cmd+S: Save current view
      if (event.key === 's' && !event.shiftKey) {
        event.preventDefault();
        this.viewWorkspaceRef?.onQuickSaveRequested(false);
        return;
      }

      // Ctrl+Shift+S / Cmd+Shift+S: Save as new view
      if (event.key === 'S' || (event.key === 's' && event.shiftKey)) {
        event.preventDefault();
        this.viewWorkspaceRef?.onQuickSaveRequested(true);
        return;
      }

      // Ctrl+, / Cmd+,: Open config panel
      if (event.key === ',') {
        event.preventDefault();
        this.viewWorkspaceRef?.onConfigureViewRequested();
        return;
      }

      // Ctrl+Z / Cmd+Z: Revert unsaved changes (only when modified)
      if (event.key === 'z' && !event.shiftKey && this.state.viewModified) {
        event.preventDefault();
        void this.viewWorkspaceRef?.onRevertView();
        return;
      }
    }
  }

  /**
   * Focus the filter input
   */
  private focusFilterInput(): void {
    if (this.filterInputRef) {
      this.filterInputRef.nativeElement.focus();
      this.filterInputRef.nativeElement.select();
    }
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // Re-apply filter when entityFilter changes
    if (changes['entityFilter'] && !changes['entityFilter'].firstChange) {
      // Update context for new filter (loads context-specific state)
      await this.stateService.setContext(this.entityFilter);
      this.state = this.stateService.CurrentState;
      await this.loadEntities();
    }
  }

  protected initDashboard(): void {
    // Called by BaseDashboard
  }

  protected loadData(): void {
    // Data loading is handled by mj-entity-viewer
  }

  // ========================================
  // ENTITY MANAGEMENT
  // ========================================

  /**
   * Load all available entities the user can access, applying any configured filter
   * @param urlState Optional URL state - if provided, skip restoring persisted entity to avoid race conditions
   */
  private async loadEntities(urlState?: DataExplorerDeepLink | null): Promise<void> {
    this.isLoadingEntities = true;

    try {
      // First, load all entities the user can access
      this.allEntities = this.metadata.Entities
        .filter(e => {
          const perms = e.GetUserPermisions(this.metadata.CurrentUser);
          return perms.CanRead && e.IncludeInAPI;
        })
        .sort((a, b) => a.Name.localeCompare(b.Name));

      // If we have an applicationId filter, load the application entities
      if (this.entityFilter?.applicationId) {
        await this.loadApplicationEntityIds(this.entityFilter.applicationId);
      }

      // Apply filter to get the final entity list
      this.entities = this.applyEntityFilter(this.allEntities);

      // Build application groups for the home view (Concept D)
      this.buildAppEntityGroups();

      // Only restore entity from persisted state if there's no URL state
      // This prevents race conditions where persisted entity triggers data load
      // before URL state can override it
      if (!urlState && this.state.selectedEntityName) {
        this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
      }
    } finally {
      this.ngZone.run(() => {
        this.isLoadingEntities = false;
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Load entity IDs associated with a specific application
   */
  private async loadApplicationEntityIds(applicationId: string): Promise<void> {
    this.applicationEntityIds.clear();

    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJApplicationEntityEntity>({
      EntityName: 'MJ: Application Entities',
      ExtraFilter: `ApplicationID = '${applicationId}'`,
      ResultType: 'entity_object'
    });

    if (result.Success && result.Results) {
      for (const appEntity of result.Results) {
        this.applicationEntityIds.add(appEntity.EntityID);
      }
    }
  }

  /**
   * Apply the configured filter to the entity list
   */
  private applyEntityFilter(entities: EntityInfo[]): EntityInfo[] {
    if (!this.entityFilter) {
      return entities;
    }

    return entities.filter(entity => {
      // Filter by application (via ApplicationEntities)
      if (this.entityFilter!.applicationId) {
        if (!this.applicationEntityIds.has(entity.ID)) {
          return false;
        }
      }

      // Filter by schema names
      if (this.entityFilter!.schemaNames && this.entityFilter!.schemaNames.length > 0) {
        if (!this.entityFilter!.schemaNames.includes(entity.SchemaName)) {
          return false;
        }
      }

      // Filter by explicit entity names
      if (this.entityFilter!.entityNames && this.entityFilter!.entityNames.length > 0) {
        if (!this.entityFilter!.entityNames.includes(entity.Name)) {
          return false;
        }
      }

      // Filter out system entities unless explicitly included
      if (!this.entityFilter!.includeSystemEntities) {
        // Skip entities with names starting with __ (MJ system entities)
        if (entity.Name.startsWith('__')) {
          return false;
        }
        // Could add more system schema checks here if needed
      }

      return true;
    });
  }

  /**
   * Handle entity selection from navigation panel or home screen
   */
  public onEntitySelected(entity: EntityInfo): void {
    this.resetRecordCounts();
    // Clear the previous entity's view — it belongs to the old entity and its sort/filter
    // state would leak into the new entity's query (e.g., ORDER BY FirstName on Groups).
    // The workspace resets its own view/grid state when its [Entity] input changes.
    this.selectedViewEntity = null;
    this.selectedEntity = entity;
    this.reconcileViewModeForEntity(entity);
    this.stateService.selectEntity(entity.Name);
    // Track entity access for recent entities
    this.stateService.trackEntityAccess(entity.Name, entity.ID);
    // mj-entity-viewer will automatically load data when entity changes
  }

  /**
   * Handle state changes from external sources
   */
  private onStateChanged(): void {
    if (this.state.selectedEntityName !== this.selectedEntity?.Name) {
      this.resetRecordCounts();
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
      this.reconcileViewModeForEntity(this.selectedEntity);
    }
  }

  /**
   * Reset viewMode to 'grid' if the current mode isn't supported by the given entity
   * (e.g., switching to an entity without geocoding while viewMode is 'map').
   */
  private reconcileViewModeForEntity(entity: EntityInfo | null): void {
    if (!entity) return;
    const mode = this.state.viewMode;
    const hasDateFields = entity.Fields.some(f => f.TSType === EntityFieldTSType.Date);
    const modeUnsupported =
      (mode === 'map' && !entity.SupportsGeoCoding) ||
      (mode === 'timeline' && !hasDateFields);
    if (modeUnsupported) {
      this.stateService.setViewMode('grid');
    }
  }

  /**
   * Reset record counts when entity changes.
   * The actual counts will be updated when mj-entity-viewer emits dataLoaded event.
   */
  private resetRecordCounts(): void {
    this.totalRecordCount = 0;
    this.filteredRecordCount = 0;
  }

  // ========================================
  // VIEW WORKSPACE EVENT HANDLERS
  // (View CRUD now lives in mj-view-workspace; these thin handlers only drive
  //  Explorer routing + URL/state sync.)
  // ========================================

  /**
   * Handle a view selection emitted by the workspace. Tracks the selected view for routing/export
   * and syncs the selected-view-id + smart-filter into the Explorer state service for URL sync.
   * Grid-state application is owned by the workspace.
   */
  public onWorkspaceViewSelected(view: MJUserViewEntityExtended | null): void {
    this.selectedViewEntity = view;
    this.stateService.selectView(view?.ID ?? null);

    if (view && view.SmartFilterEnabled && view.SmartFilterPrompt) {
      this.stateService.setSmartFilterPrompt(view.SmartFilterPrompt);
    } else {
      this.stateService.setSmartFilterPrompt('');
    }
    // User search text is separate from a saved view's filter — always clear on view switch.
    this.liveFilterText = '';
    this.debouncedFilterText = '';
    this.cdr.detectChanges();
  }

  /**
   * Handle the workspace's "open view in tab" request — route via NavigationService.
   */
  public onOpenInTabRequested(viewId: string): void {
    const viewName = this.selectedViewEntity?.Name || 'View';
    this.navigationService.OpenView(viewId, viewName, { forceNewTab: true });
  }

  /**
   * Handle the workspace's "create new record" request — route via NavigationService.
   */
  public onCreateNewRecordRequested(entity: EntityInfo): void {
    this.navigationService.OpenNewEntityRecord(entity.Name);
  }

  /**
   * Clear the Explorer "view modified" flag after the workspace persists/reverts a view.
   */
  public onWorkspaceViewSaved(): void {
    this.stateService.setViewModified(false);
  }

  // ========================================
  // VIEW MODE & FILTERING (Dashboard Header)
  // ========================================

  /**
   * Handle smart filter change from dashboard header
   */
  public onSmartFilterChanged(prompt: string): void {
    this.stateService.setSmartFilterPrompt(prompt);
    this.filterInput$.next(prompt);
  }

  /**
   * Handle direct keyboard input in the filter text box.
   * Only updates the live display text and pushes to the debounce subject.
   * Does NOT trigger state changes or URL updates — those happen after the debounce.
   */
  public onFilterInputChanged(filterText: string): void {
    this.liveFilterText = filterText;
    this.filterInput$.next(filterText);
  }

  /**
   * Clear the record filter (called by the X button).
   */
  public clearRecordFilter(): void {
    this.liveFilterText = '';
    this.debouncedFilterText = '';
    this.stateService.setSmartFilterPrompt('');
    this.filterInput$.next('');
    this.cdr.detectChanges();
  }

  /**
   * Handle filter text change from mj-entity-viewer (two-way binding)
   */
  public onFilterTextChanged(filterText: string): void {
    this.liveFilterText = filterText;
    this.debouncedFilterText = filterText;
    this.stateService.setSmartFilterPrompt(filterText);
    this.cdr.detectChanges();
  }

  // ========================================
  // ENTITY VIEWER EVENT HANDLERS
  // ========================================

  /**
   * Handle record selection from mj-entity-viewer
   */
  public onViewerRecordSelected(event: RecordSelectedEvent): void {
    this.selectedRecord = event.record;
    // When selecting from grid, detail panel entity matches the grid entity
    this.detailPanelEntity = this.selectedEntity;
    const recordName = this.getRecordDisplayName(event.record);
    const pkString = event.compositeKey.ToConcatenatedString();
    this.stateService.selectRecord(pkString, recordName);

    // Add to recent items (local state for navigation panel)
    if (this.selectedEntity) {
      this.stateService.addRecentItem({
        entityName: this.selectedEntity.Name,
        compositeKeyString: pkString,
        displayName: recordName
      });

      // Update local recent records immediately for instant home screen updates
      const recordId = event.compositeKey.KeyValuePairs[0]?.Value?.toString() || '';
      this.stateService.addLocalRecentRecord(
        this.selectedEntity.Name,
        this.selectedEntity.ID,
        recordId,
        recordName
      );

      // Log to User Record Logs for persistence (fire-and-forget)
      this.recentAccessService.logAccess(
        this.selectedEntity.Name,
        event.compositeKey.Values(),
        'record'
      );
    }
  }

  /**
   * Handle record opened from mj-entity-viewer (double-click or open button)
   */
  public onViewerRecordOpened(event: RecordOpenedEvent): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entity.Name,
      RecordPKey: event.compositeKey
    });
  }

  /**
   * Handle the workspace's OpenRecordRequested (record open from the inner viewer). Builds the
   * composite key from the record and routes to the full record view via the OpenEntityRecord output.
   */
  public onWorkspaceOpenRecord(event: { entity: EntityInfo; record: Record<string, unknown> }): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entity.Name,
      RecordPKey: buildCompositeKey(event.record, event.entity)
    });
  }

  /**
   * Handle data loaded from mj-entity-viewer
   */
  public onDataLoaded(event: DataLoadedEvent): void {
    this.totalRecordCount = event.totalRowCount;
    this.filteredRecordCount = event.loadedRowCount;
    // Store loaded records for back/forward navigation lookup
    this.loadedRecords = event.records;

    // Handle pending record selection from deep link
    if (this.pendingRecordSelection && this.selectedEntity) {
      const recordId = this.pendingRecordSelection;
      this.pendingRecordSelection = null; // Clear it so we don't keep trying

      // Try to find the record by primary key or concatenated string
      const entity = this.selectedEntity;
      const record = event.records.find(r => {
        const pkString = buildPkString(r, entity);
        const pkValue = entity.PrimaryKeys[0] ? String(r[entity.PrimaryKeys[0].Name] ?? '') : '';
        return pkString === recordId || pkValue === recordId;
      });

      if (record) {
        this.selectedRecord = record;
        this.detailPanelEntity = this.selectedEntity;
        const recordName = this.getRecordDisplayName(record);
        this.stateService.selectRecord(buildPkString(record, entity), recordName);
      } else {
        console.warn(`[DataExplorer] Deep link record not found: ${recordId}`);
      }
    }
    // Restore selected record if we have a persisted selectedRecordId
    else if (this.state.selectedRecordId && this.state.detailPanelOpen && !this.selectedRecord && this.selectedEntity) {
      const entity = this.selectedEntity;
      const record = event.records.find(r =>
        buildPkString(r, entity) === this.state.selectedRecordId
      );
      if (record) {
        this.selectedRecord = record;
        this.detailPanelEntity = this.selectedEntity;
      }
    }

    this.cdr.detectChanges();
  }

  /**
   * Handle filtered count change from mj-entity-viewer
   */
  public onFilteredCountChanged(event: FilteredCountChangedEvent): void {
    this.filteredRecordCount = event.filteredCount;
    this.totalRecordCount = event.totalCount;
    this.cdr.detectChanges();
  }

  // ========================================
  // DETAIL PANEL
  // ========================================

  /**
   * Handle detail panel close
   */
  public onDetailPanelClosed(): void {
    this.selectedRecord = null;
    this.detailPanelEntity = null;
    this.stateService.closeDetailPanel();
  }

  /**
   * Handle opening a record in full view (from detail panel)
   * Uses detailPanelEntity since the panel may be showing a different entity than the grid
   */
  public onOpenRecord(record: Record<string, unknown>): void {
    if (!this.detailPanelEntity) return;

    this.OpenEntityRecord.emit({
      EntityName: this.detailPanelEntity.Name,
      RecordPKey: buildCompositeKey(record, this.detailPanelEntity)
    });
  }

  /**
   * Handle creating a new record for the current entity
   */
  public onCreateNewRecord(): void {
    if (!this.selectedEntity) return;

    // Use NavigationService to open a new record form
    this.navigationService.OpenNewEntityRecord(this.selectedEntity.Name);
  }

  /**
   * Show a notification to the user
   */
  private showNotification(message: string, type: 'info' | 'success' | 'error', duration: number): void {
    const data: DisplaySimpleNotificationRequestData = {
      message: message,
      style: type,
      DisplayDuration: duration
    };
    MJGlobal.Instance.RaiseEvent({
      component: this,
      event: MJEventType.DisplaySimpleNotificationRequest,
      eventCode: "",
      args: data
    });
  }

  /**
   * Handle navigation to a related entity from detail panel.
   * Navigates within the explorer and applies filter to show related records.
   */
  public onNavigateToRelated(event: NavigateToRelatedEvent): void {
    const entity = this.entities.find(e => e.Name === event.entityName);
    if (!entity) {
      // Entity not in our filtered list - it may exist in the system but not be part of this app
      console.warn(`Entity not found in explorer: ${event.entityName}`);
      return;
    }

    // Close detail panel and clear current record
    this.selectedRecord = null;
    this.detailPanelEntity = null;
    this.stateService.closeDetailPanel();

    // Navigate to the entity
    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);

    // Apply the filter to show related records
    // The filter is in SQL format like "ParentID='xxx'" - we just show it in the filter box
    // The entity viewer will apply it as a smart filter
    if (event.filter) {
      // Apply the filter to the smart filter state (separate from user search)
      this.stateService.setSmartFilterPrompt(event.filter);
    }
  }

  /**
   * Handle opening a related record - display in detail panel (not new tab)
   * The record is already loaded, so just update the detail panel
   */
  public onOpenRelatedRecord(event: { entityName: string; record: Record<string, unknown> }): void {
    this.showRecordInDetailPanel(event.entityName, event.record);
  }

  /**
   * Handle opening a foreign key record (from FK field link in detail panel)
   * Loads the record and displays it in the detail panel
   */
  public async onOpenForeignKeyRecord(event: { entityName: string; recordId: string }): Promise<void> {
    await this.loadAndShowRecordInDetailPanel(event.entityName, event.recordId);
  }

  /**
   * Show an already-loaded record in the detail panel
   * Note: This does NOT change selectedEntity (the main grid's entity)
   * It only updates detailPanelEntity which is used by the detail panel
   */
  private showRecordInDetailPanel(entityName: string, record: Record<string, unknown>): void {
    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    if (!entityInfo) {
      console.warn(`Entity not found: ${entityName}`);
      return;
    }

    // Update the detail panel entity and record
    // detailPanelEntity may differ from selectedEntity when viewing FK/related records
    this.detailPanelEntity = entityInfo;
    this.selectedRecord = record;

    // Use selectRecord to open the panel with proper state tracking
    const recordName = this.getRecordDisplayName(record, entityInfo);
    this.stateService.selectRecord(buildPkString(record, entityInfo), recordName);
    this.cdr.detectChanges();
  }

  /**
   * Load a record by ID and show it in the detail panel
   */
  private async loadAndShowRecordInDetailPanel(entityName: string, recordId: string): Promise<void> {
    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    if (!entityInfo) {
      console.warn(`Entity not found: ${entityName}`);
      return;
    }

    try {
      // Load the record
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entityName,
        ExtraFilter: `ID='${recordId}'`,
        ResultType: 'simple',
        MaxRows: 1
      });

      if (result.Success && result.Results.length > 0) {
        this.ngZone.run(() => {
          this.showRecordInDetailPanel(entityName, result.Results[0]);
        });
      } else {
        console.warn(`Record not found: ${entityName} ID=${recordId}`);
      }
    } catch (error) {
      console.error(`Failed to load record: ${entityName} ID=${recordId}`, error);
    }
  }

  // ========================================
  // NAVIGATION PANEL
  // ========================================

  /**
   * Handle opening a record from navigation panel (recent/favorites)
   */
  public onOpenRecordFromNav(event: OpenRecordEvent): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.compositeKey
    });
  }

  /**
   * Handle selecting a record from navigation panel (recent/favorites).
   * Navigates to the entity within Data Explorer and selects the record
   * in the detail panel (instead of opening full record view).
   */
  public onSelectRecordFromNav(event: SelectRecordEvent): void {
    const entity = this.entities.find(e => e.Name === event.entityName);
    if (entity) {
      // Set pending record selection - will be resolved in onDataLoaded
      this.pendingRecordSelection = event.recordId;
      this.onEntitySelected(entity);
    }
  }

  /**
   * Toggle navigation panel
   */
  public toggleNavigationPanel(): void {
    this.stateService.toggleNavigationPanel();
  }

  /**
   * Handle expand and focus from collapsed nav icon click
   */
  public onExpandAndFocus(section: 'favorites' | 'recent' | 'entities'): void {
    this.stateService.expandAndFocusSection(section);
  }

  // ========================================
  // DEEP LINK HANDLING
  // ========================================

  /**
   * Apply a deep link to navigate to a specific entity/record
   */
  private async applyDeepLink(deepLink: DataExplorerDeepLink): Promise<void> {
    // ViewTypeID-only: view type is no longer deep-linked — the inner viewer persists it.

    // Navigate to entity if specified
    if (deepLink.entity) {
      const entity = this.entities.find(e =>
        e.Name.toLowerCase() === deepLink.entity!.toLowerCase()
      );

      if (entity) {
        // Reset counts before setting entity to prevent stale data display
        this.resetRecordCounts();
        this.selectedEntity = entity;
        this.stateService.selectEntity(entity.Name);

        // Apply filter if specified (to smart filter state, not user search)
        if (deepLink.filter) {
          this.stateService.setSmartFilterPrompt(deepLink.filter);
        }

        // Note: Record selection is handled after data loads via onDataLoaded
        // We store the record ID to select once data is available
        if (deepLink.record) {
          this.pendingRecordSelection = deepLink.record;
        }
      } else {
        console.warn(`[DataExplorer] Deep link entity not found: ${deepLink.entity}`);
      }
    }
  }

  /** Record ID to select once data loads (from deep link) */
  private pendingRecordSelection: string | null = null;

  // ========================================
  // BREADCRUMB NAVIGATION
  // ========================================

  /**
   * Handle breadcrumb click - navigate to that level
   */
  public onBreadcrumbClick(breadcrumb: BreadcrumbItem, index: number): void {
    // Don't navigate if it's the last (current) breadcrumb
    if (index === this.breadcrumbs.length - 1) {
      return;
    }

    this.stateService.navigateToBreadcrumb(breadcrumb);

    // If navigating to application level, clear entity selection
    if (breadcrumb.type === 'application') {
      this.selectedEntity = null;
      this.selectedRecord = null;
      this.detailPanelEntity = null;
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Get the set of allowed entity names for filtering favorites/recents.
   * Returns null if no filter is active (all entities allowed).
   */
  public get allowedEntityNames(): Set<string> | null {
    if (!this.entityFilter) {
      return null;
    }
    return new Set(this.entities.map(e => e.Name));
  }

  /**
   * Get display name for a record
   */
  private getRecordDisplayName(record: Record<string, unknown>, entityInfo?: EntityInfo): string {
    const entity = entityInfo || this.selectedEntity;
    if (!entity) return 'Unknown';

    if (entity.NameField) {
      const nameValue = record[entity.NameField.Name];
      if (nameValue) return String(nameValue);
    }

    return buildPkString(record, entity);
  }

  /**
   * Get the icon class for an entity
   */
  public getEntityIcon(entity: EntityInfo): string {
    if (entity.Icon) {
      return this.formatEntityIcon(entity.Icon);
    }
    return 'fa-solid fa-table';
  }

  /**
   * Format entity icon to ensure proper Font Awesome class format
   */
  private formatEntityIcon(icon: string): string {
    if (!icon) {
      return 'fa-solid fa-table';
    }
    if (icon.startsWith('fa-') || icon.startsWith('fa ')) {
      if (icon.startsWith('fa-solid') || icon.startsWith('fa-regular') ||
          icon.startsWith('fa-light') || icon.startsWith('fa-brands') ||
          icon.startsWith('fa ')) {
        return icon;
      }
      return `fa-solid ${icon}`;
    }
    return `fa-solid fa-${icon}`;
  }

  // ========================================
  // URL DEEP LINKING (Framework Query Param Lifecycle)
  // ========================================

  /**
   * Build a DataExplorerDeepLink from framework query params.
   * Returns null if no relevant params found.
   */
  private buildDeepLinkFromParams(params: Record<string, string>): DataExplorerDeepLink | null {
    const entity = params['entity'] || null;
    const record = params['record'] || null;
    const filterParam = params['filter'] || null;
    const viewId = params['viewId'] || null;

    if (!entity && !record && !filterParam && !viewId) {
      return null;
    }

    // ViewTypeID-only: the active view type is persisted via UserView.ViewTypeID / per-user settings
    // by the inner viewer, NOT via URL query params. So we no longer read/write view/mapMode here.
    return {
      entity: entity || undefined,
      record: record || undefined,
      filter: filterParam || undefined,
      viewId: viewId || undefined
    };
  }

  /**
   * React to back/forward navigation or deep-link entry.
   * The base class calls this when query params change via popstate or deeplink.
   */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    this.applyParams(params);
  }

  /**
   * Public entry point for the resource wrapper to forward query param changes.
   * The wrapper receives OnQueryParamsChanged from the framework and delegates here.
   */
  public HandleQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    this.applyParams(params);
  }

  /**
   * Apply a params map (from framework query params) to the component state.
   */
  private async applyParams(params: Record<string, string>): Promise<void> {
    const deepLink = this.buildDeepLinkFromParams(params);
    if (deepLink) {
      await this.applyUrlState(deepLink);
    } else {
      // No params — go to home view
      this.selectedEntity = null;
      this.selectedRecord = null;
      this.detailPanelEntity = null;
      this.stateService.selectEntity(null);
      this.stateService.closeDetailPanel();
      this.cdr.detectChanges();
    }
  }

  /**
   * Push current navigation state to the URL via the framework.
   * Called whenever state changes so users can bookmark/share URLs.
   */
  private pushCurrentStateToUrl(): void {
    const hasEntity = !!this.state.selectedEntityName;
    const hasViewId = !!(this.state.selectedViewId && hasEntity);

    // ViewTypeID-only: the active view type is persisted by the inner viewer (UserView.ViewTypeID /
    // per-user settings), not via URL. We only round-trip entity / record / saved-view selection.
    const queryParams: Record<string, string | null> = {
      entity: this.state.selectedEntityName || null,
      record: (this.state.selectedRecordId && hasEntity) ? this.state.selectedRecordId : null,
      filter: null, // Never in URL — filters live in saved views (DB), not query strings
      viewId: hasViewId ? this.state.selectedViewId : null
    };


    this.UpdateQueryParams(queryParams);
  }

  /**
   * Apply URL state to the component.
   * Used both during init and for popstate handling.
   */
  private async applyUrlState(urlState: DataExplorerDeepLink): Promise<void> {
    // ViewTypeID-only: view type / map mode are no longer URL-driven — the inner viewer persists them.

    // Navigate to entity if specified
    if (urlState.entity) {
      const entity = this.entities.find(e =>
        e.Name.toLowerCase() === urlState.entity!.toLowerCase()
      );

      if (entity) {
        const entityChanged = this.selectedEntity?.Name !== entity.Name;

        if (entityChanged) {
          // Entity changed - reset counts and select new entity
          this.resetRecordCounts();
          this.selectedEntity = entity;
          this.stateService.selectEntity(entity.Name);
        }

        // Restore saved view by ID if specified. The workspace applies the view's grid state
        // itself once selectedViewEntity flows into its [SelectedView] input.
        if (urlState.viewId) {
          await this.restoreViewFromUrl(urlState.viewId, entity);
        } else {
          // No specific view — clear view selection to use default
          this.selectedViewEntity = null;
          this.stateService.selectView(null);
        }

        // Filters live in saved views (DB), never in URL query strings.
        // Clear smart filter on entity change when no specific view is selected.
        if (entityChanged && !urlState.viewId) {
          this.stateService.setSmartFilterPrompt('');
        }
        // User search text is always cleared when applying URL state
        this.liveFilterText = '';
        this.debouncedFilterText = '';

        // Handle record selection
        if (urlState.record) {
          if (entityChanged) {
            // Entity changed - need to wait for data to load
            this.pendingRecordSelection = urlState.record;
          } else if (this.selectedEntity) {
            // Entity is the same - find record from already-loaded data
            const entity = this.selectedEntity;
            const record = this.loadedRecords.find(r => {
              const pkString = buildPkString(r, entity);
              const pkValue = entity.PrimaryKeys[0] ? String(r[entity.PrimaryKeys[0].Name] ?? '') : '';
              return pkString === urlState.record || pkValue === urlState.record;
            });

            if (record) {
              this.selectedRecord = record;
              this.detailPanelEntity = this.selectedEntity;
              const recordName = this.getRecordDisplayName(record);
              this.stateService.selectRecord(buildPkString(record, entity), recordName);
            } else {
              // Record not in current page - update state but panel won't show
              this.stateService.selectRecord(urlState.record, this.state.selectedRecordName || undefined);
            }
          }
        } else {
          // Clear record selection if not in URL
          this.selectedRecord = null;
          this.detailPanelEntity = null;
          this.stateService.closeDetailPanel();
        }
      }
    } else {
      // No entity in URL - go to home view
      this.selectedEntity = null;
      this.selectedRecord = null;
      this.detailPanelEntity = null;
      this.stateService.selectEntity(null);
      this.stateService.closeDetailPanel();
    }

    this.cdr.detectChanges();
  }

  /**
   * Restore a saved view from the URL's viewId parameter.
   * Looks up the view by ID and sets it as selected; the workspace applies its grid state once
   * selectedViewEntity flows into its [SelectedView] input. Must be async because UserViewEngine's
   * cache may not be populated yet on cold page loads.
   */
  private async restoreViewFromUrl(viewId: string, entity: EntityInfo): Promise<void> {
    // Ensure the view engine cache is populated before querying —
    // on hard refresh, the cache may be empty and GetAccessibleViewsForEntity returns []
    await UserViewEngine.Instance.Config(false);

    const accessibleViews = UserViewEngine.Instance.GetAccessibleViewsForEntity(entity.ID);
    const view = accessibleViews.find(v => UUIDsEqual(v.ID, viewId)) || null;

    if (view) {
      this.selectedViewEntity = view;
      this.stateService.selectView(viewId);

      // Apply the view's smart filter if it has one
      if (view.SmartFilterEnabled && view.SmartFilterPrompt) {
        this.stateService.setSmartFilterPrompt(view.SmartFilterPrompt);
      }
    } else {
      console.warn('[DataExplorer] restoreViewFromUrl: view NOT FOUND, falling back to default. viewId=', viewId);
      this.selectedViewEntity = null;
      this.stateService.selectView(null);
    }

    this.cdr.detectChanges();
  }

  /**
   * Emit the current display name based on selected entity/record.
   */
  private emitDisplayName(): void {
    if (this.state.selectedEntityName) {
      this.DisplayNameChanged.emit(this.state.selectedEntityName);
    } else {
      this.DisplayNameChanged.emit('Data');
    }
  }

  // ========================================
  // HOME SCREEN ACTIONS
  // ========================================

  /**
   * Toggle entity favorite status
   */
  public async toggleEntityFavorite(entity: EntityInfo, event: Event): Promise<void> {
    event.stopPropagation(); // Prevent card click
    if (this.stateService.isEntityFavorited(entity.ID)) {
      await this.stateService.removeEntityFromFavorites(entity.ID);
    } else {
      await this.stateService.addEntityToFavorites(entity.Name, entity.ID);
    }
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  /**
   * Check if entity is favorited (for template)
   */
  public isEntityFavorited(entity: EntityInfo): boolean {
    return this.stateService.isEntityFavorited(entity.ID);
  }

  /**
   * Toggle show all entities vs common entities
   */
  public toggleShowAllEntities(): void {
    this.stateService.toggleShowAllEntities();
  }

  // ========================================
  // Concept D: Application Groups + Quick Access Panel
  // ========================================

  /**
   * Toggle an application group's expanded/collapsed state
   */
  public toggleAppGroup(groupId: string): void {
    this.stateService.toggleAppGroupExpanded(groupId);
    // Update local cache for immediate UI response
    const group = this.appEntityGroups.find(g => g.applicationId === groupId);
    if (group) {
      group.isExpanded = !group.isExpanded;
    }
    this.cdr.detectChanges();
  }

  /**
   * Set the home view mode (all vs favorites)
   */
  public setHomeViewMode(mode: 'all' | 'favorites'): void {
    this.stateService.setHomeViewMode(mode);
  }

  /**
   * Toggle the quick access (right) panel
   */
  public toggleQuickAccessPanel(): void {
    this.stateService.toggleQuickAccessPanel();
  }

  /**
   * Toggle a section in the quick access panel
   */
  public toggleQuickAccessSection(sectionId: string): void {
    this.stateService.toggleQuickAccessSection(sectionId);
  }

  /**
   * Build application entity groups from metadata.
   * Groups entities by their first application membership.
   * Entities not in any application go into "System & Other".
   */
  private buildAppEntityGroups(): void {
    // Skip grouping when filtered to a single application
    if (this.entityFilter?.applicationId) {
      this.appEntityGroups = [];
      return;
    }

    const applications = this.metadata.Applications;
    const entityIdToApps = new Map<string, ApplicationInfo[]>();
    const groupMap = new Map<string, AppEntityGroup>();

    // Build entity -> applications mapping (an entity can belong to multiple apps)
    for (const app of applications) {
      for (const appEntity of app.ApplicationEntities) {
        const apps = entityIdToApps.get(appEntity.EntityID);
        if (apps) {
          apps.push(app);
        } else {
          entityIdToApps.set(appEntity.EntityID, [app]);
        }
      }
    }

    // Assign each visible entity to all of its application groups
    const ungroupedEntities: EntityInfo[] = [];
    for (const entity of this.entities) {
      const apps = entityIdToApps.get(entity.ID);
      if (apps) {
        for (const app of apps) {
          this.addEntityToGroup(groupMap, app, entity);
        }
      } else {
        ungroupedEntities.push(entity);
      }
    }

    // Convert map to sorted array
    const groups = Array.from(groupMap.values())
      .sort((a, b) => a.applicationName.localeCompare(b.applicationName));

    // Add "System & Other" catch-all if there are ungrouped entities
    if (ungroupedEntities.length > 0) {
      groups.push({
        applicationId: '__system_other__',
        applicationName: 'System & Other',
        applicationIcon: 'fa-solid fa-ellipsis',
        applicationColor: 'var(--mj-text-disabled)',
        entities: ungroupedEntities,
        isExpanded: this.state.expandedAppGroups.includes('__system_other__')
      });
    }

    // Apply expanded state from persisted state
    for (const group of groups) {
      group.isExpanded = this.state.expandedAppGroups.includes(group.applicationId);
    }

    this.appEntityGroups = groups;
  }

  /**
   * Add an entity to its application group in the map, creating the group if needed
   */
  private addEntityToGroup(
    groupMap: Map<string, AppEntityGroup>,
    app: ApplicationInfo,
    entity: EntityInfo
  ): void {
    let group = groupMap.get(app.ID);
    if (!group) {
      group = {
        applicationId: app.ID,
        applicationName: app.Name,
        applicationIcon: app.Icon || 'fa-solid fa-cube',
        applicationColor: app.Color,
        entities: [],
        isExpanded: false
      };
      groupMap.set(app.ID, group);
    }
    group.entities.push(entity);
  }

  /**
   * Handle clicking on a recent record from home screen.
   * Navigates to the entity and sets up pending selection to select the record
   * and open the detail panel once data loads.
   */
  public onRecentRecordClick(record: RecentRecordAccess): void {
    const entity = this.entities.find(e => UUIDsEqual(e.ID, record.entityId));
    if (entity) {
      // Set pending record selection - will be resolved in onDataLoaded
      this.pendingRecordSelection = record.recordId;
      this.onEntitySelected(entity);
    }
  }

  /**
   * Handle clicking on a favorite record from home screen.
   * Navigates to the entity and sets up pending selection to select the record
   * and open the detail panel once data loads.
   */
  public onFavoriteRecordClick(record: FavoriteRecord): void {
    const entity = this.entities.find(e => UUIDsEqual(e.ID, record.entityId));
    if (entity) {
      // Set pending record selection - will be resolved in onDataLoaded
      this.pendingRecordSelection = record.recordId;
      this.onEntitySelected(entity);
    }
  }

  /**
   * Get the icon for an entity by ID (for recent records)
   */
  public getEntityIconById(entityId: string): string {
    const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, entityId));
    if (entity) {
      return this.getEntityIcon(entity);
    }
    return 'fa-solid fa-table';
  }

  // Cache for relative time strings to prevent recalculation during change detection
  private relativeTimeCache = new Map<number, { formatted: string; cachedAt: number }>();

  /**
   * Format relative time for display (e.g., "2 hours ago")
   * Cached to prevent ExpressionChangedAfterItHasBeenCheckedError
   */
  public formatRelativeTime(date: Date): string {
    if (!date) return '';

    const timestamp = new Date(date).getTime();
    const now = Date.now();

    // Check cache - use cached value if less than 10 seconds old
    const cached = this.relativeTimeCache.get(timestamp);
    if (cached && (now - cached.cachedAt) < 10000) {
      return cached.formatted;
    }

    // Calculate new value
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    let formatted: string;
    if (minutes < 1) formatted = 'Just now';
    else if (minutes < 60) formatted = `${minutes}m ago`;
    else if (hours < 24) formatted = `${hours}h ago`;
    else if (days < 7) formatted = `${days}d ago`;
    else formatted = new Date(date).toLocaleDateString();

    // Cache the result
    this.relativeTimeCache.set(timestamp, { formatted, cachedAt: now });

    // Cleanup old cache entries (keep last 100)
    if (this.relativeTimeCache.size > 100) {
      const firstKey = this.relativeTimeCache.keys().next().value;
      if (firstKey !== undefined) {
        this.relativeTimeCache.delete(firstKey);
      }
    }

    return formatted;
  }

  /**
   * Check if we're at the home level (no entity selected)
   */
  get isAtHomeLevel(): boolean {
    return !this.selectedEntity;
  }

  /**
   * NAVIGATION handler: open a *related* record on a (possibly different) entity, bubbled up from a
   * plug-in renderer through the workspace (e.g. a grid foreign-key drill-through). Resolves the
   * target entity and shows the record in the detail panel, mirroring the FK navigation path used
   * by {@link onOpenForeignKeyRecord}.
   *
   * @param nav the related-record navigation payload: the target entity name and the record's key.
   */
  public onOpenRelatedRecordRequested(nav: ViewRelatedRecordNavigation): void {
    if (nav?.entityName && nav.recordKey != null) {
      void this.loadAndShowRecordInDetailPanel(nav.entityName, String(nav.recordKey));
    }
  }
}
