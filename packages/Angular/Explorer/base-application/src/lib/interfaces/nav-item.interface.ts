/**
 * Navigation item displayed in the app header
 */
export interface NavItem {
  /** Display label for the nav item */
  Label: string;

  /** Route to navigate to when clicked */
  Route: string;

  /** Font Awesome icon class (e.g., 'fa-solid fa-chart-line') */
  Icon?: string;

  /** Badge to display (notification count, etc.) */
  Badge?: number | string;

  /** Query parameters to include in the route */
  queryParams?: Record<string, string>;

  /** Whether this is the default nav item for the application */
  isDefault?: boolean;
}
