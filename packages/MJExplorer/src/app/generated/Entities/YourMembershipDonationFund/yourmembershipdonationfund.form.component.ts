import { Component } from '@angular/core';
import { YourMembershipDonationFundEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Donation Funds') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipdonationfund-form',
    templateUrl: './yourmembershipdonationfund.form.component.html'
})
export class YourMembershipDonationFundFormComponent extends BaseFormComponent {
    public record!: YourMembershipDonationFundEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'fundDetails', sectionName: 'Fund Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'donationTransactions', sectionName: 'Donation Transactions', isExpanded: false }
        ]);
    }
}

