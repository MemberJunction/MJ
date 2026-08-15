import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
    DEFAULT_AUTO_LEFT_NAV_AT,
    DEFAULT_PRIMARY_RELATED_BUDGET,
    ResolveRelatedFormRoles,
    type FormLayout,
    type IEntityFormConfiguration,
    type RelatedFormRoleAssignment,
    type RelatedFormRoleCandidate,
    type RelatedRolePolicy,
} from '@memberjunction/core';

/**
 * First-class editor + ranker preview for {@link IEntityFormConfiguration}.
 * Used on the Entities explorer Settings section.
 */
@Component({
    standalone: false,
    selector: 'mj-entity-form-chrome-editor',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './entity-form-chrome-editor.component.html',
    styleUrls: ['./entity-form-chrome-editor.component.css'],
})
export class EntityFormChromeEditorComponent {
    @Input() FormConfig: IEntityFormConfiguration | null = null;
    @Input() ParentSchemaName = '';
    @Input() Candidates: RelatedFormRoleCandidate[] = [];
    @Input() EditMode = false;
    @Output() FormConfigChange = new EventEmitter<IEntityFormConfiguration>();

    public readonly LayoutOptions: { text: string; value: FormLayout }[] = [
        { text: 'Auto (accordion, then left-nav)', value: 'auto' },
        { text: 'Accordion', value: 'accordion' },
        { text: 'Left nav', value: 'left-nav' },
    ];

    public readonly PolicyOptions: { text: string; value: RelatedRolePolicy }[] = [
        { text: 'Smart (budgeted ranker)', value: 'smart' },
        { text: 'Keep all primary (today)', value: 'keep-all-primary' },
    ];

    public get Layout(): FormLayout {
        return this.FormConfig?.Layout ?? 'auto';
    }

    public get Policy(): RelatedRolePolicy {
        return this.FormConfig?.RelatedRolePolicy ?? 'smart';
    }

    public get Budget(): number {
        return this.FormConfig?.PrimaryRelatedBudget ?? DEFAULT_PRIMARY_RELATED_BUDGET;
    }

    public get AutoLeftNavAt(): number {
        return this.FormConfig?.AutoLeftNavAt ?? DEFAULT_AUTO_LEFT_NAV_AT;
    }

    public get Assignments(): RelatedFormRoleAssignment[] {
        return ResolveRelatedFormRoles(this.ParentSchemaName, this.FormConfig, this.Candidates).Assignments;
    }

    public get PrimaryCount(): number {
        return this.Assignments.filter((a) => a.Role === 'Primary').length;
    }

    public get DetailCount(): number {
        return this.Assignments.filter((a) => a.Role === 'Detail').length;
    }

    public OnLayoutChange(value: FormLayout | unknown): void {
        if (value === 'accordion' || value === 'left-nav' || value === 'auto') {
            this.patch({ Layout: value });
        }
    }

    public OnPolicyChange(value: RelatedRolePolicy | unknown): void {
        if (value === 'smart' || value === 'keep-all-primary') {
            this.patch({ RelatedRolePolicy: value });
        }
    }

    public OnBudgetChange(value: number | unknown): void {
        if (typeof value === 'number' && Number.isFinite(value)) {
            this.patch({ PrimaryRelatedBudget: value });
        }
    }

    public OnThresholdChange(value: number | unknown): void {
        if (typeof value === 'number' && Number.isFinite(value)) {
            this.patch({ AutoLeftNavAt: value });
        }
    }

    private patch(partial: IEntityFormConfiguration): void {
        this.FormConfigChange.emit({ ...(this.FormConfig ?? {}), ...partial });
    }
}
