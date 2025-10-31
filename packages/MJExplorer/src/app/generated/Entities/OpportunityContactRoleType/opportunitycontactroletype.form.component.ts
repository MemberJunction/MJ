import { Component } from '@angular/core';
import { OpportunityContactRoleTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityContactRoleTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Contact Role Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitycontactroletype-form',
    templateUrl: './opportunitycontactroletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityContactRoleTypeFormComponent extends BaseFormComponent {
    public record!: OpportunityContactRoleTypeEntity;
} 

export function LoadOpportunityContactRoleTypeFormComponent() {
    LoadOpportunityContactRoleTypeDetailsComponent();
}
