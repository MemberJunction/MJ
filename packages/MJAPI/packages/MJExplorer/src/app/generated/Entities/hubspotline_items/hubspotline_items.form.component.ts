import { Component } from '@angular/core';
import { hubspotline_itemsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Line Items') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotline_items-form',
    templateUrl: './hubspotline_items.form.component.html'
})
export class hubspotline_itemsFormComponent extends BaseFormComponent {
    public record!: hubspotline_itemsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'salesAndPricing', sectionName: 'Sales and Pricing', isExpanded: true },
            { sectionKey: 'ownershipAndAudit', sectionName: 'Ownership and Audit', isExpanded: true },
            { sectionKey: 'taxAndMargin', sectionName: 'Tax and Margin', isExpanded: false },
            { sectionKey: 'productInformation', sectionName: 'Product Information', isExpanded: false },
            { sectionKey: 'billingSchedule', sectionName: 'Billing Schedule', isExpanded: false },
            { sectionKey: 'revenueMetrics', sectionName: 'Revenue Metrics', isExpanded: false },
            { sectionKey: 'integrationAndReferences', sectionName: 'Integration and References', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

