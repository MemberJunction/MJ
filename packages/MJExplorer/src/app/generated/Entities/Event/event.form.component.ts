import { Component } from '@angular/core';
import { EventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-event-form',
    templateUrl: './event.form.component.html'
})
export class EventFormComponent extends BaseFormComponent {
    public record!: EventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'eventAttendees', sectionName: 'Event Attendees', isExpanded: false },
            { sectionKey: 'volunteerLogs', sectionName: 'Volunteer Logs', isExpanded: false }
        ]);
    }
}

