import { Component } from '@angular/core';
import { HubSpotCompanyMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanymeeting-form',
    templateUrl: './hubspotcompanymeeting.form.component.html'
})
export class HubSpotCompanyMeetingFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyMeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'meetingAssociation', sectionName: 'Meeting Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

