import type { HomeAppPinInput } from './home-pin.types';

/** The ResourceType of a dashboard pin. */
export const DASHBOARD_PIN_RESOURCE_TYPE = 'Dashboards';

/**
 * The Home pin for a dashboard: the shape the dashboard tab's Add to menu and Home's New dashboard store. A click on
 * the pin opens the dashboard.
 */
export function BuildDashboardPinInput(dashboard: { ID: string; Name: string }): HomeAppPinInput {
  return {
    DisplayName: dashboard.Name,
    ResourceType: DASHBOARD_PIN_RESOURCE_TYPE,
    Icon: 'fa-solid fa-gauge-high',
    Configuration: { resourceType: DASHBOARD_PIN_RESOURCE_TYPE, dashboardId: dashboard.ID, recordId: dashboard.ID },
  };
}
