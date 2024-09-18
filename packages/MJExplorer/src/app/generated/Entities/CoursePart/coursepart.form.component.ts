import { Component } from '@angular/core';
import { CoursePartEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCoursePartDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course Parts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-coursepart-form',
    templateUrl: './coursepart.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CoursePartFormComponent extends BaseFormComponent {
    public record!: CoursePartEntity;
} 

export function LoadCoursePartFormComponent() {
    LoadCoursePartDetailsComponent();
}
