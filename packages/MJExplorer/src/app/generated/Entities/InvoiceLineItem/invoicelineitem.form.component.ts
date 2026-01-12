import { Component } from '@angular/core';
import { InvoiceLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Invoice Line Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-invoicelineitem-form',
    templateUrl: './invoicelineitem.form.component.html'
})
export class InvoiceLineItemFormComponent extends BaseFormComponent {
    public record!: InvoiceLineItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invoiceAssociation', sectionName: 'Invoice Association', isExpanded: true },
            { sectionKey: 'itemInformation', sectionName: 'Item Information', isExpanded: true },
            { sectionKey: 'pricing', sectionName: 'Pricing', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadInvoiceLineItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
