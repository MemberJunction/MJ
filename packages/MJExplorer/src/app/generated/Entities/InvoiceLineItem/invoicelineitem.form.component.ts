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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadInvoiceLineItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
