import { Component } from '@angular/core';
import { CourseSchoolEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseSchoolDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Course Schools') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseschool-form',
    templateUrl: './courseschool.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseSchoolFormComponent extends BaseFormComponent {
    public record!: CourseSchoolEntity;
} 

export function LoadCourseSchoolFormComponent() {
    LoadCourseSchoolDetailsComponent();
}
