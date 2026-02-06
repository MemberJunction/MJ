import { Component } from '@angular/core';
import { EmployeeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Employees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-employee-form',
    templateUrl: './employee.form.component.html'
})
export class EmployeeFormComponent extends BaseFormComponent {
    public record!: EmployeeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'personalContact', sectionName: 'Personal & Contact', isExpanded: true },
            { sectionKey: 'employmentDetails', sectionName: 'Employment Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'employeeCompanyIntegrations', sectionName: 'Employee Company Integrations', isExpanded: false },
            { sectionKey: 'employeeRoles', sectionName: 'Employee Roles', isExpanded: false },
            { sectionKey: 'employeeSkills', sectionName: 'Employee Skills', isExpanded: false },
            { sectionKey: 'directReports', sectionName: 'Direct Reports', isExpanded: false },
            { sectionKey: 'users', sectionName: 'Users', isExpanded: false }
        ]);
    }
}

export function LoadEmployeeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
