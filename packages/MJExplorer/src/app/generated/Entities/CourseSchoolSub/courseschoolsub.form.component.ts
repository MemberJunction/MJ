import { Component } from '@angular/core';
import { CourseSchoolSubEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseSchoolSubDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course School Subs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseschoolsub-form',
    templateUrl: './courseschoolsub.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseSchoolSubFormComponent extends BaseFormComponent {
    public record!: CourseSchoolSubEntity;
} 

export function LoadCourseSchoolSubFormComponent() {
    LoadCourseSchoolSubDetailsComponent();
}
