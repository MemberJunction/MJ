import { Component } from '@angular/core';
import { EmployeeRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeerole-form',
    templateUrl: './employeerole.form.component.html'
})
export class EmployeeRoleFormComponent extends BaseFormComponent {
    public record!: EmployeeRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityKeys', sectionName: 'Entity Keys', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadEmployeeRoleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
