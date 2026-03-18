import { Component } from '@angular/core';
import { YourMembershipDonationTransactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Donation Transactions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipdonationtransaction-form',
    templateUrl: './yourmembershipdonationtransaction.form.component.html'
})
export class YourMembershipDonationTransactionFormComponent extends BaseFormComponent {
    public record!: YourMembershipDonationTransactionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'donorInformation', sectionName: 'Donor Information', isExpanded: true },
            { sectionKey: 'donationDetails', sectionName: 'Donation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'donationHistories', sectionName: 'Donation Histories', isExpanded: false }
        ]);
    }
}

