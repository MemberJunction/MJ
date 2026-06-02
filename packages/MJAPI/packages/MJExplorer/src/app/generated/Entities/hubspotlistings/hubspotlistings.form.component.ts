import { Component } from '@angular/core';
import { hubspotlistingsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Listings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotlistings-form',
    templateUrl: './hubspotlistings.form.component.html'
})
export class hubspotlistingsFormComponent extends BaseFormComponent {
    public record!: hubspotlistingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'listingDetails', sectionName: 'Listing Details', isExpanded: true },
            { sectionKey: 'workflowAndOwnership', sectionName: 'Workflow and Ownership', isExpanded: true },
            { sectionKey: 'propertySpecifications', sectionName: 'Property Specifications', isExpanded: false },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: false },
            { sectionKey: 'locationInformation', sectionName: 'Location Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

