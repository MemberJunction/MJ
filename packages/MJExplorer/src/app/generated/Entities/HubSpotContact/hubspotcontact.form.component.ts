import { Component } from '@angular/core';
import { HubSpotContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontact-form',
    templateUrl: './hubspotcontact.form.component.html'
})
export class HubSpotContactFormComponent extends BaseFormComponent {
    public record!: HubSpotContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'professionalCompanyDetails', sectionName: 'Professional & Company Details', isExpanded: true },
            { sectionKey: 'lifecycleEngagement', sectionName: 'Lifecycle & Engagement', isExpanded: false },
            { sectionKey: 'addressDetails', sectionName: 'Address Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'contactTasks', sectionName: 'Contact Tasks', isExpanded: false },
            { sectionKey: 'contactFeedbackSubmissions', sectionName: 'Contact Feedback Submissions', isExpanded: false },
            { sectionKey: 'contactCompanies', sectionName: 'Contact Companies', isExpanded: false },
            { sectionKey: 'contactEmails', sectionName: 'Contact Emails', isExpanded: false },
            { sectionKey: 'quoteContacts', sectionName: 'Quote Contacts', isExpanded: false },
            { sectionKey: 'contactDeals', sectionName: 'Contact Deals', isExpanded: false },
            { sectionKey: 'contactTickets', sectionName: 'Contact Tickets', isExpanded: false },
            { sectionKey: 'contactCalls', sectionName: 'Contact Calls', isExpanded: false },
            { sectionKey: 'emailSuppressionLists', sectionName: 'Email Suppression Lists', isExpanded: false },
            { sectionKey: 'invoiceItems', sectionName: 'Invoice Items', isExpanded: false },
            { sectionKey: 'connectionsEmail', sectionName: 'Connections (Email)', isExpanded: false },
            { sectionKey: 'groupMembershipLogsLastName', sectionName: 'Group Membership Logs (Last Name)', isExpanded: false },
            { sectionKey: 'eventRegistrationsFirstName', sectionName: 'Event Registrations (First Name)', isExpanded: false },
            { sectionKey: 'duesTransactionsLastName', sectionName: 'Dues Transactions (Last Name)', isExpanded: false },
            { sectionKey: 'contactNotes', sectionName: 'Contact Notes', isExpanded: false },
            { sectionKey: 'contactMeetings', sectionName: 'Contact Meetings', isExpanded: false },
            { sectionKey: 'donationTransactionsFirstName', sectionName: 'Donation Transactions (First Name)', isExpanded: false },
            { sectionKey: 'groupMembershipLogsFirstName', sectionName: 'Group Membership Logs (First Name)', isExpanded: false },
            { sectionKey: 'connectionsLastName', sectionName: 'Connections (Last Name)', isExpanded: false },
            { sectionKey: 'eventRegistrationsLastName', sectionName: 'Event Registrations (Last Name)', isExpanded: false },
            { sectionKey: 'duesTransactionsFirstName', sectionName: 'Dues Transactions (First Name)', isExpanded: false },
            { sectionKey: 'donationTransactionsLastName', sectionName: 'Donation Transactions (Last Name)', isExpanded: false },
            { sectionKey: 'connectionsFirstName', sectionName: 'Connections (First Name)', isExpanded: false },
            { sectionKey: 'duesTransactionsEmail', sectionName: 'Dues Transactions (Email)', isExpanded: false },
            { sectionKey: 'memberProfilesEmailAddress', sectionName: 'Member Profiles (Email Address)', isExpanded: false },
            { sectionKey: 'memberProfilesFirstName', sectionName: 'Member Profiles (First Name)', isExpanded: false },
            { sectionKey: 'memberProfilesLastName', sectionName: 'Member Profiles (Last Name)', isExpanded: false }
        ]);
    }
}

