import { Component } from '@angular/core';
import { hubspotassoc_tickets_emailsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Assoc Tickets Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotassoc_tickets_emails-form',
    templateUrl: './hubspotassoc_tickets_emails.form.component.html'
})
export class hubspotassoc_tickets_emailsFormComponent extends BaseFormComponent {
    public record!: hubspotassoc_tickets_emailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

