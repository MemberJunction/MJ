import { Component } from '@angular/core';
import { YourMembershipStoreOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Store Orders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipstoreorder-form',
    templateUrl: './yourmembershipstoreorder.form.component.html'
})
export class YourMembershipStoreOrderFormComponent extends BaseFormComponent {
    public record!: YourMembershipStoreOrderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'orderSummary', sectionName: 'Order Summary', isExpanded: true },
            { sectionKey: 'fulfillment', sectionName: 'Fulfillment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'invoiceItems', sectionName: 'Invoice Items', isExpanded: false },
            { sectionKey: 'storeOrderDetails', sectionName: 'Store Order Details', isExpanded: false }
        ]);
    }
}

