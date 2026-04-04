import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type ExternalRecord,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type SearchContext,
    type SearchResult,
    type ListContext,
    type ListResult,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Connection configuration parsed from CompanyIntegration credentials */
export interface QuickBooksConnectionConfig {
    /** OAuth 2.0 Client ID from QuickBooks developer portal */
    ClientId: string;
    /** OAuth 2.0 Client Secret */
    ClientSecret: string;
    /** OAuth 2.0 Refresh Token (auto-refreshed on each use) */
    RefreshToken: string;
    /** QuickBooks Company ID (Realm ID) */
    RealmId: string;
    /** Environment: 'production' or 'sandbox'. Default: 'production' */
    Environment?: QuickBooksEnvironment;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 3 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 200 */
    MinRequestIntervalMs?: number;
}

type QuickBooksEnvironment = 'production' | 'sandbox';

/** OAuth token state */
interface QuickBooksAuthState {
    /** Bearer access token for API calls */
    AccessToken: string;
    /** Refresh token (may be rotated) */
    RefreshToken: string;
    /** When the access token expires */
    ExpiresAt: number;
    /** Base API URL for this environment */
    BaseUrl: string;
    /** Realm ID for URL construction */
    RealmId: string;
    /** Full config for reference */
    Config: QuickBooksConnectionConfig;
}

/** QuickBooks API error response */
interface QBOErrorResponse {
    Fault?: {
        Error?: Array<{
            Message?: string;
            Detail?: string;
            code?: string;
        }>;
        type?: string;
    };
}

// ─── Constants ────────────────────────────────────────────────────────

const QBO_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const QBO_OAUTH_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

/** Minor version to pin API behavior */
const QBO_MINOR_VERSION = '73';

/** Default max retries */
const DEFAULT_MAX_RETRIES = 3;

/** Default HTTP timeout in ms */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default min interval between requests in ms */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;

/** Default page size for queries */
const DEFAULT_PAGE_SIZE = 100;

/** Max records per query (QBO limit) */
const MAX_QUERY_RESULTS = 1000;

/** Access token refresh threshold — refresh 5 min before expiry */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** QBO data type to generic type mapping */
const QBO_TYPE_MAP: Record<string, string> = {
    'String': 'string',
    'Numeric': 'decimal',
    'DateTime': 'datetime',
    'Date': 'date',
    'Boolean': 'boolean',
    'EmailAddress': 'string',
    'PhysicalAddress': 'string',
    'TelephoneNumber': 'string',
    'IdType': 'string',
    'BigDecimal': 'decimal',
    'Number': 'decimal',
    'Integer': 'integer',
};

// ─── QuickBooks Object Metadata for Action Generation ─────────────────

