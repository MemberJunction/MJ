import { Component } from '@angular/core';
import { CurriculumDefinitionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumDefinitionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Curriculum Definitions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumdefinition-form',
    templateUrl: './curriculumdefinition.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumDefinitionFormComponent extends BaseFormComponent {
    public record!: CurriculumDefinitionEntity;
} 

export function LoadCurriculumDefinitionFormComponent() {
    LoadCurriculumDefinitionDetailsComponent();
}
