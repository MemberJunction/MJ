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

/**
 * Every `MJ: Integrations` name that identifies each ERP provider, canonical name first.
 *
 * The same ERP can be registered under more than one Integration name: MJ's Integrations
 * connector registers Business Central as `business-central`, and older hosts use
 * `BusinessCentral`. Connection lookups match any alias; plugins still register under the
 * canonical name ({@link ERP_INTEGRATION}), so a resolved alias is mapped back with
 * {@link CanonicalERPIntegrationName} before the ClassFactory key is built.
 *
 * QuickBooks has no alias yet: the QuickBooks connector's `QuickBooks` Integration keeps its
 * tokens in an MJ Credential, which the QuickBooks plugins cannot read.
 */
export const ERP_INTEGRATION_ALIASES: Readonly<Record<AccountingERPIntegrationName, readonly string[]>> = {
    [ERP_INTEGRATION.QuickBooksOnline]: [ERP_INTEGRATION.QuickBooksOnline],
    [ERP_INTEGRATION.BusinessCentral]: [ERP_INTEGRATION.BusinessCentral, 'business-central', 'BusinessCentral'],
};

/** Every Integration name, across all providers, that counts as an accounting ERP connection. */
export const ACCOUNTING_ERP_INTEGRATION_ALIASES: readonly string[] =
    ACCOUNTING_ERP_INTEGRATION_NAMES.flatMap(name => ERP_INTEGRATION_ALIASES[name]);

/**
 * Maps an Integration name (canonical or alias, compared case-insensitively) to the canonical
 * provider name the plugins register under.
 *
 * @param integrationName - An `MJ: Integrations` name, e.g. `business-central`.
 * @returns The canonical provider name, or `undefined` when the name is not a known ERP.
 */
export function CanonicalERPIntegrationName(integrationName: string | null | undefined): AccountingERPIntegrationName | undefined {
    const normalized = integrationName?.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    return ACCOUNTING_ERP_INTEGRATION_NAMES.find(canonical =>
        ERP_INTEGRATION_ALIASES[canonical].some(alias => alias.toLowerCase() === normalized)
    );
}

/**
 * All Integration names for the provider that `integrationName` belongs to.
 *
 * @param integrationName - A canonical provider name or one of its aliases.
 * @returns The provider's aliases (canonical first), or `[integrationName]` for a name this
 *          package does not know, so a third-party ERP plugin can still be matched by its own name.
 */
export function ERPIntegrationNameAliases(integrationName: string): readonly string[] {
    const canonical = CanonicalERPIntegrationName(integrationName);
    return canonical ? ERP_INTEGRATION_ALIASES[canonical] : [integrationName];
}

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
