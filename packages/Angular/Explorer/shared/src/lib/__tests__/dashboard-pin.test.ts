import { describe, it, expect } from 'vitest';
import { BuildDashboardPinInput, DASHBOARD_PIN_RESOURCE_TYPE } from '../dashboard-pin';

describe('BuildDashboardPinInput', () => {
  it('builds the dashboard pin the tab and Home store', () => {
    expect(BuildDashboardPinInput({ ID: 'D1', Name: 'Revenue' })).toEqual({
      DisplayName: 'Revenue',
      ResourceType: 'Dashboards',
      Icon: 'fa-solid fa-gauge-high',
      Configuration: { resourceType: 'Dashboards', dashboardId: 'D1', recordId: 'D1' },
    });
  });

  it('stores dashboard pins under the Dashboards resource type', () => {
    expect(DASHBOARD_PIN_RESOURCE_TYPE).toBe('Dashboards');
  });
});
