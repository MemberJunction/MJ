import { RegisterClass } from '@memberjunction/global';
import { BaseApplication, DynamicNavItem, NavItem, WorkspaceStateManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, CompositeKey, FieldValueCollection } from '@memberjunction/core';

/**
 * Home Application - Provides dynamic navigation items for orphan resources.
 *
 * When a user opens a resource (record, view, dashboard, etc.) from within the Home app,
 * this application dynamically creates a nav item to represent that resource.
 * The nav item shows the resource name and appropriate icon from ResourceTypes metadata.
 *
 * @example
 * User opens "John Smith" contact record from Home app:
 * - Dynamic nav item appears: [person icon] "John Smith"
 * - Clicking it re-selects that tab
 */
@RegisterClass(BaseApplication, 'HomeApplication')
export class HomeApplication extends BaseApplication {
  private workspaceManager: WorkspaceStateManager | null = null;
  private sharedService: SharedService | null = null;

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
   * Returns navigation items including any dynamic item for the active orphan resource.
   * Static items (Apps, Favorites) come from DefaultNavItems in metadata.
   * Dynamic items are generated based on the currently active tab.
   */
  override GetNavItems(): NavItem[] {
    const staticItems = super.GetNavItems();

    // Get dynamic nav item for currently active orphan resource tab
    const dynamicItem = this.getDynamicResourceNavItem();
    if (dynamicItem) {
      return [...staticItems, dynamicItem];
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
   * Creates a dynamic nav item for the currently active orphan resource tab.
   * Returns null if:
   * - No workspace manager is set
   * - No active tab exists
   * - Active tab doesn't belong to this app
   * - Active tab matches a static nav item
   * - Active tab has no resource type (e.g., app default dashboard)
   */
  private getDynamicResourceNavItem(): DynamicNavItem | null {
    if (!this.workspaceManager) {
      return null;
    }

    const config = this.workspaceManager.GetConfiguration();
    if (!config?.activeTabId) {
      return null;
    }

    const activeTab = config.tabs.find(t => t.id === config.activeTabId);
    if (!activeTab || activeTab.applicationId !== this.ID) {
      return null;
    }

    // Get resource type from tab configuration
    const resourceType = activeTab.configuration?.['resourceType'] as string | undefined;
    if (!resourceType) {
      return null;
    }

    // Don't create dynamic nav item for 'custom' resource type without a specific record
    // (these are typically app-level dashboards, not orphan resources)
    if (resourceType.toLowerCase() === 'custom' && !activeTab.resourceRecordId) {
      return null;
    }

    // Don't create dynamic nav item if it matches a static nav item
    const staticItems = super.GetNavItems();
    const matchesStatic = staticItems.some(item => {
      // Match by label
      if (item.Label === activeTab.title) {
        return true;
      }
      // Match by route
      if (item.Route && activeTab.configuration?.['route'] === item.Route) {
        return true;
      }
      // Match by driver class (for Custom resources)
      if (item.DriverClass && activeTab.configuration?.['driverClass'] === item.DriverClass) {
        return true;
      }
      return false;
    });

    if (matchesStatic) {
      return null;
    }

    // Create the dynamic nav item representing this orphan resource
    // Icon comes from ResourceTypes entity (metadata-driven, not hardcoded)
    const tabId = activeTab.id;
    const tabRecordId = activeTab.resourceRecordId;
    const entityName = activeTab.configuration?.['Entity'] as string | undefined;

    // Resolve display label: cached record name > tab title > generated default
    const label = this.resolveRecordLabel(entityName, tabRecordId, activeTab.title);

    return {
      Label: label,
      Icon: this.getResourceTypeIcon(resourceType),
      ResourceType: resourceType,
      RecordID: tabRecordId,
      Configuration: activeTab.configuration,
      isDynamic: true,
      // Custom matching function - matches if tab has same resource record ID
      isActiveMatch: (tab: unknown) => {
        const wsTab = tab as WorkspaceTab;
        if (tabRecordId) {
          return wsTab.resourceRecordId === tabRecordId;
        }
        // Fall back to tab ID matching if no record ID
        return wsTab.id === tabId;
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
