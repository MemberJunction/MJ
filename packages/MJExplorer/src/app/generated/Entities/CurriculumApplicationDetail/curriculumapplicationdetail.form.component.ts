import { Component } from '@angular/core';
import { CurriculumApplicationDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumApplicationDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Curriculum Application Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumapplicationdetail-form',
    templateUrl: './curriculumapplicationdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumApplicationDetailFormComponent extends BaseFormComponent {
    public record!: CurriculumApplicationDetailEntity;
} 

export function LoadCurriculumApplicationDetailFormComponent() {
    LoadCurriculumApplicationDetailDetailsComponent();
}
