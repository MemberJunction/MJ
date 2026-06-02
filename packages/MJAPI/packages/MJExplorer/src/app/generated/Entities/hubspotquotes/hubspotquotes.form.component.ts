import { Component } from '@angular/core';
import { hubspotquotesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Quotes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotquotes-form',
    templateUrl: './hubspotquotes.form.component.html'
})
export class hubspotquotesFormComponent extends BaseFormComponent {
    public record!: hubspotquotesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'publicAccess', sectionName: 'Public Access', isExpanded: true },
            { sectionKey: 'billingAddress', sectionName: 'Billing Address', isExpanded: true },
            { sectionKey: 'paymentAndBilling', sectionName: 'Payment and Billing', isExpanded: false },
            { sectionKey: 'senderDetails', sectionName: 'Sender Details', isExpanded: false },
            { sectionKey: 'securityAndWorkflow', sectionName: 'Security and Workflow', isExpanded: false },
            { sectionKey: 'timelineAndTracking', sectionName: 'Timeline and Tracking', isExpanded: false },
            { sectionKey: 'quoteSummary', sectionName: 'Quote Summary', isExpanded: false },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: false },
            { sectionKey: 'quoteContent', sectionName: 'Quote Content', isExpanded: false },
            { sectionKey: 'contractTimeline', sectionName: 'Contract Timeline', isExpanded: false },
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

