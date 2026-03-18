import { Component } from '@angular/core';
import { YourMembershipEventRegistrationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventregistration-form',
    templateUrl: './yourmembershipeventregistration.form.component.html'
})
export class YourMembershipEventRegistrationFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'registrationDetails', sectionName: 'Registration Details', isExpanded: true },
            { sectionKey: 'attendeeInformation', sectionName: 'Attendee Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

