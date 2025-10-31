import { Component } from '@angular/core';
import { InvoiceConsolidationOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceConsolidationOrderDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Invoice Consolidation Orders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoiceconsolidationorder-form',
    templateUrl: './invoiceconsolidationorder.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceConsolidationOrderFormComponent extends BaseFormComponent {
    public record!: InvoiceConsolidationOrderEntity;
} 

export function LoadInvoiceConsolidationOrderFormComponent() {
    LoadInvoiceConsolidationOrderDetailsComponent();
}
