import {
    Component,
    ComponentRef,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    SimpleChanges,
    ViewChild,
    ViewContainerRef,
    inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { BaseEntity, LogError } from '@memberjunction/core';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';
import { BaseFormPanel } from './base-form-panel';
import { CollapseFormPanelRegistrations, FormContributionEntityMatches } from './form-contribution';
import { CollectFormContributionRegistrations } from './collect-form-contribution-registrations';
import { MountFormContribution } from './mount-form-contribution';
import { FormRecordRefreshCoordinator } from '../form-record-refresh.coordinator';

/**
 * `<mj-form-field-panel-slot>` — mounts the contributions that stand in for a field.
 *
 * A contribution can claim one field rather than a whole section. The panel then belongs
 * inside the section that held the field, at the top, so it reads as taking the field's
 * place rather than as a separate card elsewhere on the form. `<mj-collapsible-panel>`
 * renders one of these above its projected content and tells it which fields it holds; the
 * field itself stops drawing, which `FormContext.claimedFieldNames` handles.
 *
 * Distinct from `<mj-form-panel-slot>`, which selects by slot position. This one selects by
 * field, and its position is wherever the section is — there is no slot involved and no
 * fallback chain, because a claim on a field the form does not draw is simply not matched
 * by any section.
 */
@Component({
    standalone: false,
    selector: 'mj-form-field-panel-slot',
    template: `<ng-container #anchor></ng-container>`,
    styles: [`:host { display: contents; }`],
})
export class FormFieldPanelSlotComponent implements OnInit, OnChanges, OnDestroy {
    /** The entity name being edited. */
    @Input() Entity!: string;
    /** The fields this section draws — the set a contribution may claim from. */
    @Input() FieldNames: readonly string[] = [];
    /** The record being edited, threaded through to every mounted panel. */
    @Input() Record!: BaseEntity;
    /** The host form component. */
    @Input() FormComponent!: BaseFormComponent;
    /** Optional form context. */
    @Input() FormContext?: FormContext;

    @ViewChild('anchor', { read: ViewContainerRef, static: true })
    private anchor!: ViewContainerRef;

    private mounted: ComponentRef<BaseFormPanel>[] = [];
    private readonly destroy$ = new Subject<void>();
    private readonly recordRefresh = inject(FormRecordRefreshCoordinator, { optional: true });

    public ngOnInit(): void {
        this.recordRefresh?.Refreshed$.pipe(takeUntil(this.destroy$)).subscribe((record) => {
            for (const ref of this.mounted) ref.instance.OnRecordRefreshed(record);
        });
        try {
            InteractiveFormsEngine.Instance.Contributions$
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => this.remount());
        } catch {
            // No engine here — compiled registrations are the only source.
        }
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (!this.Entity || !this.Record || !this.FormComponent) return;
        const structural = ['Entity', 'FieldNames', 'Record', 'FormComponent'];
        const changed = structural.some((k) => changes[k] && changes[k].currentValue !== changes[k].previousValue);
        if (!changed && this.mounted.length > 0) {
            if (changes['FormContext']) {
                for (const ref of this.mounted) ref.instance.FormContext = this.FormContext;
            }
            return;
        }
        this.remount();
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.unmountAll();
    }

    /**
     * Registrations claiming one of this section's fields, mounted in place.
     *
     * A form that renders its own body composes nothing, so the check the slot host makes
     * applies here for the same reason.
     */
    private remount(): void {
        this.unmountAll();
        if (this.FormComponent?.OwnsEntireFormBody) return;
        const claims = this.claimsForFields();
        if (claims.length === 0) return;

        for (const reg of claims) {
            try {
                const ref = MountFormContribution(this.anchor, reg);
                if (!ref) continue;
                ref.instance.Record = this.Record;
                ref.instance.FormComponent = this.FormComponent;
                ref.instance.RegistrationMetadata = reg.Metadata;
                if (this.FormContext) ref.instance.FormContext = this.FormContext;
                this.FormComponent?.RegisterFormPanel?.(ref.instance);
                this.mounted.push(ref);
            } catch (e) {
                LogError(`[mj-form-field-panel-slot] Failed to mount a panel on ${this.Entity}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    /** The winning registrations whose claimed field this section draws, highest sort first. */
    private claimsForFields(): ReturnType<typeof CollapseFormPanelRegistrations> {
        const fields = new Set(this.FieldNames.filter((name) => !!name));
        if (fields.size === 0) return [];
        const all = CollectFormContributionRegistrations(
            this.Record?.EntityInfo ?? null, this.FormComponent?.ProviderToUse ?? null);
        const matching = all.filter((reg) => {
            if (!FormContributionEntityMatches(reg.Metadata?.entity, this.Entity)) return false;
            const field = reg.Metadata?.replacesFieldName?.trim();
            return !!field && fields.has(field);
        });
        const collapsed = CollapseFormPanelRegistrations(matching);
        collapsed.sort((a, b) => {
            const aSort = a.Metadata?.sortKey ?? 0;
            const bSort = b.Metadata?.sortKey ?? 0;
            if (aSort !== bSort) return bSort - aSort;
            return b.Priority - a.Priority;
        });
        return collapsed;
    }

    private unmountAll(): void {
        for (const ref of this.mounted) this.FormComponent?.UnregisterFormPanel?.(ref.instance);
        this.anchor.clear();
        this.mounted = [];
    }
}
