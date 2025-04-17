import { Component } from '@angular/core';
import { CourseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Courses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-course-form',
    templateUrl: './course.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseFormComponent extends BaseFormComponent {
    public record!: CourseEntity;
} 

export function LoadCourseFormComponent() {
    LoadCourseDetailsComponent();
}
