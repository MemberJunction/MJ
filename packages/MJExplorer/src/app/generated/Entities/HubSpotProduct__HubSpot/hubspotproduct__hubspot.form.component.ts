import { Component } from '@angular/core';
import { HubSpotProduct__HubSpotEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Products__HubSpot') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotproduct__hubspot-form',
    templateUrl: './hubspotproduct__hubspot.form.component.html'
})
export class HubSpotProduct__HubSpotFormComponent extends BaseFormComponent {
    public record!: HubSpotProduct__HubSpotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productDetails', sectionName: 'Product Details', isExpanded: true },
            { sectionKey: 'pricingAndBilling', sectionName: 'Pricing and Billing', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'lineItems', sectionName: 'Line Items', isExpanded: false }
        ]);
    }
}

