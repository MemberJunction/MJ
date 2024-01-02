import { Component } from '@angular/core';
import { AuthorizationRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadAuthorizationRoleDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Authorization Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-authorizationrole-form',
    templateUrl: './authorizationrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuthorizationRoleFormComponent extends BaseFormComponent {
    public record: AuthorizationRoleEntity | null = null;
} 

export function LoadAuthorizationRoleFormComponent() {
    LoadAuthorizationRoleDetailsComponent();
}
