import { Component } from '@angular/core';
import { AuthorizationRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAuthorizationRoleDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Authorization Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-authorizationrole-form',
    templateUrl: './authorizationrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuthorizationRoleFormComponent extends BaseFormComponent {
    public record!: AuthorizationRoleEntity;
} 

export function LoadAuthorizationRoleFormComponent() {
    LoadAuthorizationRoleDetailsComponent();
}
