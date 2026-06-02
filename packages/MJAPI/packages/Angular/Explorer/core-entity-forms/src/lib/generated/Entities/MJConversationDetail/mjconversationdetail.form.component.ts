import { Component } from '@angular/core';
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversation Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationdetail-form',
    templateUrl: './mjconversationdetail.form.component.html'
})
export class MJConversationDetailFormComponent extends BaseFormComponent {
    public record!: MJConversationDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageCore', sectionName: 'Message Core', isExpanded: true },
            { sectionKey: 'userFeedbackInsights', sectionName: 'User Feedback & Insights', isExpanded: true },
            { sectionKey: 'relatedEntities', sectionName: 'Related Entities', isExpanded: false },
            { sectionKey: 'interactiveElements', sectionName: 'Interactive Elements', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJReports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'mJConversationDetailArtifacts', sectionName: 'Conversation Detail Artifacts', isExpanded: false },
            { sectionKey: 'mJConversationDetailAttachments', sectionName: 'Conversation Detail Attachments', isExpanded: false },
            { sectionKey: 'mJConversationDetailRatings', sectionName: 'Conversation Detail Ratings', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJConversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'Tasks', isExpanded: false }
        ]);
    }
}

