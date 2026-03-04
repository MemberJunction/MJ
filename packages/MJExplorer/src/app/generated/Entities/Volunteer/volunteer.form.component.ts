import { Component } from '@angular/core';
import { VolunteerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Volunteers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-volunteer-form',
    templateUrl: './volunteer.form.component.html'
})
export class VolunteerFormComponent extends BaseFormComponent {
    public record!: VolunteerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'eventAttendees', sectionName: 'Event Attendees', isExpanded: false },
            { sectionKey: 'volunteerLogs', sectionName: 'Volunteer Logs', isExpanded: false }
        ]);
    }
}

