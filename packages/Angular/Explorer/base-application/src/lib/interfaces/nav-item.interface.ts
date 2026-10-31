/**
 * Navigation item displayed in the app header
 */
export interface NavItem {
  /** Display label for the nav item */
  Label: string;

  /** Optional description — shown as tooltip in UI and passed to AI for context */
  Description?: string;

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
   * Position in the nav bar; lower comes first. Optional: an application's own items default to
   * (position + 1) × 10, and items added through `NavItem.*` application settings default to 1000
   * (see `MergeNavItemExtensions`).
   */
  Sequence?: number;

  /**
   * Status of the nav item. Only 'Active' items are displayed.
   * - 'Active': Displayed and functional (default if not specified)
   * - 'Pending': Hidden, reserved for features in development
   * - 'Disabled': Hidden, explicitly disabled
   */
  Status?: 'Active' | 'Pending' | 'Disabled';

  /**
   * Client tools that become available when this nav item is active.
   * References MJ: AI Client Tool Definitions by ID. When the user navigates
   * to this nav item, these tools are activated for the agent session.
   * When the user leaves, they deactivate.
   */
  ClientTools?: NavItemClientTool[];
}

/**
 * A client tool binding on a nav item, with optional default parameters.
 */
export interface NavItemClientTool {
  /** ID of the MJ: AI Client Tool Definition */
  ToolDefinitionID: string;
  /** Optional default parameter values for this tool in this nav item context */
  DefaultParams?: Record<string, unknown>;
}

/**
 * Extended NavItem interface supporting dynamic nav items with custom matching logic.
 * Used by applications like HomeApplication to create nav items for orphan resources.
 */
export interface DynamicNavItem extends NavItem {
  /** Whether this is a dynamically generated nav item */
  isDynamic?: boolean;

  /**
   * Custom matching function for determining if this nav item should be highlighted.
   * Receives the active tab and returns true if this nav item matches it.
   * Used when standard label/route matching is insufficient.
   */
  isActiveMatch?: (tab: unknown) => boolean;
}
