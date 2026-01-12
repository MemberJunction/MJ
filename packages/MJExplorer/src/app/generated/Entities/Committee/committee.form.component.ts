import { Component } from '@angular/core';
import { CommitteeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Committees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committee-form',
    templateUrl: './committee.form.component.html'
})
export class CommitteeFormComponent extends BaseFormComponent {
    public record!: CommitteeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'scheduleTimeline', sectionName: 'Schedule & Timeline', isExpanded: true },
            { sectionKey: 'leadershipStatus', sectionName: 'Leadership & Status', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'committeeMemberships', sectionName: 'Committee Memberships', isExpanded: false }
        ]);
    }
}

export function LoadCommitteeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
