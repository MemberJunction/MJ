import { Component } from '@angular/core';
import { EmployeeRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-employeerole-form',
    templateUrl: './employeerole.form.component.html'
})
export class EmployeeRoleFormComponent extends BaseFormComponent {
    public record!: EmployeeRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityKeys', sectionName: 'Entity Keys', isExpanded: true },
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

