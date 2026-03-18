import { Component } from '@angular/core';
import { HubSpotEmailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotemail-form',
    templateUrl: './hubspotemail.form.component.html'
})
export class HubSpotEmailFormComponent extends BaseFormComponent {
    public record!: HubSpotEmailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'emailContent', sectionName: 'Email Content', isExpanded: true },
            { sectionKey: 'activityDetails', sectionName: 'Activity Details', isExpanded: true },
            { sectionKey: 'participants', sectionName: 'Participants', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyEmails', sectionName: 'Company Emails', isExpanded: false },
            { sectionKey: 'dealEmails', sectionName: 'Deal Emails', isExpanded: false },
            { sectionKey: 'ticketEmails', sectionName: 'Ticket Emails', isExpanded: false },
            { sectionKey: 'contactEmails', sectionName: 'Contact Emails', isExpanded: false }
        ]);
    }
}

