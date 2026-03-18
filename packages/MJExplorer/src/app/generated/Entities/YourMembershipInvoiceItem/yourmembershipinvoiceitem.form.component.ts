import { Component } from '@angular/core';
import { YourMembershipInvoiceItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Invoice Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipinvoiceitem-form',
    templateUrl: './yourmembershipinvoiceitem.form.component.html'
})
export class YourMembershipInvoiceItemFormComponent extends BaseFormComponent {
    public record!: YourMembershipInvoiceItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invoiceItemDetails', sectionName: 'Invoice & Item Details', isExpanded: true },
            { sectionKey: 'customerInformation', sectionName: 'Customer Information', isExpanded: true },
            { sectionKey: 'pricingAccounting', sectionName: 'Pricing & Accounting', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

