import { Component } from '@angular/core';
import { PaymentDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Payment Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymentdetail-form',
    templateUrl: './paymentdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentDetailFormComponent extends BaseFormComponent {
    public record!: PaymentDetailEntity;
} 

export function LoadPaymentDetailFormComponent() {
    LoadPaymentDetailDetailsComponent();
}
