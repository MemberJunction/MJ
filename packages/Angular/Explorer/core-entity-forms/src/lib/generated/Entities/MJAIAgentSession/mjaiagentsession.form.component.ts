import { Component } from '@angular/core';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsession-form',
    templateUrl: './mjaiagentsession.form.component.html'
})
export class MJAIAgentSessionFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionContext', sectionName: 'Session Context', isExpanded: true },
            { sectionKey: 'sessionLifecycle', sectionName: 'Session Lifecycle', isExpanded: true },
            { sectionKey: 'technicalInfrastructure', sectionName: 'Technical Infrastructure', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentSessions', sectionName: 'AI Agent Sessions', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJConversationDetails', sectionName: 'Conversation Details', isExpanded: false },
            { sectionKey: 'mJAIAgentSessionChannels', sectionName: 'AI Agent Session Channels', isExpanded: false }
        ]);
    }
}

