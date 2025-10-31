import { Component } from '@angular/core';
import { OpportunityDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitydetail-form',
    templateUrl: './opportunitydetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityDetailFormComponent extends BaseFormComponent {
    public record!: OpportunityDetailEntity;
} 

export function LoadOpportunityDetailFormComponent() {
    LoadOpportunityDetailDetailsComponent();
}
