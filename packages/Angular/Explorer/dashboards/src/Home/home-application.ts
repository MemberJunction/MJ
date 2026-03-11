import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseApplication, DynamicNavItem, NavItem, WorkspaceStateManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, CompositeKey, FieldValueCollection } from '@memberjunction/core';

/** Storage key and category for persisting the recent orphan stack */
const STORAGE_KEY = 'HomeApp_RecentOrphanStack';
const STORAGE_CATEGORY = 'HomeApplication';

/**
 * Snapshot of an orphan resource tab for the recent navigation stack.
 * Persisted to localStorage (via Provider) so it survives page reloads.
 */
interface OrphanResourceSnapshot {
  /** URL-encoded composite key segment — primary dedup key */
  resourceRecordId: string;
  /** Resource type name (e.g., 'record', 'Dashboards') */
  resourceType: string;
  /** Entity name from tab configuration (for record name resolution) */
  entityName?: string;
  /** Tab title at time of capture (fallback label) */
  title: string;
  /** Resolved display label (cached record name). Persisted to avoid async lookups on reload. */
  resolvedLabel: string;
  /** Full tab configuration (passed to DynamicNavItem for re-opening) */
  configuration: Record<string, unknown>;
  /** Tab ID for fallback matching when no resourceRecordId */
  tabId: string;
  /** Timestamp (ms since epoch) when this snapshot was created or last promoted */
  timestamp: number;
}

/** Max age for persisted snapshots — 7 days */
const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Home Application - Provides dynamic navigation items for orphan resources.
 *
 * Maintains a recency-ordered stack of up to 3 recently visited orphan resources.
 * When the user opens a record/view/dashboard from within the Home app, the resource
 * appears as a dynamic nav item. When they navigate away (e.g., click Home), the
 * nav item persists so they can quickly jump back. Older items drop off as new ones
 * are added.
 *
 * The stack is persisted to localStorage (via Metadata.Provider.LocalStorageProvider)
 * so it survives page reloads. Resolved record labels are stored alongside each
 * snapshot to avoid async lookups when restoring from storage.
 *
 * @example
 * User opens "John Smith" contact, then "Acme Corp" company:
 * - Nav shows: [Home] [Favorites] | [person] "Acme Corp" [building] "John Smith"
 * - Clicking "John Smith" re-opens that record
 */
@RegisterClass(BaseApplication, 'HomeApplication')
export class HomeApplication extends BaseApplication {
  private static readonly MAX_RECENT_ITEMS = 3;

  private workspaceManager: WorkspaceStateManager | null = null;
  private sharedService: SharedService | null = null;
  private recentOrphanStack: OrphanResourceSnapshot[] = [];
  private _storageLoadPromise: Promise<void> | null = null;

  /**
   * Fingerprint of the last-processed active tab state (tabId::resourceRecordId).
   * Guards against redundant stack mutations while still detecting content changes.
   * In single-resource mode the tab ID stays constant when navigating between records
   * (OpenTab replaces the temp tab's content but keeps its ID), so we must also
   * include the resourceRecordId to detect when the tab shows a different record.
   */
  private _lastSeenTabFingerprint: string | null = null;

  /**
   * Inject WorkspaceStateManager for accessing current tab state.
   * Also triggers loading the persisted stack from storage on first call.
   */
  public SetWorkspaceManager(manager: WorkspaceStateManager): void {
    this.workspaceManager = manager;
    if (!this._storageLoadPromise) {
      this._storageLoadPromise = this.loadStackFromStorage();
    }
  }

  /**
   * Inject SharedService for accessing ResourceTypes metadata
   */
  public SetSharedService(service: SharedService): void {
    this.sharedService = service;
  }

  /**
   * Returns navigation items including dynamic items for recently visited orphan resources.
   * Static items come from DefaultNavItems in metadata.
   * Dynamic items are generated from the recent orphan stack (up to 3).
   */
  override async GetNavItems(): Promise<NavItem[]> {
    // Ensure persisted stack is loaded before building nav items.
    // On first call after page load, this awaits the IndexedDB read;
    // on subsequent calls the promise is already resolved (no-op await).
    if (this._storageLoadPromise) {
      await this._storageLoadPromise;
    }

    const staticItems = await super.GetNavItems();

    // Update the recent stack based on current active tab
    // Must await — updateRecentStack is async (calls matchesStaticNavItem → super.GetNavItems())
    // and buildDynamicNavItems reads recentOrphanStack, so the stack must be fully updated first.
    await this.updateRecentStack();

    // Build dynamic nav items from the stack
    const dynamicItems = this.buildDynamicNavItems();
    if (dynamicItems.length > 0) {
      return [...staticItems, ...dynamicItems];
    }

    return staticItems;
  }

