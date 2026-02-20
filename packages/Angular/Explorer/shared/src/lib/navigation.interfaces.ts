/**
 * Options for controlling navigation behavior
 */
export interface NavigationOptions {
  /**
   * Force creation of a new tab instead of replacing temporary tabs
   * If not specified, the NavigationService will use global shift-key detection
   */
  forceNewTab?: boolean;

  /**
   * Create the tab as a pinned (permanent) tab
   */
  pinTab?: boolean;

  /**
   * Focus the tab after creation (default: true)
   */
  focusTab?: boolean;

  /**
   * Replace the currently active tab instead of creating a new one
   */
  replaceActive?: boolean;

  /**
   * Initial values to populate when creating a new record.
   * Should be a plain object with field names as keys.
   */
  newRecordValues?: Record<string, unknown>;

  /**
   * URL query parameters to set on the tab after navigation.
   * Use null values to remove a query param.
   */
  queryParams?: Record<string, string | null>;
}
