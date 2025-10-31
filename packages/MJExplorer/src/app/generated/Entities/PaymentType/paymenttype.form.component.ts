import { Component } from '@angular/core';
import { PaymentTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Payment Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymenttype-form',
    templateUrl: './paymenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentTypeFormComponent extends BaseFormComponent {
    public record!: PaymentTypeEntity;
} 

export function LoadPaymentTypeFormComponent() {
    LoadPaymentTypeDetailsComponent();
}
