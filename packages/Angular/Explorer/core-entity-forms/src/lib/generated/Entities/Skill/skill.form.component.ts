import { Component } from '@angular/core';
import { SkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Skills') // Tell MemberJunction about this class
@Component({
    selector: 'gen-skill-form',
    templateUrl: './skill.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SkillFormComponent extends BaseFormComponent {
    public record!: SkillEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        employeeSkills: false,
        skills: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadSkillFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
