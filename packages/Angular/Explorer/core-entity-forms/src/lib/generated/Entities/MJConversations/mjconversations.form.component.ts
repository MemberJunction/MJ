import { Component } from '@angular/core';
import { MJConversationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Conversations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversations-form',
    templateUrl: './mjconversations.form.component.html'
})
export class MJConversationsFormComponent extends BaseFormComponent {
    public record!: MJConversationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'conversationCore', sectionName: 'Conversation Core', isExpanded: true },
            { sectionKey: 'participantsReferences', sectionName: 'Participants & References', isExpanded: true },
            { sectionKey: 'contextualScope', sectionName: 'Contextual Scope', isExpanded: false },
            { sectionKey: 'testRunDetails', sectionName: 'Test Run Details', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'mJConversationArtifacts', sectionName: 'MJ: Conversation Artifacts', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false }
        ]);
    }
}

