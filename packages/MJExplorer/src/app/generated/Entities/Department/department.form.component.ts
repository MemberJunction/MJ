import { Component } from '@angular/core';
import { DepartmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDepartmentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Departments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-department-form',
    templateUrl: './department.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DepartmentFormComponent extends BaseFormComponent {
    public record!: DepartmentEntity;
} 

export function LoadDepartmentFormComponent() {
    LoadDepartmentDetailsComponent();
}
