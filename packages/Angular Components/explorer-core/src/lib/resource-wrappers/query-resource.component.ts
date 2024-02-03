import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '../generic/base-resource-component';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';

export function LoadQueryResource() {
    const test = new QueryResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Queries')
@Component({
    selector: 'query-resource',
    template: `<app-single-query [queryId]="Data.ResourceRecordID" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()"></app-single-query>`
})
export class QueryResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {

    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = new Metadata();
        const name = await md.GetEntityRecordName('Queries', [{FieldName: "ID", Value: data.ResourceRecordID}]);
        return `${name ? name : 'Query ID: ' + data.ResourceRecordID}`;
    }
}
