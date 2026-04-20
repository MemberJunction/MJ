import { Component } from '@angular/core';
import { AssociationDemoCommitteeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Committees') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocommittee-form',
    templateUrl: './associationdemocommittee.form.component.html'
})
export class AssociationDemoCommitteeFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCommitteeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'committeeOverview', sectionName: 'Committee Overview', isExpanded: true },
            { sectionKey: 'operationsAndGovernance', sectionName: 'Operations and Governance', isExpanded: true },
            { sectionKey: 'leadershipAndMembership', sectionName: 'Leadership and Membership', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'committeeMemberships', sectionName: 'Committee Memberships', isExpanded: false }
        ]);
    }
}

