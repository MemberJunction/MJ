import { Component } from '@angular/core';
import { hubspotcartsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Carts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcarts-form',
    templateUrl: './hubspotcarts.form.component.html'
})
export class hubspotcartsFormComponent extends BaseFormComponent {
    public record!: hubspotcartsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'timelineAndMarketing', sectionName: 'Timeline and Marketing', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'billingInformation', sectionName: 'Billing Information', isExpanded: false },
            { sectionKey: 'cartOverview', sectionName: 'Cart Overview', isExpanded: false },
            { sectionKey: 'shippingInformation', sectionName: 'Shipping Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

