import { Component } from '@angular/core';
import { PaymentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Payments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-payment-form',
    templateUrl: './payment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentFormComponent extends BaseFormComponent {
    public record!: PaymentEntity;
} 

export function LoadPaymentFormComponent() {
    LoadPaymentDetailsComponent();
}
