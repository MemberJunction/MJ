import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, Metadata } from '@memberjunction/core';
export function LoadListDetailResource() {
    const test = new ListDetailResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Lists')
@Component({
    selector: 'mj-list-detail-resource',
    template: `<mj-list-detail [ListID]="Data.ResourceRecordID"/>`
})
export class ListDetailResource extends BaseResourceComponent {
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = new Metadata();
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
