import { Component } from '@angular/core';
import { MJAIAgentSessionBridgeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Session Bridges') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsessionbridge-form',
    templateUrl: './mjaiagentsessionbridge.form.component.html'
})
export class MJAIAgentSessionBridgeFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSessionBridgeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionContext', sectionName: 'Session Context', isExpanded: true },
            { sectionKey: 'connectionDetails', sectionName: 'Connection Details', isExpanded: true },
            { sectionKey: 'lifecycleAndTiming', sectionName: 'Lifecycle and Timing', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentSessionBridgeParticipants', sectionName: 'AI Agent Session Bridge Participants', isExpanded: false }
        ]);
    }
}

