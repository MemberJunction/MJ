import { Component } from '@angular/core';
import { YourMembershipShippingMethodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Shipping Methods') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipshippingmethod-form',
    templateUrl: './yourmembershipshippingmethod.form.component.html'
})
export class YourMembershipShippingMethodFormComponent extends BaseFormComponent {
    public record!: YourMembershipShippingMethodEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'shippingMethodDetails', sectionName: 'Shipping Method Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'storeOrders', sectionName: 'Store Orders', isExpanded: false },
            { sectionKey: 'storeOrderDetails', sectionName: 'Store Order Details', isExpanded: false }
        ]);
    }
}

