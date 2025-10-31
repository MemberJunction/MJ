import { Component } from '@angular/core';
import { MembershipApplicationDefinitionProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipApplicationDefinitionProductDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Membership Application Definition Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershipapplicationdefinitionproduct-form',
    templateUrl: './membershipapplicationdefinitionproduct.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipApplicationDefinitionProductFormComponent extends BaseFormComponent {
    public record!: MembershipApplicationDefinitionProductEntity;
} 

export function LoadMembershipApplicationDefinitionProductFormComponent() {
    LoadMembershipApplicationDefinitionProductDetailsComponent();
}
