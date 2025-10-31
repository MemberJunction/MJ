import { Component } from '@angular/core';
import { OpportunityStageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityStageDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Stages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitystage-form',
    templateUrl: './opportunitystage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityStageFormComponent extends BaseFormComponent {
    public record!: OpportunityStageEntity;
} 

export function LoadOpportunityStageFormComponent() {
    LoadOpportunityStageDetailsComponent();
}
