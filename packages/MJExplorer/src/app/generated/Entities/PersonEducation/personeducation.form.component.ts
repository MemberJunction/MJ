import { Component } from '@angular/core';
import { PersonEducationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonEducationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Educations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personeducation-form',
    templateUrl: './personeducation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonEducationFormComponent extends BaseFormComponent {
    public record!: PersonEducationEntity;
} 

export function LoadPersonEducationFormComponent() {
    LoadPersonEducationDetailsComponent();
}
