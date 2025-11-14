import { Component } from '@angular/core';
import { InvoiceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Invoices') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoice-form',
    templateUrl: './invoice.form.component.html'
})
export class InvoiceFormComponent extends BaseFormComponent {
    public record!: InvoiceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'invoiceLineItems', sectionName: 'Invoice Line Items', isExpanded: false },
            { sectionKey: 'payments', sectionName: 'Payments', isExpanded: false }
        ]);
    }
}

export function LoadInvoiceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
