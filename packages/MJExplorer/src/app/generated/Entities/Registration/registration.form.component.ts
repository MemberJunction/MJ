import { Component } from '@angular/core';
import { RegistrationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRegistrationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Registrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-registration-form',
    templateUrl: './registration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RegistrationFormComponent extends BaseFormComponent {
    public record!: RegistrationEntity;
} 

export function LoadRegistrationFormComponent() {
    LoadRegistrationDetailsComponent();
}
