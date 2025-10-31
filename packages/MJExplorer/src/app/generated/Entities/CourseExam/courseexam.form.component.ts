import { Component } from '@angular/core';
import { CourseExamEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseExamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course Exams') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseexam-form',
    templateUrl: './courseexam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseExamFormComponent extends BaseFormComponent {
    public record!: CourseExamEntity;
} 

export function LoadCourseExamFormComponent() {
    LoadCourseExamDetailsComponent();
}
