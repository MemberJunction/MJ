import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';

export function LoadDashboardResource() {
    const test = new DashboardResource(); // Force inclusion in production builds (tree shaking workaround)
}

/**
 * Dashboard Resource Wrapper - displays a single dashboard in a tab
 * Extends BaseResourceComponent to work with the resource type system
 * Handles loading dashboard metadata and delegating rendering to mj-single-dashboard
 */
@RegisterClass(BaseResourceComponent, 'Dashboards')
@Component({
    selector: 'mj-dashboard-resource',
    template: `<mj-single-dashboard [ResourceData]="Data" (dashboardSaved)="ResourceRecordSaved($event)" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()"></mj-single-dashboard>`
})
export class DashboardResource extends BaseResourceComponent {
    /**
     * Get the display name for a dashboard resource
     * Loads the actual dashboard name from the database if available
     */
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        try {
            // Try to load dashboard metadata if we have the record ID
            if (data.ResourceRecordID && data.ResourceRecordID.length > 0) {
                const md = new Metadata();
                const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: data.ResourceRecordID }]);
                const name = await md.GetEntityRecordName('Dashboards', compositeKey);
                if (name) {
                    return name;
                }
            }
        } catch (error) {
            // Silently fail and use fallback
        }

        // Fallback: use provided name or generic label
        return data.Name || 'Dashboard';
    }

    /**
     * Get the icon class for dashboard resources
     */
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-table-columns';
    }
}
