import { Component, OnInit, OnDestroy, ChangeDetectorRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, EntityInfo, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { ApplicationEntityEntity } from '@memberjunction/core-entities';
import {
  RecordSelectedEvent,
  RecordOpenedEvent,
  DataLoadedEvent,
  FilteredCountChangedEvent,
  EntityViewerConfig,
  EntityViewMode,
  NavigateToRelatedEvent
} from '@memberjunction/ng-entity-viewer';
import { ExplorerStateService } from './services/explorer-state.service';
import { DataExplorerState, DataExplorerFilter, BreadcrumbItem, DataExplorerDeepLink } from './models/explorer-state.interface';
import { OpenRecordEvent } from './components/navigation-panel/navigation-panel.component';

/**
 * Data Explorer Dashboard - Power user interface for exploring data across entities
 * Combines card-based browsing with grid views and relationship visualization
 *
 * Uses mj-entity-viewer composite component for the main content area,
 * which handles data loading, filtering, and view mode switching.
 */
@Component({
  selector: 'mj-data-explorer-dashboard',
  templateUrl: './data-explorer-dashboard.component.html',
  styleUrls: ['./data-explorer-dashboard.component.css']
})
@RegisterClass(BaseDashboard, 'DataExplorer')
export class DataExplorerDashboardComponent extends BaseDashboard implements OnInit, OnDestroy, OnChanges {
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

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

  // Debounced filter text (synced with mj-entity-viewer)
  public debouncedFilterText: string = '';
  private filterInput$ = new Subject<string>();

  // Entity filter text for home screen
  public entityFilterText: string = '';

  // Breadcrumbs for navigation display
  public breadcrumbs: BreadcrumbItem[] = [];

  /**
   * Filtered entities based on entityFilterText (for home screen)
   */
  get filteredEntities(): EntityInfo[] {
    if (!this.entityFilterText || this.entityFilterText.trim() === '') {
      return this.entities;
    }
    const filter = this.entityFilterText.toLowerCase().trim();
    return this.entities.filter(e =>
      e.Name.toLowerCase().includes(filter) ||
      (e.Description && e.Description.toLowerCase().includes(filter))
    );
  }

  /**
   * Configuration for mj-entity-viewer composite component
   * Hides the built-in header since we have a custom header in the dashboard
   */
  public viewerConfig: Partial<EntityViewerConfig> = {
    showFilter: false,        // We have our own filter in the dashboard header
    showViewModeToggle: false, // We have our own toggle in the dashboard header
    showRecordCount: false,   // We show count in the dashboard header
    pageSize: 1000,           // Load more records for better browsing
    height: '100%'
  };

  constructor(
    public stateService: ExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    this.state = this.stateService.CurrentState;
  }

  async ngOnInit(): Promise<void> {
    // Set context for state service (enables context-specific settings)
    await this.stateService.setContext(this.entityFilter);
    this.state = this.stateService.CurrentState;

    // Initialize debounced filter from persisted state
    if (this.state.smartFilterPrompt) {
      this.debouncedFilterText = this.state.smartFilterPrompt;
    }

    // Load available entities (async to support applicationId filter)
    await this.loadEntities();

    // Apply deep link if provided (overrides persisted state)
    if (this.deepLink) {
      await this.applyDeepLink(this.deepLink);
    }

    // Subscribe to state changes
    this.stateService.State
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const entityChanged = state.selectedEntityName !== this.state.selectedEntityName;

        this.state = state;

        // When entity changes, immediately update the debounced filter text
        if (entityChanged && state.smartFilterPrompt !== this.debouncedFilterText) {
          this.debouncedFilterText = state.smartFilterPrompt;
        }

        this.onStateChanged();
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
   */
  private async loadEntities(): Promise<void> {
    console.log('[DataExplorer] loadEntities called, entityFilter:', this.entityFilter);

    // First, load all entities the user can access
    this.allEntities = this.metadata.Entities
      .filter(e => {
        const perms = e.GetUserPermisions(this.metadata.CurrentUser);
        return perms.CanRead && e.IncludeInAPI;
      })
      .sort((a, b) => a.Name.localeCompare(b.Name));

    console.log('[DataExplorer] allEntities count:', this.allEntities.length);

    // If we have an applicationId filter, load the application entities
    if (this.entityFilter?.applicationId) {
      await this.loadApplicationEntityIds(this.entityFilter.applicationId);
      console.log('[DataExplorer] applicationEntityIds count:', this.applicationEntityIds.size);
    }

    // Apply filter to get the final entity list
    this.entities = this.applyEntityFilter(this.allEntities);

    console.log('[DataExplorer] filtered entities count:', this.entities.length);

    // If there's a selected entity in state, restore it
    if (this.state.selectedEntityName) {
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
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
   * Handle entity selection from navigation panel
   */
  public onEntitySelected(entity: EntityInfo): void {
    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);
    // mj-entity-viewer will automatically load data when entity changes
  }

  /**
   * Handle state changes from external sources
   */
  private onStateChanged(): void {
    if (this.state.selectedEntityName !== this.selectedEntity?.Name) {
      this.selectedEntity = this.entities.find(e => e.Name === this.state.selectedEntityName) || null;
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

    // Add to recent items
    if (this.selectedEntity) {
      this.stateService.addRecentItem({
        entityName: this.selectedEntity.Name,
        compositeKeyString: event.record.PrimaryKey.ToConcatenatedString(),
        displayName: recordName
      });
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
      // For now, we'll apply the filter as-is
      // A future enhancement could parse and display it more user-friendly
      this.stateService.setSmartFilterPrompt(event.filter);
      this.debouncedFilterText = event.filter;
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
        this.selectedEntity = entity;
        this.stateService.selectEntity(entity.Name);

        // Apply filter if specified
        if (deepLink.filter) {
          this.stateService.setSmartFilterPrompt(deepLink.filter);
          this.debouncedFilterText = deepLink.filter;
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
}

/**
 * Tree-shaking prevention
 */
export function LoadDataExplorerDashboard() {
  // Force inclusion in production builds
}
