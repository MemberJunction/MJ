import { Component } from '@angular/core';
import { OpportunityPartnerRoleTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityPartnerRoleTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Partner Role Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitypartnerroletype-form',
    templateUrl: './opportunitypartnerroletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityPartnerRoleTypeFormComponent extends BaseFormComponent {
    public record!: OpportunityPartnerRoleTypeEntity;
} 

export function LoadOpportunityPartnerRoleTypeFormComponent() {
    LoadOpportunityPartnerRoleTypeDetailsComponent();
}
