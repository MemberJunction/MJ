import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata, RunView, CompositeKey, EntityRecordNameInput } from '@memberjunction/core';
import { MJUserSettingEntity, MJUserFavoriteEntity, MJApplicationEntityEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { DataExplorerState, DEFAULT_EXPLORER_STATE, RecentItem, FavoriteItem, EntityCacheEntry, BreadcrumbItem, DataExplorerFilter, FavoriteEntity, RecentRecordAccess, FavoriteRecord, DataExplorerViewMode } from '../models/explorer-state.interface';

const BASE_SETTING_KEY = 'DataExplorer.State';
const MAX_RECENT_ITEMS = 20;
const MAX_RECENT_ENTITIES = 10;
const MAX_RECENT_RECORDS = 10;
const MAX_ENTITY_CACHE_SIZE = 50; // LRU cache limit

@Injectable({
  providedIn: 'root'
})
export class ExplorerStateService {
  private state$ = new BehaviorSubject<DataExplorerState>(DEFAULT_EXPLORER_STATE);
  private metadata = new Metadata();
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Current context filter (determines which settings key to use) */
  private currentFilter: DataExplorerFilter | null = null;

  /** Computed breadcrumbs based on current state */
  private breadcrumbs$ = new BehaviorSubject<BreadcrumbItem[]>([]);

  /** Recent records loaded from User Record Logs */
  private recentRecords$ = new BehaviorSubject<RecentRecordAccess[]>([]);

  /** Favorite records loaded from User Favorites (non-entity favorites) */
  private favoriteRecords$ = new BehaviorSubject<FavoriteRecord[]>([]);

  /** Application entities with DefaultForNewUser info (loaded once per context) */
  private applicationEntities: MJApplicationEntityEntity[] = [];

  /** Set of entity IDs that have DefaultForNewUser=true */
  private defaultEntityIds = new Set<string>();

  constructor() {
    // Don't load state in constructor - wait for setContext to be called
  }

  /**
   * Set the context filter and load context-specific state.
   * Call this before using the service to ensure proper context isolation.
   */
  async setContext(filter: DataExplorerFilter | null): Promise<void> {
    this.currentFilter = filter;
    await this.loadState();
    // Load application entities first (needed for filtering recent/favorite records)
    await this.loadApplicationEntities();
    // Then load the rest in parallel
    await Promise.all([
      this.loadFavoriteEntities(),
      this.loadFavoriteRecords(),
      this.loadRecentRecords()
    ]);
    this.updateBreadcrumbs();
  }

  /**
   * Get the storage key based on current context.
   * Uses application ID if available for context-specific storage.
   */
  private getSettingKey(): string {
    if (this.currentFilter?.applicationId) {
      return `${BASE_SETTING_KEY}.${this.currentFilter.applicationId}`;
    }
    return BASE_SETTING_KEY;
  }

  /**
   * Get observable of current state
   */
  get State(): Observable<DataExplorerState> {
    return this.state$.asObservable();
  }

  /**
   * Get current state value
   */
  get CurrentState(): DataExplorerState {
    return this.state$.value;
  }

  /**
   * Observable of current breadcrumbs
   */
  get Breadcrumbs(): Observable<BreadcrumbItem[]> {
    return this.breadcrumbs$.asObservable();
  }

  /**
   * Get current breadcrumbs value
   */
  get CurrentBreadcrumbs(): BreadcrumbItem[] {
    return this.breadcrumbs$.value;
  }

  /**
   * Get the current context filter
   */
  get CurrentFilter(): DataExplorerFilter | null {
    return this.currentFilter;
  }

  /**
   * Observable of recent records (from User Record Logs)
   */
  get RecentRecords(): Observable<RecentRecordAccess[]> {
    return this.recentRecords$.asObservable();
  }

  /**
   * Get current recent records value
   */
  get CurrentRecentRecords(): RecentRecordAccess[] {
    return this.recentRecords$.value;
  }

  /**
   * Observable of favorite records (from User Favorites, non-entity)
   */
  get FavoriteRecords(): Observable<FavoriteRecord[]> {
    return this.favoriteRecords$.asObservable();
  }

  /**
   * Get current favorite records value
   */
  get CurrentFavoriteRecords(): FavoriteRecord[] {
    return this.favoriteRecords$.value;
  }

  /**
   * Get the set of entity IDs with DefaultForNewUser=true
   */
  get DefaultEntityIds(): Set<string> {
    return this.defaultEntityIds;
  }

  /**
   * Update state partially
   */
  updateState(partial: Partial<DataExplorerState>): void {
    const newState = { ...this.state$.value, ...partial };
    this.state$.next(newState);
    this.updateBreadcrumbs();
    this.debouncedSave();
  }

  /**
   * Set selected entity
   * Caches current entity's filter before switching, restores new entity's cached filter
   */
  selectEntity(entityName: string | null): void {
    const currentState = this.state$.value;
    const entityCache = { ...currentState.entityCache };

    // Cache current entity's filter before switching (if we have a current entity)
    if (currentState.selectedEntityName && currentState.smartFilterPrompt) {
      entityCache[currentState.selectedEntityName] = {
        filterText: currentState.smartFilterPrompt,
        lastAccessed: Date.now()
      };
    }

    // Restore filter for new entity (if cached) or clear it
    let restoredFilter = '';
    if (entityName && entityCache[entityName]) {
      restoredFilter = entityCache[entityName].filterText;
      entityCache[entityName].lastAccessed = Date.now();
    }

    // Evict old entries if cache is too large (LRU)
    this.evictOldCacheEntries(entityCache);

    this.updateState({
      selectedEntityName: entityName,
      selectedViewId: null, // Reset view when entity changes
      smartFilterPrompt: restoredFilter, // Restore cached filter or empty
      selectedRecordId: null,
      detailPanelOpen: false,
      entityCache
    });
  }

  /**
   * Evict oldest cache entries if over limit (LRU eviction)
   */
  private evictOldCacheEntries(cache: Record<string, EntityCacheEntry>): void {
    const entries = Object.entries(cache);
    if (entries.length <= MAX_ENTITY_CACHE_SIZE) return;

    // Sort by lastAccessed (oldest first) and remove excess
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const toRemove = entries.length - MAX_ENTITY_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      delete cache[entries[i][0]];
    }
  }

  /**
   * Set selected view
   */
  selectView(viewId: string | null): void {
    this.updateState({
      selectedViewId: viewId,
      viewModified: false // Reset modified state when selecting a different view
    });
  }

  /**
   * Mark the current view as modified (has unsaved changes)
   */
  setViewModified(modified: boolean): void {
    this.updateState({ viewModified: modified });
  }

  /**
   * Toggle the view configuration panel
   */
  toggleViewConfigPanel(): void {
    this.updateState({ viewConfigPanelOpen: !this.state$.value.viewConfigPanelOpen });
  }

  /**
   * Open the view configuration panel
   */
  openViewConfigPanel(): void {
    this.updateState({ viewConfigPanelOpen: true });
  }

  /**
   * Close the view configuration panel
   */
  closeViewConfigPanel(): void {
    this.updateState({ viewConfigPanelOpen: false });
  }

  /**
   * Set view mode
   */
  setViewMode(mode: DataExplorerViewMode): void {
    this.updateState({ viewMode: mode });
  }

  /**
   * Set smart filter prompt
   * Also updates the entity cache for the current entity
   */
  setSmartFilterPrompt(prompt: string): void {
    const currentState = this.state$.value;
    const entityCache = { ...currentState.entityCache };

    // Update cache for current entity
    if (currentState.selectedEntityName) {
      if (prompt) {
        entityCache[currentState.selectedEntityName] = {
          filterText: prompt,
          lastAccessed: Date.now()
        };
      } else {
        // Clear cache entry if filter is empty
        delete entityCache[currentState.selectedEntityName];
      }
    }

    this.updateState({ smartFilterPrompt: prompt, entityCache });
  }

  /**
   * Select a record and open detail panel
   * @param recordId The composite key string for the record
   * @param recordName Optional display name for the record (for breadcrumbs)
   */
  selectRecord(recordId: string | null, recordName?: string): void {
    this.updateState({
      selectedRecordId: recordId,
      selectedRecordName: recordName || null,
      detailPanelOpen: recordId !== null
    });
  }

  /**
   * Close detail panel
   */
  closeDetailPanel(): void {
    this.updateState({
      detailPanelOpen: false,
      selectedRecordId: null,
      selectedRecordName: null
    });
  }

  /**
   * Toggle navigation panel collapsed state
   */
  toggleNavigationPanel(): void {
    this.updateState({
      navigationPanelCollapsed: !this.state$.value.navigationPanelCollapsed
    });
  }

  /**
   * Expand navigation panel and ensure a specific section is expanded
   */
  expandAndFocusSection(section: 'favorites' | 'recent' | 'entities'): void {
    const updates: Partial<DataExplorerState> = {
      navigationPanelCollapsed: false
    };

    // Ensure the target section is expanded
    switch (section) {
      case 'favorites':
        updates.favoritesSectionExpanded = true;
        break;
      case 'recent':
        updates.recentSectionExpanded = true;
        break;
      case 'entities':
        updates.entitiesSectionExpanded = true;
        break;
    }

    this.updateState(updates);
  }

  /**
   * Add item to recent history
   */
  addRecentItem(item: Omit<RecentItem, 'timestamp'>): void {
    const recentItems = [...this.state$.value.recentItems];

    // Remove existing entry if present (match by entity and composite key)
    const existingIndex = recentItems.findIndex(
      r => r.entityName === item.entityName && r.compositeKeyString === item.compositeKeyString
    );
    if (existingIndex >= 0) {
      recentItems.splice(existingIndex, 1);
    }

    // Add to front with timestamp
    recentItems.unshift({
      ...item,
      timestamp: new Date()
    });

    // Trim to max size
    if (recentItems.length > MAX_RECENT_ITEMS) {
      recentItems.length = MAX_RECENT_ITEMS;
    }

    this.updateState({ recentItems });
  }

  /**
   * Add item to favorites
   */
  addFavorite(item: FavoriteItem): void {
    const favorites = [...this.state$.value.favorites];

    // Check if already exists
    const exists = favorites.some(f =>
      f.type === item.type &&
      f.entityName === item.entityName &&
      f.compositeKeyString === item.compositeKeyString &&
      f.viewId === item.viewId
    );

    if (!exists) {
      favorites.push(item);
      this.updateState({ favorites });
    }
  }

  /**
   * Remove item from favorites
   */
  removeFavorite(item: FavoriteItem): void {
    const favorites = this.state$.value.favorites.filter(f =>
      !(f.type === item.type &&
        f.entityName === item.entityName &&
        f.compositeKeyString === item.compositeKeyString &&
        f.viewId === item.viewId)
    );
    this.updateState({ favorites });
  }

  /**
   * Toggle section expanded state
   */
  toggleSection(section: 'favorites' | 'recent' | 'entities' | 'views'): void {
    const key = `${section}SectionExpanded` as keyof DataExplorerState;
    this.updateState({ [key]: !this.state$.value[key] } as Partial<DataExplorerState>);
  }

  /**
   * Load state from UserSetting using UserInfoEngine for cached access
   */
  private async loadState(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      const settingKey = this.getSettingKey();
      const engine = UserInfoEngine.Instance;

      // Find the setting from cached user settings
      const setting = engine.UserSettings.find(s => s.Setting === settingKey);

      if (setting?.Value) {
        const savedState = JSON.parse(setting.Value) as Partial<DataExplorerState>;
        // Merge with defaults to handle new properties
        this.state$.next({ ...DEFAULT_EXPLORER_STATE, ...savedState });
      } else {
        // No saved state, use defaults
        this.state$.next({ ...DEFAULT_EXPLORER_STATE });
      }
    } catch (error) {
      console.warn('Failed to load Data Explorer state:', error);
      this.state$.next({ ...DEFAULT_EXPLORER_STATE });
    }
  }

  /**
   * Update breadcrumbs based on current state and filter
   */
  private updateBreadcrumbs(): void {
    const breadcrumbs: BreadcrumbItem[] = [];
    const state = this.state$.value;

    // Always add a root/home breadcrumb - use application name if available, otherwise "All"
    const rootLabel = this.currentFilter?.applicationName || 'All';
    breadcrumbs.push({
      label: rootLabel,
      type: 'application',
      icon: 'fa-solid fa-th-large'
    });

    // Add entity breadcrumb if selected
    if (state.selectedEntityName) {
      const entityInfo = this.metadata.Entities.find(e => e.Name === state.selectedEntityName);
      breadcrumbs.push({
        label: state.selectedEntityName,
        type: 'entity',
        entityName: state.selectedEntityName,
        icon: entityInfo?.Icon ? this.formatEntityIcon(entityInfo.Icon) : 'fa-solid fa-table'
      });
    }

    // Add record breadcrumb if selected
    if (state.selectedRecordId && state.selectedRecordName) {
      breadcrumbs.push({
        label: state.selectedRecordName,
        type: 'record',
        entityName: state.selectedEntityName || undefined,
        compositeKeyString: state.selectedRecordId,
        icon: 'fa-solid fa-file-alt'
      });
    }

    this.breadcrumbs$.next(breadcrumbs);
  }

  /**
   * Format entity icon to ensure proper Font Awesome class format
   */
  private formatEntityIcon(icon: string): string {
    if (!icon) return 'fa-solid fa-table';
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

  /**
   * Debounced save to avoid too many writes
   */
  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveState();
    }, 1000);
  }

  /**
   * Save state to UserSetting using UserInfoEngine for cached lookup
   */
  private async saveState(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      const settingKey = this.getSettingKey();
      const md = new Metadata();
      const engine = UserInfoEngine.Instance;

      // Find existing setting from cached user settings
      let setting = engine.UserSettings.find(s => s.Setting === settingKey);

      if (!setting) {
        // Create new setting if not found
        setting = await md.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
        setting.UserID = userId;
        setting.Setting = settingKey;
      }

      setting.Value = JSON.stringify(this.state$.value);
      await setting.Save();
    } catch (error) {
      console.warn('Failed to save Data Explorer state:', error);
    }
  }

  /**
   * Navigate to a specific breadcrumb level.
   * Clears any selection deeper than the clicked breadcrumb.
   */
  navigateToBreadcrumb(breadcrumb: BreadcrumbItem): void {
    switch (breadcrumb.type) {
      case 'application':
        // Clear entity and record selection (show home view)
        this.updateState({
          selectedEntityName: null,
          selectedViewId: null,
          selectedRecordId: null,
          selectedRecordName: null,
          smartFilterPrompt: '',
          detailPanelOpen: false
        });
        break;

      case 'entity':
        // Keep entity selected, clear record selection
        if (breadcrumb.entityName) {
          this.updateState({
            selectedRecordId: null,
            selectedRecordName: null,
            detailPanelOpen: false
          });
        }
        break;

      case 'record':
        // Already at record level, do nothing
        break;
    }
  }

  // ========================================
  // HOME SCREEN ENTITY MANAGEMENT
  // ========================================

  /**
   * Toggle between showing all entities or just common (DefaultForNewUser) entities
   */
  toggleShowAllEntities(): void {
    this.updateState({ showAllEntities: !this.state$.value.showAllEntities });
  }

  // ========================================
  // Concept D: Application Groups + Quick Access
  // ========================================

  /**
   * Toggle the quick access (right) panel open/closed
   */
  toggleQuickAccessPanel(): void {
    this.updateState({ quickAccessPanelOpen: !this.state$.value.quickAccessPanelOpen });
  }

  /**
   * Toggle a quick access section's expanded state
   */
  toggleQuickAccessSection(sectionId: string): void {
    const sections = { ...this.state$.value.quickAccessSections };
    sections[sectionId] = sections[sectionId] === false; // default to expanded (true)
    this.updateState({ quickAccessSections: sections });
  }

  /**
   * Toggle an application group's expanded/collapsed state
   */
  toggleAppGroupExpanded(appId: string): void {
    const expanded = [...this.state$.value.expandedAppGroups];
    const index = expanded.indexOf(appId);
    if (index >= 0) {
      expanded.splice(index, 1);
    } else {
      expanded.push(appId);
    }
    this.updateState({ expandedAppGroups: expanded });
  }

  /**
   * Set the home view mode (all vs favorites)
   */
  setHomeViewMode(mode: 'all' | 'favorites'): void {
    this.updateState({ homeViewMode: mode });
  }

  /**
   * Track entity access - called when user navigates to an entity
   */
  trackEntityAccess(entityName: string, entityId: string): void {
    const recentEntityAccesses = [...this.state$.value.recentEntityAccesses];

    // Find existing entry
    const existingIndex = recentEntityAccesses.findIndex(r => r.entityId === entityId);

    if (existingIndex >= 0) {
      // Update existing entry
      recentEntityAccesses[existingIndex] = {
        ...recentEntityAccesses[existingIndex],
        lastAccessed: new Date(),
        accessCount: recentEntityAccesses[existingIndex].accessCount + 1
      };
      // Move to front
      const [item] = recentEntityAccesses.splice(existingIndex, 1);
      recentEntityAccesses.unshift(item);
    } else {
      // Add new entry at front
      recentEntityAccesses.unshift({
        entityName,
        entityId,
        lastAccessed: new Date(),
        accessCount: 1
      });
    }

    // Trim to max size
    if (recentEntityAccesses.length > MAX_RECENT_ENTITIES) {
      recentEntityAccesses.length = MAX_RECENT_ENTITIES;
    }

    this.updateState({ recentEntityAccesses });
  }

  /**
   * Add entity to favorites using User Favorites entity
   */
  async addEntityToFavorites(entityName: string, entityId: string): Promise<boolean> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return false;

      // Check if already favorited
      const favorites = this.state$.value.favoriteEntities;
      if (favorites.some(f => f.entityId === entityId)) {
        return true; // Already favorited
      }

      // Get the Entities entity ID for favoriting
      const entitiesEntity = this.metadata.Entities.find(e => e.Name === 'MJ: Entities');
      if (!entitiesEntity) return false;

      // Create User Favorite record
      const md = new Metadata();
      const favorite = await md.GetEntityObject<MJUserFavoriteEntity>('MJ: User Favorites');
      favorite.UserID = userId;
      favorite.EntityID = entitiesEntity.ID;
      favorite.RecordID = entityId;

      const saved = await favorite.Save();
      if (saved) {
        // Update local state
        const favoriteEntities = [...favorites, {
          userFavoriteId: favorite.ID,
          entityName,
          entityId
        }];
        this.updateState({ favoriteEntities });
      }
      return saved;
    } catch (error) {
      console.warn('Failed to add entity to favorites:', error);
      return false;
    }
  }

  /**
   * Remove entity from favorites
   */
  async removeEntityFromFavorites(entityId: string): Promise<boolean> {
    try {
      const favorites = this.state$.value.favoriteEntities;
      const favorite = favorites.find(f => f.entityId === entityId);
      if (!favorite) return true; // Already not favorited

      // Delete User Favorite record
      const md = new Metadata();
      const favoriteEntity = await md.GetEntityObject<MJUserFavoriteEntity>('MJ: User Favorites');
      await favoriteEntity.Load(favorite.userFavoriteId);
      const deleted = await favoriteEntity.Delete();

      if (deleted) {
        // Update local state
        const favoriteEntities = favorites.filter(f => f.entityId !== entityId);
        this.updateState({ favoriteEntities });
      }
      return deleted;
    } catch (error) {
      console.warn('Failed to remove entity from favorites:', error);
      return false;
    }
  }

  /**
   * Check if an entity is favorited
   */
  isEntityFavorited(entityId: string): boolean {
    return this.state$.value.favoriteEntities.some(f => f.entityId === entityId);
  }

  /**
   * Load application entities with DefaultForNewUser information
   */
  private async loadApplicationEntities(): Promise<void> {
    try {
      if (!this.currentFilter?.applicationId) {
        this.applicationEntities = [];
        this.defaultEntityIds.clear();
        return;
      }

      const rv = new RunView();
      const result = await rv.RunView<MJApplicationEntityEntity>({
        EntityName: 'MJ: Application Entities',
        ExtraFilter: `ApplicationID = '${this.currentFilter.applicationId}'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.applicationEntities = result.Results;
        this.defaultEntityIds.clear();
        for (const appEntity of result.Results) {
          if (appEntity.DefaultForNewUser) {
            this.defaultEntityIds.add(appEntity.EntityID);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load application entities:', error);
    }
  }

  /**
   * Load favorite entities from User Favorites using UserInfoEngine
   */
  private async loadFavoriteEntities(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      // Get the Entities entity to filter favorites
      const entitiesEntity = this.metadata.Entities.find(e => e.Name === 'MJ: Entities');
      if (!entitiesEntity) return;

      // Use UserInfoEngine for cached access to user favorites
      const engine = UserInfoEngine.Instance;

      // Filter to only entity favorites (where EntityID is the Entities entity)
      const entityFavorites = engine.UserFavorites.filter(f => f.EntityID === entitiesEntity.ID);

      const favoriteEntities: FavoriteEntity[] = [];
      for (const fav of entityFavorites) {
        // Look up entity name from RecordID (which is the Entity.ID)
        const entity = this.metadata.Entities.find(e => e.ID === fav.RecordID);
        if (entity) {
          favoriteEntities.push({
            userFavoriteId: fav.ID,
            entityName: entity.Name,
            entityId: fav.RecordID
          });
        }
      }
      this.updateState({ favoriteEntities });
    } catch (error) {
      console.warn('Failed to load favorite entities:', error);
    }
  }

  /**
   * Load recent records from User Record Logs with batch record name lookup using UserInfoEngine
   */
  private async loadRecentRecords(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      // Use UserInfoEngine for cached access to user record logs
      const engine = UserInfoEngine.Instance;

      // Get recent records, limited to MAX_RECENT_RECORDS
      const userRecordLogs = engine.UserRecordLogs.slice(0, MAX_RECENT_RECORDS);

      const recentRecords: RecentRecordAccess[] = [];
      const recordNameInputs: EntityRecordNameInput[] = [];
      const recordIndexMap: Map<string, number> = new Map(); // Map composite key to array index

      for (const log of userRecordLogs) {
        // Look up entity name from EntityID
        const entity = this.metadata.Entities.find(e => e.ID === log.EntityID);
        if (entity) {
          // Filter by application context if applicable
          if (this.currentFilter?.applicationId && !this.applicationEntities.some(ae => ae.EntityID === log.EntityID)) {
            continue; // Skip records from entities not in this application
          }

          const recordAccess: RecentRecordAccess = {
            entityName: entity.Name,
            entityId: log.EntityID,
            recordId: log.RecordID,
            latestAt: log.LatestAt,
            totalCount: log.TotalCount
          };
          const index = recentRecords.length;
          recentRecords.push(recordAccess);

          // Build composite key for batch name lookup
          const compositeKey = this.buildCompositeKeyForRecord(entity.Name, log.RecordID);
          if (compositeKey) {
            recordNameInputs.push({ EntityName: entity.Name, CompositeKey: compositeKey });
            // Use the canonical concatenated string as the map key for consistent matching
            recordIndexMap.set(`${entity.Name}||${compositeKey.ToConcatenatedString()}`, index);
          }
        }
      }

      // Batch fetch record names
      if (recordNameInputs.length > 0) {
        try {
          const nameResults = await this.metadata.GetEntityRecordNames(recordNameInputs);
          for (const nameResult of nameResults) {
            if (nameResult.Success && nameResult.RecordName) {
              const key = `${nameResult.EntityName}||${nameResult.CompositeKey.ToConcatenatedString()}`;
              const index = recordIndexMap.get(key);
              if (index !== undefined) {
                recentRecords[index].recordName = nameResult.RecordName;
              }
            }
          }
        } catch (nameError) {
          console.warn('Failed to load record names:', nameError);
          // Continue without names - they'll show record IDs
        }
      }

      this.recentRecords$.next(recentRecords);
    } catch (error) {
      console.warn('Failed to load recent records:', error);
    }
  }

  /**
   * Build a CompositeKey for a record. RecordID may be stored as either:
   * - Concatenated format: "FieldName|Value" or "Field1|Val1||Field2|Val2"
   * - Plain value: just the raw value (e.g. a GUID)
   * Detects the format and constructs the key accordingly.
   */
  private buildCompositeKeyForRecord(entityName: string, recordId: string): CompositeKey | null {
    if (!recordId) return null;

    // If recordId contains '|', it's in concatenated format
    if (recordId.includes('|')) {
      try {
        const compositeKey = new CompositeKey();
        compositeKey.LoadFromConcatenatedString(recordId);
        if (compositeKey.KeyValuePairs.length > 0) return compositeKey;
      } catch {
        // Fall through to entity-based lookup
      }
    }

    // Plain value — look up entity primary key field(s) to construct the key
    const entityInfo = this.metadata.Entities.find(e => e.Name === entityName);
    if (!entityInfo) return null;

    const pkField = entityInfo.FirstPrimaryKey;
    if (!pkField) return null;

    const compositeKey = new CompositeKey();
    compositeKey.KeyValuePairs = [{ FieldName: pkField.Name, Value: recordId }];
    return compositeKey;
  }

  /**
   * Refresh recent records (call after navigating to a record)
   */
  async refreshRecentRecords(): Promise<void> {
    await this.loadRecentRecords();
  }

  /**
   * Add or update a recent record locally (without DB refresh).
   * Call this when a record is selected to provide instant UI feedback.
   * The DB write happens separately via RecentAccessService.logAccess().
   *
   * @param entityName The entity name
   * @param entityId The entity ID
   * @param recordId The record ID (primary key value)
   * @param recordName Optional display name for the record
   */
  addLocalRecentRecord(entityName: string, entityId: string, recordId: string, recordName?: string): void {
    // Filter by application context if applicable
    if (this.currentFilter?.applicationId && !this.applicationEntities.some(ae => ae.EntityID === entityId)) {
      return; // Don't add records from entities not in this application
    }

    const currentRecords = [...this.recentRecords$.value];

    // Find existing entry
    const existingIndex = currentRecords.findIndex(
      r => r.entityId === entityId && r.recordId === recordId
    );

    const newRecord: RecentRecordAccess = {
      entityName,
      entityId,
      recordId,
      recordName,
      latestAt: new Date(),
      totalCount: existingIndex >= 0 ? currentRecords[existingIndex].totalCount + 1 : 1
    };

    if (existingIndex >= 0) {
      // Remove existing entry (will be re-added at front)
      currentRecords.splice(existingIndex, 1);
    }

    // Add to front
    currentRecords.unshift(newRecord);

    // Trim to max size
    if (currentRecords.length > MAX_RECENT_RECORDS) {
      currentRecords.length = MAX_RECENT_RECORDS;
    }

    this.recentRecords$.next(currentRecords);
  }

  /**
   * Load favorite records from User Favorites (non-entity favorites) with batch record name lookup using UserInfoEngine.
   * Filters to only include records from entities in the current application context.
   */
  private async loadFavoriteRecords(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      // Get the Entities entity to exclude entity favorites
      const entitiesEntity = this.metadata.Entities.find(e => e.Name === 'MJ: Entities');
      const entitiesEntityId = entitiesEntity?.ID || '';

      // Use UserInfoEngine for cached access to user favorites
      const engine = UserInfoEngine.Instance;

      // Filter to non-entity favorites (exclude favorites where EntityID is the Entities entity)
      const nonEntityFavorites = engine.UserFavorites.filter(f => f.EntityID !== entitiesEntityId);

      const favoriteRecords: FavoriteRecord[] = [];
      const recordNameInputs: EntityRecordNameInput[] = [];
      const recordIndexMap: Map<string, number> = new Map();

      for (const fav of nonEntityFavorites) {
        // Look up entity info from the EntityID
        const entity = this.metadata.Entities.find(e => e.ID === fav.EntityID);
        if (entity) {
          // Filter by application context if applicable
          if (this.currentFilter?.applicationId && !this.applicationEntities.some(ae => ae.EntityID === fav.EntityID)) {
            continue; // Skip records from entities not in this application
          }

          const favoriteRecord: FavoriteRecord = {
            userFavoriteId: fav.ID,
            entityName: entity.Name,
            entityId: fav.EntityID,
            recordId: fav.RecordID
          };
          const index = favoriteRecords.length;
          favoriteRecords.push(favoriteRecord);

          // Build composite key for batch name lookup
          const compositeKey = this.buildCompositeKeyForRecord(entity.Name, fav.RecordID);
          if (compositeKey) {
            recordNameInputs.push({ EntityName: entity.Name, CompositeKey: compositeKey });
            // Use the canonical concatenated string as the map key for consistent matching
            recordIndexMap.set(`${entity.Name}||${compositeKey.ToConcatenatedString()}`, index);
          }
        }
      }

      // Batch fetch record names
      if (recordNameInputs.length > 0) {
        try {
          const nameResults = await this.metadata.GetEntityRecordNames(recordNameInputs);
          for (const nameResult of nameResults) {
            if (nameResult.Success && nameResult.RecordName) {
              const key = `${nameResult.EntityName}||${nameResult.CompositeKey.ToConcatenatedString()}`;
              const index = recordIndexMap.get(key);
              if (index !== undefined) {
                favoriteRecords[index].recordName = nameResult.RecordName;
              }
            }
          }
        } catch (nameError) {
          console.warn('Failed to load record names for favorites:', nameError);
          // Continue without names - they'll show record IDs
        }
      }

      this.favoriteRecords$.next(favoriteRecords);
      this.updateState({ favoriteRecords });
    } catch (error) {
      console.warn('Failed to load favorite records:', error);
    }
  }
}
