import { Component } from '@angular/core';
import { FunctionRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFunctionRoleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Function Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-functionrole-form',
    templateUrl: './functionrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FunctionRoleFormComponent extends BaseFormComponent {
    public record!: FunctionRoleEntity;
} 

export function LoadFunctionRoleFormComponent() {
    LoadFunctionRoleDetailsComponent();
}
