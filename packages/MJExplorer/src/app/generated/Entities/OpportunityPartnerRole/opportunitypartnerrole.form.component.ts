import { Component } from '@angular/core';
import { OpportunityPartnerRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityPartnerRoleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Partner Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitypartnerrole-form',
    templateUrl: './opportunitypartnerrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityPartnerRoleFormComponent extends BaseFormComponent {
    public record!: OpportunityPartnerRoleEntity;
} 

export function LoadOpportunityPartnerRoleFormComponent() {
    LoadOpportunityPartnerRoleDetailsComponent();
}
