import { Component } from '@angular/core';
import { EventAttendeeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Attendees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-eventattendee-form',
    templateUrl: './eventattendee.form.component.html'
})
export class EventAttendeeFormComponent extends BaseFormComponent {
    public record!: EventAttendeeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

