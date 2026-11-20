import { Component } from '@angular/core';
import { MJJurisdictionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Jurisdictions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjjurisdiction-form',
    templateUrl: './mjjurisdiction.form.component.html'
})
export class MJJurisdictionFormComponent extends BaseFormComponent {
    public record!: MJJurisdictionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJJurisdictionMembersGroupJurisdictionID', sectionName: 'Jurisdiction Members (Group Jurisdiction ID)', isExpanded: false },
            { sectionKey: 'mJJurisdictionMembersMemberJurisdictionID', sectionName: 'Jurisdiction Members (Member Jurisdiction ID)', isExpanded: false },
            { sectionKey: 'mJCommunicationSenders', sectionName: 'Communication Senders', isExpanded: false },
            { sectionKey: 'mJCommunicationComplianceRegimeJurisdictions', sectionName: 'Communication Compliance Regime Jurisdictions', isExpanded: false }
        ]);
    }
}

