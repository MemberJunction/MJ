import { Component } from '@angular/core';
import { EmployeeSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Employee Skills') // Tell MemberJunction about this class
@Component({
    selector: 'gen-employeeskill-form',
    templateUrl: './employeeskill.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EmployeeSkillFormComponent extends BaseFormComponent {
    public record!: EmployeeSkillEntity;

    // Collapsible section state
    public sectionsExpanded = {
        skillAssignment: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadEmployeeSkillFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
