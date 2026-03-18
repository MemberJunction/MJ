import { Component } from '@angular/core';
import { HubSpotDealQuoteEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Quotes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdealquote-form',
    templateUrl: './hubspotdealquote.form.component.html'
})
export class HubSpotDealQuoteFormComponent extends BaseFormComponent {
    public record!: HubSpotDealQuoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipDetails', sectionName: 'Relationship Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

