import { Component } from '@angular/core';
import { PersonAddressEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonAddressDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Addresses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personaddress-form',
    templateUrl: './personaddress.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonAddressFormComponent extends BaseFormComponent {
    public record!: PersonAddressEntity;
} 

export function LoadPersonAddressFormComponent() {
    LoadPersonAddressDetailsComponent();
}
