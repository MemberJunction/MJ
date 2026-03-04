import { Component } from '@angular/core';
import { MemberMeasurementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Measurements') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-membermeasurement-form',
    templateUrl: './membermeasurement.form.component.html'
})
export class MemberMeasurementFormComponent extends BaseFormComponent {
    public record!: MemberMeasurementEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

