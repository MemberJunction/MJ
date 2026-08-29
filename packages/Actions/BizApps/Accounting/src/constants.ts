/**
 * ERP Integration.Name values that this package can dispatch to.
 * Plugin RegisterClass keys are `${verb}:${integrationName}` and MUST match
 * the Integration.Name row in MJ: Integrations.
 */
export const ERP_INTEGRATION = {
    QuickBooksOnline: 'QuickBooks Online',
    BusinessCentral: 'Microsoft Dynamics 365 Business Central',
} as const;

export type AccountingERPIntegrationName =
    (typeof ERP_INTEGRATION)[keyof typeof ERP_INTEGRATION];

export const ACCOUNTING_ERP_INTEGRATION_NAMES: readonly AccountingERPIntegrationName[] = [
    ERP_INTEGRATION.QuickBooksOnline,
    ERP_INTEGRATION.BusinessCentral,
];

/** Verb names — RegisterClass keys on the dispatcher BaseAction subclasses. */
export const ACCOUNTING_VERBS = {
    GetChartOfAccounts: 'GetChartOfAccounts',
    GetAccountBalances: 'GetAccountBalances',
    CreateJournalEntry: 'CreateJournalEntry',
    GetDimensions: 'GetDimensions',
    GetGLEntries: 'GetGLEntries',
    GetCustomers: 'GetCustomers',
    GetSalesInvoices: 'GetSalesInvoices',
} as const;

export type AccountingVerb = (typeof ACCOUNTING_VERBS)[keyof typeof ACCOUNTING_VERBS];

/** Plugin ClassFactory key: `CreateJournalEntry:QuickBooks Online`. */
export function erpPluginKey(verb: string, integrationName: string): string {
    return `${verb}:${integrationName}`;
}
