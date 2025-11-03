import { Injectable } from '@angular/core';
import { MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { DashboardEntity } from '@memberjunction/core-entities';
import { DashboardResolutionResult } from '../models/dashboard-resolution.models';
import { ComponentSpec } from '@memberjunction/interactivecomponents';

/**
 * Service that resolves which dashboard component implementation to use for a given dashboard.
 * Resolution is based on the Dashboard.Type field:
 * - 'Interactive': Uses ComponentSpec field (JSON) to load Interactive Component
 * - 'Code': Uses DriverClass field to look up @RegisterClass component
 * - 'Config': Uses existing configuration-based dashboard (SingleDashboardComponent)
 */
@Injectable({
  providedIn: 'root'
})
export class DashboardResolverService {
  /**
   * Resolves the appropriate dashboard component for a given dashboard entity
   * @param dashboard The dashboard entity to resolve
   * @returns Dashboard resolution result with component type and details
   */
  public resolveDashboardComponent(dashboard: DashboardEntity): DashboardResolutionResult {
    if (!dashboard) {
      throw new Error('Dashboard entity is required');
    }

    const dashboardType = dashboard.Type;

    switch (dashboardType) {
      case 'Interactive':
        return this.resolveInteractiveDashboard(dashboard);

      case 'Code':
        return this.resolveCodeBasedDashboard(dashboard);

      case 'Config':
      default:
        return this.resolveConfigDashboard(dashboard);
    }
  }

  /**
   * Resolve Interactive Component dashboard
   */
  private resolveInteractiveDashboard(dashboard: DashboardEntity): DashboardResolutionResult {
    if (!dashboard.ComponentSpec) {
      throw new Error(
        `Dashboard '${dashboard.Name}' (ID: ${dashboard.ID}) has Type='Interactive' but no ComponentSpec field`
      );
    }

    try {
      // Parse the ComponentSpec JSON
      const componentSpec: ComponentSpec = SafeJSONParse(dashboard.ComponentSpec);

      if (!componentSpec) {
        throw new Error(
          `Failed to parse ComponentSpec JSON for dashboard '${dashboard.Name}' (ID: ${dashboard.ID})`
        );
      }

      return {
        type: 'Interactive',
        componentSpec: componentSpec,
        dashboardId: dashboard.ID,
        dashboardName: dashboard.Name
      };
    } catch (error) {
      throw new Error(
        `Error parsing ComponentSpec for dashboard '${dashboard.Name}' (ID: ${dashboard.ID}): ${error}`
      );
    }
  }

  /**
   * Resolve Code-based dashboard using ClassFactory (@RegisterClass)
   */
  private resolveCodeBasedDashboard(dashboard: DashboardEntity): DashboardResolutionResult {
    if (!dashboard.DriverClass) {
      throw new Error(
        `Dashboard '${dashboard.Name}' (ID: ${dashboard.ID}) has Type='Code' but no DriverClass specified`
      );
    }

    try {
      const classInfo = MJGlobal.Instance.ClassFactory.GetRegistration(
        BaseDashboard,
        dashboard.DriverClass
      );

      if (!classInfo || !classInfo.SubClass) {
        throw new Error(
          `Dashboard class '${dashboard.DriverClass}' not found for dashboard '${dashboard.Name}' (ID: ${dashboard.ID}). ` +
          `The class may not be registered with @RegisterClass.`
        );
      }

      return {
        type: 'Code',
        componentClass: classInfo.SubClass,
        dashboardId: dashboard.ID,
        dashboardName: dashboard.Name
      };
    } catch (error) {
      throw new Error(
        `Error resolving code-based dashboard '${dashboard.Name}' (ID: ${dashboard.ID}): ${error}`
      );
    }
  }

  /**
   * Resolve Config-based dashboard (existing SingleDashboardComponent)
   */
  private resolveConfigDashboard(dashboard: DashboardEntity): DashboardResolutionResult {
    // For config dashboards, we use the existing SingleDashboardComponent
    // The config will be loaded from the dashboard entity's configuration fields
    return {
      type: 'Config',
      config: {
        // The actual config will be loaded by SingleDashboardComponent
        // We just need to pass the dashboard ID
      },
      dashboardId: dashboard.ID,
      dashboardName: dashboard.Name
    };
  }
}
