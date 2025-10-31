import { Component } from '@angular/core';
import { PaymentTypeGLAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentTypeGLAccountDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Payment Type GL Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymenttypeglaccount-form',
    templateUrl: './paymenttypeglaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentTypeGLAccountFormComponent extends BaseFormComponent {
    public record!: PaymentTypeGLAccountEntity;
} 

export function LoadPaymentTypeGLAccountFormComponent() {
    LoadPaymentTypeGLAccountDetailsComponent();
}
