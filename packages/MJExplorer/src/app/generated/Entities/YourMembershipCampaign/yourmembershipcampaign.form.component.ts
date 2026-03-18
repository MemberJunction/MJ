import { Component } from '@angular/core';
import { YourMembershipCampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Campaigns') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcampaign-form',
    templateUrl: './yourmembershipcampaign.form.component.html'
})
export class YourMembershipCampaignFormComponent extends BaseFormComponent {
    public record!: YourMembershipCampaignEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'campaignDetails', sectionName: 'Campaign Details', isExpanded: true },
            { sectionKey: 'deliveryAndStatus', sectionName: 'Delivery and Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

