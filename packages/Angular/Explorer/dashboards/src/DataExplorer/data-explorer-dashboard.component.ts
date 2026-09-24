import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, Input, Output, EventEmitter, OnChanges, SimpleChanges, HostListener, ElementRef, ViewChild, NgZone } from '@angular/core';

import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BaseDashboard, NavigationService } from '@memberjunction/ng-shared';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, EntityInfo, RunView, EntityFieldTSType, ApplicationInfo } from '@memberjunction/core';
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
import { DataExplorerState, DataExplorerFilter, BreadcrumbItem, DataExplorerDeepLink, RecentRecordAccess, FavoriteRecord, AppEntityGroup, DataExplorerViewMode } from './models/explorer-state.interface';
import { OpenRecordEvent, SelectRecordEvent } from './components/navigation-panel/navigation-panel.component';
import { DisplaySimpleNotificationRequestData, MJEventType, MJGlobal } from '@memberjunction/global';
import { buildDataExplorerAgentContext, isValidViewMode, isValidEntityBrowserMode, AppGroupSummary, entityDisplayName, resolveEntityByName, resolveRecordSelection, RecordSelectionRequest } from './data-explorer-agent-context';
import { validateStringParam, validateEnumParam, validateNonNegativeNumberParam, VALID_ENTITY_BROWSER_MODES_FOR_VALIDATION } from '../shared/agent-tool-validation';

/**
 * Default server-side page size used by the inner entity viewer when {@link viewerConfig}
 * doesn't override `pageSize`. Mirrors the viewer's own default (EntityViewerComponent),
 * and is used to derive the agent-reported total page count.
 */
