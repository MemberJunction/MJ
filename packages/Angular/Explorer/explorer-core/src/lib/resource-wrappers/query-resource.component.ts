import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata } from '@memberjunction/core';

export function LoadQueryResource() {
    const test = new QueryResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Queries')
@Component({
    selector: 'mj-query-resource',
    template: `<mj-single-query [queryId]="Data.ResourceRecordID" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()"></mj-single-query>`
})
export class QueryResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {

    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = new Metadata();
        let compositeKey: CompositeKey = new CompositeKey([{FieldName: "ID", Value: data.ResourceRecordID}]);
        const name = await md.GetEntityRecordName('Queries', compositeKey);
        return `${name ? name : 'Query ID: ' + data.ResourceRecordID}`;
    }
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return '';
    }
}
