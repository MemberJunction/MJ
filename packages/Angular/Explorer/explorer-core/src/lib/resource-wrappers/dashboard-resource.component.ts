import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';

export function LoadDashboardResource() {
    const test = new DashboardResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Dashboards')
@Component({
    selector: 'mj-single-dashboard-resource',
    template: `<mj-single-dashboard [ResourceData]="Data" (dashboardSaved)="ResourceRecordSaved($event)" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()" mjFillContainer></mj-single-dashboard>`
})
export class DashboardResource extends BaseResourceComponent {
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return data.Name ? data.Name : 'Dashboard ID: ' + data.ResourceRecordID;
    }
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return '';
    }
}
