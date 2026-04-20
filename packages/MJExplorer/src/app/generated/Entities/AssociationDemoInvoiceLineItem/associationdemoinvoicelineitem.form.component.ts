import { Component } from '@angular/core';
import { AssociationDemoInvoiceLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Invoice Line Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoinvoicelineitem-form',
    templateUrl: './associationdemoinvoicelineitem.form.component.html'
})
export class AssociationDemoInvoiceLineItemFormComponent extends BaseFormComponent {
    public record!: AssociationDemoInvoiceLineItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'lineItemDetails', sectionName: 'Line Item Details', isExpanded: true },
            { sectionKey: 'pricingAndFinancials', sectionName: 'Pricing and Financials', isExpanded: true },
            { sectionKey: 'relatedEntityInformation', sectionName: 'Related Entity Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

