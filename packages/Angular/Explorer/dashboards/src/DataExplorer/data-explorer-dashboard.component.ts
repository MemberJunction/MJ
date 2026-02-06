import { Component, OnInit, OnDestroy, ChangeDetectorRef, Input, OnChanges, SimpleChanges, HostListener, ElementRef, ViewChild } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { BaseDashboard, NavigationService } from '@memberjunction/ng-shared';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, EntityInfo, RunView, EntityFieldTSType } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { ApplicationEntityEntity, ResourceData, UserInfoEngine, ViewGridAggregatesConfig } from '@memberjunction/core-entities';
import {
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  EntityViewerConfig,
  EntityViewMode,
  NavigateToRelatedEvent,
  EntityViewerComponent,
  ViewGridState,
  GridStateChangedEvent,
  ViewSaveEvent,
  ViewConfigPanelComponent
} from '@memberjunction/ng-entity-viewer';
import { ViewSelectedEvent, SaveViewRequestedEvent, ViewSelectorComponent } from './components/view-selector/view-selector.component';
import { CompositeFilterDescriptor, FilterFieldInfo, createEmptyFilter } from '@memberjunction/ng-filter-builder';
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { ExplorerStateService } from './services/explorer-state.service';
import { DataExplorerState, DataExplorerFilter, BreadcrumbItem, DataExplorerDeepLink, RecentRecordAccess, FavoriteRecord } from './models/explorer-state.interface';
import { OpenRecordEvent, SelectRecordEvent } from './components/navigation-panel/navigation-panel.component';
import { DisplaySimpleNotificationRequestData, MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { ListManagementDialogConfig, ListManagementResult } from '@memberjunction/ng-list-management';
import {
  ExportService,
  ExportDialogConfig,
  ExportDialogResult
} from '@memberjunction/ng-export-service';
import {
  ExportColumn,
  ExportData
} from '@memberjunction/export-engine';

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
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  /** Reference to the filter input for keyboard shortcuts */
  @ViewChild('filterInput') filterInputRef: ElementRef<HTMLInputElement> | undefined;

  /** Reference to the view selector for refreshing after save */
  @ViewChild(ViewSelectorComponent) viewSelectorRef: ViewSelectorComponent | undefined;

  /** Reference to the entity viewer for refreshing after view save */
  @ViewChild(EntityViewerComponent) entityViewerRef: EntityViewerComponent | undefined;

  /** Reference to the view config panel for passing filter state */
  @ViewChild(ViewConfigPanelComponent) viewConfigPanelRef: ViewConfigPanelComponent | undefined;

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

  // State
  public state: DataExplorerState;

  // Entity data - all entities available to the user
  private allEntities: EntityInfo[] = [];
  // Filtered entities based on entityFilter
  public entities: EntityInfo[] = [];
  // Entity IDs for the current application (loaded when applicationId filter is set)
  private applicationEntityIds: Set<string> = new Set();
  public selectedEntity: EntityInfo | null = null;

  // Record counts (updated by mj-entity-viewer)
  public totalRecordCount = 0;
  public filteredRecordCount = 0;

  // Selected record for detail panel
  public selectedRecord: BaseEntity | null = null;
  // Entity info for the detail panel (may differ from selectedEntity when viewing FK/related records)
  public detailPanelEntity: EntityInfo | null = null;
  // Currently loaded records from mj-entity-viewer (for back/forward navigation lookup)
  private loadedRecords: BaseEntity[] = [];

  // Currently selected view entity (for view data loading)
  public selectedViewEntity: UserViewEntityExtended | null = null;

  // Debounced filter text (synced with mj-entity-viewer)
  public debouncedFilterText: string = '';
  private filterInput$ = new Subject<string>();

  // Entity filter text for home screen
  public entityFilterText: string = '';

  // Breadcrumbs for navigation display
  public breadcrumbs: BreadcrumbItem[] = [];

  // Loading state for entities
  public isLoadingEntities: boolean = true;

  // Date field dropdown state
  public isDateFieldDropdownOpen: boolean = false;

  // Flag to skip URL updates during initialization (when applying deep link)
  private skipUrlUpdates: boolean = true;

  // Track the last URL we navigated to, to avoid reacting to our own navigation
  private lastNavigatedUrl: string = '';

  // Recent records from User Record Logs
  public recentRecords: RecentRecordAccess[] = [];

  // Favorite records from User Favorites (non-entity favorites)
  public favoriteRecords: FavoriteRecord[] = [];

  // Loading state for home screen sections
  public isLoadingRecentRecords: boolean = true;

  // Entity filter for recent records (null = show all, string = filter by entityId)
  public recentRecordsEntityFilter: string | null = null;

  // Export functionality
  public showExportDialog: boolean = false;
  public exportDialogConfig: ExportDialogConfig | null = null;

  // List management
  public showListManagementDialog: boolean = false;
  public listManagementConfig: ListManagementDialogConfig | null = null;

  // Selection tracking for grid - needed to enable Add to List button in header
  public selectedRecordIds: string[] = [];
  public selectedRecords: BaseEntity[] = [];

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Data Explorer"
  }


  /**
   * Filtered entities based on entityFilterText (for home screen)
   * Excludes entities shown in recent or favorites sections
   * Applies Common/All toggle filtering
   */
  get filteredEntities(): EntityInfo[] {
    // Get IDs of entities in recent and favorites to exclude
    const recentEntityIds = new Set(this.state.recentEntityAccesses.map(r => r.entityId));
    const favoriteEntityIds = new Set(this.state.favoriteEntities.map(f => f.entityId));

    let result = this.entities.filter(e => {
      // Exclude entities shown in recent or favorites sections
      if (recentEntityIds.has(e.ID) || favoriteEntityIds.has(e.ID)) {
        return false;
      }

      // Apply Common/All toggle filter (only if we have DefaultForNewUser info)
      if (!this.state.showAllEntities && this.stateService.DefaultEntityIds.size > 0) {
        if (!this.stateService.DefaultEntityIds.has(e.ID)) {
          return false;
        }
      }

      return true;
    });

    // Apply text filter
    if (this.entityFilterText && this.entityFilterText.trim() !== '') {
      const filter = this.entityFilterText.toLowerCase().trim();
      result = result.filter(e =>
        e.Name.toLowerCase().includes(filter) ||
        (e.Description && e.Description.toLowerCase().includes(filter))
      );
    }

    return result;
  }

  /**
   * Get recent entities for home screen display (max 5)
   */
  get recentEntities(): EntityInfo[] {
    return this.state.recentEntityAccesses
      .slice(0, 5)
      .map(r => this.entities.find(e => e.ID === r.entityId))
      .filter((e): e is EntityInfo => e !== undefined);
  }

  /**
   * Get favorite entities for home screen display
   */
  get favoriteEntities(): EntityInfo[] {
    return this.state.favoriteEntities
      .map(f => this.entities.find(e => e.ID === f.entityId))
      .filter((e): e is EntityInfo => e !== undefined);
  }

  /**
   * Check if we should show the Common/All toggle
   * Only show if we have DefaultForNewUser information
   */
  get showCommonAllToggle(): boolean {
    return this.stateService.DefaultEntityIds.size > 0;
  }

  /**
   * Total count of all entities (for display)
   */
  get allEntitiesCount(): number {
    return this.entities.length;
  }

  /**
   * Count of common (DefaultForNewUser) entities
   */
  get commonEntitiesCount(): number {
    return this.entities.filter(e => this.stateService.DefaultEntityIds.has(e.ID)).length;
  }

  /**
   * Check if we have any content for the top two-column section
   * (recent/favorite entities OR recent/favorite records)
   */
  get hasTopSectionContent(): boolean {
    return this.recentEntities.length > 0 ||
           this.favoriteEntities.length > 0 ||
           this.recentRecords.length > 0 ||
           this.favoriteRecords.length > 0;
  }

  /**
   * Check if the left column (records column) has content
   */
  get hasRecordsColumnContent(): boolean {
    return this.recentRecords.length > 0 || this.favoriteRecords.length > 0;
  }

  /**
   * Check if the right column (entities column) has content
   */
  get hasEntitiesColumnContent(): boolean {
    return this.recentEntities.length > 0 || this.favoriteEntities.length > 0;
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
   * Check if the currently selected entity has date fields available for timeline view.
   * Used to conditionally show the timeline toggle button in the header.
   */
  get entityHasDateFields(): boolean {
    if (!this.selectedEntity) return false;
    return this.selectedEntity.Fields.some(
      f => f.TSType === EntityFieldTSType.Date
    );
  }

  /**
   * Get available date fields for the currently selected entity.
   * Used for the date field selector in timeline view.
   */
  get availableDateFields(): { name: string; displayName: string }[] {
    if (!this.selectedEntity) return [];
    return this.selectedEntity.Fields
      .filter(f => f.TSType === EntityFieldTSType.Date)
      .sort((a, b) => {
        // Prioritize DefaultInView fields, then by Sequence
        if (a.DefaultInView && !b.DefaultInView) return -1;
        if (!a.DefaultInView && b.DefaultInView) return 1;
        return a.Sequence - b.Sequence;
      })
      .map(f => ({
        name: f.Name,
        displayName: f.DisplayNameOrName
      }));
  }

  /**
   * Get the effective timeline date field name.
   * Returns stored value if valid, otherwise first available date field.
   */
  get effectiveTimelineDateField(): string | null {
    const available = this.availableDateFields;
    if (available.length === 0) return null;

    // Check if stored value is still valid
    if (this.state.timelineDateFieldName && available.some(f => f.name === this.state.timelineDateFieldName)) {
      return this.state.timelineDateFieldName;
    }

    // Default to first available
    return available[0].name;
  }

  /**
   * Get the display name of the effective timeline date field.
   */
  get effectiveTimelineDateFieldDisplayName(): string {
    const fieldName = this.effectiveTimelineDateField;
    if (!fieldName) return '';
    const field = this.availableDateFields.find(f => f.name === fieldName);
    return field?.displayName || fieldName;
  }

  /**
   * Set the timeline date field.
   */
  setTimelineDateField(fieldName: string): void {
    this.state.timelineDateFieldName = fieldName;
    this.stateService.updateState({ timelineDateFieldName: fieldName });
    this.isDateFieldDropdownOpen = false;
    this.cdr.detectChanges();
  }

  /**
   * Toggle the date field dropdown open/closed.
   */
  toggleDateFieldDropdown(): void {
    this.isDateFieldDropdownOpen = !this.isDateFieldDropdownOpen;
  }

  /**
   * Close the date field dropdown.
   */
  closeDateFieldDropdown(): void {
    this.isDateFieldDropdownOpen = false;
  }

  /**
   * Toggle timeline orientation between vertical and horizontal.
   */
  toggleTimelineOrientation(): void {
    const newOrientation = this.state.timelineOrientation === 'vertical' ? 'horizontal' : 'vertical';
    this.state.timelineOrientation = newOrientation;
    this.stateService.updateState({ timelineOrientation: newOrientation });
    this.cdr.detectChanges();
  }

  /**
   * Toggle timeline sort order between newest first (desc) and oldest first (asc).
   */
  toggleTimelineSortOrder(): void {
    const newSortOrder = this.state.timelineSortOrder === 'desc' ? 'asc' : 'desc';
    this.state.timelineSortOrder = newSortOrder;
    this.stateService.updateState({ timelineSortOrder: newSortOrder });
    this.cdr.detectChanges();
  }

  /**
   * Get the current timeline configuration for the entity-viewer.
   */
  get currentTimelineConfig(): { dateFieldName: string; orientation: 'vertical' | 'horizontal'; sortOrder: 'asc' | 'desc' } | null {
    const dateField = this.effectiveTimelineDateField;
    if (!dateField) return null;
    return {
      dateFieldName: dateField,
      orientation: this.state.timelineOrientation,
      sortOrder: this.state.timelineSortOrder
    };
  }

  /**
   * Configuration for mj-entity-viewer composite component
   * Hides the built-in header since we have a custom header in the dashboard
   * Uses server-side pagination with 100 records per page (default)
   */
  public viewerConfig: Partial<EntityViewerConfig> = {
    showFilter: false,        // We have our own filter in the dashboard header
    showViewModeToggle: false, // We have our own toggle in the dashboard header
    showRecordCount: false,   // We show count in the dashboard header
    showPagination: true,     // Show the pagination UI with "Load More" button
    serverSideFiltering: true, // Use RunView's UserSearchString for filtering
    serverSideSorting: true,  // Use RunView's OrderBy for sorting
    height: '100%'
  };

  /**
   * Current grid state (built from view entity or local state changes)
   * This is passed to mj-entity-viewer to control column display
   */
  public currentGridState: ViewGridState | null = null;

  // Filter dialog state (rendered at dashboard level for full viewport width)
  public isFilterDialogOpen: boolean = false;
  public filterDialogFields: FilterFieldInfo[] = [];
  public filterDialogState: CompositeFilterDescriptor = createEmptyFilter();
  public filterDialogDisabled: boolean = false;

  // View save state
  public isSavingView: boolean = false;

  constructor(
    public stateService: ExplorerStateService,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private recentAccessService: RecentAccessService,
    private navigationService: NavigationService,
    private exportService: ExportService
  ) {
    super();
    this.state = this.stateService.CurrentState;
  }

  async ngOnInit(): Promise<void> {
    // Ensure UserInfoEngine is configured before we try to access user settings
    // This prevents race conditions where we try to load default view settings
    // before the user settings have been loaded from the server
    await UserInfoEngine.Instance.Config(false);

    // Parse URL state FIRST - URL wins over persisted state
    // This must happen before loading entities to prevent race conditions
    const urlState = this.parseUrlState();

    // Set context for state service (enables context-specific settings)
    await this.stateService.setContext(this.entityFilter);
    this.state = this.stateService.CurrentState;

    // User search text starts empty - it's separate from smart filter
    this.debouncedFilterText = '';

    // Load available entities (async to support applicationId filter)
    // Pass urlState so we don't restore persisted entity if URL specifies one
    await this.loadEntities(urlState);

    // Apply URL state after entities are loaded
    if (urlState) {
      // URL has state - apply it (overrides persisted state)
      this.applyUrlState(urlState);
    } else if (this.deepLink) {
      // No URL state but @Input deepLink provided - use that
      await this.applyDeepLink(this.deepLink);
    }

    // Subscribe to state changes
    this.stateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const entityChanged = state.selectedEntityName !== this.state.selectedEntityName;

        this.state = state;

        // When entity changes, clear user search text
        if (entityChanged) {
          this.debouncedFilterText = '';
        }

        this.onStateChanged();

        // Update URL to reflect current state (for deep linking)
        if (!this.skipUrlUpdates) {
          this.updateUrl();
        }

        this.cdr.detectChanges();
      });

    // Subscribe to breadcrumb changes
    this.stateService.Breadcrumbs
      .pipe(takeUntil(this.destroy$))
      .subscribe(breadcrumbs => {
        this.breadcrumbs = breadcrumbs;
        this.cdr.detectChanges();
      });

    // Setup debounced filter
    this.filterInput$
      .pipe(
        debounceTime(250),
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

    // Subscribe to router NavigationEnd events for back/forward button support
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        // Only react to navigation events that weren't triggered by us
        // Normalize URLs by decoding to handle + vs %20 encoding differences
        // Note: decodeURIComponent doesn't decode +, so we also replace + with space
        const currentUrl = event.urlAfterRedirects || event.url;
        const normalizedCurrentUrl = decodeURIComponent(currentUrl).replace(/\+/g, ' ');
        const normalizedLastUrl = decodeURIComponent(this.lastNavigatedUrl).replace(/\+/g, ' ');
        const isExternal = normalizedCurrentUrl !== normalizedLastUrl;
        if (isExternal) {
          this.onExternalNavigation(currentUrl);
        }
      });

    // Enable URL updates now that initialization is complete
    this.skipUrlUpdates = false;

    // Update URL to reflect current state (whether from URL, deepLink, or persisted)
    this.updateUrl();

    // Notify that loading is complete (for resource wrapper integration)
    this.NotifyLoadComplete();
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
    }

    // Cmd+K or Ctrl+K to focus filter
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.focusFilterInput();
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

      // Only restore entity from persisted state if there's no URL state
      // This prevents race conditions where persisted entity triggers data load
      // before URL state can override it
      if (!urlState && this.state.selectedEntityName) {
        this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
      }
    } finally {
      this.isLoadingEntities = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Load entity IDs associated with a specific application
   */
  private async loadApplicationEntityIds(applicationId: string): Promise<void> {
    this.applicationEntityIds.clear();

    const rv = new RunView();
    const result = await rv.RunView<ApplicationEntityEntity>({
      EntityName: 'Application Entities',
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
    // Ensure any pending grid state changes are saved before switching entities
    // This ensures column resizes/reorders are saved to the current entity's view before switching
    this.entityViewerRef?.EnsurePendingChangesSaved();

    this.resetRecordCounts();
    this.selectedEntity = entity;
    // Load user's saved default grid state for this entity (if any)
    // This ensures formatting and column settings persist across sessions
    this.currentGridState = this.loadUserDefaultGridState();
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
      // Load user's saved default grid state for this entity (if any)
      this.currentGridState = this.loadUserDefaultGridState();
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
  // VIEW MANAGEMENT
  // ========================================

  /**
   * Handle view selection from view selector dropdown
   */
  public onViewSelected(event: ViewSelectedEvent): void {
    // Ensure any pending grid state changes are saved before switching views
    // This ensures column resizes/reorders are saved to the current view before switching
    this.entityViewerRef?.EnsurePendingChangesSaved();

    this.selectedViewEntity = event.view;
    this.stateService.selectView(event.viewId);

    // When a view is selected, apply its configuration
    if (event.view) {
      // Parse and apply the view's grid state
      this.currentGridState = this.parseViewGridState(event.view);

      // Apply the view's filter - for Smart Filter views, use SmartFilterPrompt
      // For regular filter views, the WhereClause is applied in the entity-viewer
      if (event.view.SmartFilterEnabled && event.view.SmartFilterPrompt) {
        this.stateService.setSmartFilterPrompt(event.view.SmartFilterPrompt);
      } else {
        // Clear the smart filter when switching to a view with regular filters
        this.stateService.setSmartFilterPrompt('');
      }
      // Always clear user search text when switching views - smart filter is separate
      this.debouncedFilterText = '';
    } else {
      // Switching to default view - load user's saved defaults from UserInfoEngine
      this.currentGridState = this.loadUserDefaultGridState();
      this.stateService.setSmartFilterPrompt('');
      this.debouncedFilterText = '';
    }

    // Force refresh to ensure the grid reloads with the new view configuration
    this.cdr.detectChanges();
    this.entityViewerRef?.refresh();
  }

  /**
   * Load user's saved default grid state from UserInfoEngine
   * Returns null if no saved state exists
   */
  private loadUserDefaultGridState(): ViewGridState | null {
    if (!this.selectedEntity) return null;

    try {
      const settingKey = `default-view-setting/${this.selectedEntity.Name}`;
      const savedState = UserInfoEngine.Instance.GetSetting(settingKey);

      if (savedState) {
        const gridState = JSON.parse(savedState);
        if (gridState && Array.isArray(gridState.columnSettings)) {
          return {
            columnSettings: gridState.columnSettings,
            sortSettings: gridState.sortSettings || []
          };
        }
      }
    } catch (error) {
      console.warn('[DataExplorer] Failed to load user default grid state:', error);
    }

    return null;
  }

  /**
   * Parse GridState JSON from a UserView entity
   * Returns null if no valid GridState is present
   */
  private parseViewGridState(view: UserViewEntityExtended): ViewGridState | null {
    if (!view.GridState) {
      return null;
    }

    try {
      const parsed = JSON.parse(view.GridState);

      // Validate structure - expect columnSettings array
      if (parsed && Array.isArray(parsed.columnSettings)) {
        return {
          columnSettings: parsed.columnSettings,
          sortSettings: parsed.sortSettings || [],
          aggregates: parsed.aggregates || undefined
        };
      }

      return null;
    } catch (error) {
      console.warn('[DataExplorer] Failed to parse GridState:', error);
      return null;
    }
  }

  /**
   * Handle grid state changes from entity-viewer (column resize, reorder, etc.)
   * Updates the local currentGridState and marks view as modified
   */
  public onGridStateChanged(event: GridStateChangedEvent): void {
    this.currentGridState = event.gridState;

    // Mark view as modified if we have a selected view
    if (this.state.selectedViewId) {
      this.stateService.setViewModified(true);
    }
  }

  /**
   * Handle save view request from view selector
   */
  public onSaveViewRequested(event: SaveViewRequestedEvent): void {
    // TODO: Implement in Phase 4 - View CRUD Operations
    // For now, just open the config panel where save functionality will be
    this.stateService.openViewConfigPanel();
  }

  /**
   * Handle manage views request - opens view browser
   */
  public onManageViewsRequested(): void {
    // TODO: Implement navigation to view management
  }

  /**
   * Handle open in tab request - opens the view as a ViewResource in a new tab
   */
  public onOpenInTabRequested(viewId: string): void {
    // Get the view name from the component's selectedViewEntity (set when view is selected)
    const viewName = this.selectedViewEntity?.Name || 'View';

    // Use NavigationService to open as a proper ViewResource (not entity record)
    this.navigationService.OpenView(viewId, viewName, { forceNewTab: true });
  }

  /**
   * Handle configure view request - opens the configuration panel
   */
  public onConfigureViewRequested(): void {
    this.stateService.openViewConfigPanel();
  }

  /**
   * Close the view configuration panel
   */
  public onCloseViewConfigPanel(): void {
    this.stateService.closeViewConfigPanel();
  }

  // ========================================
  // FILTER DIALOG (at dashboard level for full width)
  // ========================================

  /**
   * Handle request to open filter dialog from view config panel
   * The dialog is rendered at dashboard level to allow full viewport width
   */
  public onOpenFilterDialogRequest(event: { filterState: CompositeFilterDescriptor; filterFields: FilterFieldInfo[] }): void {
    this.filterDialogState = event.filterState;
    this.filterDialogFields = event.filterFields;
    this.filterDialogDisabled = !this.viewConfigPanelRef?.canEdit;
    this.isFilterDialogOpen = true;
    this.cdr.detectChanges();
  }

  /**
   * Close the filter dialog
   */
  public onCloseFilterDialog(): void {
    this.isFilterDialogOpen = false;
    this.cdr.detectChanges();
  }

  /**
   * Handle filter applied from dialog - pass back to view config panel
   */
  public onFilterApplied(filter: CompositeFilterDescriptor): void {
    this.filterDialogState = filter;
    this.isFilterDialogOpen = false;
    // The view config panel will pick up the new filter state via input binding
    this.cdr.detectChanges();
  }

  /**
   * Handle save view from config panel
   */
  public async onSaveView(event: ViewSaveEvent): Promise<void> {
    if (!this.selectedEntity) return;

    this.isSavingView = true;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();

      // Build GridState in Kendo-compatible format
      const gridState = this.buildGridState(event);

      // Build SortState in Kendo-compatible format
      const sortState = this.buildSortState(event);

      if (event.saveAsNew || !this.selectedViewEntity) {
        // Create new view
        const newView = await md.GetEntityObject<UserViewEntityExtended>('User Views');
        newView.Name = event.name || 'Custom';
        newView.Description = event.description;
        newView.EntityID = this.selectedEntity.ID;
        newView.UserID = md.CurrentUser.ID;
        newView.IsShared = event.isShared;
        newView.IsDefault = false;

        // Set GridState and SortState
        if (gridState) {
          newView.GridState = JSON.stringify(gridState);
        }
        if (sortState) {
          newView.SortState = JSON.stringify(sortState);
        }

        // Set Smart Filter settings
        newView.SmartFilterEnabled = event.smartFilterEnabled;
        newView.SmartFilterPrompt = event.smartFilterPrompt;

        // Set traditional filter state (Kendo-compatible JSON format)
        // The UserViewEntity.Save() will auto-generate WhereClause from FilterState
        if (event.filterState) {
          newView.FilterState = JSON.stringify(event.filterState);
        }

        const saved = await newView.Save();
        if (saved) {
          this.selectedViewEntity = newView;
          this.stateService.selectView(newView.ID);
          this.stateService.setViewModified(false);
          // Update currentGridState from the saved view to refresh the grid
          this.currentGridState = this.parseViewGridState(newView);
          // Force change detection to ensure grid picks up the new gridState
          this.cdr.detectChanges();
          // Refresh the view selector dropdown
          await this.viewSelectorRef?.loadViews();
          // Refresh the entity viewer data to apply saved aggregates and fetch their values
          this.entityViewerRef?.refresh();
        }
      } else {
        // Update existing view
        this.selectedViewEntity.Name = event.name;
        this.selectedViewEntity.Description = event.description;
        this.selectedViewEntity.IsShared = event.isShared;

        // Update GridState and SortState
        if (gridState) {
          this.selectedViewEntity.GridState = JSON.stringify(gridState);
        }
        if (sortState) {
          this.selectedViewEntity.SortState = JSON.stringify(sortState);
        }

        // Update Smart Filter settings
        this.selectedViewEntity.SmartFilterEnabled = event.smartFilterEnabled;
        this.selectedViewEntity.SmartFilterPrompt = event.smartFilterPrompt;

        // Update traditional filter state (Kendo-compatible JSON format)
        // The UserViewEntity.Save() will auto-generate WhereClause from FilterState
        if (event.filterState) {
          this.selectedViewEntity.FilterState = JSON.stringify(event.filterState);
        } else {
          // Clear filter state if no filters
          this.selectedViewEntity.FilterState = JSON.stringify({ logic: 'and', filters: [] });
        }

        const saved = await this.selectedViewEntity.Save();
        if (saved) {
          this.stateService.setViewModified(false);
          // Update currentGridState from the saved view to refresh the grid columns
          this.currentGridState = this.parseViewGridState(this.selectedViewEntity);
          // Force change detection to ensure grid picks up the new gridState
          this.cdr.detectChanges();
          // Refresh the view selector dropdown
          await this.viewSelectorRef?.loadViews();
          // Refresh the entity viewer data to apply saved filters/sorts
          // Note: viewEntity reference didn't change, so we need to manually trigger refresh
          // Use refresh() instead of loadData() to reset pagination state and reload from page 1
          this.entityViewerRef?.refresh();
        }
      }

      this.stateService.closeViewConfigPanel();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('[DataExplorer] Error saving view:', error);
    } finally {
      this.isSavingView = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Handle saving default view settings to user settings
   * Used for dynamic/default views that persist to MJ: User Settings
   */
  public async onSaveDefaultViewSettings(event: ViewSaveEvent): Promise<void> {
    if (!this.selectedEntity) return;

    this.isSavingView = true;
    this.cdr.detectChanges();

    try {
      // Build GridState from the event
      const gridState = this.buildGridState(event);

      if (gridState) {
        // Build sort settings if present - prefer sortItems (multi-sort)
        if (event.sortItems && event.sortItems.length > 0) {
          gridState.sortSettings = event.sortItems.map(item => ({
            field: item.field,
            dir: item.direction
          }));
        } else if (event.sortField) {
          // Fallback to deprecated sortField for backward compatibility
          gridState.sortSettings = [{
            field: event.sortField,
            dir: event.sortDirection
          }];
        }

        // Save to user settings using the same key pattern as entity-data-grid
        const settingKey = `default-view-setting/${this.selectedEntity.Name}`;
        await UserInfoEngine.Instance.SetSetting(settingKey, JSON.stringify(gridState));

        // Update currentGridState to reflect saved state
        this.currentGridState = {
          columnSettings: gridState.columnSettings as ViewGridState['columnSettings'],
          sortSettings: gridState.sortSettings as ViewGridState['sortSettings'],
          aggregates: gridState.aggregates
        };

        // Force change detection to ensure grid picks up the new gridState
        this.cdr.detectChanges();

        // Refresh the entity viewer data to apply saved aggregates and fetch their values
        this.entityViewerRef?.refresh();

        // Show success notification
        this.showNotification('Default view settings saved', 'success', 2500);
      }

      this.stateService.closeViewConfigPanel();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('[DataExplorer] Error saving default view settings:', error);
      // Show error notification
      this.showNotification('Failed to save default view settings', 'error', 3500);
    } finally {
      this.isSavingView = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Build GridState in Kendo-compatible format
   * Format: { columnSettings: [...], sortSettings: [...], aggregates: {...} }
   *
   * Priority for column settings:
   * 1. If event.columns provided (from config panel) - use those
   * 2. If currentGridState exists (from grid interactions) - use that
   * 3. Otherwise return null
   */
  private buildGridState(event: ViewSaveEvent): { columnSettings: object[]; sortSettings?: object[]; aggregates?: ViewGridAggregatesConfig } | null {
    let columnSettings: object[];

    // First check if the event has columns configured (from config panel)
    if (event.columns.length > 0) {
      columnSettings = event.columns.map((col, idx) => ({
        ID: col.fieldId,
        Name: col.fieldName,
        DisplayName: col.displayName,
        userDisplayName: col.userDisplayName, // Include user-defined column alias
        hidden: false, // Visible columns only
        width: col.width || null,
        orderIndex: idx,
        format: col.format // Include column format settings
      }));
    }
    // Otherwise, use the current grid state if available (from grid interactions)
    else if (this.currentGridState?.columnSettings && this.currentGridState.columnSettings.length > 0) {
      columnSettings = this.currentGridState.columnSettings;
    }
    // No columns to save
    else {
      return null;
    }

    // Build sort settings - prefer event.sortItems (multi-sort), fall back to currentGridState
    let sortSettings: object[] | undefined;
    if (event.sortItems && event.sortItems.length > 0) {
      sortSettings = event.sortItems.map(item => ({
        field: item.field,
        dir: item.direction // 'asc' or 'desc'
      }));
    } else if (event.sortField) {
      // Fallback to deprecated sortField for backward compatibility
      sortSettings = [{
        field: event.sortField,
        dir: event.sortDirection
      }];
    } else if (this.currentGridState?.sortSettings && this.currentGridState.sortSettings.length > 0) {
      sortSettings = this.currentGridState.sortSettings;
    }

    // Build aggregate settings from event or current state
    let aggregates: ViewGridAggregatesConfig | undefined;
    if (event.aggregatesConfig) {
      aggregates = event.aggregatesConfig;
    } else if (this.currentGridState?.aggregates) {
      aggregates = this.currentGridState.aggregates;
    }

    return { columnSettings, sortSettings, aggregates };
  }

  /**
   * Build SortState in Kendo-compatible format
   * Format: [{field, direction}] where direction is 'asc' or 'desc'
   * Supports multi-column sorting via sortItems array
   */
  private buildSortState(event: ViewSaveEvent): object[] | null {
    // Prefer sortItems array (multi-sort) over deprecated sortField
    if (event.sortItems && event.sortItems.length > 0) {
      return event.sortItems.map(item => ({
        field: item.field,
        direction: item.direction // 'asc' or 'desc'
      }));
    }

    // Fallback to deprecated sortField for backward compatibility
    if (event.sortField) {
      return [{
        field: event.sortField,
        direction: event.sortDirection
      }];
    }

    return null;
  }

  /**
   * Handle delete view from config panel
   */
  public async onDeleteView(): Promise<void> {
    if (!this.selectedViewEntity) return;

    try {
      const deleted = await this.selectedViewEntity.Delete();
      if (deleted) {
        this.selectedViewEntity = null;
        this.stateService.selectView(null);
        this.stateService.closeViewConfigPanel();
      }
    } catch (error) {
      console.error('[DataExplorer] Error deleting view:', error);
    }
  }

  // ========================================
  // VIEW MODE & FILTERING (Dashboard Header)
  // ========================================

  /**
   * Handle view mode toggle from dashboard header
   */
  public onViewModeChanged(mode: EntityViewMode): void {
    this.stateService.setViewMode(mode);
    // Mark view as modified when view mode changes
    if (this.state.selectedViewId) {
      this.stateService.setViewModified(true);
    }
  }

  /**
   * Handle smart filter change from dashboard header
   */
  public onSmartFilterChanged(prompt: string): void {
    this.stateService.setSmartFilterPrompt(prompt);
    this.filterInput$.next(prompt);
  }

  /**
   * Handle filter text change from mj-entity-viewer (two-way binding)
   */
  public onFilterTextChanged(filterText: string): void {
    this.stateService.setSmartFilterPrompt(filterText);
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
    this.stateService.selectRecord(event.record.PrimaryKey.ToConcatenatedString(), recordName);

    // Add to recent items (local state for navigation panel)
    if (this.selectedEntity) {
      this.stateService.addRecentItem({
        entityName: this.selectedEntity.Name,
        compositeKeyString: event.record.PrimaryKey.ToConcatenatedString(),
        displayName: recordName
      });

      // Update local recent records immediately for instant home screen updates
      const recordId = event.record.PrimaryKey.KeyValuePairs[0]?.Value?.toString() || '';
      this.stateService.addLocalRecentRecord(
        this.selectedEntity.Name,
        this.selectedEntity.ID,
        recordId,
        recordName
      );

      // Log to User Record Logs for persistence (fire-and-forget)
      this.recentAccessService.logAccess(
        this.selectedEntity.Name,
        event.record.PrimaryKey.Values(),
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
   * Handle data loaded from mj-entity-viewer
   */
  public onDataLoaded(event: DataLoadedEvent): void {
    this.totalRecordCount = event.totalRowCount;
    this.filteredRecordCount = event.loadedRowCount;
    // Store loaded records for back/forward navigation lookup
    this.loadedRecords = event.records;

    // Handle pending record selection from deep link
    if (this.pendingRecordSelection) {
      const recordId = this.pendingRecordSelection;
      this.pendingRecordSelection = null; // Clear it so we don't keep trying

      // Try to find the record by primary key or concatenated string
      const record = event.records.find(r => {
        const pkString = r.PrimaryKey.ToConcatenatedString();
        const pkValue = r.PrimaryKey.KeyValuePairs[0]?.Value?.toString();
        return pkString === recordId || pkValue === recordId;
      });

      if (record) {
        this.selectedRecord = record;
        this.detailPanelEntity = this.selectedEntity;
        const recordName = this.getRecordDisplayName(record);
        this.stateService.selectRecord(record.PrimaryKey.ToConcatenatedString(), recordName);
      } else {
        console.warn(`[DataExplorer] Deep link record not found: ${recordId}`);
      }
    }
    // Restore selected record if we have a persisted selectedRecordId
    else if (this.state.selectedRecordId && this.state.detailPanelOpen && !this.selectedRecord) {
      const record = event.records.find(r =>
        r.PrimaryKey.ToConcatenatedString() === this.state.selectedRecordId
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
  public onOpenRecord(record: BaseEntity): void {
    if (!this.detailPanelEntity) return;

    this.OpenEntityRecord.emit({
      EntityName: this.detailPanelEntity.Name,
      RecordPKey: record.PrimaryKey
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
   * Handle export request - opens the export dialog
   */
  public async onExport(): Promise<void> {
    if (!this.selectedEntity) {
      console.error('Cannot export: No entity selected');
      return;
    }

    try {
      this.showNotification('Preparing export...', 'info', 2000);

      // Load the export data
      const data = await this.getExportData();

      // Get visible columns for export
      const columns = this.getExportColumns();

      // Generate file name
      const viewName = this.selectedViewEntity?.Name || 'Data';
      const fileName = `${this.selectedEntity.Name}_${viewName}_${new Date().toISOString().split('T')[0]}`;

      // Configure and show the export dialog
      this.exportDialogConfig = {
        data,
        columns,
        defaultFileName: fileName,
        availableFormats: ['excel', 'csv', 'json'],
        defaultFormat: 'excel',
        showSamplingOptions: true,
        defaultSamplingMode: 'all',
        dialogTitle: `Export ${this.selectedEntity.Name}`
      };
      this.showExportDialog = true;
      this.cdr.detectChanges();
    } catch (e) {
      this.showNotification('Error preparing export', 'error', 5000);
      console.error('Export error:', e);
    }
  }

  /**
   * Handle export dialog close
   */
  public onExportDialogClosed(result: ExportDialogResult): void {
    this.showExportDialog = false;
    this.exportDialogConfig = null;
    this.cdr.detectChanges();

    if (result.exported) {
      this.showNotification('Export complete', 'success', 2000);
    }
  }

  /**
   * Get visible columns for export based on current grid/view state
   */
  private getExportColumns(): ExportColumn[] {
    if (!this.selectedEntity) return [];

    // Priority 1: Current grid state (reflects actual displayed columns)
    if (this.currentGridState?.columnSettings && this.currentGridState.columnSettings.length > 0) {
      const visibleColumns = this.currentGridState.columnSettings.filter(col => col.hidden !== true);
      return visibleColumns.map(col => {
        const field = this.selectedEntity?.Fields.find(f => f.Name === col.Name);
        return {
          name: col.Name,
          displayName: col.DisplayName || col.Name,
          dataType: this.mapFieldTypeToExportType(field?.Type)
        };
      });
    }

    // Priority 2: View's column configuration
    if (this.selectedViewEntity?.Columns) {
      const visibleColumns = this.selectedViewEntity.Columns.filter(col => !col.hidden);
      return visibleColumns.map(col => {
        const field = this.selectedEntity?.Fields.find(f => f.Name === col.Name);
        return {
          name: col.Name,
          displayName: col.DisplayName || col.Name,
          dataType: this.mapFieldTypeToExportType(field?.Type)
        };
      });
    }

    // Priority 3: All non-virtual fields
    const visibleFields = this.selectedEntity.Fields.filter(f => !f.IsVirtual);
    return visibleFields.map(f => ({
      name: f.Name,
      displayName: f.DisplayNameOrName,
      dataType: this.mapFieldTypeToExportType(f.Type)
    }));
  }

  /**
   * Map MemberJunction field types to export column types
   */
  private mapFieldTypeToExportType(fieldType?: string): ExportColumn['dataType'] {
    if (!fieldType) return 'string';

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

  /**
   * Get the data for export - loads all records for the current view/entity
   */
  protected async getExportData(): Promise<ExportData> {
    if (!this.selectedEntity) {
      throw new Error('No entity selected for export');
    }

    const md = new Metadata();
    const rv = new RunView();

    // Build the run view params based on current state
    const baseParams = {
      EntityName: this.selectedEntity.Name,
      ExtraFilter: this.buildExtraFilter(),
      OrderBy: this.buildOrderBy(),
      IgnoreMaxRows: true,
      ForceAuditLog: true,
      AuditLogDescription: `Export of Data From ${this.selectedViewEntity ? '"' + this.selectedViewEntity.Name + '"' : this.selectedEntity.Name} View for User ${md.CurrentUser.Email}`
    };

    // Add smart filter if present
    const params = this.debouncedFilterText
      ? { ...baseParams, UserSearchString: this.debouncedFilterText }
      : baseParams;

    const result = await rv.RunView(params);

    if (result && result.Success) {
      // Convert BaseEntity objects to plain objects for export
      return result.Results.map((row: BaseEntity | Record<string, unknown>) => {
        if (row instanceof BaseEntity) {
          return row.GetAll();
        }
        return row as Record<string, unknown>;
      });
    } else {
      throw new Error('Unable to get export data: ' + (result?.ErrorMessage || 'Unknown error'));
    }
  }

  /**
   * Build the ExtraFilter string based on current view and filter state
   */
  private buildExtraFilter(): string {
    const filters: string[] = [];

    // Add view filter if a view is selected
    if (this.selectedViewEntity?.WhereClause) {
      filters.push(`(${this.selectedViewEntity.WhereClause})`);
    }

    // Add smart filter if present
    if (this.debouncedFilterText) {
      // Smart filter is applied via UserSearchString in RunView, not ExtraFilter
      // So we don't need to add it here
    }

    return filters.join(' AND ');
  }

  /**
   * Build the OrderBy string based on current view state
   */
  private buildOrderBy(): string {
    // Use view's OrderByClause if available
    if (this.selectedViewEntity?.OrderByClause) {
      return this.selectedViewEntity.OrderByClause;
    }

    // Use grid state sort if available
    if (this.currentGridState?.sortSettings && this.currentGridState.sortSettings.length > 0) {
      const sorts = this.currentGridState.sortSettings.map(s =>
        `${s.field} ${s.dir.toUpperCase()}`
      );
      return sorts.join(', ');
    }

    // Default sort by primary key
    return this.selectedEntity!.FirstPrimaryKey.Name;
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
  public onOpenRelatedRecord(event: { entityName: string; record: BaseEntity }): void {
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
  private showRecordInDetailPanel(entityName: string, record: BaseEntity): void {
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
    const recordName = this.getRecordDisplayName(record);
    this.stateService.selectRecord(record.PrimaryKey.ToConcatenatedString(), recordName);
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
      const rv = new RunView();
      const result = await rv.RunView<BaseEntity>({
        EntityName: entityName,
        ExtraFilter: `ID='${recordId}'`,
        ResultType: 'entity_object',
        MaxRows: 1
      });

      if (result.Success && result.Results.length > 0) {
        this.showRecordInDetailPanel(entityName, result.Results[0]);
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
    // Apply view mode if specified
    if (deepLink.viewMode) {
      this.stateService.setViewMode(deepLink.viewMode);
    }

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
  private getRecordDisplayName(record: BaseEntity): string {
    if (!this.selectedEntity) return 'Unknown';

    if (this.selectedEntity.NameField) {
      const nameValue = record.Get(this.selectedEntity.NameField.Name);
      if (nameValue) return String(nameValue);
    }

    return record.PrimaryKey.ToString();
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
  // URL DEEP LINKING
  // ========================================

  /**
   * Parse URL query string and return a deep link object.
   * Returns null if no relevant params found.
   *
   * Query params:
   * - entity: Selected entity name
   * - record: Selected record ID (URL segment format via CompositeKey)
   * - filter: Current filter text
   * - view: View mode (grid or cards)
   */
  private parseUrlState(): DataExplorerDeepLink | null {
    const url = this.router.url;
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
      return null;
    }

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const entity = params.get('entity');
    const record = params.get('record');
    const filter = params.get('filter');
    const view = params.get('view') as 'grid' | 'cards' | null;

    // If no params, return null
    if (!entity && !record && !filter && !view) {
      return null;
    }

    return {
      entity: entity || undefined,
      record: record || undefined,
      filter: filter || undefined,
      viewMode: view || undefined
    };
  }

  /**
   * Apply URL state to the component.
   * Used both during init and for popstate handling.
   */
  private applyUrlState(urlState: DataExplorerDeepLink): void {
    // Apply view mode if specified
    if (urlState.viewMode) {
      this.stateService.setViewMode(urlState.viewMode);
    }

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

        // Apply filter if specified (to smart filter state, not user search)
        if (urlState.filter) {
          this.stateService.setSmartFilterPrompt(urlState.filter);
        } else if (entityChanged) {
          // Only clear filter if entity changed (selectEntity already handles this)
          this.stateService.setSmartFilterPrompt('');
        }
        // User search text is always cleared when applying URL state
        this.debouncedFilterText = '';

        // Handle record selection
        if (urlState.record) {
          if (entityChanged) {
            // Entity changed - need to wait for data to load
            this.pendingRecordSelection = urlState.record;
          } else {
            // Entity is the same - find record from already-loaded data
            const record = this.loadedRecords.find(r => {
              const pkString = r.PrimaryKey.ToConcatenatedString();
              const pkValue = r.PrimaryKey.KeyValuePairs[0]?.Value?.toString();
              return pkString === urlState.record || pkValue === urlState.record;
            });

            if (record) {
              this.selectedRecord = record;
              this.detailPanelEntity = this.selectedEntity;
              const recordName = this.getRecordDisplayName(record);
              this.stateService.selectRecord(record.PrimaryKey.ToConcatenatedString(), recordName);
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
      this.stateService.selectEntity(null as unknown as string);
      this.stateService.closeDetailPanel();
    }

    this.cdr.detectChanges();
  }

  /**
   * Update the URL query string to reflect current navigation state.
   * This enables deep linking - users can bookmark or share URLs to specific views.
   * Called immediately on state changes (not debounced).
   * Uses NavigationService for proper URL management that respects app-scoped routes.
   */
  private updateUrl(): void {
    const queryParams: Record<string, string | null> = {};

    // Add entity if selected
    if (this.state.selectedEntityName) {
      queryParams['entity'] = this.state.selectedEntityName;
    } else {
      queryParams['entity'] = null;
    }

    // Add record if selected (only if entity is also selected)
    if (this.state.selectedRecordId && this.state.selectedEntityName) {
      queryParams['record'] = this.state.selectedRecordId;
    } else {
      queryParams['record'] = null;
    }

    // Add filter if present (only if entity is also selected)
    if (this.state.smartFilterPrompt && this.state.selectedEntityName) {
      queryParams['filter'] = this.state.smartFilterPrompt;
    } else {
      queryParams['filter'] = null;
    }

    // Add view mode if not default (grid is default)
    if (this.state.viewMode && this.state.viewMode !== 'grid') {
      queryParams['view'] = this.state.viewMode;
    } else {
      queryParams['view'] = null;
    }

    // Use NavigationService to update query params properly
    this.navigationService.UpdateActiveTabQueryParams(queryParams);
  }

  /**
   * Handle external navigation (back/forward buttons).
   * Parses the URL and applies the state without triggering a new navigation.
   */
  private onExternalNavigation(url: string): void {
    // Check if this URL is for our component (contains our base path)
    const currentPath = this.router.url.split('?')[0];
    const newPath = url.split('?')[0];

    // Only handle if we're still on the same base path (same dashboard instance)
    if (currentPath !== newPath) {
      return; // Different route entirely, shell will handle it
    }

    // Parse the new URL state
    const urlState = this.parseUrlFromString(url);

    // Apply the state without triggering URL updates
    this.skipUrlUpdates = true;
    if (urlState) {
      this.applyUrlState(urlState);
    } else {
      // No params means go to home view
      this.selectedEntity = null;
      this.selectedRecord = null;
      this.detailPanelEntity = null;
      this.stateService.selectEntity(null as unknown as string);
      this.stateService.closeDetailPanel();
    }
    this.skipUrlUpdates = false;

    // Update the tracked URL
    this.lastNavigatedUrl = url;

    this.cdr.detectChanges();
  }

  /**
   * Parse URL state from a URL string (used for external navigation).
   */
  private parseUrlFromString(url: string): DataExplorerDeepLink | null {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
      return null;
    }

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const entity = params.get('entity');
    const record = params.get('record');
    const filterParam = params.get('filter');
    const view = params.get('view') as 'grid' | 'cards' | null;

    // If no params, return null
    if (!entity && !record && !filterParam && !view) {
      return null;
    }

    return {
      entity: entity || undefined,
      record: record || undefined,
      filter: filterParam || undefined,
      viewMode: view || undefined
    };
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
    this.cdr.detectChanges();
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

  /**
   * Handle clicking on a recent record from home screen.
   * Navigates to the entity and sets up pending selection to select the record
   * and open the detail panel once data loads.
   */
  public onRecentRecordClick(record: RecentRecordAccess): void {
    const entity = this.entities.find(e => e.ID === record.entityId);
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
    const entity = this.entities.find(e => e.ID === record.entityId);
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
    const entity = this.metadata.Entities.find(e => e.ID === entityId);
    if (entity) {
      return this.getEntityIcon(entity);
    }
    return 'fa-solid fa-table';
  }

  /**
   * Format relative time for display (e.g., "2 hours ago")
   */
  public formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
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
  get isAtHomeLevel(): boolean {
    return !this.selectedEntity;
  }

  // ========================================
  // SELECTION TRACKING
  // ========================================

  /**
   * Handle selection changes from entity-viewer grid.
   * Tracks selected records to enable the Add to List button in the header toolbar.
   */
  public onSelectionChanged(event: { records: BaseEntity[]; recordIds: string[] }): void {
    this.selectedRecords = event.records || [];
    this.selectedRecordIds = event.recordIds || [];
    this.cdr.detectChanges();
  }

  /**
   * Check if there are selected records (for enabling Add to List button)
   */
  public get hasSelectedRecords(): boolean {
    return this.selectedRecords.length > 0;
  }

  // ========================================
  // LIST MANAGEMENT
  // ========================================

  /**
   * Handle Add to List button click from header toolbar.
   * Opens the list management dialog for selected records.
   */
  public onAddToListClick(): void {
    if (!this.selectedEntity || this.selectedRecords.length === 0) {
      console.warn('Add to List: No entity selected or no records selected');
      return;
    }

    // Build the event object and delegate to existing handler
    const event = {
      entityInfo: this.selectedEntity,
      records: this.selectedRecords,
      recordIds: this.selectedRecordIds
    };

    this.onAddToListRequested(event);
  }

  /**
   * Handle Add to List request from entity-viewer grid toolbar.
   * Opens the list management dialog for multiple selected records.
   */
  public onAddToListRequested(event: { entityInfo: EntityInfo; records: BaseEntity[]; recordIds: string[] }): void {
    // Validate input
    if (!event.entityInfo) {
      console.error('Add to List: entityInfo is missing from event');
      return;
    }
    if (!event.records || event.records.length === 0) {
      console.error('Add to List: No records in event. Event:', event);
      return;
    }

    console.log(`Add to List: Processing ${event.records.length} record(s) for entity "${event.entityInfo.Name}"`);

    // Get display names for the records
    const recordDisplayNames = event.records.map(record => {
      try {
        if (event.entityInfo.NameField) {
          const nameValue = record.Get(event.entityInfo.NameField.Name);
          if (nameValue) return String(nameValue);
        }
        return record.PrimaryKey?.ToString() || 'Unknown';
      } catch (err) {
        console.error('Add to List: Error getting record display name:', err);
        return 'Unknown';
      }
    });

    // Get raw primary key values (not concatenated strings) for list membership
    const recordIds = event.records.map(record => {
      try {
        if (!record.PrimaryKey || !record.PrimaryKey.KeyValuePairs || record.PrimaryKey.KeyValuePairs.length === 0) {
          console.error('Add to List: Record has no primary key:', record);
          return '';
        }
        return String(record.PrimaryKey.KeyValuePairs[0].Value);
      } catch (err) {
        console.error('Add to List: Error getting record ID:', err);
        return '';
      }
    }).filter(id => id !== '');

    if (recordIds.length === 0) {
      console.error('Add to List: No valid record IDs found');
      return;
    }

    const recordCount = event.records.length;
    const dialogTitle = recordCount === 1
      ? `Manage Lists for "${recordDisplayNames[0]}"`
      : `Add ${recordCount} Records to List`;

    console.log(`Add to List: Opening dialog for ${recordIds.length} record(s)`);

    this.listManagementConfig = {
      mode: 'manage',
      entityId: event.entityInfo.ID,
      entityName: event.entityInfo.Name,
      recordIds: recordIds,
      recordDisplayNames: recordDisplayNames,
      allowCreate: true,
      allowRemove: recordCount === 1, // Only allow remove for single record
      showMembership: recordCount === 1, // Only show membership for single record
      dialogTitle: dialogTitle
    };

    this.showListManagementDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Open the list management dialog for the currently selected record
   */
  public openListManagementDialog(): void {
    if (!this.selectedEntity || !this.selectedRecord) {
      return;
    }

    // Use the raw primary key value (not concatenated string) for list membership
    // This matches how records are stored in List Details and enables proper subquery filtering
    const recordId = String(this.selectedRecord.PrimaryKey.KeyValuePairs[0].Value);
    const recordName = this.getRecordDisplayName(this.selectedRecord);

    this.listManagementConfig = {
      mode: 'manage',
      entityId: this.selectedEntity.ID,
      entityName: this.selectedEntity.Name,
      recordIds: [recordId],
      recordDisplayNames: [recordName],
      allowCreate: true,
      allowRemove: true,
      showMembership: true,
      dialogTitle: `Manage Lists for "${recordName}"`
    };

    this.showListManagementDialog = true;
    this.cdr.detectChanges();
  }

  /**
   * Handle completion of the list management dialog
   */
  public onListManagementComplete(result: ListManagementResult): void {
    this.showListManagementDialog = false;
    this.listManagementConfig = null;

    if (result.action === 'apply') {
      const addedCount = result.added.length;
      const removedCount = result.removed.length;

      if (addedCount > 0 || removedCount > 0) {
        let message = '';
        if (addedCount > 0) {
          message += `Added to ${addedCount} list(s)`;
        }
        if (removedCount > 0) {
          if (message) message += ', ';
          message += `Removed from ${removedCount} list(s)`;
        }
        this.showNotification(message, 'success', 2500);
      }
    }

    this.cdr.detectChanges();
  }

  /**
   * Handle cancellation of the list management dialog
   */
  public onListManagementCancel(): void {
    this.showListManagementDialog = false;
    this.listManagementConfig = null;
    this.cdr.detectChanges();
  }
}

/**
 * Tree-shaking prevention
 */
export function LoadDataExplorerDashboard() {
  // Force inclusion in production builds
}

