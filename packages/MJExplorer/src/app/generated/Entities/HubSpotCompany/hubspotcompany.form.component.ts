import { Component } from '@angular/core';
import { HubSpotCompanyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompany-form',
    templateUrl: './hubspotcompany.form.component.html'
})
export class HubSpotCompanyFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'companyProfile', sectionName: 'Company Profile', isExpanded: true },
            { sectionKey: 'contactLocation', sectionName: 'Contact & Location', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'contacts', sectionName: 'Contacts', isExpanded: false },
            { sectionKey: 'companyDeals', sectionName: 'Company Deals', isExpanded: false },
            { sectionKey: 'companyTasks', sectionName: 'Company Tasks', isExpanded: false },
            { sectionKey: 'companyNotes', sectionName: 'Company Notes', isExpanded: false },
            { sectionKey: 'companyCalls', sectionName: 'Company Calls', isExpanded: false },
            { sectionKey: 'companyTickets', sectionName: 'Company Tickets', isExpanded: false },
            { sectionKey: 'companyEmails', sectionName: 'Company Emails', isExpanded: false },
            { sectionKey: 'companyMeetings', sectionName: 'Company Meetings', isExpanded: false },
            { sectionKey: 'contactCompanies', sectionName: 'Contact Companies', isExpanded: false }
        ]);
    }
}

