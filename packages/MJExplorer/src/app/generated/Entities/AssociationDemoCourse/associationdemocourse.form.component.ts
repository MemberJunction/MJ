import { Component } from '@angular/core';
import { AssociationDemoCourseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Courses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocourse-form',
    templateUrl: './associationdemocourse.form.component.html'
})
export class AssociationDemoCourseFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCourseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'courses', sectionName: 'Courses', isExpanded: false },
            { sectionKey: 'enrollments', sectionName: 'Enrollments', isExpanded: false }
        ]);
    }
}

