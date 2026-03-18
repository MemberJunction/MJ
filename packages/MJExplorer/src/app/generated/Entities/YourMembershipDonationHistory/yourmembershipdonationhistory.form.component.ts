import { Component } from '@angular/core';
import { YourMembershipDonationHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Donation Histories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipdonationhistory-form',
    templateUrl: './yourmembershipdonationhistory.form.component.html'
})
export class YourMembershipDonationHistoryFormComponent extends BaseFormComponent {
    public record!: YourMembershipDonationHistoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'transactionDetails', sectionName: 'Transaction Details', isExpanded: true },
            { sectionKey: 'donorFundDetails', sectionName: 'Donor & Fund Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

