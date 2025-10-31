import { Component } from '@angular/core';
import { OpportunitySourceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunitySourceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Opportunity Sources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunitysource-form',
    templateUrl: './opportunitysource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunitySourceFormComponent extends BaseFormComponent {
    public record!: OpportunitySourceEntity;
} 

export function LoadOpportunitySourceFormComponent() {
    LoadOpportunitySourceDetailsComponent();
}
