import { Component } from '@angular/core';
import { hubspotappointmentsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Appointments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotappointments-form',
    templateUrl: './hubspotappointments.form.component.html'
})
export class hubspotappointmentsFormComponent extends BaseFormComponent {
    public record!: hubspotappointmentsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pipelineAndOwnership', sectionName: 'Pipeline and Ownership', isExpanded: true },
            { sectionKey: 'scheduleAndStatus', sectionName: 'Schedule and Status', isExpanded: true },
            { sectionKey: 'appointmentDetails', sectionName: 'Appointment Details', isExpanded: false },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

