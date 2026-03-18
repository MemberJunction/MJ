import { Component } from '@angular/core';
import { YourMembershipDuesTransactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Dues Transactions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipduestransaction-form',
    templateUrl: './yourmembershipduestransaction.form.component.html'
})
export class YourMembershipDuesTransactionFormComponent extends BaseFormComponent {
    public record!: YourMembershipDuesTransactionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'paymentAndInvoiceDetails', sectionName: 'Payment and Invoice Details', isExpanded: true },
            { sectionKey: 'memberInformation', sectionName: 'Member Information', isExpanded: true },
            { sectionKey: 'membershipProfile', sectionName: 'Membership Profile', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

