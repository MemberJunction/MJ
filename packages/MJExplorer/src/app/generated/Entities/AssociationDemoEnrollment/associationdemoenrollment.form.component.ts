import { Component } from '@angular/core';
import { AssociationDemoEnrollmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Enrollments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoenrollment-form',
    templateUrl: './associationdemoenrollment.form.component.html'
})
export class AssociationDemoEnrollmentFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEnrollmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'certificates', sectionName: 'Certificates', isExpanded: false }
        ]);
    }
}

