import { Component } from '@angular/core';
import { OpportunityPartnerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityPartnerDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Partners') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitypartner-form',
    templateUrl: './opportunitypartner.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityPartnerFormComponent extends BaseFormComponent {
    public record!: OpportunityPartnerEntity;
} 

export function LoadOpportunityPartnerFormComponent() {
    LoadOpportunityPartnerDetailsComponent();
}
