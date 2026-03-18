import { Component } from '@angular/core';
import { HubSpotTicketMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticketmeeting-form',
    templateUrl: './hubspotticketmeeting.form.component.html'
})
export class HubSpotTicketMeetingFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketMeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

