import { Component } from '@angular/core';
import { OpportunitySellingRoleTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunitySellingRoleTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Selling Role Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitysellingroletype-form',
    templateUrl: './opportunitysellingroletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunitySellingRoleTypeFormComponent extends BaseFormComponent {
    public record!: OpportunitySellingRoleTypeEntity;
} 

export function LoadOpportunitySellingRoleTypeFormComponent() {
    LoadOpportunitySellingRoleTypeDetailsComponent();
}
