import { Component } from '@angular/core';
import { InvoiceConsolidationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInvoiceConsolidationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Invoice Consolidations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoiceconsolidation-form',
    templateUrl: './invoiceconsolidation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InvoiceConsolidationFormComponent extends BaseFormComponent {
    public record!: InvoiceConsolidationEntity;
} 

export function LoadInvoiceConsolidationFormComponent() {
    LoadInvoiceConsolidationDetailsComponent();
}
