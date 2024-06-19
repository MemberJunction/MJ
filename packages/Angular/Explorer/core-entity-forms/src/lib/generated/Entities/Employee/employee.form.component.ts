import { Component } from '@angular/core';
import { EmployeeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEmployeeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Employees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employee-form',
    templateUrl: './employee.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeFormComponent extends BaseFormComponent {
    public record!: EmployeeEntity;
} 

export function LoadEmployeeFormComponent() {
    LoadEmployeeDetailsComponent();
}
