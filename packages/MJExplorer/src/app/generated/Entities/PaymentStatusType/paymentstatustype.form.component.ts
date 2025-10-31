import { Component } from '@angular/core';
import { PaymentStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentStatusTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Payment Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymentstatustype-form',
    templateUrl: './paymentstatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentStatusTypeFormComponent extends BaseFormComponent {
    public record!: PaymentStatusTypeEntity;
} 

export function LoadPaymentStatusTypeFormComponent() {
    LoadPaymentStatusTypeDetailsComponent();
}
