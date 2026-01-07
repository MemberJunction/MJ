/**
 * Navigation item displayed in the app header
 */
export interface NavItem {
  /** Display label for the nav item */
  Label: string;

  /** Route to navigate to when clicked (optional if ResourceType is provided) */
  Route?: string;

  /** Resource type to load in a tab (alternative to Route) */
  ResourceType?: string;

  /**
   * Driver class name for Custom resource type
   * When ResourceType is "Custom", this specifies the BaseResourceComponent subclass to instantiate
   * For standard resource types, the DriverClass from ResourceType metadata is used instead
   */
  DriverClass?: string;

  /** Resource record ID (if opening a specific resource) */
  RecordID?: string;

  /** Additional configuration for the resource */
  Configuration?: Record<string, any>;

  /** Font Awesome icon class (e.g., 'fa-solid fa-chart-line') */
  Icon?: string;

  /** Badge to display (notification count, etc.) */
  Badge?: number | string;

  /** Query parameters to include in the route (used with Route) */
  queryParams?: Record<string, string>;

  /** Whether this is the default nav item for the application */
  isDefault?: boolean;

  /**
   * Status of the nav item. Only 'Active' items are displayed.
   * - 'Active': Displayed and functional (default if not specified)
   * - 'Pending': Hidden, reserved for features in development
   * - 'Disabled': Hidden, explicitly disabled
   */
  Status?: 'Active' | 'Pending' | 'Disabled';
}
