import { Component } from '@angular/core';
import { MJCompanyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompany-form',
    templateUrl: './mjcompany.form.component.html'
})
export class MJCompanyFormComponent extends BaseFormComponent {
    public record!: MJCompanyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreCompanyInfo', sectionName: 'Core Company Info', isExpanded: true },
            { sectionKey: 'brandingDigitalPresence', sectionName: 'Branding & Digital Presence', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrations', sectionName: 'Company Integrations', isExpanded: false },
            { sectionKey: 'mJEmployees', sectionName: 'Employees', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MCP Server Connections', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJSignatureAccounts', sectionName: 'Signature Accounts', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingTaxLiabilities', sectionName: 'Tax Liabilities', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingGLAccounts', sectionName: 'GL Accounts', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingIntercompanyAccountMatchesTargetCompanyID', sectionName: 'Intercompany Account Matches (Target Company)', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingIntercompanyAccountMatchesSourceCompanyID', sectionName: 'Intercompany Account Matches (Source Company)', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingJournalEntrySequences', sectionName: 'Journal Entry Sequences', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingJournalEntries', sectionName: 'Journal Entries', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingCompanyTaxNexus', sectionName: 'Company Tax Nexus', isExpanded: false },
            { sectionKey: 'mJBizAppsAccountingJournalEntryBatches', sectionName: 'Journal Entry Batches', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentProviders', sectionName: 'Payment Providers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProducts', sectionName: 'Products', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPromotions', sectionName: 'Promotions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderCompanyPolicies', sectionName: 'Order Company Policies', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderLines', sectionName: 'Order Lines', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersProductCategories', sectionName: 'Product Categories', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersStoredValueAccounts', sectionName: 'Stored Value Accounts', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentDetails', sectionName: 'Payment Details', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersOrderHeaders', sectionName: 'Order Headers', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersSubscriptions', sectionName: 'Subscriptions', isExpanded: false },
            { sectionKey: 'mJBizAppsOrdersPaymentHeaders', sectionName: 'Payment Headers', isExpanded: false }
        ]);
    }
}

