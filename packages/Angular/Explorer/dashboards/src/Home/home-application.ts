import { RegisterClass } from '@memberjunction/global';
import { BaseApplication, DynamicNavItem, NavItem, WorkspaceStateManager, WorkspaceTab } from '@memberjunction/ng-base-application';
import { SharedService } from '@memberjunction/ng-shared';

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

    return {
      Label: activeTab.title,
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
}

/**
 * Tree-shaking prevention function.
 * Call this to ensure the HomeApplication class is not removed during build.
 */
export function LoadHomeApplication(): void {
  // This function exists solely to prevent tree-shaking
  // The @RegisterClass decorator handles actual registration
  const x = 1;
}
