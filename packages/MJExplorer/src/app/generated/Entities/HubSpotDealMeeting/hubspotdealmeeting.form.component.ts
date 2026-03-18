import { Component } from '@angular/core';
import { HubSpotDealMeetingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Meetings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdealmeeting-form',
    templateUrl: './hubspotdealmeeting.form.component.html'
})
export class HubSpotDealMeetingFormComponent extends BaseFormComponent {
    public record!: HubSpotDealMeetingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

