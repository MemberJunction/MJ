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
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type SourceSchemaInfo,
    type SourceRelationshipInfo,
} from '@memberjunction/integration-engine';

// ─── Configuration & Session Types ──────────────────────────────

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface YMConnectionConfig {
    /** YM client/site identifier (integer) */
    ClientID: string;
    /** YM API key (used as UserName for session auth) */
    APIKey: string;
    /** YM API password (used as Password for session auth) */
    APIPassword: string;
}

/** Cached session data */
interface YMSession {
    SessionId: string;
    CreatedAt: number;
}

/** YM REST API base URL */
const YM_API_BASE = 'https://ws.yourmembership.com';

/** Sessions expire after 14 minutes (YM sessions last ~15 min) */
const SESSION_TTL_MS = 14 * 60 * 1000;

// ─── Endpoint Registry ──────────────────────────────────────────

/** Configuration for a YM API endpoint/object */
interface YMObjectConfig {
    /** API path segment (e.g., 'MemberList') */
    Path: string;
    /** Human-readable label */
    Label: string;
    /** JSON key containing the data array in the response. Null for raw array responses. */
    ResponseDataKey: string | null;
    /** Primary key field name(s) in the response records */
    PKFields: string[];
    /** Whether the endpoint supports PageSize/PageNumber pagination */
    SupportsPagination: boolean;
    /** Default page size */
    DefaultPageSize: number;
    /** Additional query params to always include */
    DefaultQueryParams?: Record<string, string>;
    /** Whether the endpoint supports incremental date filtering */
    SupportsIncrementalSync: boolean;
    /**
     * Detail endpoint path template for fetching full record data.
     * Use `{PK}` as placeholder for the record's primary key value.
     * When set, the connector will call this endpoint per-record to enrich
     * the sparse list data with full field values.
     */
    DetailPath?: string;
    /** JSON key containing the detail record in the detail endpoint response. Null for root-level. */
    DetailResponseKey?: string | null;
    /**
     * Whether this endpoint uses OffSet-based pagination instead of PageNumber.
     * When true, the watermark tracks the current offset position.
     * Max PageSize for OffSet endpoints is 100.
     */
    UsesOffSetPagination?: boolean;
    /** Foreign key relationships to other YM objects */
    Relationships?: SourceRelationshipInfo[];
}

