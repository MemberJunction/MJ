import { Component } from '@angular/core';
import { AssociationDemoInvoiceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Invoices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoinvoice-form',
    templateUrl: './associationdemoinvoice.form.component.html'
})
export class AssociationDemoInvoiceFormComponent extends BaseFormComponent {
    public record!: AssociationDemoInvoiceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'payments', sectionName: 'Payments', isExpanded: false },
            { sectionKey: 'invoiceLineItems', sectionName: 'Invoice Line Items', isExpanded: false }
        ]);
    }
}

