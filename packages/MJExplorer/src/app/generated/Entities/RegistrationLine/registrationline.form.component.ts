import { Component } from '@angular/core';
import { RegistrationLineEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRegistrationLineDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Registration Lines') // Tell MemberJunction about this class
@Component({
    selector: 'gen-registrationline-form',
    templateUrl: './registrationline.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RegistrationLineFormComponent extends BaseFormComponent {
    public record!: RegistrationLineEntity;
} 

export function LoadRegistrationLineFormComponent() {
    LoadRegistrationLineDetailsComponent();
}
