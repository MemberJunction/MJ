import { Component } from '@angular/core';
import { HubSpotMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotmeeting-form',
    templateUrl: './hubspotmeeting.form.component.html'
})
export class HubSpotMeetingFormComponent extends BaseFormComponent {
    public record!: HubSpotMeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'meetingDetails', sectionName: 'Meeting Details', isExpanded: true },
            { sectionKey: 'scheduleAndLocation', sectionName: 'Schedule and Location', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dealMeetings', sectionName: 'Deal Meetings', isExpanded: false },
            { sectionKey: 'companyMeetings', sectionName: 'Company Meetings', isExpanded: false },
            { sectionKey: 'contactMeetings', sectionName: 'Contact Meetings', isExpanded: false },
            { sectionKey: 'ticketMeetings', sectionName: 'Ticket Meetings', isExpanded: false }
        ]);
    }
}

