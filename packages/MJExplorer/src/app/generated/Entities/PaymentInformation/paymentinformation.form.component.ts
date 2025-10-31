import { Component } from '@angular/core';
import { PaymentInformationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentInformationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Payment Informations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymentinformation-form',
    templateUrl: './paymentinformation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentInformationFormComponent extends BaseFormComponent {
    public record!: PaymentInformationEntity;
} 

export function LoadPaymentInformationFormComponent() {
    LoadPaymentInformationDetailsComponent();
}
