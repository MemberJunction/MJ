import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';
@RegisterClass(BaseResourceComponent, 'RecordResource')
@Component({
  standalone: false,
    selector: 'mj-record-resource',
    template: `<mj-single-record [PrimaryKey]="this.PrimaryKey" [entityName]="Data.Configuration.Entity" [newRecordValues]="Data.Configuration.NewRecordValues" (loadComplete)="NotifyLoadComplete()" (recordSaved)="ResourceRecordSaved($event)" ></mj-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    public get PrimaryKey(): CompositeKey {
        return EntityRecordResource.GetPrimaryKey(this.Data);
    }

    public static GetPrimaryKey(data: ResourceData): CompositeKey {
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
        if (!data.Configuration.Entity) {
            return '';
        }

        const md = new Metadata();
        const e = md.EntityByName(data.Configuration.Entity);
        if (!e) {
            return '';
        }

        const pk: CompositeKey = EntityRecordResource.GetPrimaryKey(data);
        if (pk.HasValue) {
            const name = await md.GetEntityRecordName(data.Configuration.Entity, pk);
            return name ? name : e.DisplayNameOrName;
        } else {
            return `New ${e.DisplayNameOrName} Record`;
        }
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        if (!data.Configuration.Entity){
            return ''
        }
        else {
            const md = new Metadata();
            const e = md.Entities.find(e => e.Name.trim().toLowerCase() === data.Configuration.Entity.trim().toLowerCase());
            if (e)
                return e?.Icon;
            else
                return '';
        }
    }
}
