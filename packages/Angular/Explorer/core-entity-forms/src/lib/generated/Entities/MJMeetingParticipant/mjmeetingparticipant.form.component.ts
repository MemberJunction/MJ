import { Component } from '@angular/core';
import { MJMeetingParticipantEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Meeting Participants') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmeetingparticipant-form',
    templateUrl: './mjmeetingparticipant.form.component.html'
})
export class MJMeetingParticipantFormComponent extends BaseFormComponent {
    public record!: MJMeetingParticipantEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'meetingContext', sectionName: 'Meeting Context', isExpanded: true },
            { sectionKey: 'participantIdentity', sectionName: 'Participant Identity', isExpanded: true },
            { sectionKey: 'meetingParticipation', sectionName: 'Meeting Participation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

