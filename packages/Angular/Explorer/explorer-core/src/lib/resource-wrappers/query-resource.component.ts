import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata } from '@memberjunction/core';
@RegisterClass(BaseResourceComponent, 'QueryResource')
@Component({
  standalone: false,
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
