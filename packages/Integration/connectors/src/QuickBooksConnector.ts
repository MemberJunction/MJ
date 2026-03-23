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

    // ─── Discovery ───────────────────────────────────────────────────

    public async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        // QBO doesn't have a dynamic discovery API — return known objects
        return QUICKBOOKS_OBJECTS.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName,
            Description: obj.Description,
            SupportsIncrementalSync: true,
            SupportsWrite: obj.SupportsWrite,
        }));
    }

    public async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const obj = QUICKBOOKS_OBJECTS.find(o => o.Name === objectName);
        if (!obj) throw new Error(`Unknown QuickBooks object: ${objectName}`);

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
