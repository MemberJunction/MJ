import { Component } from '@angular/core';
import { PaymentAuthorizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentAuthorizationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Payment Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymentauthorization-form',
    templateUrl: './paymentauthorization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentAuthorizationFormComponent extends BaseFormComponent {
    public record!: PaymentAuthorizationEntity;
} 

export function LoadPaymentAuthorizationFormComponent() {
    LoadPaymentAuthorizationDetailsComponent();
}
