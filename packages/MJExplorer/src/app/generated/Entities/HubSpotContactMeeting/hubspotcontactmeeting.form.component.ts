import { Component } from '@angular/core';
import { HubSpotContactMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactmeeting-form',
    templateUrl: './hubspotcontactmeeting.form.component.html'
})
export class HubSpotContactMeetingFormComponent extends BaseFormComponent {
    public record!: HubSpotContactMeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'meetingAssociation', sectionName: 'Meeting Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

