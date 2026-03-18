import { Component } from '@angular/core';
import { HubSpotQuoteLineItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Quote Line Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotquotelineitem-form',
    templateUrl: './hubspotquotelineitem.form.component.html'
})
export class HubSpotQuoteLineItemFormComponent extends BaseFormComponent {
    public record!: HubSpotQuoteLineItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'quoteAssociation', sectionName: 'Quote Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

