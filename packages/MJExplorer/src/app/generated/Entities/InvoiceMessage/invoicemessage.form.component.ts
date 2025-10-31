import { Component } from '@angular/core';
import { InvoiceMessageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceMessageDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Invoice Messages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoicemessage-form',
    templateUrl: './invoicemessage.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceMessageFormComponent extends BaseFormComponent {
    public record!: InvoiceMessageEntity;
} 

export function LoadInvoiceMessageFormComponent() {
    LoadInvoiceMessageDetailsComponent();
}
