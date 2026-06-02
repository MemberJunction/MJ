import { Component } from '@angular/core';
import { hubspotsubscriptionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Subscriptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsubscriptions-form',
    templateUrl: './hubspotsubscriptions.form.component.html'
})
export class hubspotsubscriptionsFormComponent extends BaseFormComponent {
    public record!: hubspotsubscriptionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipAndAssignment', sectionName: 'Ownership and Assignment', isExpanded: true },
            { sectionKey: 'billingInformation', sectionName: 'Billing Information', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: false },
            { sectionKey: 'subscriptionOverview', sectionName: 'Subscription Overview', isExpanded: false },
            { sectionKey: 'paymentSettings', sectionName: 'Payment Settings', isExpanded: false },
            { sectionKey: 'subscriptionTimeline', sectionName: 'Subscription Timeline', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

