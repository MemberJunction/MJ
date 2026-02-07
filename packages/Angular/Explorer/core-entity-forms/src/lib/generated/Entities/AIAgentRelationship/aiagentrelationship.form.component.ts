import { Component } from '@angular/core';
import { AIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Relationships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentrelationship-form',
    templateUrl: './aiagentrelationship.form.component.html'
})
export class AIAgentRelationshipFormComponent extends BaseFormComponent {
    public record!: AIAgentRelationshipEntity;

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

export function LoadAIAgentRelationshipFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
