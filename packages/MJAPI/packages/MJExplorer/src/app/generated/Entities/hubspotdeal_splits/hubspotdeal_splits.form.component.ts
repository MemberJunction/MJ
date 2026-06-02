import { Component } from '@angular/core';
import { hubspotdeal_splitsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Splits') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdeal_splits-form',
    templateUrl: './hubspotdeal_splits.form.component.html'
})
export class hubspotdeal_splitsFormComponent extends BaseFormComponent {
    public record!: hubspotdeal_splitsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordProvenance', sectionName: 'Record Provenance', isExpanded: true },
            { sectionKey: 'revenueSplitDetails', sectionName: 'Revenue Split Details', isExpanded: true },
            { sectionKey: 'dealAssociation', sectionName: 'Deal Association', isExpanded: false },
            { sectionKey: 'ownershipAndAssignment', sectionName: 'Ownership and Assignment', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

