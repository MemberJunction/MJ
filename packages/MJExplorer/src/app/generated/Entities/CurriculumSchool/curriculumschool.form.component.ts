import { Component } from '@angular/core';
import { CurriculumSchoolEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumSchoolDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Curriculum Schools') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumschool-form',
    templateUrl: './curriculumschool.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumSchoolFormComponent extends BaseFormComponent {
    public record!: CurriculumSchoolEntity;
} 

export function LoadCurriculumSchoolFormComponent() {
    LoadCurriculumSchoolDetailsComponent();
}
