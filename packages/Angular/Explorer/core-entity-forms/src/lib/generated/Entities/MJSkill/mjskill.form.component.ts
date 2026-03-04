import { Component } from '@angular/core';
import { MJSkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjskill-form',
    templateUrl: './mjskill.form.component.html'
})
export class MJSkillFormComponent extends BaseFormComponent {
    public record!: MJSkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'skillIdentification', sectionName: 'Skill Identification', isExpanded: true },
            { sectionKey: 'skillHierarchy', sectionName: 'Skill Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJEmployeeSkills', sectionName: 'Employee Skills', isExpanded: false },
            { sectionKey: 'mJSkills', sectionName: 'Skills', isExpanded: false }
        ]);
    }
}

