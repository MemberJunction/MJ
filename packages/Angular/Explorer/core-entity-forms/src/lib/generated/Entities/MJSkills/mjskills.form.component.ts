import { Component } from '@angular/core';
import { MJSkillsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjskills-form',
    templateUrl: './mjskills.form.component.html'
})
export class MJSkillsFormComponent extends BaseFormComponent {
    public record!: MJSkillsEntity;

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

