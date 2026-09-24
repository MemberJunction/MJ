import { Component, ViewChild } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityInfo, IMetadataProvider, IsNewEntityRecordUrlId } from '@memberjunction/core';
import { SingleRecordComponent } from '../single-record/single-record.component';
import type { FormCompositionSnapshot } from '@memberjunction/ng-base-forms';
@RegisterClass(BaseResourceComponent, 'RecordResource')
@Component({
  standalone: false,
    selector: 'mj-record-resource',
    styles: [`:host { display: block; height: 100%; width: 100%; }`],
    template: `<mj-single-record [PrimaryKey]="this.PrimaryKey" [entityName]="Data.Configuration.Entity" [newRecordValues]="Data.Configuration.NewRecordValues" (loadComplete)="NotifyLoadComplete()" (recordSaved)="ResourceRecordSaved($event)" (recordDismissed)="NotifyCloseRequested()" (CompositionChanged)="OnCompositionChanged($event)"></mj-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    @ViewChild(SingleRecordComponent) private singleRecord?: SingleRecordComponent;

    /** A record being edited must never be consumed as the region's temp tab. */
    public override IsEditing(): boolean {
        return this.singleRecord?.IsEditing() === true;
    }

    /**
     * Publish the form's composition to the agent context, so an agent asked to build a
     * panel for this record knows what the form already shows — its sections, its related
     * grids, the contributions on it, and the slots it emits.
     *
     * The shell folds this into `AppContextSnapshot.AdditionalContext` and assigns that
     * wholesale, so the last publisher wins app-wide. That fails safe: another surface's
     * publish drops the Form key and an agent simply has no form context. `ComponentCacheManager`
     * caches each component's reported context and restores it on reactivation, so switching
     * back to a record tab re-publishes this snapshot without extra plumbing.
     */
    public OnCompositionChanged(snapshot: FormCompositionSnapshot): void {
        this.navigationService.SetAgentContext(this, { Form: snapshot });
    }

    public get PrimaryKey(): CompositeKey {
        return EntityRecordResource.GetPrimaryKey(this.Data, this.ProviderToUse);
    }

    public static GetPrimaryKey(data: ResourceData, provider?: IMetadataProvider): CompositeKey {
        // global-provider-ok: static helper has no component instance scope; falls back to default provider
        const md = (provider ?? Metadata.Provider) as IMetadataProvider;
        const requested = (data.Configuration.Entity ?? '').trim();
        // Prefer EntityByName (project rule: never use Entities.find for
        // single-entity lookups — case/whitespace tolerant + O(1) map). Fall
        // back to DisplayName match for callers (AI agents, hand-typed URLs,
        // external CTAs) that pass the human-readable display name instead
        // of the canonical Name (e.g. "Users" for "MJ: Users").
        let e: EntityInfo | undefined = md.EntityByName(requested);
        if (!e) {
            const lowered = requested.toLowerCase();
            e = md.Entities.find((x: EntityInfo) =>
                (x.DisplayName ?? '').trim().toLowerCase() === lowered);
        }
        if (!e){
            throw new Error(`Entity ${data.Configuration.Entity} not found in metadata (tried Name and DisplayName)`);
        }

        if (IsNewEntityRecordUrlId(data.ResourceRecordID)) {
            return new CompositeKey();
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
        let e = md.EntityByName(data.Configuration.Entity);
        if (!e) {
            // Same DisplayName fallback as GetPrimaryKey — keeps the
            // breadcrumb/title in sync when a CTA used the display name.
            const lowered = (data.Configuration.Entity ?? '').trim().toLowerCase();
            e = md.Entities.find((x: EntityInfo) =>
                (x.DisplayName ?? '').trim().toLowerCase() === lowered);
        }
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
