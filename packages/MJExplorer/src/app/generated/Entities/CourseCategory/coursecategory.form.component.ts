import { Component } from '@angular/core';
import { CourseCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Course Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-coursecategory-form',
    templateUrl: './coursecategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseCategoryFormComponent extends BaseFormComponent {
    public record!: CourseCategoryEntity;
} 

export function LoadCourseCategoryFormComponent() {
    LoadCourseCategoryDetailsComponent();
}
