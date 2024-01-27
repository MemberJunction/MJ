import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '../generic/base-resource-component';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';

export function LoadReportResource() {
    const test = new ReportResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Reports')
@Component({
    selector: 'report-resource',
    template: `<app-single-report [reportId]="Data.ResourceRecordID" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()"></app-single-report>`
})
export class ReportResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {

    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = new Metadata();
        const name = await md.GetEntityRecordName('Reports', [{FieldName: "ID", Value: data.ResourceRecordID}]);
        return `${name ? name : 'Report ID: ' + data.ResourceRecordID}`;
    }
}
