import { Component } from '@angular/core';
import { hubspotcommerce_paymentsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Commerce Payments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcommerce_payments-form',
    templateUrl: './hubspotcommerce_payments.form.component.html'
})
export class hubspotcommerce_paymentsFormComponent extends BaseFormComponent {
    public record!: hubspotcommerce_paymentsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'refundsAndDisputes', sectionName: 'Refunds and Disputes', isExpanded: true },
            { sectionKey: 'discounts', sectionName: 'Discounts', isExpanded: false },
            { sectionKey: 'paymentStatusAndTimeline', sectionName: 'Payment Status and Timeline', isExpanded: false },
            { sectionKey: 'sourceInformation', sectionName: 'Source Information', isExpanded: false },
            { sectionKey: 'shippingAddress', sectionName: 'Shipping Address', isExpanded: false },
            { sectionKey: 'billingAddress', sectionName: 'Billing Address', isExpanded: false },
            { sectionKey: 'paymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'customerDetails', sectionName: 'Customer Details', isExpanded: false },
            { sectionKey: 'notes', sectionName: 'Notes', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

