import { Component } from '@angular/core';
import { EmployeePositionCodesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEmployeePositionCodesDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Employee Position Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeepositioncodes-form',
    templateUrl: './employeepositioncodes.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeePositionCodesFormComponent extends BaseFormComponent {
    public record!: EmployeePositionCodesEntity;
} 

export function LoadEmployeePositionCodesFormComponent() {
    LoadEmployeePositionCodesDetailsComponent();
}