  /**
   * Removes a dynamic nav item from the recent stack by RecordID.
   * Called by AppNavComponent when the user clicks the dismiss X button.
   * If the dismissed item is currently active, navigates back to the app's default tab.
   */
  public RemoveDynamicNavItem(item: NavItem): void {
    const index = this.recentOrphanStack.findIndex(
      s => s.resourceRecordId === item.RecordID
    );
    if (index < 0) {
      return;
    }

    const wasActive = this.isDismissedItemActive(item);
    this.recentOrphanStack.splice(index, 1);
    this.saveStackToStorage();

    if (wasActive) {
      this.navigateToDefault();
    }
  }

  /**
   * Checks whether the dismissed nav item matches the currently active tab.
   */
  private isDismissedItemActive(item: NavItem): boolean {
    if (!this.workspaceManager) {
      return false;
    }
    const config = this.workspaceManager.GetConfiguration();
    if (!config?.activeTabId) {
      return false;
    }
    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (!activeTab) {
      return false;
    }
    return activeTab.resourceRecordId === item.RecordID;
  }

  /**
   * Navigates back to the app's default tab (first static nav item / Home dashboard).
   */
  private navigateToDefault(): void {
    if (!this.workspaceManager) {
      return;
    }
    this.CreateDefaultTab().then(tabRequest => {
      if (tabRequest && this.workspaceManager) {
        this.workspaceManager.OpenTab(tabRequest, this.GetColor());
      }
    });
  }

  // ========================================
  // Icon Resolution
  // ========================================

  /**
   * Resolves the best icon for a dynamic nav item.
   * Priority: entity-specific icon from metadata → resource type icon → generic fallback.
   */
  private resolveIcon(entityName: string | undefined, resourceTypeName: string): string {
    if (entityName) {
      const md = new Metadata();
      const entityIcon = md.EntityByName(entityName)?.Icon;
      if (entityIcon) {
        return entityIcon;
      }
    }

    if (this.sharedService) {
      const resourceType = this.sharedService.ResourceTypeByName(resourceTypeName);
      if (resourceType?.Icon) {
        return resourceType.Icon;
      }
    }

    return 'fa-solid fa-file';
  }

  // ========================================
  // Recent Stack Management
  // ========================================

  /**
   * Updates the recent orphan stack based on the currently active tab.
   * If the active tab is a new orphan resource (not already in the stack and not
   * matching any static nav item), it gets added to the front. Items already in the
   * stack keep their position to avoid visually jarring reordering when users click
   * between existing dynamic nav items.
   */
  private async updateRecentStack(): Promise<void> {
    if (!this.workspaceManager) {
      return;
    }

    const config = this.workspaceManager.GetConfiguration();
    if (!config?.activeTabId) {
      return;
    }

    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (!activeTab || !UUIDsEqual(activeTab.applicationId, this.ID)) {
      return;
    }

    // Build a fingerprint from tab ID + record content. In single-resource mode,
    // OpenTab replaces the temp tab's content but keeps the same tab ID, so we
    // need the resourceRecordId to detect when a different record is shown.
    const fingerprint = `${activeTab.id}::${activeTab.resourceRecordId ?? ''}`;
    if (fingerprint === this._lastSeenTabFingerprint) {
      return;
    }
    this._lastSeenTabFingerprint = fingerprint;

    // Check if active tab qualifies as an orphan resource
    const snapshot = await this.createSnapshotIfOrphan(activeTab);
    if (!snapshot) {
      // Active tab is a static resource (Home dashboard, etc.) — leave stack as-is
      return;
    }

    // If this item is already in the stack, leave the order unchanged.
    // Reordering on every click is visually jarring — items shift around
    // while the user is clicking between existing nav items.
    const alreadyTracked = this.recentOrphanStack.some(
      s => s.resourceRecordId === snapshot.resourceRecordId
    );
    if (alreadyTracked) {
      return;
    }

    // New orphan — push to front (most recent first) and trim oldest if needed
    this.recentOrphanStack.unshift(snapshot);
    if (this.recentOrphanStack.length > HomeApplication.MAX_RECENT_ITEMS) {
      this.recentOrphanStack.length = HomeApplication.MAX_RECENT_ITEMS;
    }

    this.saveStackToStorage();
  }

