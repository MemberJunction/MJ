import { Component } from '@angular/core';
import { OpportunityRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOpportunityRoleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Opportunity Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-opportunityrole-form',
    templateUrl: './opportunityrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OpportunityRoleFormComponent extends BaseFormComponent {
    public record!: OpportunityRoleEntity;
} 

export function LoadOpportunityRoleFormComponent() {
    LoadOpportunityRoleDetailsComponent();
}
