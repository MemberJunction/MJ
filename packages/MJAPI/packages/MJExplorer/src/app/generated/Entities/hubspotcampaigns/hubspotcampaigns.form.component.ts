import { Component } from '@angular/core';
import { hubspotcampaignsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Campaigns') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcampaigns-form',
    templateUrl: './hubspotcampaigns.form.component.html'
})
export class hubspotcampaignsFormComponent extends BaseFormComponent {
    public record!: hubspotcampaignsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'timelineAndBudget', sectionName: 'Timeline and Budget', isExpanded: true },
            { sectionKey: 'trackingParameters', sectionName: 'Tracking Parameters', isExpanded: true },
            { sectionKey: 'campaignOverview', sectionName: 'Campaign Overview', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

