import { Component } from '@angular/core';
import { OpportunityTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitytype-form',
    templateUrl: './opportunitytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityTypeFormComponent extends BaseFormComponent {
    public record!: OpportunityTypeEntity;
} 

export function LoadOpportunityTypeFormComponent() {
    LoadOpportunityTypeDetailsComponent();
}