const QUICKBOOKS_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Customer', DisplayName: 'Customer',
        Description: 'A customer in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer display name' },
            { Name: 'GivenName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First/given name' },
            { Name: 'FamilyName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last/family name' },
            { Name: 'CompanyName', DisplayName: 'Company Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company name' },
            { Name: 'PrimaryEmailAddr', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address (value in .Address)' },
            { Name: 'PrimaryPhone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number (value in .FreeFormNumber)' },
            { Name: 'BillAddr', DisplayName: 'Billing Address', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billing address (composite object)' },
            { Name: 'Balance', DisplayName: 'Balance', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Open balance' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the customer is active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Vendor', DisplayName: 'Vendor',
        Description: 'A vendor/supplier in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor display name' },
            { Name: 'GivenName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First/given name' },
            { Name: 'FamilyName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last/family name' },
            { Name: 'CompanyName', DisplayName: 'Company Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Company name' },
            { Name: 'PrimaryEmailAddr', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
            { Name: 'PrimaryPhone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number' },
            { Name: 'Balance', DisplayName: 'Balance', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Open balance' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the vendor is active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Account', DisplayName: 'Account',
        Description: 'A Chart of Accounts entry in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account name' },
            { Name: 'AccountType', DisplayName: 'Account Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account type (Bank, Expense, Income, etc.)' },
            { Name: 'AccountSubType', DisplayName: 'Sub-Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account sub-type' },
            { Name: 'CurrentBalance', DisplayName: 'Current Balance', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current balance' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the account is active' },
            { Name: 'Classification', DisplayName: 'Classification', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Asset, Equity, Expense, Liability, Revenue' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Invoice', DisplayName: 'Invoice',
        Description: 'A sales invoice in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'DocNumber', DisplayName: 'Invoice Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'User-visible invoice number' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer reference (value = customer ID)' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice date' },
            { Name: 'DueDate', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total invoice amount' },
            { Name: 'Balance', DisplayName: 'Balance', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Remaining balance' },
            { Name: 'EmailStatus', DisplayName: 'Email Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email delivery status' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Bill', DisplayName: 'Bill',
        Description: 'A payable bill in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'DocNumber', DisplayName: 'Bill Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'User-visible bill number' },
            { Name: 'VendorRef', DisplayName: 'Vendor Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor reference (value = vendor ID)' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bill date' },
            { Name: 'DueDate', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total bill amount' },
            { Name: 'Balance', DisplayName: 'Balance', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Remaining balance' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Item', DisplayName: 'Item',
        Description: 'A product or service item in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item name' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item type (Inventory, Service, NonInventory)' },
            { Name: 'UnitPrice', DisplayName: 'Unit Price', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sales price' },
            { Name: 'PurchaseCost', DisplayName: 'Purchase Cost', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Purchase cost' },
            { Name: 'QtyOnHand', DisplayName: 'Quantity On Hand', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Current inventory quantity' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the item is active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Payment', DisplayName: 'Payment',
        Description: 'A customer payment in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer reference' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment amount' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment date' },
            { Name: 'PaymentMethodRef', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment method reference' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Employee', DisplayName: 'Employee',
        Description: 'An employee in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee display name' },
            { Name: 'GivenName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name' },
            { Name: 'FamilyName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last name' },
            { Name: 'PrimaryEmailAddr', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email' },
            { Name: 'PrimaryPhone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the employee is active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Department', DisplayName: 'Department',
        Description: 'A department/location in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department name' },
            { Name: 'ParentRef', DisplayName: 'Parent Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent department reference' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the department is active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },
    {
        Name: 'Class', DisplayName: 'Class',
        Description: 'A class for categorizing transactions in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class name' },
            { Name: 'ParentRef', DisplayName: 'Parent Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent class reference' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Whether the class is active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Create/update timestamps' },
        ],
    },

    // ── Expanded Objects (from metadata) ──────────────────────────────
    {
        Name: 'Estimate', DisplayName: 'Estimate',
        Description: 'A quote or proposal in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Estimate Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Estimate Number' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'ExpirationDate', DisplayName: 'Expiration Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expiration Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'TxnStatus', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'EmailStatus', DisplayName: 'Email Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email Status' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'SalesReceipt', DisplayName: 'Sales Receipt',
        Description: 'A cash or immediate sale in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Sales Receipt Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Sales Receipt Number' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DepositToAccountRef', DisplayName: 'Deposit To Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deposit To Account' },
            { Name: 'PaymentMethodRef', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Method' },
            { Name: 'Balance', DisplayName: 'Balance', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Balance' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'CreditMemo', DisplayName: 'Credit Memo',
        Description: 'A customer credit memo in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Credit Memo Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Credit Memo Number' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'RemainingCredit', DisplayName: 'Remaining Credit', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Remaining Credit' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'RefundReceipt', DisplayName: 'Refund Receipt',
        Description: 'A customer refund in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Refund Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Refund Number' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DepositToAccountRef', DisplayName: 'Deposit To Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deposit To Account' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'JournalEntry', DisplayName: 'Journal Entry',
        Description: 'A manual general ledger journal entry in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Journal Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Journal Number' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'PrivateNote', DisplayName: 'Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Memo' },
            { Name: 'Adjustment', DisplayName: 'Is Adjustment', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Is Adjustment' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Deposit', DisplayName: 'Deposit',
        Description: 'A bank deposit in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DepositToAccountRef', DisplayName: 'Deposit To Account', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deposit To Account' },
            { Name: 'PrivateNote', DisplayName: 'Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Memo' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Transfer', DisplayName: 'Transfer',
        Description: 'An inter-account fund transfer in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'FromAccountRef', DisplayName: 'From Account', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'From Account' },
            { Name: 'ToAccountRef', DisplayName: 'To Account', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'To Account' },
            { Name: 'PrivateNote', DisplayName: 'Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Memo' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Purchase', DisplayName: 'Purchase',
        Description: 'An expense, check, or credit card charge in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Reference Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Reference Number' },
            { Name: 'AccountRef', DisplayName: 'Account Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Ref' },
            { Name: 'PaymentType', DisplayName: 'Payment Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Type' },
            { Name: 'EntityRef', DisplayName: 'Payee Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payee Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'PrivateNote', DisplayName: 'Memo', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Memo' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'PurchaseOrder', DisplayName: 'Purchase Order',
        Description: 'A vendor purchase order in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'PO Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'PO Number' },
            { Name: 'VendorRef', DisplayName: 'Vendor Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'POStatus', DisplayName: 'PO Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'PO Status' },
            { Name: 'DueDate', DisplayName: 'Expected Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expected Date' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'VendorCredit', DisplayName: 'Vendor Credit',
        Description: 'A vendor credit in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DocNumber', DisplayName: 'Reference Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Reference Number' },
            { Name: 'VendorRef', DisplayName: 'Vendor Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'Balance', DisplayName: 'Balance', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Balance' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'BillPayment', DisplayName: 'Bill Payment',
        Description: 'A bill payment to a vendor in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'VendorRef', DisplayName: 'Vendor Ref', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor Ref' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'PayType', DisplayName: 'Payment Type', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Type' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'TaxCode', DisplayName: 'Tax Code',
        Description: 'A tax classification code in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'TaxRate', DisplayName: 'Tax Rate',
        Description: 'A tax rate in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'RateValue', DisplayName: 'Rate Value', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Rate Value' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'TaxAgency', DisplayName: 'Tax Agency',
        Description: 'A tax agency/authority in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Display Name' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Term', DisplayName: 'Term',
        Description: 'Payment terms (e.g. Net 30) in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'DueDays', DisplayName: 'Due Days', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Due Days' },
            { Name: 'DiscountPercent', DisplayName: 'Discount Percent', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Discount Percent' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'PaymentMethod', DisplayName: 'Payment Method',
        Description: 'A payment method type in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'CompanyInfo', DisplayName: 'Company Info',
        Description: 'Company metadata and settings in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'CompanyName', DisplayName: 'Company Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Company Name' },
            { Name: 'LegalName', DisplayName: 'Legal Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Legal Name' },
            { Name: 'CompanyAddr', DisplayName: 'Company Address', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Company Address' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'FiscalYearStartMonth', DisplayName: 'Fiscal Year Start', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Fiscal Year Start' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Preferences', DisplayName: 'Preferences',
        Description: 'Company preferences and settings in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'AccountingInfoPrefs', DisplayName: 'Accounting Prefs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Accounting Prefs' },
            { Name: 'SalesFormsPrefs', DisplayName: 'Sales Forms Prefs', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Sales Forms Prefs' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'ExchangeRate', DisplayName: 'Exchange Rate',
        Description: 'A currency exchange rate in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'SourceCurrencyCode', DisplayName: 'Source Currency', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Source Currency' },
            { Name: 'TargetCurrencyCode', DisplayName: 'Target Currency', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Target Currency' },
            { Name: 'Rate', DisplayName: 'Rate', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Rate' },
            { Name: 'AsOfDate', DisplayName: 'As Of Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'As Of Date' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'CompanyCurrency', DisplayName: 'Company Currency',
        Description: 'An enabled currency in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Code', DisplayName: 'Currency Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Currency Code' },
            { Name: 'Name', DisplayName: 'Currency Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Currency Name' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Budget', DisplayName: 'Budget',
        Description: 'A financial budget in QuickBooks Online', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Start Date' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'BudgetType', DisplayName: 'Budget Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Budget Type' },
            { Name: 'Active', DisplayName: 'Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Active' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'Attachable', DisplayName: 'Attachable',
        Description: 'A file attachment in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'FileName', DisplayName: 'File Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'File Name' },
            { Name: 'FileAccessUri', DisplayName: 'File Access URI', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File Access URI' },
            { Name: 'Size', DisplayName: 'File Size', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File Size' },
            { Name: 'ContentType', DisplayName: 'Content Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Content Type' },
            { Name: 'Note', DisplayName: 'Note', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Note' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'TimeActivity', DisplayName: 'Time Activity',
        Description: 'A time tracking entry in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'ID' },
            { Name: 'TxnDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date' },
            { Name: 'NameOf', DisplayName: 'Name Of', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name Of' },
            { Name: 'EmployeeRef', DisplayName: 'Employee Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee Ref' },
            { Name: 'VendorRef', DisplayName: 'Vendor Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor Ref' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer Ref' },
            { Name: 'ItemRef', DisplayName: 'Item Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item Ref' },
            { Name: 'Hours', DisplayName: 'Hours', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Hours' },
            { Name: 'Minutes', DisplayName: 'Minutes', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Minutes' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'Billable', DisplayName: 'Billable', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billable' },
            { Name: 'MetaData', DisplayName: 'Metadata', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Metadata' },
        ],
    },
    {
        Name: 'RecurringTransaction', DisplayName: 'Recurring Transaction',
        Description: 'A recurring transaction template in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction date' },
            { Name: 'TotalAmt', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total amount' },
            { Name: 'Line', DisplayName: 'Line Items', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Line items array' },
            { Name: 'RecurringInfo', DisplayName: 'Recurring Info', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Recurring schedule information' },
        ],
    },
    {
        Name: 'JournalCode', DisplayName: 'Journal Code',
        Description: 'A journal code for categorizing journal entries in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Journal code name' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Journal code type' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'TaxService', DisplayName: 'Tax Service',
        Description: 'A tax service/tax code definition in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'TaxCode', DisplayName: 'Tax Code', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Tax code identifier' },
            { Name: 'TaxCodeId', DisplayName: 'Tax Code ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'QuickBooks tax code ID' },
        ],
    },
    {
        Name: 'ReimburseCharge', DisplayName: 'Reimburse Charge',
        Description: 'A reimbursable charge in QuickBooks Online', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'QuickBooks internal ID' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Charge amount' },
            { Name: 'CustomerRef', DisplayName: 'Customer Ref', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer reference' },
            { Name: 'TxnDate', DisplayName: 'Transaction Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction date' },
        ],
    },
];

// ─── Connector Implementation ─────────────────────────────────────────

/**
 * Connector for QuickBooks Online REST API v3.
 *
 * Extends BaseIntegrationConnector directly. While QBO is REST/JSON, its
 * query model uses a custom SQL-like query language and its update operations
 * require the full object with SyncToken, making it distinct from the
 * generic BaseRESTIntegrationConnector pagination pattern.
 *
 * Auth flow:
 *   1. Exchange refresh token for access token via OAuth 2.0 token endpoint
 *   2. Access token is Bearer-authenticated on all API calls
 *   3. Refresh tokens are rotated — the connector stores the latest refresh token
 *
 * API operations:
 *   - Query: SQL-like SELECT statements (e.g., "SELECT * FROM Customer WHERE Active = true")
 *   - Read: GET /v3/company/{realmId}/{objectType}/{id}
 *   - Create: POST /v3/company/{realmId}/{objectType}
 *   - Update: POST /v3/company/{realmId}/{objectType} (full object with SyncToken)
 *   - Delete: POST /v3/company/{realmId}/{objectType}?operation=delete
 *
 * Pagination:
 *   - Query supports STARTPOSITION and MAXRESULTS
 *   - COUNT query to determine total records
 */
@RegisterClass(BaseIntegrationConnector, 'QuickBooksConnector')
export class QuickBooksConnector extends BaseIntegrationConnector {

    // ── Auth State ───────────────────────────────────────────────────

    private authState: QuickBooksAuthState | null = null;

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    // ── Capability Getters ───────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'QuickBooks'; }

    // ── Action Generation ────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return QUICKBOOKS_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;

        return {
            IntegrationName: 'QuickBooks',
            CategoryName: 'QuickBooks',
            IconClass: 'fa-solid fa-book',
            Objects: objects,
            IncludeSearch: true,
            IncludeList: true,
            CategoryDescription: 'QuickBooks Online accounting integration actions',
            ParentCategoryName: 'Business Apps',
        };
    }


    // ─── Schema Discovery (from static TS definitions) ───────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return QUICKBOOKS_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: true,
            SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const obj = QUICKBOOKS_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            Name: f.Name,
            Label: f.DisplayName,
            Description: f.Description,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
        }));
    }

    // ── Default Configuration ────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return {
            DefaultSchemaName: 'QuickBooks',
            DefaultObjects: [
                {
                    SourceObjectName: 'Customer',
                    TargetTableName: 'QuickBooks_Customer',
                    TargetEntityName: 'QuickBooks Customers',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Customer', 'Contacts'),
                },
                {
                    SourceObjectName: 'Vendor',
                    TargetTableName: 'QuickBooks_Vendor',
                    TargetEntityName: 'QuickBooks Vendors',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Vendor', 'Companies'),
                },
                {
                    SourceObjectName: 'Account',
                    TargetTableName: 'QuickBooks_Account',
                    TargetEntityName: 'QuickBooks Accounts',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Customer':
                return [
                    { SourceFieldName: 'Id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'DisplayName', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'PrimaryEmailAddr', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'PrimaryPhone', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'Active', DestinationFieldName: 'Status' },
                ];
            case 'Vendor':
                return [
                    { SourceFieldName: 'Id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'DisplayName', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'PrimaryEmailAddr', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'PrimaryPhone', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'Active', DestinationFieldName: 'Status' },
                ];
            default:
                return [];
        }
    }

    // ─── TestConnection ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser, true);
            // Hit the CompanyInfo endpoint to verify connectivity
            const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/companyinfo/${auth.RealmId}?minorversion=${QBO_MINOR_VERSION}`;
            const response = await this.MakeRequest(auth, url, 'GET');
            const body = response.Body as { CompanyInfo?: { CompanyName?: string } };
            const companyName = body.CompanyInfo?.CompanyName ?? 'Unknown';

            return {
                Success: true,
                Message: `Successfully connected to QuickBooks Online (${companyName})`,
                ServerVersion: `QuickBooks Online API v3 (minor ${QBO_MINOR_VERSION})`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }


    // ─── FetchChanges ────────────────────────────────────────────────

    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.GetAuth(ctx.CompanyIntegration, ctx.ContextUser);
        const pageSize = Math.min(ctx.BatchSize || DEFAULT_PAGE_SIZE, MAX_QUERY_RESULTS);
        const startPosition = ctx.CurrentOffset ?? 1; // QBO uses 1-based STARTPOSITION

        const whereClause = ctx.WatermarkValue
            ? ` WHERE MetaData.LastUpdatedTime >= '${ctx.WatermarkValue}'`
            : '';
        const orderBy = ' ORDERBY MetaData.LastUpdatedTime ASC';

        const query = `SELECT * FROM ${ctx.ObjectName}${whereClause}${orderBy} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
        const result = await this.ExecuteQuery(auth, query);
        const records = this.ExtractQueryRecords(result, ctx.ObjectName);

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['Id'] ?? ''),
            ObjectType: ctx.ObjectName,
            Fields: r,
            ModifiedAt: this.ExtractLastUpdatedTime(r),
        }));

        const newWatermark = this.ComputeWatermark(records);
        const hasMore = records.length >= pageSize;

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NewWatermarkValue: newWatermark,
            NextOffset: hasMore ? startPosition + records.length : undefined,
        };
    }

    // ─── CRUD Operations ─────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/${ctx.ObjectName.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}`;

        try {
            const response = await this.MakeRequest(auth, url, 'POST', ctx.Attributes);
            const body = response.Body as Record<string, Record<string, unknown>>;
            const created = body[ctx.ObjectName];
            const id = created ? String(created['Id'] ?? '') : '';
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'CreateRecord', ctx.ObjectName);
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );

        // QBO requires full object with SyncToken for updates — fetch current first
        try {
            const current = await this.FetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!current) {
                return { Success: false, ErrorMessage: `Record ${ctx.ExternalID} not found`, StatusCode: 404 };
            }

            const merged = { ...current, ...ctx.Attributes };
            const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/${ctx.ObjectName.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}`;
            const response = await this.MakeRequest(auth, url, 'POST', merged);
            const body = response.Body as Record<string, Record<string, unknown>>;
            const updated = body[ctx.ObjectName];
            const id = updated ? String(updated['Id'] ?? ctx.ExternalID) : ctx.ExternalID;
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'UpdateRecord', ctx.ObjectName);
        }
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );

        try {
            // QBO delete requires Id and SyncToken
            const current = await this.FetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!current) {
                return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 }; // Already gone
            }

            const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/${ctx.ObjectName.toLowerCase()}?operation=delete&minorversion=${QBO_MINOR_VERSION}`;
            await this.MakeRequest(auth, url, 'POST', {
                Id: ctx.ExternalID,
                SyncToken: current['SyncToken'],
            });
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'DeleteRecord', ctx.ObjectName);
        }
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );

        try {
            const record = await this.FetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!record) return null;

            return {
                ExternalID: String(record['Id'] ?? ctx.ExternalID),
                ObjectType: ctx.ObjectName,
                Fields: record,
            };
        } catch {
            return null;
        }
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;
        const startPos = ctx.Page ? ((ctx.Page - 1) * pageSize) + 1 : 1;

        const whereParts = Object.entries(ctx.Filters).map(
            ([field, value]) => `${field} = '${value.replace(/'/g, "\\'")}'`
        );
        const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : '';

        const query = `SELECT * FROM ${ctx.ObjectName}${whereClause} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
        const result = await this.ExecuteQuery(auth, query);
        const records = this.ExtractQueryRecords(result, ctx.ObjectName);

        return {
            Records: records.map(r => ({
                ExternalID: String(r['Id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: r,
            })),
            TotalCount: records.length, // QBO doesn't return total in queries
            HasMore: records.length >= pageSize,
        };
    }

    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;
        const startPos = ctx.Cursor ? parseInt(ctx.Cursor, 10) : 1;

        let whereClause = '';
        if (ctx.Filter) {
            const parts = Object.entries(ctx.Filter).map(
                ([k, v]) => `${k} = '${v.replace(/'/g, "\\'")}'`
            );
            whereClause = ` WHERE ${parts.join(' AND ')}`;
        }

        const query = `SELECT * FROM ${ctx.ObjectName}${whereClause} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
        const result = await this.ExecuteQuery(auth, query);
        const records = this.ExtractQueryRecords(result, ctx.ObjectName);

        const hasMore = records.length >= pageSize;
        const nextCursor = hasMore ? String(startPos + records.length) : undefined;

        return {
            Records: records.map(r => ({
                ExternalID: String(r['Id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: r,
            })),
            HasMore: hasMore,
            NextCursor: nextCursor,
        };
    }

    // ─── OAuth 2.0 Authentication ────────────────────────────────────

    private async GetAuth(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<QuickBooksAuthState> {
        if (!forceRefresh && this.authState && this.IsTokenValid()) {
            return this.authState;
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const auth = await this.RefreshAccessToken(config);
        this.authState = auth;
        return auth;
    }

    private IsTokenValid(): boolean {
        if (!this.authState) return false;
        return Date.now() < (this.authState.ExpiresAt - TOKEN_REFRESH_BUFFER_MS);
    }

    private async RefreshAccessToken(config: QuickBooksConnectionConfig): Promise<QuickBooksAuthState> {
        const basicAuth = Buffer.from(`${config.ClientId}:${config.ClientSecret}`).toString('base64');

        const response = await fetch(QBO_OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(config.RefreshToken)}`,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OAuth token refresh failed (${response.status}): ${errorText.slice(0, 500)}`);
        }

        const tokenData = await response.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
            token_type: string;
        };

        const baseUrl = config.Environment === 'sandbox' ? QBO_SANDBOX_BASE : QBO_PRODUCTION_BASE;

        return {
            AccessToken: tokenData.access_token,
            RefreshToken: tokenData.refresh_token,
            ExpiresAt: Date.now() + (tokenData.expires_in * 1000),
            BaseUrl: baseUrl,
            RealmId: config.RealmId,
            Config: config,
        };
    }

    // ─── Configuration Parsing ───────────────────────────────────────

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<QuickBooksConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const config = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (config) return config;
        }

        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Partial<QuickBooksConnectionConfig>;
            return this.ValidateConfig(parsed);
        }

        throw new Error('QuickBooksConnector: No credentials or configuration found on CompanyIntegration');
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<QuickBooksConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            const parsed = JSON.parse(credential.Values) as Partial<QuickBooksConnectionConfig>;
            return this.ValidateConfig(parsed);
        } catch {
            return null;
        }
    }

    private ValidateConfig(raw: Partial<QuickBooksConnectionConfig>): QuickBooksConnectionConfig {
        if (!raw.ClientId) throw new Error('QuickBooksConnector: ClientId is required');
        if (!raw.ClientSecret) throw new Error('QuickBooksConnector: ClientSecret is required');
        if (!raw.RefreshToken) throw new Error('QuickBooksConnector: RefreshToken is required');
        if (!raw.RealmId) throw new Error('QuickBooksConnector: RealmId is required');

        return {
            ClientId: raw.ClientId,
            ClientSecret: raw.ClientSecret,
            RefreshToken: raw.RefreshToken,
            RealmId: raw.RealmId,
            Environment: raw.Environment ?? 'production',
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    // ─── HTTP Transport ──────────────────────────────────────────────

    private async MakeRequest(
        auth: QuickBooksAuthState,
        url: string,
        method: string,
        body?: unknown
    ): Promise<{ Status: number; Body: unknown }> {
        const config = auth.Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);

            try {
                const controller = new AbortController();
                const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

                const headers: Record<string, string> = {
                    'Authorization': `Bearer ${auth.AccessToken}`,
                    'Accept': 'application/json',
                };
                if (body) {
                    headers['Content-Type'] = 'application/json';
                }

                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });

                clearTimeout(timeoutHandle);
                this.lastRequestTime = Date.now();

                const responseBody = await response.json() as unknown;

                if (!response.ok) {
                    const errorMsg = this.ExtractQBOErrorMessage(responseBody);
                    throw new Error(`QBO API ${response.status}: ${errorMsg}`);
                }

                return { Status: response.status, Body: responseBody };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                const isRetryable = message.includes('abort') || message.includes('timeout')
                    || message.includes('ECONNRESET') || message.includes('429')
                    || message.includes('503');

                if (!isRetryable || attempt === maxRetries) {
                    throw new Error(`QuickBooks API request failed after ${attempt + 1} attempt(s): ${message}`);
                }

                const delay = Math.pow(2, attempt) * 1000;
                await this.Sleep(delay);
            }
        }

        throw new Error('QuickBooks API request failed: max retries exceeded');
    }

    // ─── Query Execution ─────────────────────────────────────────────

    private async ExecuteQuery(auth: QuickBooksAuthState, query: string): Promise<unknown> {
        const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/query?query=${encodeURIComponent(query)}&minorversion=${QBO_MINOR_VERSION}`;
        const response = await this.MakeRequest(auth, url, 'GET');
        return response.Body;
    }

    private async FetchSingleRecord(
        auth: QuickBooksAuthState,
        objectName: string,
        id: string
    ): Promise<Record<string, unknown> | null> {
        const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/${objectName.toLowerCase()}/${id}?minorversion=${QBO_MINOR_VERSION}`;
        try {
            const response = await this.MakeRequest(auth, url, 'GET');
            const body = response.Body as Record<string, Record<string, unknown>>;
            return body[objectName] ?? null;
        } catch {
            return null;
        }
    }

    // ─── Response Parsing ────────────────────────────────────────────

    private ExtractQueryRecords(body: unknown, objectName: string): Record<string, unknown>[] {
        const typedBody = body as { QueryResponse?: Record<string, unknown> };
        const queryResponse = typedBody?.QueryResponse;
        if (!queryResponse) return [];

        const records = queryResponse[objectName] as Record<string, unknown>[] | undefined;
        return records ?? [];
    }

    private ExtractLastUpdatedTime(record: Record<string, unknown>): Date | undefined {
        const metaData = record['MetaData'] as { LastUpdatedTime?: string } | undefined;
        if (metaData?.LastUpdatedTime) {
            return new Date(metaData.LastUpdatedTime);
        }
        return undefined;
    }

    private ComputeWatermark(records: Record<string, unknown>[]): string | undefined {
        let latest: string | undefined;
        for (const record of records) {
            const metaData = record['MetaData'] as { LastUpdatedTime?: string } | undefined;
            const ts = metaData?.LastUpdatedTime;
            if (ts && (!latest || ts > latest)) {
                latest = ts;
            }
        }
        return latest;
    }

    private ExtractQBOErrorMessage(body: unknown): string {
        const typed = body as QBOErrorResponse;
        if (typed?.Fault?.Error && typed.Fault.Error.length > 0) {
            const err = typed.Fault.Error[0];
            return err.Detail || err.Message || 'Unknown QBO error';
        }
        return typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500);
    }

    // ─── Utility Helpers ─────────────────────────────────────────────

    private async Throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.Sleep(minIntervalMs - elapsed);
        }
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private BuildCRUDError(err: unknown, operation: string, objectName: string): CRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return {
            Success: false,
            ErrorMessage: `${operation} failed for ${objectName}: ${message}`,
            StatusCode: 500,
        };
    }
}

/** Tree-shaking prevention function — import and call from module entry point */
export function LoadQuickBooksConnector(): void { /* no-op */ }
