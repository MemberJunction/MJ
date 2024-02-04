import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared/src/lib/base-resource-component';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';

export function LoadViewResource() {
    const test = new UserViewResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'User Views')
@Component({
    selector: 'userview-resource',
    template: `<app-single-view [viewId]="Data.ResourceRecordID" 
                                [viewName]="Data.Configuration?.ViewName" 
                                [entityName]="Data.Configuration?.Entity" 
                                [extraFilter]="Data.Configuration?.ExtraFilter" 
                                (loadComplete)="NotifyLoadComplete()">
                </app-single-view>`
})
export class UserViewResource extends BaseResourceComponent {
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        const md = new Metadata();
        if (data.ResourceRecordID > 0) {
            const name = await md.GetEntityRecordName('User Views', [{FieldName: "ID", Value: data.ResourceRecordID}]);
            return name ? name : 'View: ' + data.ResourceRecordID;
        }
        else if (data.Configuration?.Entity && data.Configuration?.Entity.length > 0) {
            return `${data.Configuration?.Entity} [Dynamic${data.Configuration.ExtraFilter ? ' - Filtered' : ' - All'}]`;
        }
        else
            return 'User Views [Error]';
    }
}
