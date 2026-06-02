import { Component } from '@angular/core';
import { hubspotordersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Orders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotorders-form',
    templateUrl: './hubspotorders.form.component.html'
})
export class hubspotordersFormComponent extends BaseFormComponent {
    public record!: hubspotordersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'marketingAttribution', sectionName: 'Marketing Attribution', isExpanded: true },
            { sectionKey: 'orderOverview', sectionName: 'Order Overview', isExpanded: true },
            { sectionKey: 'customerInformation', sectionName: 'Customer Information', isExpanded: false },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: false },
            { sectionKey: 'billingAddress', sectionName: 'Billing Address', isExpanded: false },
            { sectionKey: 'shippingAddress', sectionName: 'Shipping Address', isExpanded: false },
            { sectionKey: 'externalSystemIntegration', sectionName: 'External System Integration', isExpanded: false },
            { sectionKey: 'logisticsAndTracking', sectionName: 'Logistics and Tracking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

