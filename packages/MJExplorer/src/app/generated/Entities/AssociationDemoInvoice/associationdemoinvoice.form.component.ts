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
            { sectionKey: 'invoiceDetails', sectionName: 'Invoice Details', isExpanded: true },
            { sectionKey: 'financialSummary', sectionName: 'Financial Summary', isExpanded: true },
            { sectionKey: 'additionalInformation', sectionName: 'Additional Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'payments', sectionName: 'Payments', isExpanded: false },
            { sectionKey: 'invoiceLineItems', sectionName: 'Invoice Line Items', isExpanded: false }
        ]);
    }
}

