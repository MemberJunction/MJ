import { Component } from '@angular/core';
import { MJAISkillSubAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Skill Sub Agents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiskillsubagent-form',
    templateUrl: './mjaiskillsubagent.form.component.html'
})
export class MJAISkillSubAgentFormComponent extends BaseFormComponent {
    public record!: MJAISkillSubAgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentAssociation', sectionName: 'Agent Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

