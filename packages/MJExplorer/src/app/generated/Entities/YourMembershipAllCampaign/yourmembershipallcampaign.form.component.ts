import { Component } from '@angular/core';
import { YourMembershipAllCampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'All Campaigns') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipallcampaign-form',
    templateUrl: './yourmembershipallcampaign.form.component.html'
})
export class YourMembershipAllCampaignFormComponent extends BaseFormComponent {
    public record!: YourMembershipAllCampaignEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'campaignDetails', sectionName: 'Campaign Details', isExpanded: true },
            { sectionKey: 'deliveryAndPerformance', sectionName: 'Delivery and Performance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

