import { Component } from '@angular/core';
import { OpportunityStatusReportEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityStatusReportDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Status Reports') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitystatusreport-form',
    templateUrl: './opportunitystatusreport.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityStatusReportFormComponent extends BaseFormComponent {
    public record!: OpportunityStatusReportEntity;
} 

export function LoadOpportunityStatusReportFormComponent() {
    LoadOpportunityStatusReportDetailsComponent();
}
