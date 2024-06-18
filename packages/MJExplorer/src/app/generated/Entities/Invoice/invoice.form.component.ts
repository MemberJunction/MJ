import { Component } from '@angular/core';
import { InvoiceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Invoices') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoice-form',
    templateUrl: './invoice.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceFormComponent extends BaseFormComponent {
    public record!: InvoiceEntity;
} 

export function LoadInvoiceFormComponent() {
    LoadInvoiceDetailsComponent();
}
