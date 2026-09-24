import { Component, Input } from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
import type { AfterDataLoadEventArgs } from '@memberjunction/ng-entity-viewer';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';
import type { FormContributionWinner } from './form-contribution';
import { SlotDisplayOrder } from './slot-order';

/**
 * Stock related-entity grid the composer mounts when a DisplayInForm
 * relationship is neither baked into the form template nor claimed by a
 * registered panel. Mirrors the CodeGen EntityDataGrid template.
 */
@Component({
    standalone: false,
    selector: 'mj-related-entity-grid-panel',
    template: `
        <mj-collapsible-panel
            [SectionKey]="Contribution.BakedSectionKey"
            [Order]="DisplayOrder"
            [SectionName]="Contribution.DisplayName"
            [Icon]="GridIcon"
            Variant="related-entity"
            [Form]="FormComponent"
            [FormContext]="FormContext"
            [DefaultExpanded]="false">
            @if (Record.IsSaved) {
                <mj-explorer-entity-data-grid
                    [Params]="FormComponent.BuildRelationshipViewParamsByEntityName(Contribution.RelatedEntity!, Contribution.RelatedJoinField)"
                    [NewRecordValues]="FormComponent.NewRecordValues(Contribution.RelatedEntity!, Contribution.RelatedJoinField)"
                    [AllowLoad]="FormComponent.IsSectionExpanded(Contribution.BakedSectionKey)"
                    [ShowToolbar]="true"
                    (Navigate)="FormComponent.OnFormNavigate($event)"
                    (AfterDataLoad)="onDataLoad($event)">
                </mj-explorer-entity-data-grid>
            }
        </mj-collapsible-panel>
    `,
    styles: [`:host { display: contents; }`],
})
export class RelatedEntityGridPanelComponent {
    /** Sits with the related grids rather than after the field sections. */
    public get DisplayOrder(): number {
        return SlotDisplayOrder('after-related', this.Contribution.SortKey ?? 0);
    }

    @Input() Contribution!: FormContributionWinner;
    @Input() Record!: BaseEntity;
    @Input() FormComponent!: BaseFormComponent;
    @Input() FormContext?: FormContext;

    public OnDataLoad(event: AfterDataLoadEventArgs): void {
        this.FormComponent.SetSectionRowCount(this.Contribution.BakedSectionKey, event.totalRowCount);
    }

    /** @deprecated Use {@link OnDataLoad}. */
    public onDataLoad(event: AfterDataLoadEventArgs): void {
        return this.OnDataLoad(event);
    }

    public get GridIcon(): string {
        const name = this.Contribution.RelatedEntity;
        if (!name) return 'fa fa-table';
        const icon = this.FormComponent.ProviderToUse.EntityByName(name)?.Icon?.trim();
        return icon || 'fa fa-table';
    }
}
