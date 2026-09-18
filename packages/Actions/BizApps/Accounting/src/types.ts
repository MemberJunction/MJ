/**
 * Shared shapes for ERP accounting verbs. Provider plugins may emit extra
 * fields; callers of the verb set should rely on these.
 */

export interface JournalEntryLine {
    /** Provider account id (QBO Account.Id / BC accountId). */
    accountId?: string;
    /** ERP account number — preferred when posting (AM-4). */
    accountNumber?: string;
    debit?: number;
    credit?: number;
    description?: string;
    dimensions?: Array<{ code: string; valueCode: string }>;
    entityType?: 'Customer' | 'Vendor' | 'Employee';
    entityId?: string;
    classId?: string;
    departmentId?: string;
}

export interface ChartOfAccount {
    id: string;
    code: string;
    name: string;
    accountType: string;
    isActive: boolean;
}

export interface AccountBalance {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    accountSubType?: string;
    normalBalance?: 'Debit' | 'Credit';
    currentBalance: number;
    balanceWithSubAccounts?: number;
    currency?: string;
    asOfDate: Date;
    isActive?: boolean;
    level?: number;
    parentAccountId?: string;
    parentAccountName?: string;
}

export interface DimensionValue {
    code: string;
    displayName: string;
}

export interface Dimension {
    code: string;
    displayName: string;
    values: DimensionValue[];
}

export interface ResolvedAccountingIntegration {
    /** Integration.Name — the ERP vendor string used in plugin keys. */
    Name: string;
    CompanyIntegrationID: string;
    CompanyID: string;
    IntegrationID: string;
}
