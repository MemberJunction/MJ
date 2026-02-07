import { Component } from '@angular/core';
import { SkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-skill-form',
    templateUrl: './skill.form.component.html'
})
export class SkillFormComponent extends BaseFormComponent {
    public record!: SkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'skillIdentification', sectionName: 'Skill Identification', isExpanded: true },
            { sectionKey: 'skillHierarchy', sectionName: 'Skill Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'employeeSkills', sectionName: 'Employee Skills', isExpanded: false },
            { sectionKey: 'skills', sectionName: 'Skills', isExpanded: false }
        ]);
    }
}

export function LoadSkillFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
