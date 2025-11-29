import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Metadata, RunView } from '@memberjunction/core';
import { UserSettingEntity } from '@memberjunction/core-entities';
import { DataExplorerState, DEFAULT_EXPLORER_STATE, RecentItem, FavoriteItem, EntityCacheEntry, BreadcrumbItem, DataExplorerFilter } from '../models/explorer-state.interface';

const BASE_SETTING_KEY = 'DataExplorer.State';
const MAX_RECENT_ITEMS = 20;
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
    this.updateState({ selectedViewId: viewId });
  }

  /**
   * Set view mode
   */
  setViewMode(mode: 'cards' | 'grid'): void {
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
   * Load state from UserSetting
   */
  private async loadState(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      const settingKey = this.getSettingKey();
      const rv = new RunView();
      const result = await rv.RunView<UserSettingEntity>({
        EntityName: 'MJ: User Settings',
        ExtraFilter: `UserID='${userId}' AND Setting='${settingKey}'`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results.length > 0) {
        const setting = result.Results[0];
        if (setting.Value) {
          const savedState = JSON.parse(setting.Value) as Partial<DataExplorerState>;
          // Merge with defaults to handle new properties
          this.state$.next({ ...DEFAULT_EXPLORER_STATE, ...savedState });
        }
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
   * Save state to UserSetting
   */
  private async saveState(): Promise<void> {
    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      const settingKey = this.getSettingKey();
      const md = new Metadata();
      const rv = new RunView();

      // Check if setting exists
      const result = await rv.RunView<UserSettingEntity>({
        EntityName: 'MJ: User Settings',
        ExtraFilter: `UserID='${userId}' AND Setting='${settingKey}'`,
        ResultType: 'entity_object'
      });

      let setting: UserSettingEntity;
      if (result.Success && result.Results.length > 0) {
        setting = result.Results[0];
      } else {
        setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings');
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
}
