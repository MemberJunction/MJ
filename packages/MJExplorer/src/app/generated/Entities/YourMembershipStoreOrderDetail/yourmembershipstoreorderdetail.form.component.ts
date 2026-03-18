import { Component } from '@angular/core';
import { YourMembershipStoreOrderDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Store Order Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipstoreorderdetail-form',
    templateUrl: './yourmembershipstoreorderdetail.form.component.html'
})
export class YourMembershipStoreOrderDetailFormComponent extends BaseFormComponent {
    public record!: YourMembershipStoreOrderDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'lineItemDetails', sectionName: 'Line Item Details', isExpanded: true },
            { sectionKey: 'pricingAndQuantity', sectionName: 'Pricing and Quantity', isExpanded: true },
            { sectionKey: 'fulfillmentAndStatus', sectionName: 'Fulfillment and Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

