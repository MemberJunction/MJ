import { Component } from '@angular/core';
import { MJAIAgentCoAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Co Agents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentcoagent-form',
    templateUrl: './mjaiagentcoagent.form.component.html'
})
export class MJAIAgentCoAgentFormComponent extends BaseFormComponent {
    public record!: MJAIAgentCoAgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentRelationship', sectionName: 'Agent Relationship', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

