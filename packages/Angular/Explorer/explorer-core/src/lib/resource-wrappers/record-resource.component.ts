import { Component, ViewChild } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, CompositeKey, EntityInfo, IMetadataProvider, IsNewEntityRecordUrlId, LogError } from '@memberjunction/core';
import { take } from 'rxjs/operators';
import { EntityFormMode } from '@memberjunction/ng-base-forms';
import { FormModeFromQueryParams, FormModeQueryParams, IsRecordTabOwner, ReconcileFormMode } from './record-form-mode';
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

    private destroyed = false;

    public override ngOnDestroy(): void {
        this.destroyed = true;
        super.ngOnDestroy();
    }

    /**
     * Follow the tab's `form` param — a standard-form open that dedup routed
     * to this tab, a deep link, back/forward, or a plain URL clearing it.
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        this.applyFormModeParams(params);
    }

    /**
     * Re-home after a cache reattach. A reattach to a DIFFERENT tab id replays
     * that tab's params in the base class. A same-id reattach does not — and
     * a delivery this component skipped while its tab hosted another record
     * (see {@link applyFormModeParams}) is recorded as delivered, so it would
     * never come again. Re-read the live params in that case.
     */
    public override RebindTabId(tabId: string): void {
        const sameTab = this.getTabId() === tabId;
        super.RebindTabId(tabId);
        if (sameTab) {
            this.resyncFormModeFromTab();
        }
    }

    /**
     * The host switched forms and told us: the strip, a programmatic
     * {@link SingleRecordComponent.SwitchFormMode} (including our own, from
     * {@link applyFormModeParams}), or an interactive-variant pick (back to
     * default). Record it on the tab, and so the URL. For our own switch this
     * runs inside a query-param delivery, where UpdateQueryParams is suppressed
     * — correct, since the tab already says it, and it cannot loop.
     */
    public OnFormModeChange(mode: EntityFormMode): void {
        this._formMode = mode;
        this.UpdateQueryParams(FormModeQueryParams(mode));
    }

    /**
     * Reconcile the mounted form with a tab's `form` param. Ignored unless this
     * component still owns its tab: a cached (detached) record stays subscribed
     * to its birth tab id, which may now host another record — whose params
     * would otherwise reload this form in the background or raise a spurious
     * "save or discard" warning.
     */
    private applyFormModeParams(params: Record<string, string>): void {
        if (!this.ownsTab()) return;
        const result = ReconcileFormMode(params, this._formMode, this.singleRecord ?? null);
        this._formMode = result.Mode;
        if (result.WriteBack) {
            this.writeBackRefusedMode(result.WriteBack);
        }
    }

    /**
     * The switch was refused (unsaved work; the host warned the user): put the
     * URL back to what is on screen. Deferred a microtask because
     * UpdateQueryParams is suppressed for the whole delivery that called us;
     * re-checked then, since the component may be gone or its tab reused.
     */
    private writeBackRefusedMode(writeBack: Record<string, string | null>): void {
        Promise.resolve()
            .then(() => {
                if (!this.destroyed && this.ownsTab()) {
                    this.UpdateQueryParams(writeBack);
                }
            })
            .catch((err: unknown) => {
                LogError(`EntityRecordResource: could not restore the form-mode query param for "${this.Data?.Configuration?.Entity}" (tab ${this.getTabId()}): ${err instanceof Error ? err.message : String(err)}`);
            });
    }

    /** Re-read the live tab's params and reconcile (same-id cache reattach). */
    private resyncFormModeFromTab(): void {
        const tabId = this.getTabId();
        if (!tabId) return;
        // The workspace stream replays its current value on subscribe, so take(1) is a synchronous read.
        this.navigationService.ObserveTabQueryParams(tabId)
            .pipe(take(1))
            .subscribe(params => this.applyFormModeParams(params));
    }

    /** Whether the live tab still hosts this component's record. */
    private ownsTab(): boolean {
        const tabId = this.getTabId();
        if (!tabId) return false;
        return IsRecordTabOwner(
            this.navigationService.GetTabRecordIdentity(tabId),
            { Entity: this.Data?.Configuration?.Entity, RecordId: this.Data?.ResourceRecordID || this.Data?.Configuration?.recordId || '' }
        );
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
