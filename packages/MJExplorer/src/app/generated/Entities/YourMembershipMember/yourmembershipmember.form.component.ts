import { Component } from '@angular/core';
import { YourMembershipMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Members') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmember-form',
    templateUrl: './yourmembershipmember.form.component.html'
})
export class YourMembershipMemberFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'memberProfile', sectionName: 'Member Profile', isExpanded: true },
            { sectionKey: 'contactInformation', sectionName: 'Contact Information', isExpanded: true },
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'memberGroupBulks', sectionName: 'Member Group Bulks', isExpanded: false },
            { sectionKey: 'memberReferralsReferredID', sectionName: 'Member Referrals (Referred Member)', isExpanded: false },
            { sectionKey: 'certificationJournals', sectionName: 'Certification Journals', isExpanded: false },
            { sectionKey: 'duesTransactions', sectionName: 'Dues Transactions', isExpanded: false },
            { sectionKey: 'memberSubAccountsID', sectionName: 'Member Sub Accounts (ID)', isExpanded: false },
            { sectionKey: 'memberReferralsReferrerID', sectionName: 'Member Referrals (Referrer)', isExpanded: false },
            { sectionKey: 'donationTransactions', sectionName: 'Donation Transactions', isExpanded: false },
            { sectionKey: 'memberSubAccountsParentID', sectionName: 'Member Sub Accounts (Parent Account)', isExpanded: false },
            { sectionKey: 'storeOrders', sectionName: 'Store Orders', isExpanded: false },
            { sectionKey: 'storeOrderDetails', sectionName: 'Store Order Details', isExpanded: false },
            { sectionKey: 'invoiceItems', sectionName: 'Invoice Items', isExpanded: false },
            { sectionKey: 'quotes', sectionName: 'Quotes', isExpanded: false },
            { sectionKey: 'emailsHsEmailSenderEmail', sectionName: 'Emails (Sender Email)', isExpanded: false },
            { sectionKey: 'emailsHsEmailSenderFirstname', sectionName: 'Emails (Sender First Name)', isExpanded: false },
            { sectionKey: 'emailsHsEmailSenderLastname', sectionName: 'Emails (Sender Last Name)', isExpanded: false },
            { sectionKey: 'emailsHsEmailToEmail', sectionName: 'Emails (Recipient Email)', isExpanded: false },
            { sectionKey: 'companiesCity', sectionName: 'Companies (City)', isExpanded: false },
            { sectionKey: 'companiesAddress', sectionName: 'Companies (Address Line 1)', isExpanded: false },
            { sectionKey: 'contactsEmail', sectionName: 'Contacts (Email)', isExpanded: false },
            { sectionKey: 'companiesAddress2', sectionName: 'Companies (Address Line 2)', isExpanded: false },
            { sectionKey: 'contactsLastname', sectionName: 'Contacts (Last Name)', isExpanded: false },
            { sectionKey: 'companiesPhone', sectionName: 'Companies (Phone Number)', isExpanded: false },
            { sectionKey: 'contactsCountry', sectionName: 'Contacts (Country)', isExpanded: false },
            { sectionKey: 'companiesState', sectionName: 'Companies (State/Province)', isExpanded: false },
            { sectionKey: 'contactsFirstname', sectionName: 'Contacts (First Name)', isExpanded: false },
            { sectionKey: 'companiesCountry', sectionName: 'Companies (Country)', isExpanded: false },
            { sectionKey: 'contactsCity', sectionName: 'Contacts (City)', isExpanded: false },
            { sectionKey: 'contactsState', sectionName: 'Contacts (State / Region)', isExpanded: false },
            { sectionKey: 'contactsPhone', sectionName: 'Contacts (Phone)', isExpanded: false }
        ]);
    }
}

