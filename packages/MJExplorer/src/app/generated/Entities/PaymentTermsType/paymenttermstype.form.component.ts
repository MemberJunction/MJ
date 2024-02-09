import { Component } from '@angular/core';
import { PaymentTermsTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadPaymentTermsTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Payment Terms Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymenttermstype-form',
    templateUrl: './paymenttermstype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentTermsTypeFormComponent extends BaseFormComponent {
    public record!: PaymentTermsTypeEntity;
} 

export function LoadPaymentTermsTypeFormComponent() {
    LoadPaymentTermsTypeDetailsComponent();
}
