import { Component } from '@angular/core';
import { MJPhoneNumberEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Phone Numbers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjphonenumber-form',
    templateUrl: './mjphonenumber.form.component.html'
})
export class MJPhoneNumberFormComponent extends BaseFormComponent {
    public record!: MJPhoneNumberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'phoneNumberDetails', sectionName: 'Phone Number Details', isExpanded: true },
            { sectionKey: 'carrierInformation', sectionName: 'Carrier Information', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'routingAndPooling', sectionName: 'Routing and Pooling', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMeetings', sectionName: 'Meetings', isExpanded: false },
            { sectionKey: 'mJInteractions', sectionName: 'Interactions', isExpanded: false }
        ]);
    }
}

