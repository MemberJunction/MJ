import { Component } from '@angular/core';
import { CampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Campaigns') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-campaign-form',
    templateUrl: './campaign.form.component.html'
})
export class CampaignFormComponent extends BaseFormComponent {
    public record!: CampaignEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'donations', sectionName: 'Donations', isExpanded: false },
            { sectionKey: 'events', sectionName: 'Events', isExpanded: false },
            { sectionKey: 'grants', sectionName: 'Grant _s', isExpanded: false }
        ]);
    }
}

