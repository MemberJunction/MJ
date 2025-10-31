import { Component } from '@angular/core';
import { PersonPhoneEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonPhoneDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Phones') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personphone-form',
    templateUrl: './personphone.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonPhoneFormComponent extends BaseFormComponent {
    public record!: PersonPhoneEntity;
} 

export function LoadPersonPhoneFormComponent() {
    LoadPersonPhoneDetailsComponent();
}
