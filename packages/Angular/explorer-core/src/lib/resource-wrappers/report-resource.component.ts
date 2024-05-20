import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata } from '@memberjunction/core';

export function LoadReportResource() {
    const test = new ReportResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Reports')
@Component({
    selector: 'mj-report-resource',
    template: `<mj-single-report [reportId]="Data.ResourceRecordID" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()"></mj-single-report>`
})
export class ReportResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {

    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = new Metadata();
        let compositeKey: CompositeKey = new CompositeKey([{FieldName: "ID", Value: data.ResourceRecordID}]);
        const name = await md.GetEntityRecordName('Reports', compositeKey);
        return `${name ? name : 'Report ID: ' + data.ResourceRecordID}`;
    }
}
