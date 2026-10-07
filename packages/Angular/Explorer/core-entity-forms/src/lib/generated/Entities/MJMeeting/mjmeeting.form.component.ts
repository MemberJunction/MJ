import { Component } from '@angular/core';
import { MJMeetingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmeeting-form',
    templateUrl: './mjmeeting.form.component.html'
})
export class MJMeetingFormComponent extends BaseFormComponent {
    public record!: MJMeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'meetingDetails', sectionName: 'Meeting Details', isExpanded: true },
            { sectionKey: 'meetingStatusAndTimeline', sectionName: 'Meeting Status and Timeline', isExpanded: true },
            { sectionKey: 'accessAndRecording', sectionName: 'Access and Recording', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMeetingParticipants', sectionName: 'Meeting Participants', isExpanded: false }
        ]);
    }
}

