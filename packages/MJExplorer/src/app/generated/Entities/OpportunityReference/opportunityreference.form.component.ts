import { Component } from '@angular/core';
import { OpportunityReferenceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityReferenceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity References') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunityreference-form',
    templateUrl: './opportunityreference.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityReferenceFormComponent extends BaseFormComponent {
    public record!: OpportunityReferenceEntity;
} 

export function LoadOpportunityReferenceFormComponent() {
    LoadOpportunityReferenceDetailsComponent();
}