  /**
   * Creates an OrphanResourceSnapshot from a tab if it qualifies as an orphan resource.
   * Returns null if the tab is a static nav item, has no resource type, or is an
   * app-level custom dashboard (no record ID).
   */
  private async createSnapshotIfOrphan(tab: WorkspaceTab): Promise<OrphanResourceSnapshot | null> {
    const resourceType = tab.configuration?.['resourceType'] as string | undefined;
    if (!resourceType) {
      return null;
    }

    // Skip 'custom' resource type without a specific record (app-level dashboards)
    if (resourceType.toLowerCase() === 'custom' && !tab.resourceRecordId) {
      return null;
    }

    // Skip if it matches a static nav item
    if (await this.matchesStaticNavItem(tab)) {
      return null;
    }

    // Resolve the label now so it's stored with the snapshot
    const entityName = tab.configuration?.['Entity'] as string | undefined;
    const resolvedLabel = await this.resolveRecordLabel(entityName, tab.resourceRecordId, tab.title);

    return {
      resourceRecordId: tab.resourceRecordId,
      resourceType,
      entityName,
      title: tab.title,
      resolvedLabel,
      configuration: tab.configuration as Record<string, unknown>,
      tabId: tab.id,
      timestamp: Date.now()
    };
  }

  /**
   * Checks whether a tab matches any static nav item (by label, route, or driver class).
   */
  private async matchesStaticNavItem(tab: WorkspaceTab): Promise<boolean> {
    const staticItems = await super.GetNavItems();
    return staticItems.some(item => {
      if (item.Label === tab.title) {
        return true;
      }
      if (item.Route && tab.configuration?.['route'] === item.Route) {
        return true;
      }
      if (item.DriverClass && tab.configuration?.['driverClass'] === item.DriverClass) {
        return true;
      }
      return false;
    });
  }

  // ========================================
  // Dynamic NavItem Building
  // ========================================

  /**
   * Creates DynamicNavItem entries for each item in the recent orphan stack.
   * Uses the pre-resolved label from the snapshot (no async needed).
   */
  private buildDynamicNavItems(): DynamicNavItem[] {
    return this.recentOrphanStack.map(snapshot => this.createDynamicNavItem(snapshot));
  }

  /**
   * Creates a single DynamicNavItem from an OrphanResourceSnapshot.
   * Uses the snapshot's resolvedLabel directly — no async lookup needed.
   */
  private createDynamicNavItem(snapshot: OrphanResourceSnapshot): DynamicNavItem {
    return {
      Label: snapshot.resolvedLabel,
      Icon: this.resolveIcon(snapshot.entityName, snapshot.resourceType),
      ResourceType: snapshot.resourceType,
      RecordID: snapshot.resourceRecordId,
      Configuration: snapshot.configuration,
      isDynamic: true,
      isActiveMatch: (tab: unknown) => {
        const wsTab = tab as WorkspaceTab;
        if (snapshot.resourceRecordId) {
          return wsTab.resourceRecordId === snapshot.resourceRecordId;
        }
        return wsTab.id === snapshot.tabId;
      }
    };
  }

  // ========================================
  // Label Resolution
  // ========================================

