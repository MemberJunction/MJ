/**
 * Configuration interface for tabbed dashboards
 */
export interface TabbedDashboardConfig {
  /**
   * Extra filter to apply when fetching dashboards
   */
  extraFilter?: string;
  
  /**
   * Scope of dashboards to display ('Global', 'App', etc.)
   */
  scope?: string;
  
  /**
   * Component to display when no dashboards are available
   */
  defaultComponentType?: any;
}