import { Component } from '@angular/core';
import { UserRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadUserRoleDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'User Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userrole-form',
    templateUrl: './userrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserRoleFormComponent extends BaseFormComponent {
    public record!: UserRoleEntity;
} 

export function LoadUserRoleFormComponent() {
    LoadUserRoleDetailsComponent();
}
