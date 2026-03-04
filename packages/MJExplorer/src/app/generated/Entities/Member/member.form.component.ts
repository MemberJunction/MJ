import { Component } from '@angular/core';
import { MemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-member-form',
    templateUrl: './member.form.component.html'
})
export class MemberFormComponent extends BaseFormComponent {
    public record!: MemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'memberMeasurements', sectionName: 'Member Measurements', isExpanded: false },
            { sectionKey: 'payments', sectionName: 'Payments', isExpanded: false },
            { sectionKey: 'personalTrainingSessions', sectionName: 'Personal Training Sessions', isExpanded: false },
            { sectionKey: 'classBookings', sectionName: 'Class Bookings', isExpanded: false }
        ]);
    }
}

