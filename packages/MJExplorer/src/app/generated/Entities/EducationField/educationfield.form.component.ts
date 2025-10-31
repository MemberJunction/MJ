import { Component } from '@angular/core';
import { EducationFieldEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEducationFieldDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Education Fields') // Tell MemberJunction about this class
@Component({
    selector: 'gen-educationfield-form',
    templateUrl: './educationfield.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EducationFieldFormComponent extends BaseFormComponent {
    public record!: EducationFieldEntity;
} 

export function LoadEducationFieldFormComponent() {
    LoadEducationFieldDetailsComponent();
}
