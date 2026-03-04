import { Component } from '@angular/core';
import { DonorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Donors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-donor-form',
    templateUrl: './donor.form.component.html'
})
export class DonorFormComponent extends BaseFormComponent {
    public record!: DonorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'donations', sectionName: 'Donations', isExpanded: false },
            { sectionKey: 'eventAttendees', sectionName: 'Event Attendees', isExpanded: false }
        ]);
    }
}

