import { Component } from '@angular/core';
import { CoursePartUseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCoursePartUseDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course Part Uses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-coursepartuse-form',
    templateUrl: './coursepartuse.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CoursePartUseFormComponent extends BaseFormComponent {
    public record!: CoursePartUseEntity;
} 

export function LoadCoursePartUseFormComponent() {
    LoadCoursePartUseDetailsComponent();
}
