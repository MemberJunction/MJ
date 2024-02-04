import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared/src/lib/base-resource-component';
import { RegisterClass } from '@memberjunction/global';

export function LoadDashboardResource() {
    const test = new DashboardResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Dashboards')
@Component({
    selector: 'single-dashboard-resource',
    template: `<app-single-dashboard [ResourceData]="Data" (dashboardSaved)="ResourceRecordSaved($event)" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()" mjFillContainer></app-single-dashboard>`
})
export class DashboardResource extends BaseResourceComponent {
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return data.Name ? data.Name : 'Dashboard ID: ' + data.ResourceRecordID;
    }
}
