import { Component } from '@angular/core';
import { CommitteeMembershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Committee Memberships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-committeemembership-form',
    templateUrl: './committeemembership.form.component.html'
})
export class CommitteeMembershipFormComponent extends BaseFormComponent {
    public record!: CommitteeMembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'committeeAssignment', sectionName: 'Committee Assignment', isExpanded: true },
            { sectionKey: 'membershipTimeline', sectionName: 'Membership Timeline', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadCommitteeMembershipFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
