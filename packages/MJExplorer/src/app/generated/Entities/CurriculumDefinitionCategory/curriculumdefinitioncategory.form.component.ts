import { Component } from '@angular/core';
import { CurriculumDefinitionCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumDefinitionCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Curriculum Definition Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumdefinitioncategory-form',
    templateUrl: './curriculumdefinitioncategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumDefinitionCategoryFormComponent extends BaseFormComponent {
    public record!: CurriculumDefinitionCategoryEntity;
} 

export function LoadCurriculumDefinitionCategoryFormComponent() {
    LoadCurriculumDefinitionCategoryDetailsComponent();
}
