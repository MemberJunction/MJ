import { Component } from '@angular/core';
import { CampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Campaigns') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaign-form',
    templateUrl: './campaign.form.component.html'
})
export class CampaignFormComponent extends BaseFormComponent {
    public record!: CampaignEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'campaignMembers', sectionName: 'Campaign Members', isExpanded: false },
            { sectionKey: 'emailSends', sectionName: 'Email Sends', isExpanded: false }
        ]);
    }
}

export function LoadCampaignFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
