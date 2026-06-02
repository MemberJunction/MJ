import { Component } from '@angular/core';
import { hubspotpostal_mailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Postal Mails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotpostal_mail-form',
    templateUrl: './hubspotpostal_mail.form.component.html'
})
export class hubspotpostal_mailFormComponent extends BaseFormComponent {
    public record!: hubspotpostal_mailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipAndAssignment', sectionName: 'Ownership and Assignment', isExpanded: true },
            { sectionKey: 'postalMailContent', sectionName: 'Postal Mail Content', isExpanded: true },
            { sectionKey: 'activityTimeline', sectionName: 'Activity Timeline', isExpanded: false },
            { sectionKey: 'sourceInformation', sectionName: 'Source Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

