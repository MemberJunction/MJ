import { Component } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';

export function LoadRecordResource() {
    const test = new EntityRecordResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Records')
@Component({
    selector: 'mj-record-resource',
    template: `<mj-single-record [CompositeKey]="this.CompositeKey" [entityName]="Data.Configuration.Entity" (loadComplete)="NotifyLoadComplete()" mjFillContainer></mj-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    public get CompositeKey(): CompositeKey {
        return EntityRecordResource.GetCompositeKey(this.Data);
    }

    public static GetCompositeKey(data: ResourceData): CompositeKey {
        const md = new Metadata();
        const e = md.Entities.find(e => e.Name.trim().toLowerCase() === data.Configuration.Entity.trim().toLowerCase());
        if (!e){
            throw new Error(`Entity ${data.Configuration.Entity} not found in metadata`);
        }

        let compositeKey: CompositeKey = new CompositeKey();
        compositeKey.LoadFromURLSegment(e, data.ResourceRecordID);
        return compositeKey;
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (!data.Configuration.Entity){
            return ''
        }
        else {
            const md = new Metadata();
            let compositeKey: CompositeKey = new CompositeKey();
            compositeKey = EntityRecordResource.GetCompositeKey(data);
            const name = await md.GetEntityRecordName(data.Configuration.Entity, compositeKey);
            const displayId = compositeKey.KeyValuePairs.length > 1 ? compositeKey.Values() : compositeKey.KeyValuePairs[0].Value;         
            return (name ? name : data.Configuration.Entity) + ` (${displayId})`;
        }
    }
}
