import { Component } from '@angular/core';
import { MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Relationships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentrelationship-form',
    templateUrl: './mjaiagentrelationship.form.component.html'
})
export class MJAIAgentRelationshipFormComponent extends BaseFormComponent {
    public record!: MJAIAgentRelationshipEntity;

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

