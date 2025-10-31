import { Component } from '@angular/core';
import { PaymentGLEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPaymentGLEntryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Payment GL Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-paymentglentry-form',
    templateUrl: './paymentglentry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PaymentGLEntryFormComponent extends BaseFormComponent {
    public record!: PaymentGLEntryEntity;
} 

export function LoadPaymentGLEntryFormComponent() {
    LoadPaymentGLEntryDetailsComponent();
}
