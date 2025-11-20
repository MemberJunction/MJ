import { RegisterClass } from '@memberjunction/global';
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
@RegisterClass(BaseApplication)
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

  /**
   * Returns navigation items for this application.
   * Override in subclass for dynamic behavior based on permissions, context, etc.
   */
  GetNavItems(): NavItem[] {
    if (this.DefaultNavItems) {
      try {
        return JSON.parse(this.DefaultNavItems) as NavItem[];
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
   * Override in subclass for custom default tab logic.
   */
  CreateDefaultTab(): TabRequest | null {
    const navItems = this.GetNavItems();
    if (navItems.length > 0) {
      const firstItem = navItems[0];
      const tabRequest: TabRequest = {
        ApplicationId: this.ID,
        Title: firstItem.Label,
        Route: firstItem.Route
      };

      // Include query params in the configuration if present
      if (firstItem.queryParams) {
        tabRequest.Configuration = { queryParams: firstItem.queryParams };
      }

      return tabRequest;
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
