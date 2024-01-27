import { Component } from '@angular/core';
import { EmployeeRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEmployeeRoleDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Employee Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeerole-form',
    templateUrl: './employeerole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeRoleFormComponent extends BaseFormComponent {
    public record!: EmployeeRoleEntity;
} 

export function LoadEmployeeRoleFormComponent() {
    LoadEmployeeRoleDetailsComponent();
}
