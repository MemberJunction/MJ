import { Component } from '@angular/core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Conversation Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-conversationdetail-form',
    templateUrl: './conversationdetail.form.component.html'
})
export class ConversationDetailFormComponent extends BaseFormComponent {
    public record!: ConversationDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageCore', sectionName: 'Message Core', isExpanded: true },
            { sectionKey: 'userFeedbackInsights', sectionName: 'User Feedback & Insights', isExpanded: true },
            { sectionKey: 'relatedEntities', sectionName: 'Related Entities', isExpanded: false },
            { sectionKey: 'interactiveElements', sectionName: 'Interactive Elements', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'mJConversationDetailArtifacts', sectionName: 'MJ: Conversation Detail Artifacts', isExpanded: false },
            { sectionKey: 'mJConversationDetailAttachments', sectionName: 'MJ: Conversation Detail Attachments', isExpanded: false },
            { sectionKey: 'mJConversationDetailRatings', sectionName: 'MJ: Conversation Detail Ratings', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false }
        ]);
    }
}

