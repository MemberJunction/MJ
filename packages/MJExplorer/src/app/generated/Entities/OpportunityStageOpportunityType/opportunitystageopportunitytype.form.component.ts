import { Component } from '@angular/core';
import { OpportunityStageOpportunityTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityStageOpportunityTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Stage Opportunity Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitystageopportunitytype-form',
    templateUrl: './opportunitystageopportunitytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityStageOpportunityTypeFormComponent extends BaseFormComponent {
    public record!: OpportunityStageOpportunityTypeEntity;
} 

export function LoadOpportunityStageOpportunityTypeFormComponent() {
    LoadOpportunityStageOpportunityTypeDetailsComponent();
}
