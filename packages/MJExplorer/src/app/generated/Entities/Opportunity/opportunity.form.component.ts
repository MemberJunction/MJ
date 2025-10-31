import { Component } from '@angular/core';
import { OpportunityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunity-form',
    templateUrl: './opportunity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityFormComponent extends BaseFormComponent {
    public record!: OpportunityEntity;
} 

export function LoadOpportunityFormComponent() {
    LoadOpportunityDetailsComponent();
}
