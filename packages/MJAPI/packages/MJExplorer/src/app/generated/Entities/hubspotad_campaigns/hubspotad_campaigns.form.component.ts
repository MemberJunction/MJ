import { Component } from '@angular/core';
import { hubspotad_campaignsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ad Campaigns') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotad_campaigns-form',
    templateUrl: './hubspotad_campaigns.form.component.html'
})
export class hubspotad_campaignsFormComponent extends BaseFormComponent {
    public record!: hubspotad_campaignsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'timelineAndBudget', sectionName: 'Timeline and Budget', isExpanded: true },
            { sectionKey: 'campaignDetails', sectionName: 'Campaign Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

