import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, KeyValuePair } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';

export function LoadRecordResource() {
    const test = new EntityRecordResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Records')
@Component({
    selector: 'mj-record-resource',
    template: `<mj-single-record [KeyValuePairs]="this.KeyValuePairs" [entityName]="Data.Configuration.Entity" (loadComplete)="NotifyLoadComplete()" mjFillContainer></mj-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    public get KeyValuePairs(): KeyValuePair[] {
        return EntityRecordResource.GetKeyValuePairs(this.Data);
    }
    public static GetKeyValuePairs(data: ResourceData): KeyValuePair[] {
        const md = new Metadata();
        const e = md.Entities.find(e => e.Name.trim().toLowerCase() === data.Configuration.Entity.trim().toLowerCase());
        if (!e)
            throw new Error(`Entity ${data.Configuration.Entity} not found in metadata`);

        const pKeys = SharedService.ParsePrimaryKeys(e, data.ResourceRecordID)
        return pKeys;
    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (!data.Configuration.Entity)
            return ''
        else {
            const md = new Metadata();
            const pKeys = EntityRecordResource.GetKeyValuePairs(data);  
            const name = await md.GetEntityRecordName(data.Configuration.Entity, pKeys);
            const displayId = pKeys.length > 1 ? pKeys.map(p => p.Value).join(', ') : pKeys[0].Value;         
            return (name ? name : data.Configuration.Entity) + ` (${displayId})`;
        }
    }
}
