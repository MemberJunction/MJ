import { Component, ViewChild } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityInfo, IMetadataProvider, IsNewEntityRecordUrlId } from '@memberjunction/core';
import { EntityFormMode } from '@memberjunction/ng-base-forms';
import { FormModeFromQueryParams, FormModeQueryParams, ReconcileFormMode } from './record-form-mode';
import { SingleRecordComponent } from '../single-record/single-record.component';
@RegisterClass(BaseResourceComponent, 'RecordResource')
@Component({
  standalone: false,
    selector: 'mj-record-resource',
    styles: [`:host { display: block; height: 100%; width: 100%; }`],
    template: `<mj-single-record [PrimaryKey]="this.PrimaryKey" [entityName]="Data.Configuration.Entity" [newRecordValues]="Data.Configuration.NewRecordValues" [FormMode]="FormMode" (FormModeChange)="OnFormModeChange($event)" (loadComplete)="NotifyLoadComplete()" (recordSaved)="ResourceRecordSaved($event)" (recordDismissed)="NotifyCloseRequested()"></mj-single-record>`
})
export class EntityRecordResource extends BaseResourceComponent {
    @ViewChild(SingleRecordComponent) private singleRecord?: SingleRecordComponent;

    /** A record being edited must never be consumed as the region's temp tab. */
    public override IsEditing(): boolean {
        return this.singleRecord?.IsEditing() === true;
    }

    public get PrimaryKey(): CompositeKey {
        return EntityRecordResource.GetPrimaryKey(this.Data, this.ProviderToUse);
    }

    /**
     * Custom vs standard form (MJ#4755). The tab's `form` query param is the
     * source of truth — the URL, back/forward, tab re-focus and a cached
     * component all read it — and this tracks the mode actually on screen.
     */
    private _formMode: EntityFormMode = 'default';

    /** The mode bound to the form host: seeded from the tab's params, so a deep link mounts the standard form directly. */
    public get FormMode(): EntityFormMode {
        return this._formMode;
    }

    public override set Data(value: ResourceData) {
        super.Data = value;
        // Seed only before the form mounts: afterwards a changed input would
        // remount the host WITHOUT its unsaved-work guard. Later changes arrive
        // through OnQueryParamsChanged instead.
        if (!this.singleRecord) {
            this._formMode = FormModeFromQueryParams(this.GetQueryParams());
        }
    }
    public override get Data(): ResourceData {
        return super.Data;
    }

    /**
     * Follow the tab's `form` param — a standard-form open that dedup routed
     * to this tab, a deep link, back/forward, or a plain URL clearing it.
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        const result = ReconcileFormMode(params, this._formMode, this.singleRecord ?? null);
        this._formMode = result.Mode;
        const writeBack = result.WriteBack;
        if (writeBack) {
            // The switch was refused (unsaved work; the host warned the user):
            // put the URL back to what is on screen. Deferred a microtask because
            // UpdateQueryParams is suppressed for the whole delivery that called us.
            void Promise.resolve().then(() => this.UpdateQueryParams(writeBack));
        }
    }

    /** The user switched forms from the host's strip: record it on the tab (and so the URL). */
    public OnFormModeChange(mode: EntityFormMode): void {
        this._formMode = mode;
        this.UpdateQueryParams(FormModeQueryParams(mode));
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
