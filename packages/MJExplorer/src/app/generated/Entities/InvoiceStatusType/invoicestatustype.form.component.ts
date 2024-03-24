import { Component } from '@angular/core';
import { InvoiceStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceStatusTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Invoice Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoicestatustype-form',
    templateUrl: './invoicestatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceStatusTypeFormComponent extends BaseFormComponent {
    public record!: InvoiceStatusTypeEntity;
} 

export function LoadInvoiceStatusTypeFormComponent() {
    LoadInvoiceStatusTypeDetailsComponent();
}
