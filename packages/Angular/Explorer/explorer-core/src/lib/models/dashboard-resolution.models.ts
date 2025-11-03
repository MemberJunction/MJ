import { Type } from '@angular/core';
import { ComponentSpec } from '@memberjunction/interactivecomponents';
import { BaseDashboard } from '@memberjunction/ng-dashboards';

/**
 * Dashboard implementation type (matches Dashboard.Type field)
 */
export type DashboardImplementationType = 'Interactive' | 'Code' | 'Config';

/**
 * Result of dashboard component resolution
 */
export interface DashboardResolutionResult {
    /**
     * The type of dashboard implementation
     */
    type: DashboardImplementationType;

    /**
     * Component class to instantiate (for Code type)
     */
    componentClass?: Type<BaseDashboard>;

    /**
     * Component specification (for Interactive type)
     */
    componentSpec?: ComponentSpec;

    /**
     * Dashboard configuration (for Config type)
     */
    config?: any;

    /**
     * The dashboard record ID
     */
    dashboardId: string;

    /**
     * The dashboard name
     */
    dashboardName: string;
}
