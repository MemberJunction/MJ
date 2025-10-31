import { Component } from '@angular/core';
import { CurriculumCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumCategoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Curriculum Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumcategory-form',
    templateUrl: './curriculumcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumCategoryFormComponent extends BaseFormComponent {
    public record!: CurriculumCategoryEntity;
} 

export function LoadCurriculumCategoryFormComponent() {
    LoadCurriculumCategoryDetailsComponent();
}
