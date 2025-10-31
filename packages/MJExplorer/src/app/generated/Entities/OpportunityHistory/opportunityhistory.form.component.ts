import { Component } from '@angular/core';
import { OpportunityHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityHistoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunityhistory-form',
    templateUrl: './opportunityhistory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityHistoryFormComponent extends BaseFormComponent {
    public record!: OpportunityHistoryEntity;
} 

export function LoadOpportunityHistoryFormComponent() {
    LoadOpportunityHistoryDetailsComponent();
}
