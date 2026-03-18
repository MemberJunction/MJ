import { Component } from '@angular/core';
import { HubSpotQuoteContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Quote Contacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotquotecontact-form',
    templateUrl: './hubspotquotecontact.form.component.html'
})
export class HubSpotQuoteContactFormComponent extends BaseFormComponent {
    public record!: HubSpotQuoteContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

