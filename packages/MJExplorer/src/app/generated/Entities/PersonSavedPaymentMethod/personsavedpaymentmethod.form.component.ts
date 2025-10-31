import { Component } from '@angular/core';
import { PersonSavedPaymentMethodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonSavedPaymentMethodDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Saved Payment Methods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personsavedpaymentmethod-form',
    templateUrl: './personsavedpaymentmethod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonSavedPaymentMethodFormComponent extends BaseFormComponent {
    public record!: PersonSavedPaymentMethodEntity;
} 

export function LoadPersonSavedPaymentMethodFormComponent() {
    LoadPersonSavedPaymentMethodDetailsComponent();
}
