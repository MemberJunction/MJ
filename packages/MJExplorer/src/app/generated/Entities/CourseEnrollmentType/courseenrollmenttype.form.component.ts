import { Component } from '@angular/core';
import { CourseEnrollmentTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseEnrollmentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Course Enrollment Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseenrollmenttype-form',
    templateUrl: './courseenrollmenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseEnrollmentTypeFormComponent extends BaseFormComponent {
    public record!: CourseEnrollmentTypeEntity;
} 

export function LoadCourseEnrollmentTypeFormComponent() {
    LoadCourseEnrollmentTypeDetailsComponent();
}
