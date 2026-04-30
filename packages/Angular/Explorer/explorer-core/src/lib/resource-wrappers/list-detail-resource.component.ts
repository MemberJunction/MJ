import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata } from '@memberjunction/core';
@RegisterClass(BaseResourceComponent, 'ListDetailResource')
@Component({
  standalone: false,
    selector: 'mj-list-detail-resource',
    template: `<mj-list-detail [ListID]="Data.ResourceRecordID"/>`
})
export class ListDetailResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {
        super.ngOnInit();
        this.NotifyLoadComplete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = this.ProviderToUse;
        if (data.ResourceRecordID) {
            let compositeKey: CompositeKey = new CompositeKey([{FieldName: "ID", Value: data.ResourceRecordID}]);
            const name = await md.GetEntityRecordName('Lists', compositeKey);
            return name ? name : `List: ${data.ResourceRecordID}`;
        }
        else{
            return 'List [Error]';
        }
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return '';
    }
}
