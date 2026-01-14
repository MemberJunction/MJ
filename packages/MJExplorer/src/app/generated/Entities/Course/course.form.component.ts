import { Component } from '@angular/core';
import { CourseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Courses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-course-form',
    templateUrl: './course.form.component.html'
})
export class CourseFormComponent extends BaseFormComponent {
    public record!: CourseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'courses', sectionName: 'Courses', isExpanded: false },
            { sectionKey: 'enrollments', sectionName: 'Enrollments', isExpanded: false }
        ]);
    }
}

export function LoadCourseFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
