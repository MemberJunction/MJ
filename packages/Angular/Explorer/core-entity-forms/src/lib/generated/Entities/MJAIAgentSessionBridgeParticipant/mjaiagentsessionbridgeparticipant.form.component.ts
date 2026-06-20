import { Component } from '@angular/core';
import { MJAIAgentSessionBridgeParticipantEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Session Bridge Participants') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsessionbridgeparticipant-form',
    templateUrl: './mjaiagentsessionbridgeparticipant.form.component.html'
})
export class MJAIAgentSessionBridgeParticipantFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSessionBridgeParticipantEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionInformation', sectionName: 'Session Information', isExpanded: true },
            { sectionKey: 'participantDetails', sectionName: 'Participant Details', isExpanded: true },
            { sectionKey: 'userAssociation', sectionName: 'User Association', isExpanded: true },
            { sectionKey: 'sessionTimeline', sectionName: 'Session Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

