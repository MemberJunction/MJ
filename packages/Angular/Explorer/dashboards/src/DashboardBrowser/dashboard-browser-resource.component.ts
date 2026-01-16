import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';

export function LoadDashboardBrowserResource() {
    // Prevents tree-shaking
}

/**
 * A placeholder resource component for the Dashboard Browser.
 * This will be fully implemented in Phase 3 with Golden Layout integration.
 */
@RegisterClass(BaseResourceComponent, 'DashboardBrowserResource')
@Component({
    selector: 'mj-dashboard-browser-resource',
    templateUrl: './dashboard-browser-resource.component.html',
    styleUrls: ['./dashboard-browser-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardBrowserResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    ngOnInit(): void {
        // Mark as loaded
        setTimeout(() => this.NotifyLoadComplete(), 100);
    }

    ngOnDestroy(): void {
        // Cleanup
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Dashboards';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-gauge-high';
    }
}
