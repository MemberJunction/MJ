import { Component } from '@angular/core';
import { YourMembershipEventAttendeeTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Attendee Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventattendeetype-form',
    templateUrl: './yourmembershipeventattendeetype.form.component.html'
})
export class YourMembershipEventAttendeeTypeFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventAttendeeTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'attendeeTypeDetails', sectionName: 'Attendee Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

