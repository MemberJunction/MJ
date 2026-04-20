import { Component } from '@angular/core';
import { AssociationDemoEventRegistrationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoeventregistration-form',
    templateUrl: './associationdemoeventregistration.form.component.html'
})
export class AssociationDemoEventRegistrationFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEventRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'registrationDetails', sectionName: 'Registration Details', isExpanded: true },
            { sectionKey: 'attendanceTracking', sectionName: 'Attendance Tracking', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: false },
            { sectionKey: 'professionalDevelopment', sectionName: 'Professional Development', isExpanded: false },
            { sectionKey: 'cancellationDetails', sectionName: 'Cancellation Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

