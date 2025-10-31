import { Component } from '@angular/core';
import { CourseInstructorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseInstructorDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Course Instructors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseinstructor-form',
    templateUrl: './courseinstructor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseInstructorFormComponent extends BaseFormComponent {
    public record!: CourseInstructorEntity;
} 

export function LoadCourseInstructorFormComponent() {
    LoadCourseInstructorDetailsComponent();
}
