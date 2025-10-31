import { Component } from '@angular/core';
import { CourseETMaterialsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseETMaterialsDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course ET Materials') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseetmaterials-form',
    templateUrl: './courseetmaterials.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseETMaterialsFormComponent extends BaseFormComponent {
    public record!: CourseETMaterialsEntity;
} 

export function LoadCourseETMaterialsFormComponent() {
    LoadCourseETMaterialsDetailsComponent();
}