/** All supported YM objects */
const YM_OBJECTS: Record<string, YMObjectConfig> = {
    Members: {
        Path: 'MemberList',
        Label: 'Members',
        ResponseDataKey: 'Members',
        PKFields: ['ProfileID'],
        SupportsPagination: true,
        DefaultPageSize: 200,
        DefaultQueryParams: {
            FieldSelection: [
                'ProfileID', 'FirstName', 'LastName', 'EmailAddr', 'MemberTypeCode',
                'Status', 'Organization', 'Phone', 'Address1', 'Address2', 'City',
                'State', 'PostalCode', 'Country', 'JoinDate', 'RenewalDate',
                'ExpirationDate', 'MemberSinceDate', 'Title', 'WebsiteUrl',
            ].join(','),
        },
        SupportsIncrementalSync: false,
        DetailPath: 'Members/{PK}',
        DetailResponseKey: null,
    },
    Events: {
        Path: 'Events',
        Label: 'Events',
        ResponseDataKey: 'EventsList',
        PKFields: ['EventId'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { Active: 'true' },
        SupportsIncrementalSync: false,
    },
    MemberTypes: {
        Path: 'MemberTypes',
        Label: 'Member Types',
        ResponseDataKey: 'MemberTypes',
        PKFields: ['ID'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Memberships: {
        Path: 'Memberships',
        Label: 'Memberships',
        ResponseDataKey: 'membershipList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Groups: {
        Path: 'Groups',
        Label: 'Groups',
        ResponseDataKey: 'GroupTypeList',
        PKFields: ['Id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Products: {
        Path: 'Products',
        Label: 'Products',
        ResponseDataKey: null,
        PKFields: ['id'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    DonationFunds: {
        Path: 'DonationFunds',
        Label: 'Donation Funds',
        ResponseDataKey: 'fundList',
        PKFields: ['fundId'],
        SupportsPagination: false,
        DefaultPageSize: 500,
        SupportsIncrementalSync: false,
    },
    Certifications: {
        Path: 'Certifications',
        Label: 'Certifications',
        ResponseDataKey: 'CertificationList',
        PKFields: ['CertificationID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        SupportsIncrementalSync: false,
    },
    InvoiceItems: {
        Path: 'InvoiceItems',
        Label: 'Invoice Items',
        ResponseDataKey: 'InvoiceItemsList',
        PKFields: ['LineItemID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', InvoiceItemType: 'All', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'WebSiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
    DuesTransactions: {
        Path: 'DuesTransactions',
        Label: 'Dues Transactions',
        ResponseDataKey: 'DuesTransactionsList',
        PKFields: ['TransactionID'],
        SupportsPagination: true,
        DefaultPageSize: 100,
        DefaultQueryParams: { DateFrom: '2000-01-01', OffSet: '0' },
        SupportsIncrementalSync: true,
        UsesOffSetPagination: true,
        Relationships: [
            { FieldName: 'WebsiteMemberID', TargetObject: 'Members', TargetField: 'ProfileID' },
        ],
    },
};

/** Field definitions for known YM objects. Used by DiscoverFields. */
const YM_FIELD_SCHEMAS: Record<string, ExternalFieldSchema[]> = {
    Members: [
        { Name: 'ProfileID', Label: 'Profile ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EmailAddr', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'MemberTypeCode', Label: 'Member Type Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Phone', Label: 'Phone', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Address1', Label: 'Address 1', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Address2', Label: 'Address 2', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'City', Label: 'City', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'State', Label: 'State', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'PostalCode', Label: 'Postal Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Country', Label: 'Country', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Title', Label: 'Title', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'JoinDate', Label: 'Join Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'RenewalDate', Label: 'Renewal Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ExpirationDate', Label: 'Expiration Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MemberSinceDate', Label: 'Member Since', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebsiteUrl', Label: 'Website URL', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Events: [
        { Name: 'EventId', Label: 'Event ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Event Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Active', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartDate', Label: 'Start Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndDate', Label: 'End Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'StartTime', Label: 'Start Time', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'EndTime', Label: 'End Time', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsVirtual', Label: 'Is Virtual', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'VirtualMeetingType', Label: 'Virtual Meeting Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    MemberTypes: [
        { Name: 'ID', Label: 'Type ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'TypeCode', Label: 'Type Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsDefault', Label: 'Is Default', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'PresetType', Label: 'Preset Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'SortOrder', Label: 'Sort Order', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Memberships: [
        { Name: 'Id', Label: 'Membership ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Code', Label: 'Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'DuesAmount', Label: 'Dues Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ProRatedDues', Label: 'Pro-Rated Dues', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'AllowMultipleOpenInvoices', Label: 'Allow Multiple Invoices', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    Groups: [
        { Name: 'Id', Label: 'Group ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'Name', Label: 'Group Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'GroupTypeName', Label: 'Group Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GroupTypeId', Label: 'Group Type ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Products: [
        { Name: 'id', Label: 'Product ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'description', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'weight', Label: 'Weight', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'taxRate', Label: 'Tax Rate', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'quantity', Label: 'Quantity', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ProductActive', Label: 'Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsFeatured', Label: 'Is Featured', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'ListInStore', Label: 'List In Store', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'taxable', Label: 'Taxable', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    DonationFunds: [
        { Name: 'fundId', Label: 'Fund ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'fundName', Label: 'Fund Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'fundOptionsCount', Label: 'Options Count', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    Certifications: [
        { Name: 'CertificationID', Label: 'Certification ID', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'ID', Label: 'ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'IsActive', Label: 'Is Active', DataType: 'boolean', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'CEUsRequired', Label: 'CEUs Required', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
        { Name: 'Code', Label: 'Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false },
    ],
    InvoiceItems: [
        { Name: 'LineItemID', Label: 'Line Item ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'InvoiceNo', Label: 'Invoice Number', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceType', Label: 'Invoice Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebSiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ConstituentID', Label: 'Constituent ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceNameFirst', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceNameLast', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'EmailAddress', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemType', Label: 'Line Item Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemDescription', Label: 'Description', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemDate', Label: 'Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemDateEntered', Label: 'Date Entered', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemAmount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineItemQuantity', Label: 'Quantity', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LineTotal', Label: 'Line Total', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'OutstandingBalance', Label: 'Outstanding Balance', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentTerms', Label: 'Payment Terms', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'GLCodeItemName', Label: 'GL Code', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'QBClassItemName', Label: 'QB Class', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentOption', Label: 'Payment Option', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
    DuesTransactions: [
        { Name: 'TransactionID', Label: 'Transaction ID', DataType: 'integer', IsRequired: true, IsUniqueKey: true, IsReadOnly: true },
        { Name: 'InvoiceNumber', Label: 'Invoice Number', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Status', Label: 'Status', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'WebsiteMemberID', Label: 'Member ID', DataType: 'integer', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ConstituentID', Label: 'Constituent ID', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'FirstName', Label: 'First Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'LastName', Label: 'Last Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Email', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Organization', Label: 'Organization', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'Amount', Label: 'Amount', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'BalanceDue', Label: 'Balance Due', DataType: 'decimal', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'PaymentType', Label: 'Payment Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateSubmitted', Label: 'Date Submitted', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateProcessed', Label: 'Date Processed', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MembershipRequested', Label: 'Membership Requested', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CurrentMembership', Label: 'Current Membership', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'CurrentMembershipExpDate', Label: 'Membership Expiration', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'MemberType', Label: 'Member Type', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'DateMemberSignup', Label: 'Member Signup Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'InvoiceDate', Label: 'Invoice Date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        { Name: 'ClosedBy', Label: 'Closed By', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
    ],
};

// ─── Connector Implementation ───────────────────────────────────

/**
 * Connector for the YourMembership (YM) AMS REST API.
 *
 * Auth flow:
 *   1. POST /Ams/Authenticate with credentials + ClientID
 *   2. Receive SessionId
 *   3. Pass SessionId as X-SS-ID header on all data requests
 *
 * Configuration JSON: { "ClientID": "25363", "APIKey": "...", "APIPassword": "..." }
 */
@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseIntegrationConnector {
    /** Session cache keyed by ClientID */
    private sessionCache = new Map<string, YMSession>();

    // ─── Configuration parsing ───────────────────────────────────

    /**
     * Parses credentials from CompanyIntegration.CredentialID (preferred) or
     * falls back to CompanyIntegration.Configuration JSON for backwards compat.
     */
    protected async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<YMConnectionConfig> {
        // Try loading from linked Credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID && contextUser) {
            const config = await this.loadFromCredential(credentialID, contextUser);
            if (config) return config;
        }

        // Fallback: read from CompanyIntegration Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            return this.parseConfigJson(configJson);
        }

        throw new Error('No YM credentials found. Attach a credential with ClientID, APIKey, and APIPassword, or set Configuration JSON on the CompanyIntegration.');
    }

    private async loadFromCredential(credentialID: string, contextUser: UserInfo): Promise<YMConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            return this.parseConfigJson(credential.Values);
        } catch {
            return null; // Credential values don't match expected format
        }
    }

    private parseConfigJson(json: string): YMConnectionConfig {
        const parsed = JSON.parse(json) as Record<string, string>;
        // Support both PascalCase (Configuration JSON) and camelCase (Credential entity schema)
        const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
        const apiKey = parsed['APIKey'] || parsed['apiKey'] || parsed['ApiKey'];
        const apiPassword = parsed['APIPassword'] || parsed['apiPassword'] || parsed['ApiPassword'];

        if (!clientId || !apiKey || !apiPassword) {
            throw new Error('Configuration JSON must contain ClientID, APIKey, and APIPassword (any casing)');
        }

        return { ClientID: String(clientId), APIKey: apiKey, APIPassword: apiPassword };
    }

    // ─── Session management ──────────────────────────────────────

    /** Obtains or reuses a YM session for the given credentials. */
    protected async GetSession(config: YMConnectionConfig): Promise<string> {
        const cached = this.sessionCache.get(config.ClientID);
        if (cached && (Date.now() - cached.CreatedAt) < SESSION_TTL_MS) {
            return cached.SessionId;
        }
        return this.CreateSession(config);
    }

    /** Creates a new YM session via the Authenticate endpoint. */
    private async CreateSession(config: YMConnectionConfig): Promise<string> {
        const response = await fetch(`${YM_API_BASE}/Ams/Authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                provider: 'credentials',
                UserName: config.APIKey,
                Password: config.APIPassword,
                UserType: 'Admin',
                ClientID: Number(config.ClientID),
            }),
        });

        if (!response.ok) {
            throw new Error(`YM authentication failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as {
            SessionId?: string;
            ResponseStatus?: { ErrorCode?: string; Message?: string };
        };

        if (json.ResponseStatus?.ErrorCode && json.ResponseStatus.ErrorCode !== 'None') {
            throw new Error(`YM auth error: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`);
        }

        if (!json.SessionId) {
            throw new Error('YM auth: No SessionId returned');
        }

        this.sessionCache.set(config.ClientID, {
            SessionId: json.SessionId,
            CreatedAt: Date.now(),
        });

        return json.SessionId;
    }

    /** Invalidates a cached session so the next request re-authenticates. */
    protected InvalidateSession(clientId: string): void {
        this.sessionCache.delete(clientId);
    }

    // ─── HTTP helper ─────────────────────────────────────────────

    /**
     * Makes a GET request to a YM API endpoint using session auth.
     * Retries once on 401 (session expiry).
     */
    protected async MakeRequest(
        config: YMConnectionConfig,
        endpoint: string,
        queryParams?: Record<string, string>
    ): Promise<Record<string, unknown>> {
        const sessionId = await this.GetSession(config);
        const url = this.BuildUrl(config.ClientID, endpoint, queryParams);

        let response = await this.FetchWithSession(url, sessionId);

        if (response.status === 401) {
            this.InvalidateSession(config.ClientID);
            const newSessionId = await this.GetSession(config);
            response = await this.FetchWithSession(url, newSessionId);
        }

        if (!response.ok) {
            throw new Error(`YM API error for ${endpoint}: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as Record<string, unknown>;
        this.CheckResponseError(json, endpoint);
        return json;
    }

    private async FetchWithSession(url: string, sessionId: string): Promise<Response> {
        return fetch(url, {
            method: 'GET',
            headers: { 'X-SS-ID': sessionId, 'Accept': 'application/json' },
        });
    }

    private BuildUrl(clientId: string, endpoint: string, queryParams?: Record<string, string>): string {
        const base = `${YM_API_BASE}/Ams/${clientId}/${endpoint}`;
        if (!queryParams || Object.keys(queryParams).length === 0) {
            return base;
        }
        const qs = new URLSearchParams(queryParams).toString();
        return `${base}?${qs}`;
    }

    private CheckResponseError(json: Record<string, unknown>, endpoint: string): void {
        const rs = json['ResponseStatus'] as { ErrorCode?: string; Message?: string } | undefined;
        if (rs?.ErrorCode && rs.ErrorCode !== 'None' && rs.ErrorCode !== '') {
            throw new Error(`YM API error for ${endpoint}: ${rs.Message ?? rs.ErrorCode}`);
        }
    }

    // ─── BaseIntegrationConnector implementation ─────────────────

    /** Tests connectivity by authenticating and fetching ClientConfig. */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            await this.GetSession(config);
            const clientConfig = await this.MakeRequest(config, 'ClientConfig');
            const siteUrl = (clientConfig['SiteUrl'] as string) ?? 'Unknown';

            return {
                Success: true,
                Message: `Connected to YourMembership site: ${siteUrl}`,
                ServerVersion: `ClientID ${config.ClientID}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    /** Returns all known YM object types available for integration. */
    public async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return Object.entries(YM_OBJECTS).map(([name, cfg]) => ({
            Name: name,
            Label: cfg.Label,
            SupportsIncrementalSync: cfg.SupportsIncrementalSync,
            SupportsWrite: false,
        }));
    }

    /**
     * Override IntrospectSchema to populate Relationships from YM_OBJECTS config.
     * This enables the Schema Builder to generate soft FK entries in additionalSchemaInfo.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const schema = await super.IntrospectSchema(companyIntegration, contextUser);

        // Inject relationships from our object registry
        for (const obj of schema.Objects) {
            const config = YM_OBJECTS[obj.ExternalName];
            if (config?.Relationships) {
                obj.Relationships = config.Relationships;
                // Also mark FK fields on the field list
                for (const rel of config.Relationships) {
                    const field = obj.Fields.find(f => f.Name === rel.FieldName);
                    if (field) {
                        field.IsForeignKey = true;
                        field.ForeignKeyTarget = rel.TargetObject;
                    }
                }
            }
        }

        return schema;
    }

    /** Returns the known field schema for a YM object. */
    public async DiscoverFields(
        _companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        return YM_FIELD_SCHEMAS[objectName] ?? [];
    }

    /**
     * Fetches a batch of records from a YM API endpoint.
     *
     * For paginated endpoints (Members, Events, Certifications), uses
     * PageSize/PageNumber. The watermark tracks the current page number
     * for resuming large fetches across batches.
     *
     * For non-paginated endpoints (MemberTypes, Memberships, Groups, Products),
     * fetches all data in one call.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const config = await this.ParseConfig(ctx.CompanyIntegration, ctx.ContextUser);
        const objectConfig = YM_OBJECTS[ctx.ObjectName];

        if (!objectConfig) {
            throw new Error(`Unknown YourMembership object: ${ctx.ObjectName}`);
        }

        if (ctx.ObjectName === 'Groups') {
            return this.FetchGroups(config, ctx);
        }

        if (objectConfig.ResponseDataKey === null) {
            return this.FetchRawArray(config, ctx, objectConfig);
        }

        if (objectConfig.UsesOffSetPagination) {
            return this.FetchWithOffSet(config, ctx, objectConfig);
        }

        if (objectConfig.SupportsPagination) {
            return this.FetchPaginated(config, ctx, objectConfig);
        }

        return this.FetchAll(config, ctx, objectConfig);
    }

    /** Fetches data from a paginated YM endpoint. Watermark = page number. */
    private async FetchPaginated(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const pageNumber = ctx.WatermarkValue ? Number(ctx.WatermarkValue) : 1;
        const pageSize = Math.min(ctx.BatchSize, objectConfig.DefaultPageSize);

        const queryParams: Record<string, string> = {
            PageSize: String(pageSize),
            PageNumber: String(pageNumber),
            ...(objectConfig.DefaultQueryParams ?? {}),
        };

        const json = await this.MakeRequest(config, objectConfig.Path, queryParams);
        const dataArray = json[objectConfig.ResponseDataKey!];

        if (!dataArray || !Array.isArray(dataArray)) {
            return { Records: [], HasMore: false };
        }

        let records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        // Enrich with detail endpoint if available
        records = await this.EnrichRecordsWithDetails(config, records, objectConfig);

        const hasMore = records.length >= pageSize;
        const newWatermark = hasMore ? String(pageNumber + 1) : undefined;

        return { Records: records, HasMore: hasMore, NewWatermarkValue: newWatermark };
    }

    /** Fetches all data from a non-paginated endpoint in a single request. */
    private async FetchAll(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const json = await this.MakeRequest(config, objectConfig.Path, objectConfig.DefaultQueryParams);
        const dataArray = json[objectConfig.ResponseDataKey!];

        if (!dataArray || !Array.isArray(dataArray)) {
            return { Records: [], HasMore: false };
        }

        let records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        // Enrich with detail endpoint if available
        records = await this.EnrichRecordsWithDetails(config, records, objectConfig);

        return { Records: records, HasMore: false };
    }

    /**
     * Fetches data using OffSet-based pagination (InvoiceItems, DuesTransactions).
     * These YM endpoints use OffSet instead of PageNumber, with max PageSize of 100.
     * Watermark tracks the current offset position.
     */
    private async FetchWithOffSet(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const offset = ctx.WatermarkValue ? Number(ctx.WatermarkValue) : 0;
        const pageSize = Math.min(ctx.BatchSize, objectConfig.DefaultPageSize, 100);

        const queryParams: Record<string, string> = {
            ...(objectConfig.DefaultQueryParams ?? {}),
            PageSize: String(pageSize),
            PageNumber: '1',
            OffSet: String(offset),
        };

        const json = await this.MakeRequest(config, objectConfig.Path, queryParams);
        const dataArray = json[objectConfig.ResponseDataKey!];

        if (!dataArray || !Array.isArray(dataArray)) {
            return { Records: [], HasMore: false };
        }

        const records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        const hasMore = records.length >= pageSize;
        const newWatermark = hasMore ? String(offset + records.length) : undefined;

        return { Records: records, HasMore: hasMore, NewWatermarkValue: newWatermark };
    }

    /** Fetches endpoints that return a raw JSON array (e.g., Products). */
    private async FetchRawArray(
        config: YMConnectionConfig,
        ctx: FetchContext,
        objectConfig: YMObjectConfig
    ): Promise<FetchBatchResult> {
        const sessionId = await this.GetSession(config);
        const url = this.BuildUrl(config.ClientID, objectConfig.Path, objectConfig.DefaultQueryParams);

        const response = await this.FetchWithSession(url, sessionId);
        if (!response.ok) {
            throw new Error(`YM API error for ${objectConfig.Path}: ${response.status}`);
        }

        const data = await response.json() as unknown;
        if (!Array.isArray(data)) {
            return { Records: [], HasMore: false };
        }

        let records = (data as Record<string, unknown>[]).map((item) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        // Enrich with detail endpoint if available
        records = await this.EnrichRecordsWithDetails(config, records, objectConfig);

        return { Records: records, HasMore: false };
    }

    /**
     * Fetches Groups, which have a nested structure: GroupTypeList → Groups.
     * Flattens into individual group records with the GroupType name attached.
     */
    private async FetchGroups(
        config: YMConnectionConfig,
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const json = await this.MakeRequest(config, 'Groups');
        const typeList = json['GroupTypeList'] as GroupTypeListItem[] | undefined;

        if (!typeList || !Array.isArray(typeList)) {
            return { Records: [], HasMore: false };
        }

        const records: ExternalRecord[] = [];
        for (const groupType of typeList) {
            const typeName = groupType.TypeName ?? '';
            for (const group of groupType.Groups ?? []) {
                records.push({
                    ExternalID: String(group.Id),
                    ObjectType: ctx.ObjectName,
                    Fields: { ...group, GroupTypeName: typeName, GroupTypeId: groupType.Id },
                });
            }
        }

        return { Records: records, HasMore: false };
    }

    // ─── Default field mappings ──────────────────────────────────

    /** Returns suggested default field mappings for YM objects to MJ entities. */
    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'YourMembership',
            DefaultObjects: Object.entries(YM_OBJECTS).map(([name, cfg]) => ({
                SourceObjectName: name,
                TargetTableName: cfg.Label.replace(/\s+/g, ''),
                TargetEntityName: `YM ${cfg.Label}`,
                SyncEnabled: true,
                FieldMappings: this.GetDefaultFieldMappings(name, cfg.Label),
            })),
        };
    }

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Members':
                return [
                    { SourceFieldName: 'EmailAddr', DestinationFieldName: 'Email', IsKeyField: true },
                    { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'Organization', DestinationFieldName: 'CompanyName' },
                    { SourceFieldName: 'MemberTypeCode', DestinationFieldName: 'Status' },
                ];
            case 'Events':
                return [
                    { SourceFieldName: 'EventId', DestinationFieldName: 'ID', IsKeyField: true },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                ];
            case 'InvoiceItems':
                return [
                    { SourceFieldName: 'LineItemID', DestinationFieldName: 'LineItemID', IsKeyField: true },
                    { SourceFieldName: 'InvoiceNo', DestinationFieldName: 'InvoiceNo' },
                    { SourceFieldName: 'InvoiceType', DestinationFieldName: 'InvoiceType' },
                    { SourceFieldName: 'WebSiteMemberID', DestinationFieldName: 'WebSiteMemberID' },
                    { SourceFieldName: 'LineItemDescription', DestinationFieldName: 'Description' },
                    { SourceFieldName: 'LineItemAmount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'LineItemDate', DestinationFieldName: 'Date' },
                ];
            case 'DuesTransactions':
                return [
                    { SourceFieldName: 'TransactionID', DestinationFieldName: 'TransactionID', IsKeyField: true },
                    { SourceFieldName: 'WebsiteMemberID', DestinationFieldName: 'WebsiteMemberID' },
                    { SourceFieldName: 'Status', DestinationFieldName: 'Status' },
                    { SourceFieldName: 'Amount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'MembershipRequested', DestinationFieldName: 'MembershipRequested' },
                    { SourceFieldName: 'DateSubmitted', DestinationFieldName: 'DateSubmitted' },
                ];
            default:
                return [];
        }
    }

    // ─── Record building ─────────────────────────────────────────

    private BuildRecord(
        item: Record<string, unknown>,
        pkFields: string[],
        objectType: string
    ): ExternalRecord {
        const externalId = pkFields.map(pk => String(item[pk] ?? '')).join('|');
        return {
            ExternalID: externalId,
            ObjectType: objectType,
            Fields: { ...item },
        };
    }

    // ─── Detail enrichment ───────────────────────────────────────

    /**
     * Enriches a batch of records by fetching full detail data for each record
     * via the object's detail endpoint. List endpoints often return sparse data;
     * detail endpoints return all available fields for a record.
     *
     * Records are enriched in parallel with a concurrency limit to avoid
     * overwhelming the API.
     */
    private async EnrichRecordsWithDetails(
        config: YMConnectionConfig,
        records: ExternalRecord[],
        objectConfig: YMObjectConfig
    ): Promise<ExternalRecord[]> {
        if (!objectConfig.DetailPath || records.length === 0) {
            return records;
        }

        const concurrency = 10;
        const enriched: ExternalRecord[] = [];

        for (let i = 0; i < records.length; i += concurrency) {
            const batch = records.slice(i, i + concurrency);
            const results = await Promise.all(
                batch.map(record => this.EnrichSingleRecord(config, record, objectConfig))
            );
            enriched.push(...results);
        }

        return enriched;
    }

    /**
     * Fetches full detail data for a single record and merges it with
     * the existing list data. Detail fields override list fields.
     */
    private async EnrichSingleRecord(
        config: YMConnectionConfig,
        record: ExternalRecord,
        objectConfig: YMObjectConfig
    ): Promise<ExternalRecord> {
        try {
            const detailPath = objectConfig.DetailPath!.replace('{PK}', record.ExternalID);
            const json = await this.MakeRequest(config, detailPath);

            const detailData = objectConfig.DetailResponseKey != null
                ? json[objectConfig.DetailResponseKey] as Record<string, unknown> | undefined
                : json;

            if (detailData && typeof detailData === 'object') {
                const normalized = this.NormalizeDetailFields(detailData, objectConfig);
                record.Fields = { ...record.Fields, ...normalized };
            }
        } catch {
            // If detail fetch fails for one record, keep the list data
            // and continue — don't fail the entire batch
        }

        return record;
    }

    /**
     * Normalizes detail response fields to match our expected field names.
     * The YM detail endpoints use camelCase and nested objects,
     * while our schema uses PascalCase and flat structure.
     */
    private NormalizeDetailFields(
        detail: Record<string, unknown>,
        objectConfig: YMObjectConfig
    ): Record<string, unknown> {
        if (objectConfig.Path === 'MemberList') {
            return this.NormalizeMemberDetail(detail);
        }
        // For other object types, just filter out metadata keys
        return this.FilterMetadataKeys(detail);
    }

    /**
     * Maps the Members detail endpoint response to our flat PascalCase schema.
     * Detail endpoint returns: { firstName, lastName, emailAddress, primaryAddress: { ... } }
     * We need:                 { FirstName, LastName, EmailAddr, Phone, Address1, ... }
     */
    private NormalizeMemberDetail(detail: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const addr = detail['primaryAddress'] as Record<string, unknown> | undefined;

        // Direct field mappings (detail camelCase → our PascalCase)
        const fieldMap: Record<string, string> = {
            'id': 'ProfileID',
            'firstName': 'FirstName',
            'lastName': 'LastName',
            'emailAddress': 'EmailAddr',
            'organization': 'Organization',
            'typeCode': 'MemberTypeCode',
            'expirationDate': 'ExpirationDate',
            'isMember': 'Status',
        };

        for (const [detailKey, ourKey] of Object.entries(fieldMap)) {
            const value = detail[detailKey];
            if (value !== undefined && value !== null && value !== '') {
                if (detailKey === 'isMember') {
                    result[ourKey] = value ? 'Active' : 'Inactive';
                } else {
                    result[ourKey] = value;
                }
            }
        }

        // Address fields (nested → flat)
        if (addr) {
            const addrMap: Record<string, string> = {
                'address1': 'Address1',
                'address2': 'Address2',
                'city': 'City',
                'location': 'State',
                'postalCode': 'PostalCode',
                'countryName': 'Country',
                'phone': 'Phone',
            };

            for (const [addrKey, ourKey] of Object.entries(addrMap)) {
                const value = addr[addrKey];
                if (value !== undefined && value !== null && value !== '') {
                    result[ourKey] = value;
                }
            }
        }

        return result;
    }

    /** Filters out YM API metadata keys that shouldn't be stored as field data. */
    private FilterMetadataKeys(data: Record<string, unknown>): Record<string, unknown> {
        const metadataKeys = new Set([
            'ResponseStatus', 'UsingRedis', 'AppInitTime', 'ServerID',
            'ClientID', 'BypassCache', 'DateCached', 'Device',
        ]);
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            if (!metadataKeys.has(key)) {
                result[key] = value;
            }
        }
        return result;
    }
}

/** Shape of a GroupType entry from the Groups endpoint */
interface GroupTypeListItem {
    Id?: number;
    TypeName?: string;
    Groups?: Array<{ Id: number; Name: string; [key: string]: unknown }>;
}
