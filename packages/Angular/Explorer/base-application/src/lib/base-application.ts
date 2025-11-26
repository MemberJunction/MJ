import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { DashboardEntity, DashboardUserPreferenceEntity } from '@memberjunction/core-entities';
import { NavItem } from './interfaces/nav-item.interface';
import { TabRequest } from './interfaces/tab-request.interface';

/**
 * Base class for application definitions in MemberJunction Explorer.
 *
 * Applications can extend this class to provide dynamic behavior
 * for navigation items, colors, default tabs, and lifecycle hooks.
 *
 * @example
 * ```typescript
 * import { RegisterClass } from '@memberjunction/global';
 *
 * @RegisterClass(BaseApplication, 'CRMApplication')
 * export class CRMApplication extends BaseApplication {
 *   override GetNavItems(): NavItem[] {
 *     const items = super.GetNavItems();
 *     // Add dynamic items based on permissions
 *     return items;
 *   }
 * }
 * ```
 */
export class BaseApplication {
  /** Application ID from database */
  public ID: string = '';

  /** Application name */
  public Name: string = '';

  /** Application description */
  public Description: string = '';

  /** Font Awesome icon class */
  public Icon: string = '';

  /** Hex color code for theming */
  public Color: string = '';

  /** JSON string of default navigation items */
  public DefaultNavItems: string = '';

  /** TypeScript class name for ClassFactory */
  public ClassName: string = '';

  constructor(data?: Partial<BaseApplication>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  private _defaultNavItems: NavItem[] | null = null;
  /**
   * Returns navigation items for this application.
   * Override in subclass for dynamic behavior based on permissions, context, etc.
   */
  GetNavItems(): NavItem[] {
    if (this._defaultNavItems) {
      return this._defaultNavItems;
    }

    if (this.DefaultNavItems) {
      try {
        this._defaultNavItems = JSON.parse(this.DefaultNavItems) as NavItem[];
        return this._defaultNavItems;
      } catch (e) {
        console.error(`Failed to parse DefaultNavItems for ${this.Name}:`, e);
        return [];
      }
    }
    return [];
  }

  /**
   * Returns the application color for theming.
   * Override in subclass for dynamic color based on context.
   */
  GetColor(): string {
    return this.Color || '#757575';
  }

  /**
   * Creates the default tab request when user switches to this app.
   * If app has navigation items, uses the first nav item.
   * If app has no nav items, loads the first available dashboard preference for this app.
   * Override in subclass for custom default tab logic.
   */
  async CreateDefaultTab(): Promise<TabRequest | null> {
    const navItems = this.GetNavItems();

    if (navItems.length > 0) {
      const firstItem = navItems[0];
      const tabRequest: TabRequest = {
        ApplicationId: this.ID,
        Title: firstItem.Label
      };

      // Handle resource-based nav items
      if (firstItem.ResourceType) {
        tabRequest.ResourceType = firstItem.ResourceType;
        tabRequest.ResourceRecordId = firstItem.RecordID;
        // Put resourceType in Configuration so it gets stored properly
        tabRequest.Configuration = {
          resourceType: firstItem.ResourceType,
          recordId: firstItem.RecordID,
          ...(firstItem.Configuration || {})
        };

        // For Custom resource types, include the DriverClass
        if (firstItem.ResourceType === 'Custom' && firstItem.DriverClass) {
          tabRequest.Configuration.driverClass = firstItem.DriverClass;
        }
      }
      // Handle route-based nav items (legacy)
      else if (firstItem.Route) {
        tabRequest.Route = firstItem.Route;

        // Include query params in the configuration if present
        if (firstItem.queryParams) {
          tabRequest.Configuration = { queryParams: firstItem.queryParams };
        }
      }

      return tabRequest;
    }

    // No nav items defined - try to load default dashboard for this app
    return await this.loadDefaultDashboard();
  }

  /**
   * Loads the default dashboard for this app from DashboardUserPreference.
   * Uses a simple cascading pattern:
   * For the app scope: return user preferences if they exist, otherwise system defaults
   * Returns null if no dashboards are available.
   */
  private async loadDefaultDashboard(): Promise<TabRequest | null> {
    try {
      const md = new Metadata();
      const rv = new RunView();
      const entity = md.EntityByName('MJ: Dashboard User Preferences');
      const currentUserId = md.CurrentUser?.ID;

      if (!currentUserId) {
        console.log(`[${this.Name}] No current user, returning null`);
        return null;
      }

      // Build the cascading filter following the legacy pattern:
      // Show user preferences for this app, OR show system defaults if user has no preferences
      const userFilter = `UserID='${currentUserId}' AND Scope='App' AND ApplicationID='${this.ID}'`;
      const baseCondition = `Scope='App' AND ApplicationID='${this.ID}'`;

      // Single query that returns:
      // 1. User preferences if they exist for this app
      // 2. System defaults (UserID IS NULL) if user has no preferences for this app
      const filter = `(${userFilter})
                      OR
                      (UserID IS NULL AND ${baseCondition} AND
                       NOT EXISTS (SELECT 1 FROM [${entity.SchemaName}].vwDashboardUserPreferences dup2
                                  WHERE ${userFilter}))`;

      const result = await rv.RunView<DashboardUserPreferenceEntity>({
        EntityName: 'MJ: Dashboard User Preferences',
        ExtraFilter: filter,
        OrderBy: 'DisplayOrder ASC',
        MaxRows: 1,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results && result.Results.length > 0) {
        const preference = result.Results[0];
        if (preference.DashboardID) {
          return {
            ApplicationId: this.ID,
            Title: this.Name, // Use app name instead of dashboard name
            ResourceType: 'Dashboards',
            ResourceRecordId: preference.DashboardID,
            Configuration: {
              resourceType: 'Dashboards',
              recordId: preference.DashboardID,
              appName: this.Name,  // Mark this as an app-level dashboard
              isAppDefault: true   // Flag to indicate this is the app's default view
            }
          };
        }
      } else {
        console.log(`[${this.Name}] No results found. Success:`, result.Success, 'Results:', result.Results?.length);
      }
    } catch (error) {
      console.error(`[${this.Name}] Error loading default dashboard:`, error);
    }

    return null;
  }

  /**
   * Called when this application becomes the active app.
   * Override in subclass for custom initialization logic.
   */
  async OnActivate(): Promise<void> {
    // Default: no-op
  }

  /**
   * Called when user navigates away from this application.
   * Override in subclass for cleanup logic.
   */
  async OnDeactivate(): Promise<void> {
    // Default: no-op
  }

  /**
   * Called to check if user has permission for a specific action.
   * Override in subclass for permission checks.
   */
  HasPermission(action: string): boolean {
    // Default: allow all
    return true;
  }
}
