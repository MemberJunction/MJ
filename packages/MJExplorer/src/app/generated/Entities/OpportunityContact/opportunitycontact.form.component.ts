import { Component } from '@angular/core';
import { OpportunityContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityContactDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitycontact-form',
    templateUrl: './opportunitycontact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityContactFormComponent extends BaseFormComponent {
    public record!: OpportunityContactEntity;
} 

export function LoadOpportunityContactFormComponent() {
    LoadOpportunityContactDetailsComponent();
}
