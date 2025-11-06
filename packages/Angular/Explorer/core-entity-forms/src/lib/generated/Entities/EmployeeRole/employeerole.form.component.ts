import { Component } from '@angular/core';
import { EmployeeRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeerole-form',
    templateUrl: './employeerole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeRoleFormComponent extends BaseFormComponent {
    public record!: EmployeeRoleEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEmployeeRoleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