const DATA_EXPLORER_DEFAULT_PAGE_SIZE = 100;

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
export class DataExplorerDashboardComponent extends BaseDashboard implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  protected override destroy$ = new Subject<void>();
  private metadata = this.ProviderToUse;

  /** Reference to the filter input for keyboard shortcuts */
  @ViewChild('filterInput') FilterInputRef: ElementRef<HTMLInputElement> | undefined;

  /** @deprecated Use {@link FilterInputRef}. */
  get filterInputRef(): ElementRef<HTMLInputElement> | undefined {
    return this.FilterInputRef;
  }
  /** @deprecated Use {@link FilterInputRef}. */
  set filterInputRef(value: ElementRef<HTMLInputElement> | undefined) {
    this.FilterInputRef = value;
  }

  /** Reference to the view workspace (owns view CRUD + the inner data renderer) */
  @ViewChild(ViewWorkspaceComponent) ViewWorkspaceRef: ViewWorkspaceComponent | undefined;

  /** @deprecated Use {@link ViewWorkspaceRef}. */
  get viewWorkspaceRef(): ViewWorkspaceComponent | undefined {
    return this.ViewWorkspaceRef;
  }
  /** @deprecated Use {@link ViewWorkspaceRef}. */
  set viewWorkspaceRef(value: ViewWorkspaceComponent | undefined) {
    this.ViewWorkspaceRef = value;
  }

  /**
   * Optional filter to constrain which entities are shown in the explorer.
   * Can filter by applicationId, schemaNames, or explicit entityNames.
   */
  @Input() EntityFilter: DataExplorerFilter | null = null;

  /** @deprecated Use {@link EntityFilter}. */
  @Input() set entityFilter(value: DataExplorerFilter | null) {
    this.EntityFilter = value;
  }
  /** @deprecated Use {@link EntityFilter}. */
  get entityFilter(): DataExplorerFilter | null {
    return this.EntityFilter;
  }

  /**
   * Optional deep link to navigate to a specific entity/record on load.
   * Parsed from URL query parameters (e.g., ?entity=Users&record=123)
   */
  @Input() DeepLink: DataExplorerDeepLink | null = null;

  /** @deprecated Use {@link DeepLink}. */
  @Input() set deepLink(value: DataExplorerDeepLink | null) {
    this.DeepLink = value;
  }
  /** @deprecated Use {@link DeepLink}. */
  get deepLink(): DataExplorerDeepLink | null {
    return this.DeepLink;
  }

  /**
   * Optional context name to display in the header instead of "Data Explorer".
   * Use this to customize the explorer for specific applications (e.g., "CRM", "Association Demo").
   */
  @Input() ContextName: string | null = null;

  /** @deprecated Use {@link ContextName}. */
  @Input() set contextName(value: string | null) {
    this.ContextName = value;
  }
  /** @deprecated Use {@link ContextName}. */
  get contextName(): string | null {
    return this.ContextName;
  }

  /**
   * Optional context icon (Font Awesome class) to display in the header.
   * Use this alongside contextName for a fully customized header (e.g., "fa-solid fa-users" for CRM).
   */
  @Input() ContextIcon: string | null = null;

  /** @deprecated Use {@link ContextIcon}. */
  @Input() set contextIcon(value: string | null) {
    this.ContextIcon = value;
  }
  /** @deprecated Use {@link ContextIcon}. */
  get contextIcon(): string | null {
    return this.ContextIcon;
  }

  /**
   * Initial query params forwarded from the resource wrapper.
   * On hard refresh, the shell delivers params to the wrapper (which has Data.Configuration.queryParams),
   * not to this inner dashboard component. This input bridges that gap.
   */
  @Input() InitialQueryParams: Record<string, string> = {};

  /** @deprecated Use {@link InitialQueryParams}. */
  @Input() set initialQueryParams(value: Record<string, string>) {
    this.InitialQueryParams = value;
  }
  /** @deprecated Use {@link InitialQueryParams}. */
  get initialQueryParams(): Record<string, string> {
    return this.InitialQueryParams;
  }

  /**
   * Emitted when the display title should change (entity selected, record opened, etc.)
   */
  @Output() DisplayNameChanged = new EventEmitter<string>();

  // State
  public State: DataExplorerState;

  /** @deprecated Use {@link State}. */
  public get state(): DataExplorerState {
    return this.State;
  }
  /** @deprecated Use {@link State}. */
  public set state(value: DataExplorerState) {
    this.State = value;
  }

  // Entity data - all entities available to the user
  private allEntities: EntityInfo[] = [];
  // Filtered entities based on entityFilter
  public Entities: EntityInfo[] = [];

  /** @deprecated Use {@link Entities}. */
  public get entities(): EntityInfo[] {
    return this.Entities;
  }
  /** @deprecated Use {@link Entities}. */
  public set entities(value: EntityInfo[]) {
    this.Entities = value;
  }
  // Application entity groups for the home view (Concept D)
  public AppEntityGroups: AppEntityGroup[] = [];

  /** @deprecated Use {@link AppEntityGroups}. */
  public get appEntityGroups(): AppEntityGroup[] {
    return this.AppEntityGroups;
  }
  /** @deprecated Use {@link AppEntityGroups}. */
  public set appEntityGroups(value: AppEntityGroup[]) {
    this.AppEntityGroups = value;
  }
  // Entity IDs for the current application (loaded when applicationId filter is set)
  private applicationEntityIds: Set<string> = new Set();
  public SelectedEntity: EntityInfo | null = null;

  /** @deprecated Use {@link SelectedEntity}. */
  public get selectedEntity(): EntityInfo | null {
    return this.SelectedEntity;
  }
  /** @deprecated Use {@link SelectedEntity}. */
  public set selectedEntity(value: EntityInfo | null) {
    this.SelectedEntity = value;
  }

  // Record counts (updated by mj-entity-viewer)
  public totalRecordCount = 0;
  public FilteredRecordCount = 0;

  /** @deprecated Use {@link FilteredRecordCount}. */
  public get filteredRecordCount() {
    return this.FilteredRecordCount;
  }
  /** @deprecated Use {@link FilteredRecordCount}. */
  public set filteredRecordCount(value) {
    this.FilteredRecordCount = value;
  }

  // Selected record for detail panel
  public SelectedRecord: Record<string, unknown> | null = null;

  /** @deprecated Use {@link SelectedRecord}. */
  public get selectedRecord(): Record<string, unknown> | null {
    return this.SelectedRecord;
  }
  /** @deprecated Use {@link SelectedRecord}. */
  public set selectedRecord(value: Record<string, unknown> | null) {
    this.SelectedRecord = value;
  }
  // Entity info for the detail panel (may differ from selectedEntity when viewing FK/related records)
  public DetailPanelEntity: EntityInfo | null = null;

  /** @deprecated Use {@link DetailPanelEntity}. */
  public get detailPanelEntity(): EntityInfo | null {
    return this.DetailPanelEntity;
  }
  /** @deprecated Use {@link DetailPanelEntity}. */
  public set detailPanelEntity(value: EntityInfo | null) {
    this.DetailPanelEntity = value;
  }
  // Currently loaded records from mj-entity-viewer (for back/forward navigation lookup)
  private loadedRecords: Record<string, unknown>[] = [];

  // Currently selected view entity (for view data loading)
  public SelectedViewEntity: MJUserViewEntityExtended | null = null;

  /** @deprecated Use {@link SelectedViewEntity}. */
  public get selectedViewEntity(): MJUserViewEntityExtended | null {
    return this.SelectedViewEntity;
  }
  /** @deprecated Use {@link SelectedViewEntity}. */
  public set selectedViewEntity(value: MJUserViewEntityExtended | null) {
    this.SelectedViewEntity = value;
  }

  // Live filter text (what the user sees in the input, updates immediately)
  public LiveFilterText: string = '';

  /** @deprecated Use {@link LiveFilterText}. */
  public get liveFilterText(): string {
    return this.LiveFilterText;
  }
  /** @deprecated Use {@link LiveFilterText}. */
  public set liveFilterText(value: string) {
    this.LiveFilterText = value;
  }
  // Debounced filter text (synced with mj-entity-viewer, updates after delay)
  public DebouncedFilterText: string = '';

  /** @deprecated Use {@link DebouncedFilterText}. */
  public get debouncedFilterText(): string {
    return this.DebouncedFilterText;
  }
  /** @deprecated Use {@link DebouncedFilterText}. */
  public set debouncedFilterText(value: string) {
    this.DebouncedFilterText = value;
  }
  private filterInput$ = new Subject<string>();

  // Entity filter text for home screen
  public EntityFilterText: string = '';

  /** @deprecated Use {@link EntityFilterText}. */
  public get entityFilterText(): string {
    return this.EntityFilterText;
  }
  /** @deprecated Use {@link EntityFilterText}. */
  public set entityFilterText(value: string) {
    this.EntityFilterText = value;
  }

  // Breadcrumbs for navigation display
  public Breadcrumbs: BreadcrumbItem[] = [];

  /** @deprecated Use {@link Breadcrumbs}. */
  public get breadcrumbs(): BreadcrumbItem[] {
    return this.Breadcrumbs;
  }
  /** @deprecated Use {@link Breadcrumbs}. */
  public set breadcrumbs(value: BreadcrumbItem[]) {
    this.Breadcrumbs = value;
  }

  // Loading state for entities
  public IsLoadingEntities: boolean = true;

  /** @deprecated Use {@link IsLoadingEntities}. */
  public get isLoadingEntities(): boolean {
    return this.IsLoadingEntities;
  }
  /** @deprecated Use {@link IsLoadingEntities}. */
  public set isLoadingEntities(value: boolean) {
    this.IsLoadingEntities = value;
  }

  // Recent records from User Record Logs
  public RecentRecords: RecentRecordAccess[] = [];

  /** @deprecated Use {@link RecentRecords}. */
  public get recentRecords(): RecentRecordAccess[] {
    return this.RecentRecords;
  }
  /** @deprecated Use {@link RecentRecords}. */
  public set recentRecords(value: RecentRecordAccess[]) {
    this.RecentRecords = value;
  }

  // Timer that refreshes the pre-computed relative-time labels on recentRecords (see refreshRecentRecordTimes / NG0100 note)
  private recentTimeRefreshTimer: ReturnType<typeof setInterval> | null = null;

  // Favorite records from User Favorites (non-entity favorites)
  public FavoriteRecords: FavoriteRecord[] = [];

  /** @deprecated Use {@link FavoriteRecords}. */
  public get favoriteRecords(): FavoriteRecord[] {
    return this.FavoriteRecords;
  }
  /** @deprecated Use {@link FavoriteRecords}. */
  public set favoriteRecords(value: FavoriteRecord[]) {
    this.FavoriteRecords = value;
  }

  // Loading state for home screen sections
  public IsLoadingRecentRecords: boolean = true;

  /** @deprecated Use {@link IsLoadingRecentRecords}. */
  public get isLoadingRecentRecords(): boolean {
    return this.IsLoadingRecentRecords;
  }
  /** @deprecated Use {@link IsLoadingRecentRecords}. */
  public set isLoadingRecentRecords(value: boolean) {
    this.IsLoadingRecentRecords = value;
  }

  // Entity filter for recent records (null = show all, string = filter by entityId)
  public RecentRecordsEntityFilter: string | null = null;

  /** @deprecated Use {@link RecentRecordsEntityFilter}. */
  public get recentRecordsEntityFilter(): string | null {
    return this.RecentRecordsEntityFilter;
  }
  /** @deprecated Use {@link RecentRecordsEntityFilter}. */
  public set recentRecordsEntityFilter(value: string | null) {
    this.RecentRecordsEntityFilter = value;
  }

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
  get FilteredAppEntityGroups(): AppEntityGroup[] {
    const filterText = this.EntityFilterText.toLowerCase().trim();
    const showFavoritesOnly = this.State.homeViewMode === 'favorites';

    return this.AppEntityGroups
      .map(group => this.filterGroupEntities(group, filterText, showFavoritesOnly))
      .filter(group => group.entities.length > 0);
  }

  /** @deprecated Use {@link FilteredAppEntityGroups}. */
  get filteredAppEntityGroups(): AppEntityGroup[] {
    return this.FilteredAppEntityGroups;
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
      filtered = filtered.filter(e => this.IsEntityFavorited(e));
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
  get FlatFilteredEntities(): EntityInfo[] {
    let result = this.Entities;

    if (this.State.homeViewMode === 'favorites') {
      result = result.filter(e => this.IsEntityFavorited(e));
    }

    const filterText = this.EntityFilterText.toLowerCase().trim();
    if (filterText) {
      result = result.filter(e =>
        e.Name.toLowerCase().includes(filterText) ||
        e.DisplayNameOrName.toLowerCase().includes(filterText) ||
        (e.Description && e.Description.toLowerCase().includes(filterText))
      );
    }

    return result;
  }

  /** @deprecated Use {@link FlatFilteredEntities}. */
  get flatFilteredEntities(): EntityInfo[] {
    return this.FlatFilteredEntities;
  }

  /**
   * Total count of entities matching current filters (across all groups or flat list)
   */
  get FilteredEntityCount(): number {
    if (this.EntityFilter?.applicationId) {
      return this.FlatFilteredEntities.length;
    }
    return this.FilteredAppEntityGroups.reduce((sum, g) => sum + g.entities.length, 0);
  }

  /** @deprecated Use {@link FilteredEntityCount}. */
  get filteredEntityCount(): number {
    return this.FilteredEntityCount;
  }

  /** No-results message for the entity list (echoes the filter text). */
  get NoEntityResultsMessage(): string {
    return `No entities match "${this.EntityFilterText}".`;
  }

  /**
   * Count of applications that have at least one visible entity
   */
  get ApplicationCount(): number {
    return this.AppEntityGroups.filter(g => g.entities.length > 0).length;
  }

  /** @deprecated Use {@link ApplicationCount}. */
  get applicationCount(): number {
    return this.ApplicationCount;
  }

  /**
   * Get recent entities for home screen display (max 5)
   */
  get RecentEntities(): EntityInfo[] {
    return this.State.recentEntityAccesses
      .slice(0, 5)
      .map(r => this.Entities.find(e => UUIDsEqual(e.ID, r.entityId)))
      .filter((e): e is EntityInfo => e !== undefined);
  }

  /** @deprecated Use {@link RecentEntities}. */
  get recentEntities(): EntityInfo[] {
    return this.RecentEntities;
  }

  /**
   * Get favorite entities for home screen display
   */
  get FavoriteEntities(): EntityInfo[] {
    return this.State.favoriteEntities
      .map(f => this.Entities.find(e => UUIDsEqual(e.ID, f.entityId)))
      .filter((e): e is EntityInfo => e !== undefined);
  }

  /** @deprecated Use {@link FavoriteEntities}. */
  get favoriteEntities(): EntityInfo[] {
    return this.FavoriteEntities;
  }

  /**
   * Recent records limited to 3 for the quick access panel
   */
  get QuickAccessRecentRecords(): RecentRecordAccess[] {
    return this.RecentRecords.slice(0, 3);
  }

  /** @deprecated Use {@link QuickAccessRecentRecords}. */
  get quickAccessRecentRecords(): RecentRecordAccess[] {
    return this.QuickAccessRecentRecords;
  }

  /**
   * Recent entities limited to 3 for the quick access panel
   */
  get QuickAccessRecentEntities(): EntityInfo[] {
    return this.RecentEntities.slice(0, 3);
  }

  /** @deprecated Use {@link QuickAccessRecentEntities}. */
  get quickAccessRecentEntities(): EntityInfo[] {
    return this.QuickAccessRecentEntities;
  }

  /**
   * Favorite records limited to 3 for the quick access panel
   */
  get QuickAccessFavoriteRecords(): FavoriteRecord[] {
    return this.FavoriteRecords.slice(0, 3);
  }

  /** @deprecated Use {@link QuickAccessFavoriteRecords}. */
  get quickAccessFavoriteRecords(): FavoriteRecord[] {
    return this.QuickAccessFavoriteRecords;
  }

  /**
   * Check if a quick access section is expanded
   */
  public IsQuickAccessSectionExpanded(sectionId: string): boolean {
    return this.State.quickAccessSections[sectionId] !== false;
  }

  /** @deprecated Use {@link IsQuickAccessSectionExpanded}. */
  public isQuickAccessSectionExpanded(sectionId: string): boolean {
    return this.IsQuickAccessSectionExpanded(sectionId);
  }

  /**
   * Get unique entities from recent records for the filter strip.
   * Returns up to 5 entities, sorted by frequency in the recent records.
   */
  get UniqueRecentRecordEntities(): { entityId: string; entityName: string; icon: string; count: number }[] {
    const entityCounts = new Map<string, { entityId: string; entityName: string; count: number }>();

    for (const record of this.RecentRecords) {
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
        icon: this.GetEntityIconById(e.entityId)
      }));
  }

  /** @deprecated Use {@link UniqueRecentRecordEntities}. */
  get uniqueRecentRecordEntities(): { entityId: string; entityName: string; icon: string; count: number }[] {
    return this.UniqueRecentRecordEntities;
  }

  /**
   * Check if we should show the entity filter strip for recent records.
   * Only show when there are 2+ unique entities.
   */
  get ShowRecentRecordsEntityFilter(): boolean {
    return this.UniqueRecentRecordEntities.length >= 2;
  }

  /** @deprecated Use {@link ShowRecentRecordsEntityFilter}. */
  get showRecentRecordsEntityFilter(): boolean {
    return this.ShowRecentRecordsEntityFilter;
  }

  /**
   * Get filtered recent records based on entity filter.
   */
  get FilteredRecentRecords(): RecentRecordAccess[] {
    if (!this.RecentRecordsEntityFilter) {
      return this.RecentRecords;
    }
    return this.RecentRecords.filter(r => r.entityId === this.RecentRecordsEntityFilter);
  }

  /** @deprecated Use {@link FilteredRecentRecords}. */
  get filteredRecentRecords(): RecentRecordAccess[] {
    return this.FilteredRecentRecords;
  }

  /**
   * Set the entity filter for recent records
   */
  public SetRecentRecordsEntityFilter(entityId: string | null): void {
    this.RecentRecordsEntityFilter = entityId;
  }

  /** @deprecated Use {@link SetRecentRecordsEntityFilter}. */
  public setRecentRecordsEntityFilter(entityId: string | null): void {
    return this.SetRecentRecordsEntityFilter(entityId);
  }

  /**
   * Get the display title for the header.
   * Priority: contextName > entityFilter.applicationName > "Data Explorer"
   */
  get DisplayTitle(): string {
    return this.ContextName || this.EntityFilter?.applicationName || 'Data Explorer';
  }

  /** @deprecated Use {@link DisplayTitle}. */
  get displayTitle(): string {
    return this.DisplayTitle;
  }

  /**
   * Get the display icon for the header (when at home level).
   * Returns contextIcon if provided, otherwise null.
   */
  get DisplayIcon(): string | null {
    return this.ContextIcon;
  }

  /** @deprecated Use {@link DisplayIcon}. */
  get displayIcon(): string | null {
    return this.DisplayIcon;
  }

  /**
   * Configuration for mj-entity-viewer composite component
   * Hides the built-in header since we have a custom header in the dashboard
   * Uses server-side pagination with 100 records per page (default)
   */
  public ViewerConfig: Partial<EntityViewerConfig> = {
    showFilter: false,        // We have our own filter in the dashboard header
    showViewModeToggle: true,  // Use the viewer's metadata-driven view-type dropdown (no legacy header toggle)
    showRecordCount: false,   // We show count in the dashboard header
    showPagination: true,     // Show the pagination UI with "Load More" button
    serverSideFiltering: true, // Use RunView's UserSearchString for filtering
    serverSideSorting: true,  // Use RunView's OrderBy for sorting
    height: '100%'
  };

  /** @deprecated Use {@link ViewerConfig}. */
  public get viewerConfig(): Partial<EntityViewerConfig> {
    return this.ViewerConfig;
  }
  /** @deprecated Use {@link ViewerConfig}. */
  public set viewerConfig(value: Partial<EntityViewerConfig>) {
    this.ViewerConfig = value;
  }

  constructor(
    public StateService: ExplorerStateService,
    private cdr: ChangeDetectorRef,
    private recentAccessService: RecentAccessService,
    private ngZone: NgZone
  ) {
    super();
    this.State = this.StateService.CurrentState;
  }

  /** @deprecated Use {@link StateService}. */
  public get stateService(): ExplorerStateService {
    return this.StateService;
  }
  /** @deprecated Use {@link StateService}. */
  public set stateService(value: ExplorerStateService) {
    this.StateService = value;
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
    const wrapperParams = this.InitialQueryParams && Object.keys(this.InitialQueryParams).length > 0
      ? this.InitialQueryParams
      : null;
    const ownParams = this.GetQueryParams();
    const rawParams = wrapperParams || (Object.keys(ownParams).length > 0 ? ownParams : {});

    const urlState = this.buildDeepLinkFromParams(rawParams);

    // Set context for state service (enables context-specific settings)
    this.StateService.Provider = this.ProviderToUse;
    await this.StateService.setContext(this.EntityFilter);
    this.State = this.StateService.CurrentState;

    // User search text starts empty - it's separate from smart filter
    this.LiveFilterText = '';
    this.DebouncedFilterText = '';

    // Load available entities (async to support applicationId filter)
    // Pass urlState so we don't restore persisted entity if URL specifies one
    await this.loadEntities(urlState);

    // Apply URL state after entities are loaded
    if (urlState) {
      await this.applyUrlState(urlState);
    } else if (this.DeepLink) {
      await this.applyDeepLink(this.DeepLink);
    }

    // Subscribe to state changes
    this.StateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const entityChanged = state.selectedEntityName !== this.State.selectedEntityName;

        this.State = state;

        // When entity changes, clear user search text and update title
        if (entityChanged) {
          this.LiveFilterText = '';
          this.DebouncedFilterText = '';
          this.emitDisplayName();
        }

        this.onStateChanged();

        // Update URL query params to reflect current state (for deep linking)
        this.pushCurrentStateToUrl();

        // Keep the AI agent's view of this surface in sync with every state change
        // (entity selection, view mode, filter, record selection, detail panel, etc.).
        this.publishAgentContext();

        // Re-scope the agent's client tools to the current mode (entity-browser vs
        // record-view). Cheap: the guard inside only re-registers on the home↔entity flip.
        this.syncAgentToolsForMode();

        this.cdr.detectChanges();
      });

    // Subscribe to breadcrumb changes
    this.StateService.Breadcrumbs
      .pipe(takeUntil(this.destroy$))
      .subscribe(breadcrumbs => {
        this.Breadcrumbs = breadcrumbs;
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
        this.DebouncedFilterText = filterText;
        this.cdr.detectChanges();
      });

    // Subscribe to recent records changes
    this.StateService.RecentRecords
      .pipe(takeUntil(this.destroy$))
      .subscribe(records => {
        this.RecentRecords = records;
        this.refreshRecentRecordTimes(); // pre-compute the "N ago" labels off the CD path (see NG0100 note)
        this.IsLoadingRecentRecords = false;
        this.cdr.detectChanges();
      });

    // Refresh the pre-computed relative-time labels on a timer so "Just now" ages into "1m ago"
    // etc. without the template ever computing time during change detection. Updating the stored
    // field + running detectChanges here (rather than calling a Date.now()-based method from the
    // template binding) is what prevents the ExpressionChangedAfterItHasBeenCheckedError (NG0100).
    this.recentTimeRefreshTimer = setInterval(() => {
      if (this.RecentRecords.length > 0) {
        this.refreshRecentRecordTimes();
        this.cdr.detectChanges();
      }
    }, 30000);

    // Subscribe to favorite records changes
    this.StateService.FavoriteRecords
      .pipe(takeUntil(this.destroy$))
      .subscribe(records => {
        this.FavoriteRecords = records;
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
   * After the view initializes, publish the initial agent context and register the
   * mode-scoped client tools the AI agent can invoke against this surface (the initial
   * mode is 'home' until an entity is selected). The ongoing context re-emit and tool
   * re-scoping both happen in the state subscription set up in {@link ngOnInit}.
   */
  ngAfterViewInit(): void {
    this.publishAgentContext();
    this.syncAgentToolsForMode();
  }

  // ========================================
  // AI AGENT CONTEXT & CLIENT TOOLS
  // ========================================

  /**
   * Publish the current Data Explorer state to the AI agent via NavigationService.
   *
   * When an entity is selected this reports the record-browsing surface
   * (SelectedEntityName, ViewMode, ActiveViewId, FilterText, Total/Filtered record
   * counts, SelectedRecordName, DetailPanelOpen). At the home level it instead reports
   * the entity-browsing surface (HomeViewMode, EntitySearchText, VisibleEntityCount).
   * The shaping lives in the pure {@link buildDataExplorerAgentContext} helper so it
   * stays unit-testable. Called on init and on every state change.
   */
  private publishAgentContext(): void {
    const accessibleViews = this.getAccessibleViewsForSelectedEntity();
    const gridState = this.ViewWorkspaceRef?.GetGridState() ?? null;
    const context = buildDataExplorerAgentContext({
      SelectedEntityName: this.SelectedEntity?.Name ?? null,
      ViewMode: this.State.viewMode,
      AvailableViewTypes: this.getAvailableViewTypesForSelectedEntity(),
      ActiveViewId: this.State.selectedViewId,
      ActiveViewName: this.resolveActiveViewName(accessibleViews),
      AvailableViewNames: accessibleViews.map(v => v.Name),
      VisibleColumnNames: this.getVisibleColumnNames(),
      FilterText: this.DebouncedFilterText,
      TotalRecordCount: this.totalRecordCount,
      FilteredRecordCount: this.FilteredRecordCount,
      PageSize: this.getEffectivePageSize(),
      CurrentPage: gridState?.CurrentPage ?? null,
      TotalPages: gridState?.TotalPages ?? null,
      SortColumn: gridState?.Sort?.field ?? null,
      SortDirection: this.normalizeSortDirection(gridState?.Sort?.direction ?? null),
      RelatedEntityNames: this.getRelatedEntityNames(),
      SelectedRecordName: this.State.selectedRecordName,
      DetailPanelOpen: this.State.detailPanelOpen,
      VisibleRecordNames: this.getVisibleRecordNames(),
      LoadedRecordCount: this.loadedRecords.length,
      HomeViewMode: this.State.homeViewMode,
      EntitySearchText: this.EntityFilterText,
      VisibleEntityCount: this.FilteredEntityCount,
      FavoriteEntityCount: this.State.favoriteEntities.length,
      // Publish the DISPLAY names the user sees on the entity cards (the "MJ: " prefix
      // stripped / DisplayName), so the agent passes back what the user actually says.
      AvailableEntityNames: this.Entities.map(e => entityDisplayName(e.Name, e.DisplayName)),
      AppGroups: this.getAgentAppGroupSummaries(),
    });
    this.navigationService.SetAgentContext(this, context);
  }

  /**
   * Normalize the grid's SortDirection (`'asc' | 'desc' | null`) for the agent context.
   * The viewer can carry a null direction as "unsorted"; we only report 'asc'/'desc'.
   */
  private normalizeSortDirection(dir: 'asc' | 'desc' | null): 'asc' | 'desc' | null {
    return dir === 'asc' || dir === 'desc' ? dir : null;
  }

  /**
   * Names of the entities related to the selected entity, read straight from in-memory
   * {@link EntityInfo.RelatedEntities} metadata (no lookup). Bounded to a sane number so the
   * streamed context stays small; the context helper bounds it again. Returns [] at the home level.
   */
  private getRelatedEntityNames(): string[] {
    const entity = this.SelectedEntity;
    if (!entity) {
      return [];
    }
    const seen = new Set<string>();
    const names: string[] = [];
    for (const r of entity.RelatedEntities) {
      const name = r.RelatedEntity;
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  /**
   * Display values of the records currently loaded in the grid (from {@link loadedRecords}),
   * in grid order, using the same name-field logic the detail panel / state use
   * ({@link getRecordDisplayName}). Drives the agent's VisibleRecordNames context and the
   * SelectRecord tool. Returns [] when no entity is selected or nothing is loaded.
   */
  private getVisibleRecordNames(): string[] {
    if (!this.SelectedEntity || this.loadedRecords.length === 0) {
      return [];
    }
    return this.loadedRecords.map(r => this.getRecordDisplayName(r));
  }

  /**
   * Resolve an agent-supplied entity reference to one of the available entities, matching
   * the way the user names things (display name with the "MJ: " prefix stripped, e.g.
   * "ML Models" → "MJ: ML Models"). Delegates to the pure {@link resolveEntityByName} helper.
   */
  private resolveEntityByName(input: string): EntityInfo | null {
    return resolveEntityByName(input, this.Entities);
  }

  /**
   * The record-view modes the CURRENT entity actually supports. Mirrors the gating in
   * {@link reconcileViewModeForEntity}: 'grid' and 'cards' are always available; 'timeline'
   * requires at least one Date field; 'map' requires geocoding support. Returns [] at the
   * home level. Read straight from in-memory {@link EntityInfo} metadata (no lookup).
   */
  private getAvailableViewTypesForSelectedEntity(): DataExplorerViewMode[] {
    const entity = this.SelectedEntity;
    if (!entity) {
      return [];
    }
    const modes: DataExplorerViewMode[] = ['grid', 'cards'];
    if (entity.Fields.some(f => f.TSType === EntityFieldTSType.Date)) {
      modes.push('timeline');
    }
    if (entity.SupportsGeoCoding) {
      modes.push('map');
    }
    return modes;
  }

  /**
   * The grid's server-side page size. The dashboard forwards {@link viewerConfig} to the inner
   * viewer; when it doesn't set `pageSize` the viewer's default (100) applies. We surface that
   * effective value so the agent can derive total pages from the record counts.
   */
  private getEffectivePageSize(): number {
    return this.ViewerConfig.pageSize ?? DATA_EXPLORER_DEFAULT_PAGE_SIZE;
  }

  /**
   * Summaries of the application groups currently shown on the home-screen entity browser
   * (name, visible-entity count, expanded flag). Reuses the same filtered grouping the UI
   * renders ({@link filteredAppEntityGroups}), so the agent sees exactly what the user sees.
   * Returns [] when scoped to a single application (no grouping).
   */
  private getAgentAppGroupSummaries(): AppGroupSummary[] {
    if (this.EntityFilter?.applicationId) {
      return [];
    }
    return this.FilteredAppEntityGroups.map(g => ({
      Name: g.applicationName,
      EntityCount: g.entities.length,
      Expanded: g.isExpanded,
    }));
  }

  /**
   * Saved views accessible to the current user for the selected entity, read from the
   * already-loaded {@link UserViewEngine} cache (no new RunView). Returns [] at the home
   * level. The engine's cache is populated lazily elsewhere (e.g. {@link restoreViewFromUrl}
   * and the view workspace); if it hasn't loaded yet this returns [] and the next state
   * change re-publishes once it has.
   */
  private getAccessibleViewsForSelectedEntity(): MJUserViewEntityExtended[] {
    if (!this.SelectedEntity) {
      return [];
    }
    return UserViewEngine.Instance.GetAccessibleViewsForEntity(this.SelectedEntity.ID);
  }

  /**
   * Resolve the display name for the active view id. Prefers the live
   * {@link selectedViewEntity}, then the accessible-views list, then the engine cache.
   */
  private resolveActiveViewName(accessibleViews: MJUserViewEntityExtended[]): string | null {
    const activeId = this.State.selectedViewId;
    if (!activeId) {
      return null;
    }
    if (this.SelectedViewEntity && UUIDsEqual(this.SelectedViewEntity.ID, activeId)) {
      return this.SelectedViewEntity.Name;
    }
    const fromList = accessibleViews.find(v => UUIDsEqual(v.ID, activeId));
    if (fromList) {
      return fromList.Name;
    }
    return UserViewEngine.Instance.GetViewById(activeId)?.Name ?? null;
  }

  /**
   * Column/field names visible in the grid for the selected entity — the entity's
   * default-in-view fields, read straight from in-memory {@link EntityInfo} metadata
   * (no lookup). Falls back to all fields when none are flagged for view display.
   * Returns [] at the home level.
   */
  private getVisibleColumnNames(): string[] {
    if (!this.SelectedEntity) {
      return [];
    }
    const inViewFields = this.SelectedEntity.Fields.filter(f => f.DefaultInView);
    const fields = inViewFields.length > 0 ? inViewFields : this.SelectedEntity.Fields;
    return fields.map(f => f.DisplayNameOrName);
  }

  /**
   * Tracks which tool set was last registered with the NavigationService, so the
   * mode-scoped re-registration ({@link syncAgentToolsForMode}) only fires on the
   * home↔entity transition rather than on every state change.
   */
  private lastRegisteredToolMode: 'home' | 'entity' | null = null;

  /**
   * Re-scope the agent's client tools to the CURRENT mode. The Data Explorer has two
   * surfaces with very different affordances:
   * - 'home' (no entity selected): the entity browser — browse/search entities, favorites,
   *   application groups.
   * - 'entity' (an entity is selected): the record view — views, view types, filter, sort,
   *   paginate, open record, export, view properties.
   *
   * We register the COMMON tools plus exactly one mode's tools, so a browser-only tool is
   * never exposed in record-view mode and vice-versa. Because {@link publishAgentContext}
   * fires on every state change but the tool set only changes on the mode flip, this guards
   * on {@link lastRegisteredToolMode} and only calls into NavigationService when the mode
   * actually changes.
   */
  private syncAgentToolsForMode(): void {
    const mode: 'home' | 'entity' = this.SelectedEntity ? 'entity' : 'home';
    if (mode === this.lastRegisteredToolMode) {
      return;
    }
    this.lastRegisteredToolMode = mode;
    this.navigationService.SetAgentClientTools(this, [
      ...this.buildCommonTools(),
      ...(mode === 'home' ? this.buildEntityBrowserTools() : this.buildRecordViewTools()),
    ]);
  }

  /** The tool-definition shape the NavigationService accepts. */
  private buildAgentTool(
    name: string,
    description: string,
    parameterSchema: Record<string, unknown>,
    handler: (params: Record<string, unknown>) => Promise<unknown>,
  ): { Name: string; Description: string; ParameterSchema: Record<string, unknown>; Handler: (params: Record<string, unknown>) => Promise<unknown> } {
    return { Name: name, Description: description, ParameterSchema: parameterSchema, Handler: handler };
  }

  /**
   * COMMON tools — available in BOTH modes. Currently just {@link BackToEntityBrowser},
   * which deselects the current entity and returns to the entity browser (the home screen).
   */
  private buildCommonTools(): Array<ReturnType<DataExplorerDashboardComponent['buildAgentTool']>> {
    return [
      this.buildAgentTool(
        'BackToEntityBrowser',
        'Deselect the current entity and return to the entity browser (home screen) where the user can pick a different entity.',
        { type: 'object', properties: {} },
        async () => this.toolBackToEntityBrowser(),
      ),
    ];
  }

  /**
   * ENTITY-BROWSER tools — only registered at the home level (no entity selected).
   * Browse/search entities, manage favorites, expand/collapse application groups.
   */
  private buildEntityBrowserTools(): Array<ReturnType<DataExplorerDashboardComponent['buildAgentTool']>> {
    return [
      this.buildAgentTool(
        'OpenEntityData',
        'Open and load data for an entity by its name. Pass the display name the user says (e.g. "AI Models", "ML Models", "Users") exactly as it appears on the entity cards — the tool resolves it even though the full entity name may carry an "MJ: " prefix (e.g. "MJ: ML Models").',
        { type: 'object', properties: { entityName: { type: 'string' } }, required: ['entityName'] },
        async (params) => this.toolOpenEntityData(params),
      ),
      this.buildAgentTool(
        'OpenEntity',
        'Open and load data for an entity by its name (alias of OpenEntityData). Pass the display name the user says (e.g. "AI Models", "ML Models") — the tool resolves the "MJ: " prefix.',
        { type: 'object', properties: { entityName: { type: 'string' } }, required: ['entityName'] },
        async (params) => this.toolOpenEntityData(params),
      ),
      this.buildAgentTool(
        'SearchEntities',
        'Type into the home-screen entity-search box to filter the list of available entities by name/description.',
        { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        async (params) => this.toolSearchEntities(params),
      ),
      this.buildAgentTool(
        'SetEntityBrowserMode',
        'Switch the home-screen entity browser between showing all entities and favorites only. Valid modes: all, favorites.',
        { type: 'object', properties: { mode: { type: 'string' } }, required: ['mode'] },
        async (params) => this.toolSetEntityBrowserMode(params),
      ),
      this.buildAgentTool(
        'ToggleEntityFavorite',
        "Add or remove an entity from the user's favorites by entity name (reversible toggle). Pass the display name the user says (e.g. \"AI Models\") — the tool resolves the \"MJ: \" prefix.",
        { type: 'object', properties: { entityName: { type: 'string' } }, required: ['entityName'] },
        async (params) => this.toolToggleEntityFavorite(params),
      ),
      this.buildAgentTool(
        'ExpandAppGroup',
        'Expand an application group in the home-screen entity browser by its application name (e.g. "AI", "Admin").',
        { type: 'object', properties: { appName: { type: 'string' } }, required: ['appName'] },
        async (params) => this.toolSetAppGroupExpanded(params, true),
      ),
      this.buildAgentTool(
        'CollapseAppGroup',
        'Collapse an application group in the home-screen entity browser by its application name (e.g. "AI", "Admin").',
        { type: 'object', properties: { appName: { type: 'string' } }, required: ['appName'] },
        async (params) => this.toolSetAppGroupExpanded(params, false),
      ),
    ];
  }

  /**
   * RECORD-VIEW tools — only registered when an entity is selected. Views, view types,
   * filter, sort, paginate, open/create record, navigate-to-related, export, view properties.
   */
  private buildRecordViewTools(): Array<ReturnType<DataExplorerDashboardComponent['buildAgentTool']>> {
    return [
      this.buildAgentTool(
        'SelectView',
        'Select a saved view for the current entity. Accepts either the view name (e.g. "Active Accounts", as listed in AvailableViews) or its view ID.',
        {
          type: 'object',
          properties: {
            view: { type: 'string', description: 'The view name or view ID to select.' },
            viewId: { type: 'string', description: 'Deprecated alias for "view" — the view ID.' },
          },
        },
        async (params) => this.toolSelectView(params),
      ),
      this.buildAgentTool(
        'ChangeViewType',
        'Change the record-view type for the selected entity. Valid types: grid, cards, timeline, map.',
        { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] },
        async (params) => this.toolChangeViewType(params),
      ),
      this.buildAgentTool(
        'SetViewMode',
        'Set the record-view mode (alias of ChangeViewType). Valid modes: grid, cards, timeline, map.',
        { type: 'object', properties: { mode: { type: 'string' } }, required: ['mode'] },
        async (params) => this.toolSetViewMode(params),
      ),
      this.buildAgentTool(
        'FilterRecords',
        'Set the record filter for the current entity\'s view via smart-filter text (a natural-language or simple search string applied to the grid).',
        { type: 'object', properties: { filterText: { type: 'string' } }, required: ['filterText'] },
        async (params) => this.toolFilterRecords(params),
      ),
      this.buildAgentTool(
        'ClearRecordFilter',
        'Clear the current record filter for the selected entity.',
        { type: 'object', properties: {} },
        async () => {
          this.ClearRecordFilter();
          return { Success: true };
        },
      ),
      this.buildAgentTool(
        'SelectRecord',
        'Select a row in the current view (the equivalent of the user clicking a row): this highlights the row and opens its detail panel. Pick the row by position ("first", "last", or a 1-based index number) OR by name (matches a loaded record\'s display value — see VisibleRecordNames, case-insensitive/contains). Compose with OpenRecord to then open the full form.',
        {
          type: 'object',
          properties: {
            position: { type: 'string', description: '"first", "last", or a 1-based index (a number is also accepted).' },
            name: { type: 'string', description: 'A loaded record display value to match (case-insensitive, contains).' },
          },
        },
        async (params) => this.toolSelectRecord(params),
      ),
      this.buildAgentTool(
        'OpenRecord',
        'Open the currently-selected record in its full record form.',
        { type: 'object', properties: {} },
        async () => this.toolOpenSelectedRecord(),
      ),
      this.buildAgentTool(
        'CreateNewRecord',
        'Open a new-record form for the currently-selected entity.',
        { type: 'object', properties: {} },
        async () => this.toolCreateNewRecord(),
      ),
      this.buildAgentTool(
        'NavigateToRelated',
        'Navigate to a related entity by name (see the RelatedEntities context field), optionally applying a SQL filter to show related records. Pass the display name the user says — the tool resolves the "MJ: " prefix.',
        {
          type: 'object',
          properties: { entityName: { type: 'string' }, filter: { type: 'string' } },
          required: ['entityName'],
        },
        async (params) => this.toolNavigateToRelated(params),
      ),
      this.buildAgentTool(
        'ExportView',
        'Export the current entity/view\'s records to a file. Optional format: csv, excel, or json (defaults to excel).',
        { type: 'object', properties: { format: { type: 'string', description: 'csv | excel | json' } } },
        async (params) => this.toolExportView(params),
      ),
      this.buildAgentTool(
        'OpenViewProperties',
        'Open the view configuration / properties panel for the current entity\'s view (the same panel as Cmd+,).',
        { type: 'object', properties: {} },
        async () => this.toolOpenViewProperties(),
      ),
      this.buildAgentTool(
        'NextPage',
        'Advance the record grid to the next page of results.',
        { type: 'object', properties: {} },
        async () => this.toolNextPage(),
      ),
      this.buildAgentTool(
        'PreviousPage',
        'Move the record grid to the previous page of results.',
        { type: 'object', properties: {} },
        async () => this.toolPreviousPage(),
      ),
      this.buildAgentTool(
        'GoToPage',
        'Jump the record grid to a specific 1-based page number.',
        { type: 'object', properties: { page: { type: 'number' } }, required: ['page'] },
        async (params) => this.toolGoToPage(params),
      ),
      this.buildAgentTool(
        'SetPageSize',
        'Set how many records load per page in the record grid (reloads from page 1).',
        { type: 'object', properties: { size: { type: 'number' } }, required: ['size'] },
        async (params) => this.toolSetPageSize(params),
      ),
      this.buildAgentTool(
        'SetSort',
        'Sort the record grid by a column. Provide the column field name and an optional direction (asc | desc, defaults to asc).',
        {
          type: 'object',
          properties: { column: { type: 'string' }, direction: { type: 'string', description: 'asc | desc' } },
          required: ['column'],
        },
        async (params) => this.toolSetSort(params),
      ),
    ];
  }

  /**
   * Build a tolerant "entity not found" error listing a few of the DISPLAY names the user
   * actually sees, so the agent can correct itself.
   */
  private entityNotFoundError(input: string): string {
    const sample = this.Entities.slice(0, 6).map(e => entityDisplayName(e.Name, e.DisplayName)).join(', ');
    return `Entity "${input}" is not available in this explorer. Available entities include: ${sample || '(none)'}.`;
  }

  /** Resolve an entity by name and open its data. */
  private toolOpenEntityData(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const entityName = String(params['entityName'] ?? '');
    const entity = this.resolveEntityByName(entityName);
    if (!entity) {
      return { Success: false, ErrorMessage: this.entityNotFoundError(entityName) };
    }
    this.OnEntitySelected(entity);
    return { Success: true, Data: { EntityName: entity.Name } };
  }

  /** Apply a record filter for the selected entity. */
  private toolFilterRecords(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected to filter.' };
    }
    this.OnFilterInputChanged(String(params['filterText'] ?? ''));
    return { Success: true };
  }

  /** Switch the record-view mode after validating it. */
  private toolSetViewMode(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const mode = params['mode'];
    if (!isValidViewMode(mode)) {
      return { Success: false, ErrorMessage: `Invalid view mode "${String(mode)}". Valid modes: grid, cards, timeline, map.` };
    }
    this.StateService.setViewMode(mode);
    return { Success: true, Data: { ViewMode: mode } };
  }

  /**
   * Select a saved view by name OR id. The agent now sees view names via the
   * AvailableViews context field, so this resolves a supplied name (case-insensitive)
   * to its id against the in-memory {@link UserViewEngine} cache for the current entity.
   * A value that already matches a known view id is used directly.
   */
  private toolSelectView(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected, so there are no saved views to choose from.' };
    }
    // Accept either "view" (name or id) or the legacy "viewId" alias.
    const raw = String(params['view'] ?? params['viewId'] ?? '').trim();
    if (!raw) {
      return { Success: false, ErrorMessage: 'A view name or view ID is required.' };
    }

    const accessibleViews = this.getAccessibleViewsForSelectedEntity();
    // Prefer an exact id match, then fall back to a case-insensitive name match.
    const lowered = raw.toLowerCase();
    const match =
      accessibleViews.find(v => UUIDsEqual(v.ID, raw)) ??
      accessibleViews.find(v => v.Name.toLowerCase() === lowered);

    if (!match) {
      const available = accessibleViews.map(v => v.Name).join(', ') || '(none)';
      return { Success: false, ErrorMessage: `No saved view named or identified by "${raw}" for "${this.SelectedEntity.Name}". Available views: ${available}.` };
    }

    this.StateService.selectView(match.ID);
    return { Success: true, Data: { ViewId: match.ID, ViewName: match.Name } };
  }

  /**
   * Select a record/row in the current view by position or name, then drive the same
   * selection path a user row-click takes (open the detail panel, track recent, highlight
   * the grid row via the viewer's additive SelectRecord). Tolerant: clear errors when no
   * records are loaded or the position/name doesn't match.
   */
  private toolSelectRecord(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected, so there are no records to select.' };
    }
    const request = this.parseRecordSelectionRequest(params);
    const recordNames = this.getVisibleRecordNames();
    const resolution = resolveRecordSelection(recordNames, request);
    if (!resolution.Ok) {
      return { Success: false, ErrorMessage: resolution.Error };
    }
    const record = this.loadedRecords[resolution.Index];
    if (!record) {
      return { Success: false, ErrorMessage: 'The resolved record is no longer loaded in the view.' };
    }
    this.applyRecordSelection(record);
    return { Success: true, Data: { SelectedRecordName: this.getRecordDisplayName(record), Index: resolution.Index + 1 } };
  }

  /**
   * Coerce the agent's loosely-typed SelectRecord params into a {@link RecordSelectionRequest}.
   * `position` may arrive as a string ('first'/'last'/'2') or a number; `name` as a string.
   */
  private parseRecordSelectionRequest(params: Record<string, unknown>): RecordSelectionRequest {
    const rawPosition = params['position'];
    const request: RecordSelectionRequest = {};
    if (typeof rawPosition === 'number') {
      request.position = rawPosition;
    } else if (typeof rawPosition === 'string') {
      const trimmed = rawPosition.trim().toLowerCase();
      if (trimmed === 'first' || trimmed === 'last') {
        request.position = trimmed;
      } else if (trimmed) {
        const n = Number(trimmed);
        if (Number.isFinite(n)) {
          request.position = n;
        } else {
          // A non-numeric, non-first/last "position" is really a name — fall back to name matching.
          request.name = rawPosition;
        }
      }
    }
    if (params['name'] != null) {
      request.name = String(params['name']);
    }
    return request;
  }

  /**
   * Drive the selection of a loaded record exactly like {@link onViewerRecordSelected}: set the
   * selected record + detail-panel entity, open the detail panel via the state service, and ask
   * the inner viewer to highlight the matching grid row (additive viewer.SelectRecord). Mirrors
   * the user row-click path so the detail panel opens and the grid reflects the selection.
   */
  private applyRecordSelection(record: Record<string, unknown>): void {
    const entity = this.SelectedEntity;
    if (!entity) {
      return;
    }
    this.SelectedRecord = record;
    this.DetailPanelEntity = entity;
    const recordName = this.getRecordDisplayName(record);
    const pkString = buildPkString(record, entity);
    this.StateService.selectRecord(pkString, recordName);
    this.StateService.addRecentItem({
      entityName: entity.Name,
      compositeKeyString: pkString,
      displayName: recordName,
    });
    // Highlight the row in the grid (no-op when the grid view isn't mounted, e.g. cards/timeline).
    this.ViewWorkspaceRef?.SelectRecord(record);
    this.cdr.detectChanges();
  }

  /** Open the currently-selected record in its full form. */
  private toolOpenSelectedRecord(): { Success: boolean; ErrorMessage?: string } {
    if (!this.SelectedRecord) {
      return { Success: false, ErrorMessage: 'No record is currently selected to open.' };
    }
    // onOpenRecord uses detailPanelEntity; fall back to the selected entity when
    // the record came from the grid rather than the detail panel.
    if (!this.DetailPanelEntity) {
      this.DetailPanelEntity = this.SelectedEntity;
    }
    if (!this.DetailPanelEntity) {
      return { Success: false, ErrorMessage: 'No entity context is available for the selected record.' };
    }
    this.OnOpenRecord(this.SelectedRecord);
    return { Success: true };
  }

  /** Open a new-record form for the selected entity. */
  private toolCreateNewRecord(): { Success: boolean; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected to create a record for.' };
    }
    this.OnCreateNewRecord();
    return { Success: true };
  }

  /** Navigate to a related entity, optionally applying a filter. */
  private toolNavigateToRelated(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const entityName = String(params['entityName'] ?? '');
    const entity = this.resolveEntityByName(entityName);
    if (!entity) {
      return { Success: false, ErrorMessage: this.entityNotFoundError(entityName) };
    }
    const filter = params['filter'] != null ? String(params['filter']) : '';
    this.OnNavigateToRelated({ entityName: entity.Name, filter });
    return { Success: true };
  }

  /** Drive the home-screen entity-search box. */
  private toolSearchEntities(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const validated = validateStringParam(params['query'], 'query');
    if (!validated.ok) {
      return validated.result;
    }
    this.EntityFilterText = validated.value;
    this.publishAgentContext();
    this.cdr.detectChanges();
    return { Success: true, Data: { Query: validated.value, VisibleEntityCount: this.FilteredEntityCount } };
  }

  /** Switch the home-screen entity browser between 'all' and 'favorites'. */
  private toolSetEntityBrowserMode(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const validated = validateEnumParam(params['mode'], VALID_ENTITY_BROWSER_MODES_FOR_VALIDATION, 'mode');
    if (!validated.ok) {
      return validated.result;
    }
    if (!isValidEntityBrowserMode(validated.value)) {
      return { Success: false, ErrorMessage: `Invalid mode "${String(params['mode'])}". Valid modes: all, favorites.` };
    }
    this.SetHomeViewMode(validated.value);
    return { Success: true, Data: { EntityBrowserMode: validated.value } };
  }

  /** Add or remove an entity from favorites by name (reversible). */
  private async toolToggleEntityFavorite(params: Record<string, unknown>): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
    const validated = validateStringParam(params['entityName'], 'entityName');
    if (!validated.ok) {
      return validated.result;
    }
    const entity = this.resolveEntityByName(validated.value);
    if (!entity) {
      return { Success: false, ErrorMessage: this.entityNotFoundError(validated.value) };
    }
    const wasFavorited = this.StateService.isEntityFavorited(entity.ID);
    const ok = wasFavorited
      ? await this.StateService.removeEntityFromFavorites(entity.ID)
      : await this.StateService.addEntityToFavorites(entity.Name, entity.ID);
    if (!ok) {
      return { Success: false, ErrorMessage: `Failed to ${wasFavorited ? 'remove' : 'add'} "${entity.Name}" ${wasFavorited ? 'from' : 'to'} favorites.` };
    }
    this.ngZone.run(() => {
      this.publishAgentContext();
      this.cdr.detectChanges();
    });
    return { Success: true, Data: { EntityName: entity.Name, Favorited: !wasFavorited } };
  }

  /**
   * Expand or collapse an application group by its application NAME (the agent sees names,
   * not the internal application IDs). Resolves the name against the currently-shown groups.
   */
  private toolSetAppGroupExpanded(params: Record<string, unknown>, expand: boolean): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (this.EntityFilter?.applicationId) {
      return { Success: false, ErrorMessage: 'The entity browser is scoped to a single application, so there are no groups to expand or collapse.' };
    }
    const validated = validateStringParam(params['appName'], 'appName');
    if (!validated.ok) {
      return validated.result;
    }
    const lowered = validated.value.trim().toLowerCase();
    const group = this.AppEntityGroups.find(g => g.applicationName.toLowerCase() === lowered);
    if (!group) {
      const available = this.AppEntityGroups.map(g => g.applicationName).join(', ') || '(none)';
      return { Success: false, ErrorMessage: `No application group named "${validated.value}". Available groups: ${available}.` };
    }
    // toggleAppGroup flips state; only call it when the current state differs from the target.
    if (group.isExpanded !== expand) {
      this.ToggleAppGroup(group.applicationId);
    }
    this.publishAgentContext();
    return { Success: true, Data: { AppName: group.applicationName, Expanded: expand } };
  }

  /** Change the record-view type (alias of SetViewMode). */
  private toolChangeViewType(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    return this.toolSetViewMode({ mode: params['type'] });
  }

  /** Deselect the current entity and return to the entity browser (home screen). */
  private toolBackToEntityBrowser(): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'Already at the entity browser — no entity is selected.' };
    }
    this.goToEntityBrowser();
    return { Success: true, Data: { AtHomeLevel: true } };
  }

  /**
   * Export the current entity/view's records. Delegates to the inner grid's Export()
   * (via the view workspace). Optional format: csv | excel | json (defaults to excel).
   */
  private async toolExportView(params: Record<string, unknown>): Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }> {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected to export.' };
    }
    const format = this.normalizeExportFormat(params['format']);
    if (format === 'invalid') {
      return { Success: false, ErrorMessage: `Invalid format "${String(params['format'])}". Valid formats: csv, excel, json.` };
    }
    const workspace = this.ViewWorkspaceRef;
    if (!workspace || !workspace.ExportRecords) {
      return { Success: false, ErrorMessage: 'The record grid is not ready to export yet.' };
    }
    try {
      const ok = await workspace.ExportRecords(format ?? undefined);
      if (!ok) {
        return { Success: false, ErrorMessage: 'Export is not available for the current view.' };
      }
      return { Success: true, Data: { EntityName: this.SelectedEntity.Name, Format: format ?? 'excel' } };
    } catch (err) {
      return { Success: false, ErrorMessage: `Export failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Narrow an untrusted export-format param to a supported value, or 'invalid'. */
  private normalizeExportFormat(raw: unknown): 'csv' | 'excel' | 'json' | null | 'invalid' {
    if (raw == null || raw === '') {
      return null; // default (excel)
    }
    const value = String(raw).toLowerCase();
    if (value === 'csv' || value === 'excel' || value === 'json') {
      return value;
    }
    return 'invalid';
  }

  /** Open the view configuration / properties panel (same as Cmd+,). */
  private toolOpenViewProperties(): { Success: boolean; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected, so there are no view properties to configure.' };
    }
    if (!this.ViewWorkspaceRef) {
      return { Success: false, ErrorMessage: 'The view workspace is not ready yet.' };
    }
    this.ViewWorkspaceRef.onConfigureViewRequested();
    return { Success: true };
  }

  /** Advance the record grid to the next page. */
  private toolNextPage(): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    return this.applyPageChange(() => this.ViewWorkspaceRef?.NextPage() ?? null);
  }

  /** Move the record grid to the previous page. */
  private toolPreviousPage(): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    return this.applyPageChange(() => this.ViewWorkspaceRef?.PreviousPage() ?? null);
  }

  /** Jump the record grid to a specific 1-based page number. */
  private toolGoToPage(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    const validated = validateNonNegativeNumberParam(params['page'], 'page');
    if (!validated.ok) {
      return validated.result;
    }
    if (validated.value < 1) {
      return { Success: false, ErrorMessage: 'page must be 1 or greater.' };
    }
    return this.applyPageChange(() => this.ViewWorkspaceRef?.GoToPage(validated.value) ?? null);
  }

  /**
   * Shared executor for the three pagination tools: run the workspace passthrough,
   * report the resulting page, and re-publish context. A null result means the grid
   * isn't paging (e.g. not mounted, or externally-supplied records).
   */
  private applyPageChange(action: () => number | null): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected, so there is no record grid to page.' };
    }
    const page = action();
    if (page == null) {
      return { Success: false, ErrorMessage: 'The record grid is not ready to page yet.' };
    }
    this.publishAgentContext();
    return { Success: true, Data: { CurrentPage: page } };
  }

  /** Set the record grid's server-side page size (reloads from page 1). */
  private toolSetPageSize(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected, so there is no record grid to resize.' };
    }
    const validated = validateNonNegativeNumberParam(params['size'], 'size');
    if (!validated.ok) {
      return validated.result;
    }
    if (validated.value < 1) {
      return { Success: false, ErrorMessage: 'size must be 1 or greater.' };
    }
    const applied = this.ViewWorkspaceRef?.SetPageSize(validated.value) ?? null;
    if (applied == null) {
      return { Success: false, ErrorMessage: 'The record grid is not ready to set a page size yet.' };
    }
    this.publishAgentContext();
    return { Success: true, Data: { PageSize: applied } };
  }

  /** Sort the record grid by a column + optional direction (asc | desc, default asc). */
  private toolSetSort(params: Record<string, unknown>): { Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string } {
    if (!this.SelectedEntity) {
      return { Success: false, ErrorMessage: 'No entity is selected, so there is no record grid to sort.' };
    }
    const column = validateStringParam(params['column'], 'column');
    if (!column.ok) {
      return column.result;
    }
    const columnName = column.value.trim();
    if (!columnName) {
      return { Success: false, ErrorMessage: 'A column name is required to sort.' };
    }
    // Resolve the column against the entity's fields (case-insensitive) so we sort by a real field.
    const field = this.SelectedEntity.Fields.find(
      f => f.Name.toLowerCase() === columnName.toLowerCase() || f.DisplayNameOrName.toLowerCase() === columnName.toLowerCase(),
    );
    if (!field) {
      return { Success: false, ErrorMessage: `No column named "${columnName}" on "${this.SelectedEntity.Name}".` };
    }
    const rawDir = params['direction'] != null ? String(params['direction']).toLowerCase() : 'asc';
    if (rawDir !== 'asc' && rawDir !== 'desc') {
      return { Success: false, ErrorMessage: `Invalid direction "${String(params['direction'])}". Valid directions: asc, desc.` };
    }
    const applied = this.ViewWorkspaceRef?.SetSort(field.Name, rawDir) ?? false;
    if (!applied) {
      return { Success: false, ErrorMessage: 'The record grid is not ready to sort yet.' };
    }
    this.publishAgentContext();
    return { Success: true, Data: { SortColumn: field.Name, SortDirection: rawDir } };
  }

  /**
   * Deselect the current entity and return to the entity browser. Mirrors the home path
   * used by {@link onBreadcrumbClick} (application level) and {@link applyParams} (no params):
   * clear the selected entity / record / detail panel and notify the state service.
   */
  private goToEntityBrowser(): void {
    this.SelectedEntity = null;
    this.SelectedRecord = null;
    this.DetailPanelEntity = null;
    this.StateService.selectEntity(null);
    this.StateService.closeDetailPanel();
    this.cdr.detectChanges();
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
    if (this.SelectedEntity && (event.metaKey || event.ctrlKey)) {
      // Ctrl+S / Cmd+S: Save current view
      if (event.key === 's' && !event.shiftKey) {
        event.preventDefault();
        this.ViewWorkspaceRef?.onQuickSaveRequested(false);
        return;
      }

      // Ctrl+Shift+S / Cmd+Shift+S: Save as new view
      if (event.key === 'S' || (event.key === 's' && event.shiftKey)) {
        event.preventDefault();
        this.ViewWorkspaceRef?.onQuickSaveRequested(true);
        return;
      }

      // Ctrl+, / Cmd+,: Open config panel
      if (event.key === ',') {
        event.preventDefault();
        this.ViewWorkspaceRef?.onConfigureViewRequested();
        return;
      }

      // Ctrl+Z / Cmd+Z: Revert unsaved changes (only when modified)
      if (event.key === 'z' && !event.shiftKey && this.State.viewModified) {
        event.preventDefault();
        void this.ViewWorkspaceRef?.onRevertView();
        return;
      }
    }
  }

  /**
   * Focus the filter input
   */
  private focusFilterInput(): void {
    if (this.FilterInputRef) {
      this.FilterInputRef.nativeElement.focus();
      this.FilterInputRef.nativeElement.select();
    }
  }

  override ngOnDestroy(): void {
    if (this.recentTimeRefreshTimer !== null) {
      clearInterval(this.recentTimeRefreshTimer);
      this.recentTimeRefreshTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // Re-apply filter when entityFilter changes
    if (changes['entityFilter'] && !changes['entityFilter'].firstChange) {
      // Update context for new filter (loads context-specific state)
      await this.StateService.setContext(this.EntityFilter);
      this.State = this.StateService.CurrentState;
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
    this.IsLoadingEntities = true;

    try {
      // First, load all entities the user can access
      this.allEntities = this.metadata.Entities
        .filter(e => {
          const perms = e.GetUserPermisions(this.metadata.CurrentUser);
          return perms.CanRead && e.IncludeInAPI;
        })
        .sort((a, b) => a.Name.localeCompare(b.Name));

      // If we have an applicationId filter, load the application entities
      if (this.EntityFilter?.applicationId) {
        await this.loadApplicationEntityIds(this.EntityFilter.applicationId);
      }

      // Apply filter to get the final entity list
      this.Entities = this.applyEntityFilter(this.allEntities);

      // Build application groups for the home view (Concept D)
      this.buildAppEntityGroups();

      // Only restore entity from persisted state if there's no URL state
      // This prevents race conditions where persisted entity triggers data load
      // before URL state can override it
      if (!urlState && this.State.selectedEntityName) {
        this.SelectedEntity = this.Entities.find(e => e.Name === this.State.selectedEntityName) || null;
      }
    } finally {
      this.ngZone.run(() => {
        this.IsLoadingEntities = false;
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
    if (!this.EntityFilter) {
      return entities;
    }

    return entities.filter(entity => {
      // Filter by application (via ApplicationEntities)
      if (this.EntityFilter!.applicationId) {
        if (!this.applicationEntityIds.has(entity.ID)) {
          return false;
        }
      }

      // Filter by schema names
      if (this.EntityFilter!.schemaNames && this.EntityFilter!.schemaNames.length > 0) {
        if (!this.EntityFilter!.schemaNames.includes(entity.SchemaName)) {
          return false;
        }
      }

      // Filter by explicit entity names
      if (this.EntityFilter!.entityNames && this.EntityFilter!.entityNames.length > 0) {
        if (!this.EntityFilter!.entityNames.includes(entity.Name)) {
          return false;
        }
      }

      // Filter out system entities unless explicitly included
      if (!this.EntityFilter!.includeSystemEntities) {
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
  public OnEntitySelected(entity: EntityInfo): void {
    this.resetRecordCounts();
    // Clear the previous entity's view — it belongs to the old entity and its sort/filter
    // state would leak into the new entity's query (e.g., ORDER BY FirstName on Groups).
    // The workspace resets its own view/grid state when its [Entity] input changes.
    this.SelectedViewEntity = null;
    this.SelectedEntity = entity;
    this.reconcileViewModeForEntity(entity);
    this.StateService.selectEntity(entity.Name);
    // Track entity access for recent entities
    this.StateService.trackEntityAccess(entity.Name, entity.ID);
    // mj-entity-viewer will automatically load data when entity changes
  }

  /** @deprecated Use {@link OnEntitySelected}. */
  public onEntitySelected(entity: EntityInfo): void {
    return this.OnEntitySelected(entity);
  }

  /**
   * Handle state changes from external sources
   */
  private onStateChanged(): void {
    if (this.State.selectedEntityName !== this.SelectedEntity?.Name) {
      this.resetRecordCounts();
      this.SelectedEntity = this.Entities.find(e => e.Name === this.State.selectedEntityName) || null;
      this.reconcileViewModeForEntity(this.SelectedEntity);
    }
  }

  /**
   * Reset viewMode to 'grid' if the current mode isn't supported by the given entity
   * (e.g., switching to an entity without geocoding while viewMode is 'map').
   */
  private reconcileViewModeForEntity(entity: EntityInfo | null): void {
    if (!entity) return;
    const mode = this.State.viewMode;
    const hasDateFields = entity.Fields.some(f => f.TSType === EntityFieldTSType.Date);
    const modeUnsupported =
      (mode === 'map' && !entity.SupportsGeoCoding) ||
      (mode === 'timeline' && !hasDateFields);
    if (modeUnsupported) {
      this.StateService.setViewMode('grid');
    }
  }

  /**
   * Reset record counts when entity changes.
   * The actual counts will be updated when mj-entity-viewer emits dataLoaded event.
   */
  private resetRecordCounts(): void {
    this.totalRecordCount = 0;
    this.FilteredRecordCount = 0;
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
  public OnWorkspaceViewSelected(view: MJUserViewEntityExtended | null): void {
    this.SelectedViewEntity = view;
    this.StateService.selectView(view?.ID ?? null);

    if (view && view.SmartFilterEnabled && view.SmartFilterPrompt) {
      this.StateService.setSmartFilterPrompt(view.SmartFilterPrompt);
    } else {
      this.StateService.setSmartFilterPrompt('');
    }
    // User search text is separate from a saved view's filter — always clear on view switch.
    this.LiveFilterText = '';
    this.DebouncedFilterText = '';
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnWorkspaceViewSelected}. */
  public onWorkspaceViewSelected(view: MJUserViewEntityExtended | null): void {
    return this.OnWorkspaceViewSelected(view);
  }

  /**
   * Handle the workspace's "open view in tab" request — route via NavigationService.
   */
  public OnOpenInTabRequested(viewId: string): void {
    const viewName = this.SelectedViewEntity?.Name || 'View';
    this.navigationService.OpenView(viewId, viewName, { forceNewTab: true });
  }

  /** @deprecated Use {@link OnOpenInTabRequested}. */
  public onOpenInTabRequested(viewId: string): void {
    return this.OnOpenInTabRequested(viewId);
  }

  /**
   * Handle the workspace's "create new record" request — route via NavigationService.
   */
  public OnCreateNewRecordRequested(entity: EntityInfo): void {
    this.navigationService.OpenNewEntityRecord(entity.Name);
  }

  /** @deprecated Use {@link OnCreateNewRecordRequested}. */
  public onCreateNewRecordRequested(entity: EntityInfo): void {
    return this.OnCreateNewRecordRequested(entity);
  }

  /**
   * Clear the Explorer "view modified" flag after the workspace persists/reverts a view.
   */
  public OnWorkspaceViewSaved(): void {
    this.StateService.setViewModified(false);
  }

  /** @deprecated Use {@link OnWorkspaceViewSaved}. */
  public onWorkspaceViewSaved(): void {
    return this.OnWorkspaceViewSaved();
  }

  // ========================================
  // VIEW MODE & FILTERING (Dashboard Header)
  // ========================================

  /**
   * Handle smart filter change from dashboard header
   */
  public OnSmartFilterChanged(prompt: string): void {
    this.StateService.setSmartFilterPrompt(prompt);
    this.filterInput$.next(prompt);
  }

  /** @deprecated Use {@link OnSmartFilterChanged}. */
  public onSmartFilterChanged(prompt: string): void {
    return this.OnSmartFilterChanged(prompt);
  }

  /**
   * Handle direct keyboard input in the filter text box.
   * Only updates the live display text and pushes to the debounce subject.
   * Does NOT trigger state changes or URL updates — those happen after the debounce.
   */
  public OnFilterInputChanged(filterText: string): void {
    this.LiveFilterText = filterText;
    this.filterInput$.next(filterText);
  }

  /** @deprecated Use {@link OnFilterInputChanged}. */
  public onFilterInputChanged(filterText: string): void {
    return this.OnFilterInputChanged(filterText);
  }

  /**
   * Clear the record filter (called by the X button).
   */
  public ClearRecordFilter(): void {
    this.LiveFilterText = '';
    this.DebouncedFilterText = '';
    this.StateService.setSmartFilterPrompt('');
    this.filterInput$.next('');
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ClearRecordFilter}. */
  public clearRecordFilter(): void {
    return this.ClearRecordFilter();
  }

  /**
   * Handle filter text change from mj-entity-viewer (two-way binding)
   */
  public OnFilterTextChanged(filterText: string): void {
    this.LiveFilterText = filterText;
    this.DebouncedFilterText = filterText;
    this.StateService.setSmartFilterPrompt(filterText);
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnFilterTextChanged}. */
  public onFilterTextChanged(filterText: string): void {
    return this.OnFilterTextChanged(filterText);
  }

  // ========================================
  // ENTITY VIEWER EVENT HANDLERS
  // ========================================

  /**
   * Handle record selection from mj-entity-viewer
   */
  public OnViewerRecordSelected(event: RecordSelectedEvent): void {
    this.SelectedRecord = event.record;
    // When selecting from grid, detail panel entity matches the grid entity
    this.DetailPanelEntity = this.SelectedEntity;
    const recordName = this.getRecordDisplayName(event.record);
    const pkString = event.compositeKey.ToConcatenatedString();
    this.StateService.selectRecord(pkString, recordName);

    // Add to recent items (local state for navigation panel)
    if (this.SelectedEntity) {
      this.StateService.addRecentItem({
        entityName: this.SelectedEntity.Name,
        compositeKeyString: pkString,
        displayName: recordName
      });

      // Update local recent records immediately for instant home screen updates
      const recordId = event.compositeKey.KeyValuePairs[0]?.Value?.toString() || '';
      this.StateService.addLocalRecentRecord(
        this.SelectedEntity.Name,
        this.SelectedEntity.ID,
        recordId,
        recordName
      );

      // Log to User Record Logs for persistence (fire-and-forget)
      this.recentAccessService.logAccess(
        this.SelectedEntity.Name,
        event.compositeKey.Values(),
        'record'
      );
    }
  }

  /** @deprecated Use {@link OnViewerRecordSelected}. */
  public onViewerRecordSelected(event: RecordSelectedEvent): void {
    return this.OnViewerRecordSelected(event);
  }

  /**
   * Handle record opened from mj-entity-viewer (double-click or open button)
   */
  public OnViewerRecordOpened(event: RecordOpenedEvent): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entity.Name,
      RecordPKey: event.compositeKey
    });
  }

  /** @deprecated Use {@link OnViewerRecordOpened}. */
  public onViewerRecordOpened(event: RecordOpenedEvent): void {
    return this.OnViewerRecordOpened(event);
  }

  /**
   * Handle the workspace's OpenRecordRequested (record open from the inner viewer). Builds the
   * composite key from the record and routes to the full record view via the OpenEntityRecord output.
   */
  public OnWorkspaceOpenRecord(event: { entity: EntityInfo; record: Record<string, unknown> }): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entity.Name,
      RecordPKey: buildCompositeKey(event.record, event.entity)
    });
  }

  /** @deprecated Use {@link OnWorkspaceOpenRecord}. */
  public onWorkspaceOpenRecord(event: { entity: EntityInfo; record: Record<string, unknown> }): void {
    return this.OnWorkspaceOpenRecord(event);
  }

  /**
   * Handle data loaded from mj-entity-viewer
   */
  public OnDataLoaded(event: DataLoadedEvent): void {
    this.totalRecordCount = event.totalRowCount;
    this.FilteredRecordCount = event.loadedRowCount;
    // Store loaded records for back/forward navigation lookup
    this.loadedRecords = event.records;

    // Handle pending record selection from deep link
    if (this.pendingRecordSelection && this.SelectedEntity) {
      const recordId = this.pendingRecordSelection;
      this.pendingRecordSelection = null; // Clear it so we don't keep trying

      // Try to find the record by primary key or concatenated string
      const entity = this.SelectedEntity;
      const record = event.records.find(r => {
        // Match either the concatenated "F|v" form or the compact segment (raw value for a single-column key)
        const key = buildCompositeKey(r, entity);
        return key.ToConcatenatedString() === recordId || key.ToCompactURLSegment() === recordId;
      });

      if (record) {
        this.SelectedRecord = record;
        this.DetailPanelEntity = this.SelectedEntity;
        const recordName = this.getRecordDisplayName(record);
        this.StateService.selectRecord(buildPkString(record, entity), recordName);
      } else {
        console.warn(`[DataExplorer] Deep link record not found: ${recordId}`);
      }
    }
    // Restore selected record if we have a persisted selectedRecordId
    else if (this.State.selectedRecordId && this.State.detailPanelOpen && !this.SelectedRecord && this.SelectedEntity) {
      const entity = this.SelectedEntity;
      const record = event.records.find(r =>
        buildPkString(r, entity) === this.State.selectedRecordId
      );
      if (record) {
        this.SelectedRecord = record;
        this.DetailPanelEntity = this.SelectedEntity;
      }
    }

    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnDataLoaded}. */
  public onDataLoaded(event: DataLoadedEvent): void {
    return this.OnDataLoaded(event);
  }

  /**
   * Handle filtered count change from mj-entity-viewer
   */
  public OnFilteredCountChanged(event: FilteredCountChangedEvent): void {
    this.FilteredRecordCount = event.filteredCount;
    this.totalRecordCount = event.totalCount;
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link OnFilteredCountChanged}. */
  public onFilteredCountChanged(event: FilteredCountChangedEvent): void {
    return this.OnFilteredCountChanged(event);
  }

  // ========================================
  // DETAIL PANEL
  // ========================================

  /**
   * Handle detail panel close
   */
  public OnDetailPanelClosed(): void {
    this.SelectedRecord = null;
    this.DetailPanelEntity = null;
    this.StateService.closeDetailPanel();
  }

  /** @deprecated Use {@link OnDetailPanelClosed}. */
  public onDetailPanelClosed(): void {
    return this.OnDetailPanelClosed();
  }

  /**
   * Handle opening a record in full view (from detail panel)
   * Uses detailPanelEntity since the panel may be showing a different entity than the grid
   */
  public OnOpenRecord(record: Record<string, unknown>): void {
    if (!this.DetailPanelEntity) return;

    this.OpenEntityRecord.emit({
      EntityName: this.DetailPanelEntity.Name,
      RecordPKey: buildCompositeKey(record, this.DetailPanelEntity)
    });
  }

  /** @deprecated Use {@link OnOpenRecord}. */
  public onOpenRecord(record: Record<string, unknown>): void {
    return this.OnOpenRecord(record);
  }

  /**
   * Handle creating a new record for the current entity
   */
  public OnCreateNewRecord(): void {
    if (!this.SelectedEntity) return;

    // Use NavigationService to open a new record form
    this.navigationService.OpenNewEntityRecord(this.SelectedEntity.Name);
  }

  /** @deprecated Use {@link OnCreateNewRecord}. */
  public onCreateNewRecord(): void {
    return this.OnCreateNewRecord();
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
  public OnNavigateToRelated(event: NavigateToRelatedEvent): void {
    const entity = this.Entities.find(e => e.Name === event.entityName);
    if (!entity) {
      // Entity not in our filtered list - it may exist in the system but not be part of this app
      console.warn(`Entity not found in explorer: ${event.entityName}`);
      return;
    }

    // Close detail panel and clear current record
    this.SelectedRecord = null;
    this.DetailPanelEntity = null;
    this.StateService.closeDetailPanel();

    // Navigate to the entity
    this.SelectedEntity = entity;
    this.StateService.selectEntity(entity.Name);

    // Apply the filter to show related records
    // The filter is in SQL format like "ParentID='xxx'" - we just show it in the filter box
    // The entity viewer will apply it as a smart filter
    if (event.filter) {
      // Apply the filter to the smart filter state (separate from user search)
      this.StateService.setSmartFilterPrompt(event.filter);
    }
  }

  /** @deprecated Use {@link OnNavigateToRelated}. */
  public onNavigateToRelated(event: NavigateToRelatedEvent): void {
    return this.OnNavigateToRelated(event);
  }

  /**
   * Handle opening a related record - display in detail panel (not new tab)
   * The record is already loaded, so just update the detail panel
   */
  public OnOpenRelatedRecord(event: { entityName: string; record: Record<string, unknown> }): void {
    this.showRecordInDetailPanel(event.entityName, event.record);
  }

  /** @deprecated Use {@link OnOpenRelatedRecord}. */
  public onOpenRelatedRecord(event: { entityName: string; record: Record<string, unknown> }): void {
    return this.OnOpenRelatedRecord(event);
  }

  /**
   * Handle opening a foreign key record (from FK field link in detail panel)
   * Loads the record and displays it in the detail panel
   */
  public async OnOpenForeignKeyRecord(event: { entityName: string; recordId: string }): Promise<void> {
    await this.loadAndShowRecordInDetailPanel(event.entityName, event.recordId);
  }

  /** @deprecated Use {@link OnOpenForeignKeyRecord}. */
  public async onOpenForeignKeyRecord(event: { entityName: string; recordId: string }): Promise<void> {
    return this.OnOpenForeignKeyRecord(event);
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
    this.DetailPanelEntity = entityInfo;
    this.SelectedRecord = record;

    // Use selectRecord to open the panel with proper state tracking
    const recordName = this.getRecordDisplayName(record, entityInfo);
    this.StateService.selectRecord(buildPkString(record, entityInfo), recordName);
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
      // recordId may be a bare value or a composite "F1|v1||F2|v2" segment — build the predicate
      // from the entity's real key column(s) rather than a hardcoded ID.
      const result = await rv.RunView<Record<string, unknown>>({
        EntityName: entityName,
        ExtraFilter: CompositeKey.FromURLSegment(entityInfo, recordId).ToWhereClause(),
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
  public OnOpenRecordFromNav(event: OpenRecordEvent): void {
    this.OpenEntityRecord.emit({
      EntityName: event.entityName,
      RecordPKey: event.CompositeKey
    });
  }

  /** @deprecated Use {@link OnOpenRecordFromNav}. */
  public onOpenRecordFromNav(event: OpenRecordEvent): void {
    return this.OnOpenRecordFromNav(event);
  }

  /**
   * Handle selecting a record from navigation panel (recent/favorites).
   * Navigates to the entity within Data Explorer and selects the record
   * in the detail panel (instead of opening full record view).
   */
  public OnSelectRecordFromNav(event: SelectRecordEvent): void {
    const entity = this.Entities.find(e => e.Name === event.entityName);
    if (entity) {
      // Set pending record selection - will be resolved in onDataLoaded
      this.pendingRecordSelection = event.recordId;
      this.OnEntitySelected(entity);
    }
  }

  /** @deprecated Use {@link OnSelectRecordFromNav}. */
  public onSelectRecordFromNav(event: SelectRecordEvent): void {
    return this.OnSelectRecordFromNav(event);
  }

  /**
   * Toggle navigation panel
   */
  public ToggleNavigationPanel(): void {
    this.StateService.toggleNavigationPanel();
  }

  /** @deprecated Use {@link ToggleNavigationPanel}. */
  public toggleNavigationPanel(): void {
    return this.ToggleNavigationPanel();
  }

  /**
   * Handle expand and focus from collapsed nav icon click
   */
  public OnExpandAndFocus(section: 'favorites' | 'recent' | 'entities'): void {
    this.StateService.expandAndFocusSection(section);
  }

  /** @deprecated Use {@link OnExpandAndFocus}. */
  public onExpandAndFocus(section: 'favorites' | 'recent' | 'entities'): void {
    return this.OnExpandAndFocus(section);
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
      const entity = this.Entities.find(e =>
        e.Name.toLowerCase() === deepLink.entity!.toLowerCase()
      );

      if (entity) {
        // Reset counts before setting entity to prevent stale data display
        this.resetRecordCounts();
        this.SelectedEntity = entity;
        this.StateService.selectEntity(entity.Name);

        // Apply filter if specified (to smart filter state, not user search)
        if (deepLink.filter) {
          this.StateService.setSmartFilterPrompt(deepLink.filter);
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
  public OnBreadcrumbClick(breadcrumb: BreadcrumbItem, index: number): void {
    // Don't navigate if it's the last (current) breadcrumb
    if (index === this.Breadcrumbs.length - 1) {
      return;
    }

    this.StateService.navigateToBreadcrumb(breadcrumb);

    // If navigating to application level, clear entity selection
    if (breadcrumb.type === 'application') {
      this.SelectedEntity = null;
      this.SelectedRecord = null;
      this.DetailPanelEntity = null;
    }
  }

  /** @deprecated Use {@link OnBreadcrumbClick}. */
  public onBreadcrumbClick(breadcrumb: BreadcrumbItem, index: number): void {
    return this.OnBreadcrumbClick(breadcrumb, index);
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Get the set of allowed entity names for filtering favorites/recents.
   * Returns null if no filter is active (all entities allowed).
   */
  public get AllowedEntityNames(): Set<string> | null {
    if (!this.EntityFilter) {
      return null;
    }
    return new Set(this.Entities.map(e => e.Name));
  }

  /** @deprecated Use {@link AllowedEntityNames}. */
  public get allowedEntityNames(): Set<string> | null {
    return this.AllowedEntityNames;
  }

  /**
   * Get display name for a record
   */
  private getRecordDisplayName(record: Record<string, unknown>, entityInfo?: EntityInfo): string {
    const entity = entityInfo || this.SelectedEntity;
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
  public GetEntityIcon(entity: EntityInfo): string {
    if (entity.Icon) {
      return this.formatEntityIcon(entity.Icon);
    }
    return 'fa-solid fa-table';
  }

  /** @deprecated Use {@link GetEntityIcon}. */
  public getEntityIcon(entity: EntityInfo): string {
    return this.GetEntityIcon(entity);
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
      this.SelectedEntity = null;
      this.SelectedRecord = null;
      this.DetailPanelEntity = null;
      this.StateService.selectEntity(null);
      this.StateService.closeDetailPanel();
      this.cdr.detectChanges();
    }
  }

  /**
   * Push current navigation state to the URL via the framework.
   * Called whenever state changes so users can bookmark/share URLs.
   */
  private pushCurrentStateToUrl(): void {
    const hasEntity = !!this.State.selectedEntityName;
    const hasViewId = !!(this.State.selectedViewId && hasEntity);

    // ViewTypeID-only: the active view type is persisted by the inner viewer (UserView.ViewTypeID /
    // per-user settings), not via URL. We only round-trip entity / record / saved-view selection.
    const queryParams: Record<string, string | null> = {
      entity: this.State.selectedEntityName || null,
      record: (this.State.selectedRecordId && hasEntity) ? this.State.selectedRecordId : null,
      filter: null, // Never in URL — filters live in saved views (DB), not query strings
      viewId: hasViewId ? this.State.selectedViewId : null
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
      const entity = this.Entities.find(e =>
        e.Name.toLowerCase() === urlState.entity!.toLowerCase()
      );

      if (entity) {
        const entityChanged = this.SelectedEntity?.Name !== entity.Name;

        if (entityChanged) {
          // Entity changed - reset counts and select new entity
          this.resetRecordCounts();
          this.SelectedEntity = entity;
          this.StateService.selectEntity(entity.Name);
        }

        // Restore saved view by ID if specified. The workspace applies the view's grid state
        // itself once selectedViewEntity flows into its [SelectedView] input.
        if (urlState.viewId) {
          await this.restoreViewFromUrl(urlState.viewId, entity);
        } else {
          // No specific view — clear view selection to use default
          this.SelectedViewEntity = null;
          this.StateService.selectView(null);
        }

        // Filters live in saved views (DB), never in URL query strings.
        // Clear smart filter on entity change when no specific view is selected.
        if (entityChanged && !urlState.viewId) {
          this.StateService.setSmartFilterPrompt('');
        }
        // User search text is always cleared when applying URL state
        this.LiveFilterText = '';
        this.DebouncedFilterText = '';

        // Handle record selection
        if (urlState.record) {
          if (entityChanged) {
            // Entity changed - need to wait for data to load
            this.pendingRecordSelection = urlState.record;
          } else if (this.SelectedEntity) {
            // Entity is the same - find record from already-loaded data
            const entity = this.SelectedEntity;
            const record = this.loadedRecords.find(r => {
              const key = buildCompositeKey(r, entity);
              return key.ToConcatenatedString() === urlState.record || key.ToCompactURLSegment() === urlState.record;
            });

            if (record) {
              this.SelectedRecord = record;
              this.DetailPanelEntity = this.SelectedEntity;
              const recordName = this.getRecordDisplayName(record);
              this.StateService.selectRecord(buildPkString(record, entity), recordName);
            } else {
              // Record not in current page - update state but panel won't show
              this.StateService.selectRecord(urlState.record, this.State.selectedRecordName || undefined);
            }
          }
        } else {
          // Clear record selection if not in URL
          this.SelectedRecord = null;
          this.DetailPanelEntity = null;
          this.StateService.closeDetailPanel();
        }
      }
    } else {
      // No entity in URL - go to home view
      this.SelectedEntity = null;
      this.SelectedRecord = null;
      this.DetailPanelEntity = null;
      this.StateService.selectEntity(null);
      this.StateService.closeDetailPanel();
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
      this.SelectedViewEntity = view;
      this.StateService.selectView(viewId);

      // Apply the view's smart filter if it has one
      if (view.SmartFilterEnabled && view.SmartFilterPrompt) {
        this.StateService.setSmartFilterPrompt(view.SmartFilterPrompt);
      }
    } else {
      console.warn('[DataExplorer] restoreViewFromUrl: view NOT FOUND, falling back to default. viewId=', viewId);
      this.SelectedViewEntity = null;
      this.StateService.selectView(null);
    }

    this.cdr.detectChanges();
  }

  /**
   * Emit the current display name based on selected entity/record.
   */
  private emitDisplayName(): void {
    if (this.State.selectedEntityName) {
      const displayName = this.SelectedEntity?.DisplayNameOrName || this.GetEntityDisplayName(this.State.selectedEntityName);
      this.DisplayNameChanged.emit(displayName);
    } else {
      this.DisplayNameChanged.emit('Data');
    }
  }

  /**
   * Get user-friendly display name for an entity.
   */
  public GetEntityDisplayName(entityName?: string): string {
    if (!entityName) return '';
    const entity = this.metadata.Entities.find(e => e.Name.toLowerCase() === entityName.toLowerCase());
    return entity?.DisplayNameOrName || entityName;
  }

  /** @deprecated Use {@link GetEntityDisplayName}. */
  public getEntityDisplayName(entityName?: string): string {
    return this.GetEntityDisplayName(entityName);
  }

  // ========================================
  // HOME SCREEN ACTIONS
  // ========================================

  /**
   * Toggle entity favorite status
   */
  public async ToggleEntityFavorite(entity: EntityInfo, event: Event): Promise<void> {
    event.stopPropagation(); // Prevent card click
    if (this.StateService.isEntityFavorited(entity.ID)) {
      await this.StateService.removeEntityFromFavorites(entity.ID);
    } else {
      await this.StateService.addEntityToFavorites(entity.Name, entity.ID);
    }
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  /** @deprecated Use {@link ToggleEntityFavorite}. */
  public async toggleEntityFavorite(entity: EntityInfo, event: Event): Promise<void> {
    return this.ToggleEntityFavorite(entity, event);
  }

  /**
   * Check if entity is favorited (for template)
   */
  public IsEntityFavorited(entity: EntityInfo): boolean {
    return this.StateService.isEntityFavorited(entity.ID);
  }

  /** @deprecated Use {@link IsEntityFavorited}. */
  public isEntityFavorited(entity: EntityInfo): boolean {
    return this.IsEntityFavorited(entity);
  }

  /**
   * Toggle show all entities vs common entities
   */
  public ToggleShowAllEntities(): void {
    this.StateService.toggleShowAllEntities();
  }

  /** @deprecated Use {@link ToggleShowAllEntities}. */
  public toggleShowAllEntities(): void {
    return this.ToggleShowAllEntities();
  }

  // ========================================
  // Concept D: Application Groups + Quick Access Panel
  // ========================================

  /**
   * Toggle an application group's expanded/collapsed state
   */
  public ToggleAppGroup(groupId: string): void {
    this.StateService.toggleAppGroupExpanded(groupId);
    // Update local cache for immediate UI response
    const group = this.AppEntityGroups.find(g => g.applicationId === groupId);
    if (group) {
      group.isExpanded = !group.isExpanded;
    }
    this.cdr.detectChanges();
  }

  /** @deprecated Use {@link ToggleAppGroup}. */
  public toggleAppGroup(groupId: string): void {
    return this.ToggleAppGroup(groupId);
  }

  /**
   * Set the home view mode (all vs favorites)
   */
  public SetHomeViewMode(mode: 'all' | 'favorites'): void {
    this.StateService.setHomeViewMode(mode);
  }

  /** @deprecated Use {@link SetHomeViewMode}. */
  public setHomeViewMode(mode: 'all' | 'favorites'): void {
    return this.SetHomeViewMode(mode);
  }

  /**
   * Toggle the quick access (right) panel
   */
  public ToggleQuickAccessPanel(): void {
    this.StateService.toggleQuickAccessPanel();
  }

  /** @deprecated Use {@link ToggleQuickAccessPanel}. */
  public toggleQuickAccessPanel(): void {
    return this.ToggleQuickAccessPanel();
  }

  /**
   * Toggle a section in the quick access panel
   */
  public ToggleQuickAccessSection(sectionId: string): void {
    this.StateService.toggleQuickAccessSection(sectionId);
  }

  /** @deprecated Use {@link ToggleQuickAccessSection}. */
  public toggleQuickAccessSection(sectionId: string): void {
    return this.ToggleQuickAccessSection(sectionId);
  }

  /**
   * Build application entity groups from metadata.
   * Groups entities by their first application membership.
   * Entities not in any application go into "System & Other".
   */
  private buildAppEntityGroups(): void {
    // Skip grouping when filtered to a single application
    if (this.EntityFilter?.applicationId) {
      this.AppEntityGroups = [];
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
    for (const entity of this.Entities) {
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
        isExpanded: this.State.expandedAppGroups.includes('__system_other__')
      });
    }

    // Apply expanded state from persisted state
    for (const group of groups) {
      group.isExpanded = this.State.expandedAppGroups.includes(group.applicationId);
    }

    this.AppEntityGroups = groups;
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
  public OnRecentRecordClick(record: RecentRecordAccess): void {
    const entity = this.Entities.find(e => UUIDsEqual(e.ID, record.entityId));
    if (entity) {
      // Set pending record selection - will be resolved in onDataLoaded
      this.pendingRecordSelection = record.recordId;
      this.OnEntitySelected(entity);
    }
  }

  /** @deprecated Use {@link OnRecentRecordClick}. */
  public onRecentRecordClick(record: RecentRecordAccess): void {
    return this.OnRecentRecordClick(record);
  }

  /**
   * Handle clicking on a favorite record from home screen.
   * Navigates to the entity and sets up pending selection to select the record
   * and open the detail panel once data loads.
   */
  public OnFavoriteRecordClick(record: FavoriteRecord): void {
    const entity = this.Entities.find(e => UUIDsEqual(e.ID, record.entityId));
    if (entity) {
      // Set pending record selection - will be resolved in onDataLoaded
      this.pendingRecordSelection = record.recordId;
      this.OnEntitySelected(entity);
    }
  }

  /** @deprecated Use {@link OnFavoriteRecordClick}. */
  public onFavoriteRecordClick(record: FavoriteRecord): void {
    return this.OnFavoriteRecordClick(record);
  }

  /**
   * Get the icon for an entity by ID (for recent records)
   */
  public GetEntityIconById(entityId: string): string {
    const entity = this.metadata.Entities.find(e => UUIDsEqual(e.ID, entityId));
    if (entity) {
      return this.GetEntityIcon(entity);
    }
    return 'fa-solid fa-table';
  }

  /** @deprecated Use {@link GetEntityIconById}. */
  public getEntityIconById(entityId: string): string {
    return this.GetEntityIconById(entityId);
  }

  /**
   * Pre-compute the "N ago" relative-time label for each recent record into its `relativeTime`
   * field. The template binds `record.relativeTime` (a stable value) instead of calling
   * {@link formatRelativeTime} — which reads `Date.now()` — during change detection. Recomputing
   * time inside a template binding is what produced the NG0100
   * ExpressionChangedAfterItHasBeenCheckedError (the value could differ between the two dev-mode
   * CD passes when a minute boundary was crossed); binding a stored field cannot. Called when the
   * record set loads and on a timer so the labels stay current.
   */
  private refreshRecentRecordTimes(): void {
    for (const record of this.RecentRecords) {
      record.relativeTime = this.formatRelativeTime(record.latestAt);
    }
  }

  /**
   * Format relative time for display (e.g., "2 hours ago").
   * NOTE: this reads Date.now(), so it must NOT be called directly from a template binding —
   * use the pre-computed {@link RecentRecordAccess.relativeTime} field (see refreshRecentRecordTimes).
   */
  private formatRelativeTime(date: Date): string {
    if (!date) return '';

    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }

  /**
   * Check if we're at the home level (no entity selected)
   */
  get IsAtHomeLevel(): boolean {
    return !this.SelectedEntity;
  }

  /** @deprecated Use {@link IsAtHomeLevel}. */
  get isAtHomeLevel(): boolean {
    return this.IsAtHomeLevel;
  }

  /**
   * NAVIGATION handler: open a *related* record on a (possibly different) entity, bubbled up from a
   * plug-in renderer through the workspace (e.g. a grid foreign-key drill-through). Resolves the
   * target entity and shows the record in the detail panel, mirroring the FK navigation path used
   * by {@link onOpenForeignKeyRecord}.
   *
   * @param nav the related-record navigation payload: the target entity name and the record's key.
   */
  public OnOpenRelatedRecordRequested(nav: ViewRelatedRecordNavigation): void {
    if (nav?.entityName && nav.recordKey != null) {
      void this.loadAndShowRecordInDetailPanel(nav.entityName, String(nav.recordKey));
    }
  }

  /** @deprecated Use {@link OnOpenRelatedRecordRequested}. */
  public onOpenRelatedRecordRequested(nav: ViewRelatedRecordNavigation): void {
    return this.OnOpenRelatedRecordRequested(nav);
  }
}
