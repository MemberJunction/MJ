import { Component } from '@angular/core';
import { OpportunityReferenceTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityReferenceTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Reference Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunityreferencetype-form',
    templateUrl: './opportunityreferencetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityReferenceTypeFormComponent extends BaseFormComponent {
    public record!: OpportunityReferenceTypeEntity;
} 

export function LoadOpportunityReferenceTypeFormComponent() {
    LoadOpportunityReferenceTypeDetailsComponent();
}
