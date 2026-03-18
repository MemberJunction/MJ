import { Component } from '@angular/core';
import { YourMembershipEventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipevent-form',
    templateUrl: './yourmembershipevent.form.component.html'
})
export class YourMembershipEventFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventDetails', sectionName: 'Event Details', isExpanded: true },
            { sectionKey: 'scheduleAndTimeline', sectionName: 'Schedule and Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'eventRegistrations', sectionName: 'Event Registrations', isExpanded: false },
            { sectionKey: 'eventTickets', sectionName: 'Event Tickets', isExpanded: false },
            { sectionKey: 'eventIDs', sectionName: 'Event IDs', isExpanded: false },
            { sectionKey: 'eventSessions', sectionName: 'Event Sessions', isExpanded: false },
            { sectionKey: 'eventAttendeeTypes', sectionName: 'Event Attendee Types', isExpanded: false },
            { sectionKey: 'eventSessionGroups', sectionName: 'Event Session Groups', isExpanded: false },
            { sectionKey: 'eventCEUAwards', sectionName: 'Event CEU Awards', isExpanded: false }
        ]);
    }
}

