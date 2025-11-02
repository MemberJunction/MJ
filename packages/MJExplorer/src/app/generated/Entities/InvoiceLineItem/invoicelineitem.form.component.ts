import { Component } from '@angular/core';
import { InvoiceLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceLineItemDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Invoice Line Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoicelineitem-form',
    templateUrl: './invoicelineitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceLineItemFormComponent extends BaseFormComponent {
    public record!: InvoiceLineItemEntity;
} 

export function LoadInvoiceLineItemFormComponent() {
    LoadInvoiceLineItemDetailsComponent();
}
