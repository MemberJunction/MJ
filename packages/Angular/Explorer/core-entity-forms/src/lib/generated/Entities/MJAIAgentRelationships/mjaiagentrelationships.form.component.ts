import { Component } from '@angular/core';
import { MJAIAgentRelationshipsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Relationships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrelationships-form',
    templateUrl: './mjaiagentrelationships.form.component.html'
})
export class MJAIAgentRelationshipsFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRelationshipsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentRelationship', sectionName: 'Agent Relationship', isExpanded: true },
            { sectionKey: 'payloadMappingContext', sectionName: 'Payload Mapping & Context', isExpanded: true },
            { sectionKey: 'conversationSettings', sectionName: 'Conversation Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

