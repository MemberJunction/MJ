import { RegisterClass } from '@memberjunction/global';
import { BaseApplication, DynamicNavItem, NavItem, WorkspaceStateManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, CompositeKey, FieldValueCollection } from '@memberjunction/core';

/**
 * Snapshot of an orphan resource tab for the recent navigation stack.
 * Stored in memory (session-only) to allow quick jump-back to recently viewed resources.
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
  /** Full tab configuration (passed to DynamicNavItem for re-opening) */
  configuration: Record<string, unknown>;
  /** Tab ID for fallback matching when no resourceRecordId */
  tabId: string;
}

/**
 * Home Application - Provides dynamic navigation items for orphan resources.
 *
 * Maintains a recency-ordered stack of up to 3 recently visited orphan resources.
 * When the user opens a record/view/dashboard from within the Home app, the resource
 * appears as a dynamic nav item. When they navigate away (e.g., click Home), the
 * nav item persists so they can quickly jump back. Older items drop off as new ones
 * are added.
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

  /**
   * Inject WorkspaceStateManager for accessing current tab state
   */
  public SetWorkspaceManager(manager: WorkspaceStateManager): void {
    this.workspaceManager = manager;
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
  override GetNavItems(): NavItem[] {
    const staticItems = super.GetNavItems();

    // Update the recent stack based on current active tab
    this.updateRecentStack();

    // Build dynamic nav items from the stack
    const dynamicItems = this.buildDynamicNavItems();
    if (dynamicItems.length > 0) {
      return [...staticItems, ...dynamicItems];
    }

    return staticItems;
  }

  /**
   * Gets the icon for a resource type from the ResourceTypes entity.
   * Uses SharedService which caches ResourceTypes on app load.
   */
  private getResourceTypeIcon(resourceTypeName: string): string {
    if (!this.sharedService) {
      return 'fa-solid fa-file';
    }

    const resourceType = this.sharedService.ResourceTypeByName(resourceTypeName);
    return resourceType?.Icon || 'fa-solid fa-file';
  }

  /**
   * Updates the recent orphan stack based on the currently active tab.
   * If the active tab is an orphan resource (not matching any static nav item),
   * it gets pushed/promoted to the front of the stack. If the active tab is
   * a static resource (e.g., Home dashboard), the stack is left unchanged.
   */
  private updateRecentStack(): void {
    if (!this.workspaceManager) {
      return;
    }

    const config = this.workspaceManager.GetConfiguration();
    if (!config?.activeTabId) {
      return;
    }

    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (!activeTab || activeTab.applicationId !== this.ID) {
      return;
    }

    // Check if active tab qualifies as an orphan resource
    const snapshot = this.createSnapshotIfOrphan(activeTab);
    if (!snapshot) {
      // Active tab is a static resource (Home dashboard, etc.) — leave stack as-is
      return;
    }

    // Deduplicate: remove existing entry with same resourceRecordId
    this.recentOrphanStack = this.recentOrphanStack.filter(
      s => s.resourceRecordId !== snapshot.resourceRecordId
    );

    // Push to front (most recent first)
    this.recentOrphanStack.unshift(snapshot);

    // Trim to max size
    if (this.recentOrphanStack.length > HomeApplication.MAX_RECENT_ITEMS) {
      this.recentOrphanStack.length = HomeApplication.MAX_RECENT_ITEMS;
    }
  }

  /**
   * Creates an OrphanResourceSnapshot from a tab if it qualifies as an orphan resource.
   * Returns null if the tab is a static nav item, has no resource type, or is an
   * app-level custom dashboard (no record ID).
   */
  private createSnapshotIfOrphan(tab: WorkspaceTab): OrphanResourceSnapshot | null {
    const resourceType = tab.configuration?.['resourceType'] as string | undefined;
    if (!resourceType) {
      return null;
    }

    // Skip 'custom' resource type without a specific record (app-level dashboards)
    if (resourceType.toLowerCase() === 'custom' && !tab.resourceRecordId) {
      return null;
    }

    // Skip if it matches a static nav item
    if (this.matchesStaticNavItem(tab)) {
      return null;
    }

    return {
      resourceRecordId: tab.resourceRecordId,
      resourceType,
      entityName: tab.configuration?.['Entity'] as string | undefined,
      title: tab.title,
      configuration: tab.configuration as Record<string, unknown>,
      tabId: tab.id
    };
  }

  /**
   * Checks whether a tab matches any static nav item (by label, route, or driver class).
   */
  private matchesStaticNavItem(tab: WorkspaceTab): boolean {
    const staticItems = super.GetNavItems();
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

  /**
   * Creates DynamicNavItem entries for each item in the recent orphan stack.
   * The active tab's item will be highlighted via isActiveMatch.
   */
  private buildDynamicNavItems(): DynamicNavItem[] {
    return this.recentOrphanStack.map(snapshot => this.createDynamicNavItem(snapshot));
  }

  /**
   * Creates a single DynamicNavItem from an OrphanResourceSnapshot.
   */
  private createDynamicNavItem(snapshot: OrphanResourceSnapshot): DynamicNavItem {
    const label = this.resolveRecordLabel(
      snapshot.entityName,
      snapshot.resourceRecordId,
      snapshot.title
    );

    return {
      Label: label,
      Icon: this.getResourceTypeIcon(snapshot.resourceType),
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
  private resolveRecordLabel(entityName: string | undefined, tabRecordId: string | undefined, tabTitle: string): string {
    if (!entityName || !tabRecordId) {
      return tabTitle || '';
    }

    // Parse the URL segment into a CompositeKey
    const fvCollection = new FieldValueCollection();
    fvCollection.SimpleLoadFromURLSegment(tabRecordId);
    const compositeKey = new CompositeKey(fvCollection.KeyValuePairs);

    // Check the cache first
    try {
      const cachedName = Metadata.Provider.GetCachedRecordName(entityName, compositeKey);
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
}
