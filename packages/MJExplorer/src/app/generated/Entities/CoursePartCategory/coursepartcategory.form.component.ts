import { Component } from '@angular/core';
import { CoursePartCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCoursePartCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Course Part Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-coursepartcategory-form',
    templateUrl: './coursepartcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CoursePartCategoryFormComponent extends BaseFormComponent {
    public record!: CoursePartCategoryEntity;
} 

export function LoadCoursePartCategoryFormComponent() {
    LoadCoursePartCategoryDetailsComponent();
}