  /**
   * Resolves the best available display label for an entity record nav item.
   * Priority order:
   *   1. Cached record name (from EntityRecordNameCache, populated by entity Load/Save)
   *   2. Tab title (whatever the workspace assigned when the tab was opened)
   *   3. Generated default (entity name + truncated primary key values)
   *
   * @param entityName - Entity name from tab configuration, may be undefined for non-entity resources
   * @param tabRecordId - URL-encoded composite key segment (e.g. "ID|abc-123" or "Field1|val1||Field2|val2")
   * @param tabTitle - Fallback title assigned by the workspace when the tab was opened
   */
  private async resolveRecordLabel(entityName: string | undefined, tabRecordId: string | undefined, tabTitle: string): Promise<string> {
    if (!entityName || !tabRecordId) {
      return tabTitle || '';
    }

    // Parse the URL segment into a CompositeKey
    const fvCollection = new FieldValueCollection();
    fvCollection.SimpleLoadFromURLSegment(tabRecordId);
    const compositeKey = new CompositeKey(fvCollection.KeyValuePairs);

    // Check the cache first
    try {
      const cachedName = await Metadata.Provider.GetCachedRecordName(entityName, compositeKey, true);
      if (cachedName) {
        return cachedName;
      }
    } catch (error) {
      console.warn('Failed to look up cached record name:', error);
    }

    // Fall back generated default from the key values, then tabTitle if we have no default label(unlikely)
    return this.createDefaultLabel(entityName, compositeKey) || tabTitle;
  }

  /**
   * Generates a fallback label when no cached record name or tab title is available.
   * Format: "EntityName: <truncated key value(s)>"
   *
   * @example
   * // Single key:  "Contacts: abc1234..."
   * // Multi key:   "Order Details: abc1..., 42"
   * // No key:      "Contacts record"
   */
  private createDefaultLabel(entityName: string, key: CompositeKey): string {
    if (!key || key.KeyValuePairs.length === 0) {
      return `${entityName} record`;
    }

    if (key.KeyValuePairs.length === 1) {
      return `${entityName}: ${this.trimValue(key.KeyValuePairs[0].Value)}`;
    }

    // Multiple keys - show each value trimmed, comma-separated
    const values = key.KeyValuePairs.map(kv => this.trimValue(kv.Value)).join(', ');
    return `${entityName}: ${values}`;
  }

  /**
   * Truncates a primary key value for display, appending "..." if it exceeds maxLength.
   * Returns the value as-is if it's short enough or empty.
   */
  private trimValue(value: string, maxLength: number = 8): string {
    if (!value || value.trim().length === 0) {
      return value;
    }

    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    return trimmed.substring(0, maxLength) + '...';
  }

  // ========================================
  // Storage Persistence
  // ========================================

  /**
   * Persists the current recentOrphanStack to localStorage via Provider.
   * Fire-and-forget — errors are logged but don't affect the UX.
   */
  private saveStackToStorage(): void {
    try {
      const provider = Metadata.Provider.LocalStorageProvider;
      if (!provider) {
        return;
      }

      // Strip non-serializable fields (isActiveMatch closures are rebuilt on load)
      const serializable = this.recentOrphanStack.map(s => ({
        resourceRecordId: s.resourceRecordId,
        resourceType: s.resourceType,
        entityName: s.entityName,
        title: s.title,
        resolvedLabel: s.resolvedLabel,
        configuration: s.configuration,
        tabId: s.tabId,
        timestamp: s.timestamp
      }));

      provider.SetItem(STORAGE_KEY, JSON.stringify(serializable), STORAGE_CATEGORY).catch(err => {
        console.warn('Failed to persist recent nav stack:', err);
      });
    } catch (err) {
      console.warn('Failed to persist recent nav stack:', err);
    }
  }

  /**
   * Loads the recent orphan stack from localStorage via Provider.
   * Filters out stale entries (older than MAX_SNAPSHOT_AGE_MS).
   */
  private async loadStackFromStorage(): Promise<void> {
    try {
      const provider = Metadata.Provider.LocalStorageProvider;
      if (!provider) {
        return;
      }

      const raw = await provider.GetItem(STORAGE_KEY, STORAGE_CATEGORY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as OrphanResourceSnapshot[];
      if (!Array.isArray(parsed)) {
        return;
      }

      // Filter out stale snapshots
      const now = Date.now();
      this.recentOrphanStack = parsed
        .filter(s => s.resourceRecordId && s.timestamp && (now - s.timestamp) < MAX_SNAPSHOT_AGE_MS)
        .slice(0, HomeApplication.MAX_RECENT_ITEMS);
    } catch (err) {
      console.warn('Failed to load recent nav stack from storage:', err);
    }
  }
}
