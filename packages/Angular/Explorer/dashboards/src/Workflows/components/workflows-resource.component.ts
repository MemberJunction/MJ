import { Component, OnInit, ViewChild } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { WorkflowsDashboardComponent } from '../workflows-dashboard.component';

/**
 * Workflows resource — thin shim that passes tab `Data` and query-param updates straight into
 * `<mj-workflows-dashboard>` so URL deep-links (`workflow`, `tab`, `view`) round-trip cleanly.
 */
@RegisterClass(BaseResourceComponent, 'WorkflowsResource')
@Component({
    standalone: false,
    selector: 'mj-workflows-resource',
    template: `<mj-workflows-dashboard [HostData]="Data"></mj-workflows-dashboard>`,
})
export class WorkflowsResourceComponent extends BaseResourceComponent implements OnInit {
    @ViewChild(WorkflowsDashboardComponent) private dashboard: WorkflowsDashboardComponent | undefined;

    ngOnInit(): void {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
        this.dashboard?.ApplyQueryParams(params, source);
    }

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Workflows';
    }

    async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-diagram-project';
    }
}
