import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
import { BaseFormComponent } from '../base-form-component';
import { FormContext } from '../types/form-types';
import { CollectFormPanelRegistrations } from './collect-form-panel-registrations';
import {
    ResolveFormContributions,
    type FormContributionWinner,
} from './form-contribution';

/**
 * Fills in related-entity grids that the form template did not bake and that
 * no registered panel claimed. Lives in `<mj-record-form-container>` so every
 * generated and custom form that uses the container picks it up.
 *
 * Claimed / extra panels still mount via `<mj-form-panel-slot>` — this host
 * does not remount those (avoids doubles).
 */
@Component({
    standalone: false,
    selector: 'mj-form-contributions',
    template: `
        @for (grid of StockGrids; track grid.ContributionKey) {
            <mj-related-entity-grid-panel
                [Contribution]="grid"
                [Record]="Record"
                [FormComponent]="FormComponent"
                [FormContext]="FormContext">
            </mj-related-entity-grid-panel>
        }
    `,
    styles: [`:host { display: contents; }`],
})
export class FormContributionsComponent implements OnChanges {
    @Input() Record!: BaseEntity;
    @Input() FormComponent!: BaseFormComponent;
    @Input() FormContext?: FormContext;
    @Input() BakedSectionKeys: string[] = [];
    @Input() ShowRelatedEntities = true;

    public StockGrids: FormContributionWinner[] = [];

    public ngOnChanges(changes: SimpleChanges): void {
        const keys = ['Record', 'FormComponent', 'BakedSectionKeys', 'ShowRelatedEntities'];
        const meaningful = keys.some((k) => changes[k] && changes[k].currentValue !== changes[k].previousValue);
        if (!meaningful && this.StockGrids.length > 0) return;
        this.refresh();
    }

    private refresh(): void {
        if (!this.Record?.EntityInfo || !this.FormComponent) {
            this.StockGrids = [];
            return;
        }
        const entity = this.Record.EntityInfo;
        const resolved = ResolveFormContributions({
            EntityName: entity.Name,
            RelatedEntities: entity.RelatedEntities,
            IsaChildEntityIDs: entity.ChildEntities.map((child) => child.ID),
            Registrations: CollectFormPanelRegistrations(),
            BakedSectionKeys: this.BakedSectionKeys,
            ShowRelatedEntities: this.ShowRelatedEntities,
        });
        this.StockGrids = resolved.StockGrids;
    }
}
