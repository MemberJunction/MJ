import { Component } from '@angular/core';
import { hubspotinvoicesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Invoices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotinvoices-form',
    templateUrl: './hubspotinvoices.form.component.html'
})
export class hubspotinvoicesFormComponent extends BaseFormComponent {
    public record!: hubspotinvoicesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'shippingInformation', sectionName: 'Shipping Information', isExpanded: true },
            { sectionKey: 'invoiceDetails', sectionName: 'Invoice Details', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: false },
            { sectionKey: 'paymentInformation', sectionName: 'Payment Information', isExpanded: false },
            { sectionKey: 'senderInformation', sectionName: 'Sender Information', isExpanded: false },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: false },
            { sectionKey: 'recipientInformation', sectionName: 'Recipient Information', isExpanded: false },
            { sectionKey: 'communication', sectionName: 'Communication', isExpanded: false },
            { sectionKey: 'ownershipAndSync', sectionName: 'Ownership and Sync', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

