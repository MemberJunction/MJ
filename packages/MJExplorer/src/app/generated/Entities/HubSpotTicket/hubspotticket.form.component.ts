import { Component } from '@angular/core';
import { HubSpotTicketEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tickets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticket-form',
    templateUrl: './hubspotticket.form.component.html'
})
export class HubSpotTicketFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ticketContent', sectionName: 'Ticket Content', isExpanded: true },
            { sectionKey: 'statusAndAssignment', sectionName: 'Status and Assignment', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyTickets', sectionName: 'Company Tickets', isExpanded: false },
            { sectionKey: 'ticketCalls', sectionName: 'Ticket Calls', isExpanded: false },
            { sectionKey: 'ticketTasks', sectionName: 'Ticket Tasks', isExpanded: false },
            { sectionKey: 'ticketFeedbackSubmissions', sectionName: 'Ticket Feedback Submissions', isExpanded: false },
            { sectionKey: 'ticketMeetings', sectionName: 'Ticket Meetings', isExpanded: false },
            { sectionKey: 'contactTickets', sectionName: 'Contact Tickets', isExpanded: false },
            { sectionKey: 'ticketEmails', sectionName: 'Ticket Emails', isExpanded: false },
            { sectionKey: 'ticketNotes', sectionName: 'Ticket Notes', isExpanded: false }
        ]);
    }
}

