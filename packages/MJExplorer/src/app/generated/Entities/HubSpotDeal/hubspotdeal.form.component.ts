import { Component } from '@angular/core';
import { HubSpotDealEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Deals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdeal-form',
    templateUrl: './hubspotdeal.form.component.html'
})
export class HubSpotDealFormComponent extends BaseFormComponent {
    public record!: HubSpotDealEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dealOverview', sectionName: 'Deal Overview', isExpanded: true },
            { sectionKey: 'financialsTimeline', sectionName: 'Financials & Timeline', isExpanded: true },
            { sectionKey: 'pipelineTracking', sectionName: 'Pipeline Tracking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dealTasks', sectionName: 'Deal Tasks', isExpanded: false },
            { sectionKey: 'dealEmails', sectionName: 'Deal Emails', isExpanded: false },
            { sectionKey: 'dealLineItems', sectionName: 'Deal Line Items', isExpanded: false },
            { sectionKey: 'dealNotes', sectionName: 'Deal Notes', isExpanded: false },
            { sectionKey: 'dealCalls', sectionName: 'Deal Calls', isExpanded: false },
            { sectionKey: 'dealMeetings', sectionName: 'Deal Meetings', isExpanded: false },
            { sectionKey: 'dealQuotes', sectionName: 'Deal Quotes', isExpanded: false },
            { sectionKey: 'contactDeals', sectionName: 'Contact Deals', isExpanded: false },
            { sectionKey: 'companyDeals', sectionName: 'Company Deals', isExpanded: false }
        ]);
    }
}

