import { Component } from '@angular/core';
import { RoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRoleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-role-form',
    templateUrl: './role.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RoleFormComponent extends BaseFormComponent {
    public record!: RoleEntity;
} 

export function LoadRoleFormComponent() {
    LoadRoleDetailsComponent();
}
