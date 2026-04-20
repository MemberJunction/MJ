import { Component } from '@angular/core';
import { AssociationDemoCampaignMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Campaign Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocampaignmember-form',
    templateUrl: './associationdemocampaignmember.form.component.html'
})
export class AssociationDemoCampaignMemberFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCampaignMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'campaignMembership', sectionName: 'Campaign Membership', isExpanded: true },
            { sectionKey: 'interactionTracking', sectionName: 'Interaction Tracking', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

