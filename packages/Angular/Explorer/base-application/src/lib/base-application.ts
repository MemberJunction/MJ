import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { DashboardEngine, DashboardUserPreferenceEntity } from '@memberjunction/core-entities';
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

  /** Default sequence position when adding to new user's User Applications */
  public DefaultSequence: number = 100;

  /** Application lifecycle status - only Active apps are shown to users */
  public Status: 'Pending' | 'Active' | 'Disabled' | 'Deprecated' = 'Active';

  /** How the application appears in navigation */
  public NavigationStyle: 'App Switcher' | 'Nav Bar' | 'Both' = 'App Switcher';

  /** Position of permanent nav icon when NavigationStyle is Nav Bar or Both */
  public TopNavLocation: 'Left of App Switcher' | 'Left of User Menu' | null = null;

  /** When true, hide the Nav Bar icon when this application is active */
  public HideNavBarIconWhenActive: boolean = false;

  /** URL-friendly slug for the application (e.g., "data-explorer" for "Data Explorer") */
  public Path: string = '';

  /** When true, Path is automatically generated from Name on save */
  public AutoUpdatePath: boolean = true;

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
  async GetNavItems(): Promise<NavItem[]> {
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
    const navItems = await this.GetNavItems();

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
   * For the app scope: return user preferences if they exist, otherwise system defaults.
   *
   * Leverages DashboardEngine which is pre-warmed on login, so no database queries are needed.
   * Returns null if no dashboards are available.
   */
  private async loadDefaultDashboard(): Promise<TabRequest | null> {
    try {
      const md = new Metadata();
      const currentUserId = md.CurrentUser?.ID;

      if (!currentUserId) {
        console.log(`[${this.Name}] No current user, returning null`);
        return null;
      }

      // Ensure DashboardEngine is configured (no-op if already loaded)
      await DashboardEngine.Instance.Config(false);

      // Get all preferences from the cached engine
      const allPreferences = DashboardEngine.Instance.DashboardUserPreferences;

      // Find preferences for this app with App scope
      const appPreferences = allPreferences.filter(
        p => p.Scope === 'App' && p.ApplicationID === this.ID
      );

      // First, look for user-specific preferences
      const preference = this.findBestPreference(appPreferences, currentUserId);

      if (preference?.DashboardID) {
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
    } catch (error) {
      console.error(`[${this.Name}] Error loading default dashboard:`, error);
    }

    // No dashboard configured - fall back to Data Explorer filtered by this application
    return this.createDataExplorerTab();
  }

  /**
   * Finds the best dashboard preference using cascading logic:
   * 1. User-specific preferences (lowest DisplayOrder)
   * 2. System defaults (UserID is null) if no user preferences exist
   */
  private findBestPreference(
    preferences: Array<DashboardUserPreferenceEntity>,
    currentUserId: string
  ): DashboardUserPreferenceEntity | null {
    // Sort by DisplayOrder
    const sorted = [...preferences].sort((a, b) => a.DisplayOrder - b.DisplayOrder);

    // First, look for user-specific preference
    const userPreference = sorted.find(p => p.UserID === currentUserId);
    if (userPreference) {
      return userPreference;
    }

    // Fall back to system default (UserID is null)
    const systemDefault = sorted.find(p => p.UserID === null);
    return systemDefault || null;
  }

  /**
   * Creates a Data Explorer tab filtered to entities within this application.
   * Used as a fallback when no dashboard or nav items are configured.
   */
  private createDataExplorerTab(): TabRequest {
    return {
      ApplicationId: this.ID,
      Title: this.Name,
      ResourceType: 'Dashboards',
      ResourceRecordId: 'DataExplorer',
      Configuration: {
        resourceType: 'Dashboards',
        dashboardType: 'DataExplorer',
        appName: this.Name,
        appIcon: this.Icon,
        isAppDefault: true,
        // Pass filter configuration for Data Explorer
        entityFilter: {
          applicationId: this.ID
        }
      }
    };
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
