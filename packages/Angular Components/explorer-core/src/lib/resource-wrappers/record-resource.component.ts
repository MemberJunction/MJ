import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '../generic/base-resource-component';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, PrimaryKeyValue } from '@memberjunction/core';
import { SharedService } from '../../public-api';

export function LoadRecordResource() {
    const test = new EntityRecordResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Records')
@Component({
    selector: 'record-resource',
    template: `<app-single-record [primaryKeyValues]="this.primaryKeyValues" [entityName]="Data.Configuration.Entity" (loadComplete)="NotifyLoadComplete()"></app-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    public get primaryKeyValues(): PrimaryKeyValue[] {
        const md = new Metadata();
        const e = md.Entities.find(e => e.Name.trim().toLowerCase() === this.Data.Configuration.Entity.trim().toLowerCase());
        if (!e)
            throw new Error(`Entity ${this.Data.Configuration.Entity} not found in metadata`);

        const pKeys = SharedService.ParsePrimaryKeys(e, this.Data.ResourceRecordID)
        return pKeys;
    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (!data.Configuration.Entity)
            return ''
        else {
            const md = new Metadata();
            const name = await md.GetEntityRecordName(data.Configuration.Entity, [{FieldName: "ID", Value: data.ResourceRecordID}]);
            const e = md.Entities.find(e => e.Name === data.Configuration.Entity);
            if (!e)
                throw new Error(`Entity ${data.Configuration.Entity} not found in metadata`);
            const pKeys = SharedService.ParsePrimaryKeys(e, data.ResourceRecordID)   
            const displayId = pKeys.length > 1 ? pKeys.map(p => p.Value).join(', ') : pKeys[0].Value;         
            return (name ? name : data.Configuration.Entity) + ` (${displayId})`;
        }
    }
}
