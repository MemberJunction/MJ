import { Component } from '@angular/core';
import { EducationStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEducationStatusDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Education Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-educationstatus-form',
    templateUrl: './educationstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EducationStatusFormComponent extends BaseFormComponent {
    public record!: EducationStatusEntity;
} 

export function LoadEducationStatusFormComponent() {
    LoadEducationStatusDetailsComponent();
}
