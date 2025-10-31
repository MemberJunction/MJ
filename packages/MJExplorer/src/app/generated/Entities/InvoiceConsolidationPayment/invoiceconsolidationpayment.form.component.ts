import { Component } from '@angular/core';
import { InvoiceConsolidationPaymentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceConsolidationPaymentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Invoice Consolidation Payments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoiceconsolidationpayment-form',
    templateUrl: './invoiceconsolidationpayment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceConsolidationPaymentFormComponent extends BaseFormComponent {
    public record!: InvoiceConsolidationPaymentEntity;
} 

export function LoadInvoiceConsolidationPaymentFormComponent() {
    LoadInvoiceConsolidationPaymentDetailsComponent();
}
