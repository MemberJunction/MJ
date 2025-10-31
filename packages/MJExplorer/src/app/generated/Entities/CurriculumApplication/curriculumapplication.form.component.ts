import { Component } from '@angular/core';
import { CurriculumApplicationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCurriculumApplicationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Curriculum Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-curriculumapplication-form',
    templateUrl: './curriculumapplication.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CurriculumApplicationFormComponent extends BaseFormComponent {
    public record!: CurriculumApplicationEntity;
} 

export function LoadCurriculumApplicationFormComponent() {
    LoadCurriculumApplicationDetailsComponent();
}
