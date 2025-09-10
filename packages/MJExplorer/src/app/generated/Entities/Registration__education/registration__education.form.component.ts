import { Component } from '@angular/core';
import { Registration__educationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRegistration__educationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Registrations__education') // Tell MemberJunction about this class
@Component({
    selector: 'gen-registration__education-form',
    templateUrl: './registration__education.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Registration__educationFormComponent extends BaseFormComponent {
    public record!: Registration__educationEntity;
} 

export function LoadRegistration__educationFormComponent() {
    LoadRegistration__educationDetailsComponent();
}
