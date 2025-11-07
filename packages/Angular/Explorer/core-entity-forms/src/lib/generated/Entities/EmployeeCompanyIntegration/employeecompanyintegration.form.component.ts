import { Component } from '@angular/core';
import { EmployeeCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Company Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeecompanyintegration-form',
    templateUrl: './employeecompanyintegration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeCompanyIntegrationFormComponent extends BaseFormComponent {
    public record!: EmployeeCompanyIntegrationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        integrationMapping: true,
        externalIdentifier: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEmployeeCompanyIntegrationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
