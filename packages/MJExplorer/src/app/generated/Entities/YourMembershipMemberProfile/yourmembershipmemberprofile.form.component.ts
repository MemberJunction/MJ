import { Component } from '@angular/core';
import { YourMembershipMemberProfileEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Member Profiles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmemberprofile-form',
    templateUrl: './yourmembershipmemberprofile.form.component.html'
})
export class YourMembershipMemberProfileFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberProfileEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'memberIdentity', sectionName: 'Member Identity', isExpanded: true },
            { sectionKey: 'membershipAndStatus', sectionName: 'Membership and Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'groupMembershipLogs', sectionName: 'Group Membership Logs', isExpanded: false },
            { sectionKey: 'connections', sectionName: 'Connections', isExpanded: false },
            { sectionKey: 'memberFavorites', sectionName: 'Member Favorites', isExpanded: false },
            { sectionKey: 'donationHistories', sectionName: 'Donation Histories', isExpanded: false },
            { sectionKey: 'memberNetworks', sectionName: 'Member Networks', isExpanded: false },
            { sectionKey: 'engagementScores', sectionName: 'Engagement Scores', isExpanded: false },
            { sectionKey: 'memberGroups', sectionName: 'Member Groups', isExpanded: false }
        ]);
    }
}

