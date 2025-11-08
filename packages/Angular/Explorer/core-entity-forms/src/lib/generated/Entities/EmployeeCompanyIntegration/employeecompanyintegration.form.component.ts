import { Component } from '@angular/core';
import { EmployeeCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Company Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeecompanyintegration-form',
    templateUrl: './employeecompanyintegration.form.component.html'
})
export class EmployeeCompanyIntegrationFormComponent extends BaseFormComponent {
    public record!: EmployeeCompanyIntegrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationMapping', sectionName: 'Integration Mapping', isExpanded: true },
            { sectionKey: 'externalIdentifier', sectionName: 'External Identifier', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadEmployeeCompanyIntegrationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
