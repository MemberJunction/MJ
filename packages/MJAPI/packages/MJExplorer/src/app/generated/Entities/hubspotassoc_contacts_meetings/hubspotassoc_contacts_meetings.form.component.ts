import { Component } from '@angular/core';
import { hubspotassoc_contacts_meetingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Assoc Contacts Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotassoc_contacts_meetings-form',
    templateUrl: './hubspotassoc_contacts_meetings.form.component.html'
})
export class hubspotassoc_contacts_meetingsFormComponent extends BaseFormComponent {
    public record!: hubspotassoc_contacts_meetingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

