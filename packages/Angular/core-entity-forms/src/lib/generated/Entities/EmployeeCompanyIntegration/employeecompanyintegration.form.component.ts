import { Component } from '@angular/core';
import { EmployeeCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEmployeeCompanyIntegrationDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Employee Company Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeecompanyintegration-form',
    templateUrl: './employeecompanyintegration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeCompanyIntegrationFormComponent extends BaseFormComponent {
    public record!: EmployeeCompanyIntegrationEntity;
} 

export function LoadEmployeeCompanyIntegrationFormComponent() {
    LoadEmployeeCompanyIntegrationDetailsComponent();
}
