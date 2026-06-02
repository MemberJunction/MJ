import { Component } from '@angular/core';
import { hubspotdealsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdeals-form',
    templateUrl: './hubspotdeals.form.component.html'
})
export class hubspotdealsFormComponent extends BaseFormComponent {
    public record!: hubspotdealsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: true },
            { sectionKey: 'datesAndTimeline', sectionName: 'Dates and Timeline', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: false },
            { sectionKey: 'activityAndEngagement', sectionName: 'Activity and Engagement', isExpanded: false },
            { sectionKey: 'dealOverview', sectionName: 'Deal Overview', isExpanded: false },
            { sectionKey: 'forecastingAndTracking', sectionName: 'Forecasting and Tracking', isExpanded: false },
            { sectionKey: 'ownershipAndAccess', sectionName: 'Ownership and Access', isExpanded: false },
            { sectionKey: 'stageTimestamps', sectionName: 'Stage Timestamps', isExpanded: false },
            { sectionKey: 'dealOutcomes', sectionName: 'Deal Outcomes', isExpanded: false },
            { sectionKey: 'analytics', sectionName: 'Analytics', isExpanded: false },
            { sectionKey: 'partnerCollaboration', sectionName: 'Partner Collaboration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

