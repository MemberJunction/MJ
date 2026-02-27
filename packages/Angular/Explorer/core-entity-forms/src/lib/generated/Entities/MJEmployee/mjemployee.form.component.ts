import { Component } from '@angular/core';
import { MJEmployeeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Employees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjemployee-form',
    templateUrl: './mjemployee.form.component.html'
})
export class MJEmployeeFormComponent extends BaseFormComponent {
    public record!: MJEmployeeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'personalContact', sectionName: 'Personal & Contact', isExpanded: true },
            { sectionKey: 'employmentDetails', sectionName: 'Employment Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEmployeeCompanyIntegrations', sectionName: 'Employee Company Integrations', isExpanded: false },
            { sectionKey: 'mJEmployeeRoles', sectionName: 'Employee Roles', isExpanded: false },
            { sectionKey: 'mJEmployeeSkills', sectionName: 'Employee Skills', isExpanded: false },
            { sectionKey: 'mJEmployees', sectionName: 'Direct Reports', isExpanded: false },
            { sectionKey: 'mJUsers', sectionName: 'Users', isExpanded: false }
        ]);
    }
}

