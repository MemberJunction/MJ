import { Component } from '@angular/core';
import { HubSpotLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Line Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotlineitem-form',
    templateUrl: './hubspotlineitem.form.component.html'
})
export class HubSpotLineItemFormComponent extends BaseFormComponent {
    public record!: HubSpotLineItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'productInformation', sectionName: 'Product Information', isExpanded: true },
            { sectionKey: 'pricingAndBilling', sectionName: 'Pricing and Billing', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dealLineItems', sectionName: 'Deal Line Items', isExpanded: false },
            { sectionKey: 'quoteLineItems', sectionName: 'Quote Line Items', isExpanded: false }
        ]);
    }
}

