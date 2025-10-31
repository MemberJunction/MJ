import { Component } from '@angular/core';
import { CurriculumCourseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumCourseDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Curriculum Courses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumcourse-form',
    templateUrl: './curriculumcourse.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumCourseFormComponent extends BaseFormComponent {
    public record!: CurriculumCourseEntity;
} 

export function LoadCurriculumCourseFormComponent() {
    LoadCurriculumCourseDetailsComponent();
}
