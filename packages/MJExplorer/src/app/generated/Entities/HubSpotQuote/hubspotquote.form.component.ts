import { Component } from '@angular/core';
import { HubSpotQuoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Quotes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotquote-form',
    templateUrl: './hubspotquote.form.component.html'
})
export class HubSpotQuoteFormComponent extends BaseFormComponent {
    public record!: HubSpotQuoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'quoteDetails', sectionName: 'Quote Details', isExpanded: true },
            { sectionKey: 'pricingAndCurrency', sectionName: 'Pricing and Currency', isExpanded: true },
            { sectionKey: 'senderInformation', sectionName: 'Sender Information', isExpanded: false },
            { sectionKey: 'accessAndSharing', sectionName: 'Access and Sharing', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dealQuotes', sectionName: 'Deal Quotes', isExpanded: false },
            { sectionKey: 'quoteContacts', sectionName: 'Quote Contacts', isExpanded: false },
            { sectionKey: 'quoteLineItems', sectionName: 'Quote Line Items', isExpanded: false }
        ]);
    }
}

