import { Component } from '@angular/core';
import { FitnessClassEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Fitness Classes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-fitnessclass-form',
    templateUrl: './fitnessclass.form.component.html'
})
export class FitnessClassFormComponent extends BaseFormComponent {
    public record!: FitnessClassEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'classBookings', sectionName: 'Class Bookings', isExpanded: false }
        ]);
    }
}

