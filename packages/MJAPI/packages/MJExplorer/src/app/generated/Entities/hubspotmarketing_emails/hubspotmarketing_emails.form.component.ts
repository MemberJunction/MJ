import { Component } from '@angular/core';
import { hubspotmarketing_emailsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Marketing Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotmarketing_emails-form',
    templateUrl: './hubspotmarketing_emails.form.component.html'
})
export class hubspotmarketing_emailsFormComponent extends BaseFormComponent {
    public record!: hubspotmarketing_emailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'campaignStatus', sectionName: 'Campaign Status', isExpanded: false },
            { sectionKey: 'senderSettings', sectionName: 'Sender Settings', isExpanded: false },
            { sectionKey: 'emailContent', sectionName: 'Email Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

