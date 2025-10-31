import { Component } from '@angular/core';
import { OpportunityCompetitorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityCompetitorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Competitors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitycompetitor-form',
    templateUrl: './opportunitycompetitor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityCompetitorFormComponent extends BaseFormComponent {
    public record!: OpportunityCompetitorEntity;
} 

export function LoadOpportunityCompetitorFormComponent() {
    LoadOpportunityCompetitorDetailsComponent();
}
