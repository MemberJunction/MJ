import { Component } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityInfo, IMetadataProvider } from '@memberjunction/core';
@RegisterClass(BaseResourceComponent, 'RecordResource')
@Component({
  standalone: false,
    selector: 'mj-record-resource',
    styles: [`:host { display: block; height: 100%; width: 100%; }`],
    template: `<mj-single-record [PrimaryKey]="this.PrimaryKey" [entityName]="Data.Configuration.Entity" [newRecordValues]="Data.Configuration.NewRecordValues" (loadComplete)="NotifyLoadComplete()" (recordSaved)="ResourceRecordSaved($event)" ></mj-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    public get PrimaryKey(): CompositeKey {
        return EntityRecordResource.GetPrimaryKey(this.Data, this.ProviderToUse);
    }

    public static GetPrimaryKey(data: ResourceData, provider?: IMetadataProvider): CompositeKey {
        // global-provider-ok: static helper has no component instance scope; falls back to default provider
        const md = (provider ?? Metadata.Provider) as IMetadataProvider;
        const e = md.Entities.find((e: EntityInfo) => e.Name.trim().toLowerCase() === data.Configuration.Entity.trim().toLowerCase());
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

        const md = this.ProviderToUse;
        const e = md.EntityByName(data.Configuration.Entity);
        if (!e) {
            return '';
        }

        const pk: CompositeKey = EntityRecordResource.GetPrimaryKey(data, this.ProviderToUse);
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
            const md = this.ProviderToUse;
            const e = md.Entities.find(e => e.Name.trim().toLowerCase() === data.Configuration.Entity.trim().toLowerCase());
            if (e)
                return e?.Icon;
            else
                return '';
        }
    }
}
