import { Component } from '@angular/core';
import { MembershipApplicationDefinitionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipApplicationDefinitionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Membership Application Definitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershipapplicationdefinition-form',
    templateUrl: './membershipapplicationdefinition.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipApplicationDefinitionFormComponent extends BaseFormComponent {
    public record!: MembershipApplicationDefinitionEntity;
} 

export function LoadMembershipApplicationDefinitionFormComponent() {
    LoadMembershipApplicationDefinitionDetailsComponent();
}
