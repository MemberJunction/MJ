import { Component } from '@angular/core';
import { EnrollmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Enrollments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-enrollment-form',
    templateUrl: './enrollment.form.component.html'
})
export class EnrollmentFormComponent extends BaseFormComponent {
    public record!: EnrollmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'enrollmentDetails', sectionName: 'Enrollment Details', isExpanded: true },
            { sectionKey: 'timelineAccess', sectionName: 'Timeline & Access', isExpanded: true },
            { sectionKey: 'progressResults', sectionName: 'Progress & Results', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'certificates', sectionName: 'Certificates', isExpanded: false }
        ]);
    }
}

export function LoadEnrollmentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
