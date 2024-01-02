import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '../generic/base-resource-component';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';

export function LoadRecordResource() {
    const test = new EntityRecordResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Records')
@Component({
    selector: 'record-resource',
    template: `<app-single-record [recordId]="Data.ResourceRecordID" [entityName]="Data.Configuration.Entity" (loadComplete)="NotifyLoadComplete()"></app-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (!data.Configuration.Entity)
            return ''
        else {
            const md = new Metadata();
            const name = await md.GetEntityRecordName(data.Configuration.Entity, data.ResourceRecordID);
            return (name ? name : data.Configuration.Entity) + ` (ID: ${data.ResourceRecordID})`;
        }
    }
}
