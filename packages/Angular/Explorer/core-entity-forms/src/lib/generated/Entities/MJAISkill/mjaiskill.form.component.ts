import { Component } from '@angular/core';
import { MJAISkillEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Skills') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiskill-form',
    templateUrl: './mjaiskill.form.component.html'
})
export class MJAISkillFormComponent extends BaseFormComponent {
    public record!: MJAISkillEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'skillProfile', sectionName: 'Skill Profile', isExpanded: true },
            { sectionKey: 'agentConfiguration', sectionName: 'Agent Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAISkillSubAgents', sectionName: 'AI Skill Sub Agents', isExpanded: false },
            { sectionKey: 'mJAISkillActions', sectionName: 'AI Skill Actions', isExpanded: false },
            { sectionKey: 'mJAIAgentSkills', sectionName: 'AI Agent Skills', isExpanded: false }
        ]);
    }
}

