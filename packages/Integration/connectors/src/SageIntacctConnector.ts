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
export interface SageIntacctConnectionConfig {
    /** Sage Intacct Company ID */
    CompanyId: string;
    /** Web Services Sender ID (from Marketplace subscription) */
    SenderId: string;
    /** Web Services Sender Password */
    SenderPassword: string;
    /** User ID for session-based authentication */
    UserId: string;
    /** User password */
    UserPassword: string;
    /** Optional entity ID for multi-entity shared companies */
    EntityId?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 3 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 200 */
    MinRequestIntervalMs?: number;
}

/** Internal session state for Sage Intacct API */
interface SageIntacctSession {
    /** Session ID returned by getAPISession */
    SessionId: string;
    /** API endpoint URL returned by the session */
    Endpoint: string;
    /** When the session was created */
    CreatedAt: number;
    /** Full config for reference */
    Config: SageIntacctConnectionConfig;
}

/** Sage Intacct field definition from inspect */
interface IntacctFieldDef {
    Name: string;
    Label: string;
    DataType: string;
    IsRequired: boolean;
    IsReadOnly: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Sage Intacct XML Gateway endpoint */
const INTACCT_API_ENDPOINT = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

/** Control ID prefix for XML requests */
const CONTROL_ID_PREFIX = 'mj-intacct';

/** DTD version for Sage Intacct API */
const DTD_VERSION = '3.0';

/** Default maximum retries */
const DEFAULT_MAX_RETRIES = 3;

/** Default HTTP request timeout in milliseconds */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default minimum milliseconds between API requests */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;

/** Default page size for readByQuery */
const DEFAULT_PAGE_SIZE = 100;

/** Session lifetime — Sage Intacct sessions last ~10 minutes; refresh at 8 min */
const SESSION_LIFETIME_MS = 8 * 60 * 1000;

/** Sage Intacct data type to generic type mapping */
const INTACCT_TYPE_MAP: Record<string, string> = {
    'string': 'string',
    'varchar': 'string',
    'text': 'text',
    'integer': 'integer',
    'int': 'integer',
    'decimal': 'decimal',
    'number': 'decimal',
    'float': 'decimal',
    'double': 'decimal',
    'currency': 'decimal',
    'boolean': 'boolean',
    'date': 'date',
    'datetime': 'datetime',
    'timestamp': 'datetime',
    'percent': 'decimal',
};

// ─── Sage Intacct Object Metadata for Action Generation ───────────────

const SAGE_INTACCT_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'CUSTOMER', DisplayName: 'Customer',
        Description: 'A customer record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique customer identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer name' },
            { Name: 'DISPLAYCONTACT.EMAIL1', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
            { Name: 'DISPLAYCONTACT.PHONE1', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.ADDRESS1', DisplayName: 'Address Line 1', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing address line 1' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.CITY', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State/province' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.ZIP', DisplayName: 'Zip Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Postal/zip code' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.COUNTRY', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer status (active/inactive)' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total amount due' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'VENDOR', DisplayName: 'Vendor',
        Description: 'A vendor/supplier record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique vendor identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor name' },
            { Name: 'DISPLAYCONTACT.EMAIL1', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
            { Name: 'DISPLAYCONTACT.PHONE1', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor status' },
            { Name: 'VENDTYPE', DisplayName: 'Vendor Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor type category' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total amount due' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'GLACCOUNT', DisplayName: 'GL Account',
        Description: 'A General Ledger account in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'ACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'GL account number' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account title' },
            { Name: 'ACCOUNTTYPE', DisplayName: 'Account Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account type (e.g., balancesheet, incomestatement)' },
            { Name: 'NORMALBALANCE', DisplayName: 'Normal Balance', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Normal balance (debit/credit)' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account status' },
            { Name: 'CATEGORY', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account category' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'APBILL', DisplayName: 'AP Bill',
        Description: 'An Accounts Payable bill in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'System-assigned record number' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
            { Name: 'VENDORNAME', DisplayName: 'Vendor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Vendor name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bill date' },
            { Name: 'WHENDUE', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total bill amount' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount remaining' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Bill state (Draft, Pending, etc.)' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bill description/memo' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'ARINVOICE', DisplayName: 'AR Invoice',
        Description: 'An Accounts Receivable invoice in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'System-assigned record number' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice date' },
            { Name: 'WHENDUE', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total invoice amount' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount remaining' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice state' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice description/memo' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'PROJECT', DisplayName: 'Project',
        Description: 'A project in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'PROJECTID', DisplayName: 'Project ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique project identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project name' },
            { Name: 'PROJECTCATEGORY', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project category' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project status' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated customer ID' },
            { Name: 'BEGINDATE', DisplayName: 'Begin Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project start date' },
            { Name: 'ENDDATE', DisplayName: 'End Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project end date' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'EMPLOYEE', DisplayName: 'Employee',
        Description: 'An employee record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'EMPLOYEEID', DisplayName: 'Employee ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique employee identifier' },
            { Name: 'PERSONALINFO.CONTACTNAME', DisplayName: 'Contact Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee contact name' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Job title' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee status' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department identifier' },
            { Name: 'LOCATIONID', DisplayName: 'Location ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location identifier' },
            { Name: 'STARTDATE', DisplayName: 'Start Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employment start date' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'DEPARTMENT', DisplayName: 'Department',
        Description: 'A department in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'DEPARTMENTID', DisplayName: 'Department ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique department identifier' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department title' },
            { Name: 'PARENTID', DisplayName: 'Parent ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent department ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'CLASS', DisplayName: 'Class',
        Description: 'A class dimension in Sage Intacct for categorizing transactions', SupportsWrite: true,
        Fields: [
            { Name: 'CLASSID', DisplayName: 'Class ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique class identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class name' },
            { Name: 'PARENTID', DisplayName: 'Parent ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent class ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
];

/** Primary key field name for each known Sage Intacct object */
const OBJECT_PK_MAP: Record<string, string> = {
    CUSTOMER: 'CUSTOMERID',
    VENDOR: 'VENDORID',
    GLACCOUNT: 'ACCOUNTNO',
    APBILL: 'RECORDNO',
    ARINVOICE: 'RECORDNO',
    PROJECT: 'PROJECTID',
    EMPLOYEE: 'EMPLOYEEID',
    DEPARTMENT: 'DEPARTMENTID',
    CLASS: 'CLASSID',
};

/** Objects that use legacy API functions (create_*, update_*, delete_*) instead of the
 *  generic CRUD API. These require different XML structures. */
const LEGACY_FUNCTION_OBJECTS = new Set(['APBILL', 'ARINVOICE']);

// ─── Connector Implementation ─────────────────────────────────────────

/**
 * Connector for the Sage Intacct Web Services API (XML over HTTPS).
 *
 * Extends BaseIntegrationConnector directly (not BaseRESTIntegrationConnector)
 * because Sage Intacct uses XML request/response bodies over a single gateway
 * endpoint, not standard REST resource URLs.
 *
 * Auth flow:
 *   1. POST XML to https://api.intacct.com/ia/xml/xmlgw.phtml
 *   2. The request includes Sender ID/Password (app credentials) and User ID/Password
 *   3. A getAPISession function returns a sessionid + endpoint
 *   4. Subsequent requests use the sessionid for authentication
 *
 * API operations:
 *   - readByQuery: Query records with SQL-like filter expressions
 *   - readMore: Fetch next page of a paginated result set
 *   - read: Get a single record by key
 *   - create / update / delete: Standard CRUD on objects
 *   - inspect: Discover object fields and types
 *
 * Pagination:
 *   - readByQuery returns a resultId + numRemaining
 *   - readMore uses the resultId to fetch subsequent pages
 */
@RegisterClass(BaseIntegrationConnector, 'SageIntacctConnector')
export class SageIntacctConnector extends BaseIntegrationConnector {

    // ── Session Cache ────────────────────────────────────────────────

    private cachedSession: SageIntacctSession | null = null;

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    // ── Capability Getters ───────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'Sage Intacct'; }

    // ── Action Generation ────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return SAGE_INTACCT_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;

        return {
            IntegrationName: 'Sage Intacct',
            CategoryName: 'Sage Intacct',
            IconClass: 'fa-solid fa-file-invoice-dollar',
            Objects: objects,
            IncludeSearch: true,
            IncludeList: true,
            CategoryDescription: 'Sage Intacct accounting and ERP integration actions',
            ParentCategoryName: 'Business Apps',
        };
    }

    // ── Default Configuration ────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return {
            DefaultSchemaName: 'SageIntacct',
            DefaultObjects: [
                {
                    SourceObjectName: 'CUSTOMER',
                    TargetTableName: 'SageIntacct_Customer',
                    TargetEntityName: 'Sage Intacct Customers',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('CUSTOMER', 'Contacts'),
                },
                {
                    SourceObjectName: 'VENDOR',
                    TargetTableName: 'SageIntacct_Vendor',
                    TargetEntityName: 'Sage Intacct Vendors',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('VENDOR', 'Companies'),
                },
                {
                    SourceObjectName: 'GLACCOUNT',
                    TargetTableName: 'SageIntacct_GLAccount',
                    TargetEntityName: 'Sage Intacct GL Accounts',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        switch (objectName) {
            case 'CUSTOMER':
                return [
                    { SourceFieldName: 'CUSTOMERID', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'NAME', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'DISPLAYCONTACT.EMAIL1', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'DISPLAYCONTACT.PHONE1', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'STATUS', DestinationFieldName: 'Status' },
                ];
            case 'VENDOR':
                return [
                    { SourceFieldName: 'VENDORID', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'NAME', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'DISPLAYCONTACT.EMAIL1', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'DISPLAYCONTACT.PHONE1', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'STATUS', DestinationFieldName: 'Status' },
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
            const session = await this.GetSession(companyIntegration, contextUser, true);
            return {
                Success: true,
                Message: `Successfully connected to Sage Intacct (Company: ${session.Config.CompanyId})`,
                ServerVersion: `Sage Intacct Web Services API ${DTD_VERSION}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery ───────────────────────────────────────────────────

    /**
     * Discovers available objects using the inspect API function with '*' wildcard.
     * Falls back to the known object list if the API call fails.
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        try {
            const session = await this.GetSession(companyIntegration, contextUser);
            const xml = this.BuildInspectRequest(session, '*');
            const response = await this.SendXMLRequest(session, xml);
            const types = this.ParseInspectObjectsResponse(response);

            return types.map(name => ({
                Name: name,
                Label: this.FormatLabel(name),
                SupportsIncrementalSync: true,
                SupportsWrite: true,
            }));
        } catch {
            // Fallback to known objects
            return SAGE_INTACCT_OBJECTS.map(obj => ({
                Name: obj.Name,
                Label: obj.DisplayName,
                Description: obj.Description,
                SupportsIncrementalSync: true,
                SupportsWrite: obj.SupportsWrite,
            }));
        }
    }

    /**
     * Discovers fields on a specific object using the inspect API function.
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const session = await this.GetSession(companyIntegration, contextUser);
        const xml = this.BuildInspectRequest(session, objectName);
        const response = await this.SendXMLRequest(session, xml);
        const fields = this.ParseInspectFieldsResponse(response);

        return fields.map(f => ({
            Name: f.Name,
            Label: f.Label || this.FormatLabel(f.Name),
            DataType: INTACCT_TYPE_MAP[f.DataType.toLowerCase()] ?? 'string',
            IsRequired: f.IsRequired,
            IsUniqueKey: f.Name === this.GetPrimaryKeyField(objectName),
            IsReadOnly: f.IsReadOnly,
        }));
    }

    // ─── FetchChanges ────────────────────────────────────────────────

    /**
     * Fetches records using readByQuery with WHENMODIFIED watermark filtering.
     * Supports pagination via readMore with resultId tokens.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const session = await this.GetSession(ctx.CompanyIntegration, ctx.ContextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);
        const pageSize = Math.min(ctx.BatchSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);

        // If we have a cursor (resultId) from a previous call, use readMore
        if (ctx.CurrentCursor) {
            return this.FetchMoreRecords(session, ctx.CurrentCursor, ctx.ObjectName, pkField);
        }

        // Build the query filter
        const filter = ctx.WatermarkValue
            ? `WHENMODIFIED >= '${ctx.WatermarkValue}'`
            : '';

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        return this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField);
    }

    // ─── CRUD Operations ─────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);

        const xml = this.BuildCreateRequest(session, ctx.ObjectName, ctx.Attributes);
        try {
            const response = await this.SendXMLRequest(session, xml);
            const recordKey = this.ExtractRecordKey(response, ctx.ObjectName);
            return { Success: true, ExternalID: recordKey, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'CreateRecord', ctx.ObjectName);
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);

        const xml = this.BuildUpdateRequest(session, ctx.ObjectName, ctx.ExternalID, ctx.Attributes);
        try {
            await this.SendXMLRequest(session, xml);
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'UpdateRecord', ctx.ObjectName);
        }
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);

        const xml = this.BuildDeleteRequest(session, ctx.ObjectName, ctx.ExternalID);
        try {
            await this.SendXMLRequest(session, xml);
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'DeleteRecord', ctx.ObjectName);
        }
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);

        const xml = this.BuildReadRequest(session, ctx.ObjectName, ctx.ExternalID);
        try {
            const response = await this.SendXMLRequest(session, xml);
            const record = this.ParseSingleRecord(response, ctx.ObjectName);
            if (!record) return null;

            return {
                ExternalID: String(record[pkField] ?? ctx.ExternalID),
                ObjectType: ctx.ObjectName,
                Fields: record,
            };
        } catch {
            return null;
        }
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;

        const filterParts = Object.entries(ctx.Filters).map(
            ([field, value]) => `${field} = '${this.EscapeXmlValue(String(value))}'`
        );
        const filter = filterParts.join(' AND ');

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField);

        return {
            Records: result.Records,
            TotalCount: result.Records.length + (result.HasMore ? 1 : 0), // Intacct doesn't give exact total in readByQuery
            HasMore: result.HasMore,
        };
    }

    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;

        if (ctx.Cursor) {
            const result = await this.FetchMoreRecords(session, ctx.Cursor, ctx.ObjectName, pkField);
            return {
                Records: result.Records,
                HasMore: result.HasMore,
                NextCursor: result.HasMore ? result.NextCursor : undefined,
            };
        }

        const filter = ctx.Filter
            ? Object.entries(ctx.Filter).map(([k, v]) => `${k} = '${this.EscapeXmlValue(String(v))}'`).join(' AND ')
            : '';

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField);

        return {
            Records: result.Records,
            HasMore: result.HasMore,
            NextCursor: result.HasMore ? result.NextCursor : undefined,
        };
    }

    // ─── Session Management ──────────────────────────────────────────

    /**
     * Gets or refreshes a Sage Intacct API session.
     * Sessions are cached and reused until they approach expiration.
     */
    private async GetSession(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<SageIntacctSession> {
        if (!forceRefresh && this.cachedSession && this.IsSessionValid()) {
            return this.cachedSession;
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const xml = this.BuildSessionRequest(config);
        const responseXml = await this.PostXML(INTACCT_API_ENDPOINT, xml, config);
        const session = this.ParseSessionResponse(responseXml, config);

        this.cachedSession = session;
        return session;
    }

    private IsSessionValid(): boolean {
        if (!this.cachedSession) return false;
        return (Date.now() - this.cachedSession.CreatedAt) < SESSION_LIFETIME_MS;
    }

    // ─── Configuration Parsing ───────────────────────────────────────

    /**
     * Parses connection configuration from CompanyIntegration credentials.
     * Looks for a linked MJCredentialEntity or falls back to Configuration JSON.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SageIntacctConnectionConfig> {
        // Try credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const config = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (config) return config;
        }

        // Fall back to Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Partial<SageIntacctConnectionConfig>;
            return this.ValidateConfig(parsed);
        }

        throw new Error('SageIntacctConnector: No credentials or configuration found on CompanyIntegration');
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<SageIntacctConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            const parsed = JSON.parse(credential.Values) as Partial<SageIntacctConnectionConfig>;
            return this.ValidateConfig(parsed);
        } catch {
            return null;
        }
    }

    private ValidateConfig(raw: Partial<SageIntacctConnectionConfig>): SageIntacctConnectionConfig {
        if (!raw.CompanyId) throw new Error('SageIntacctConnector: CompanyId is required');
        if (!raw.SenderId) throw new Error('SageIntacctConnector: SenderId is required');
        if (!raw.SenderPassword) throw new Error('SageIntacctConnector: SenderPassword is required');
        if (!raw.UserId) throw new Error('SageIntacctConnector: UserId is required');
        if (!raw.UserPassword) throw new Error('SageIntacctConnector: UserPassword is required');

        return {
            CompanyId: raw.CompanyId,
            SenderId: raw.SenderId,
            SenderPassword: raw.SenderPassword,
            UserId: raw.UserId,
            UserPassword: raw.UserPassword,
            EntityId: raw.EntityId,
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    // ─── XML Request Builders ────────────────────────────────────────

    private BuildSessionRequest(config: SageIntacctConnectionConfig): string {
        const entityTag = config.EntityId
            ? `<locationid>${this.EscapeXmlValue(config.EntityId)}</locationid>`
            : '';
        return `<?xml version="1.0" encoding="UTF-8"?>
<request>
    <control>
        <senderid>${this.EscapeXmlValue(config.SenderId)}</senderid>
        <password>${this.EscapeXmlValue(config.SenderPassword)}</password>
        <controlid>${CONTROL_ID_PREFIX}-session-${Date.now()}</controlid>
        <uniqueid>false</uniqueid>
        <dtdversion>${DTD_VERSION}</dtdversion>
        <includewhitespace>false</includewhitespace>
    </control>
    <operation>
        <authentication>
            <login>
                <userid>${this.EscapeXmlValue(config.UserId)}</userid>
                <companyid>${this.EscapeXmlValue(config.CompanyId)}</companyid>
                <password>${this.EscapeXmlValue(config.UserPassword)}</password>
                ${entityTag}
            </login>
        </authentication>
        <content>
            <function controlid="${CONTROL_ID_PREFIX}-getSession">
                <getAPISession/>
            </function>
        </content>
    </operation>
</request>`;
    }

    private BuildReadByQueryRequest(
        session: SageIntacctSession,
        objectName: string,
        filter: string,
        pageSize: number
    ): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-readByQuery-${Date.now()}">
                <readByQuery>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                    <fields>*</fields>
                    <query>${this.EscapeXmlValue(filter)}</query>
                    <pagesize>${pageSize}</pagesize>
                </readByQuery>
            </function>`);
    }

    private BuildReadMoreRequest(session: SageIntacctSession, resultId: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-readMore-${Date.now()}">
                <readMore>
                    <resultId>${this.EscapeXmlValue(resultId)}</resultId>
                </readMore>
            </function>`);
    }

    private BuildReadRequest(session: SageIntacctSession, objectName: string, key: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-read-${Date.now()}">
                <read>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                    <keys>${this.EscapeXmlValue(key)}</keys>
                    <fields>*</fields>
                </read>
            </function>`);
    }

    private BuildCreateRequest(
        session: SageIntacctSession,
        objectName: string,
        attributes: Record<string, unknown>
    ): string {
        const fieldsXml = this.AttributesToXml(attributes);
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-create-${Date.now()}">
                <create>
                    <${objectName}>
                        ${fieldsXml}
                    </${objectName}>
                </create>
            </function>`);
    }

    private BuildUpdateRequest(
        session: SageIntacctSession,
        objectName: string,
        key: string,
        attributes: Record<string, unknown>
    ): string {
        const pkField = this.GetPrimaryKeyField(objectName);
        const fieldsXml = this.AttributesToXml({ [pkField]: key, ...attributes });
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-update-${Date.now()}">
                <update>
                    <${objectName}>
                        ${fieldsXml}
                    </${objectName}>
                </update>
            </function>`);
    }

    private BuildDeleteRequest(
        session: SageIntacctSession,
        objectName: string,
        key: string
    ): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-delete-${Date.now()}">
                <delete>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                    <keys>${this.EscapeXmlValue(key)}</keys>
                </delete>
            </function>`);
    }

    private BuildInspectRequest(session: SageIntacctSession, objectNameOrWildcard: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-inspect-${Date.now()}">
                <inspect>
                    <object>${this.EscapeXmlValue(objectNameOrWildcard)}</object>
                </inspect>
            </function>`);
    }

    /**
     * Wraps a function XML fragment in a session-authenticated request envelope.
     */
    private WrapInSessionRequest(session: SageIntacctSession, functionXml: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<request>
    <control>
        <senderid>${this.EscapeXmlValue(session.Config.SenderId)}</senderid>
        <password>${this.EscapeXmlValue(session.Config.SenderPassword)}</password>
        <controlid>${CONTROL_ID_PREFIX}-${Date.now()}</controlid>
        <uniqueid>false</uniqueid>
        <dtdversion>${DTD_VERSION}</dtdversion>
        <includewhitespace>false</includewhitespace>
    </control>
    <operation>
        <authentication>
            <sessionid>${this.EscapeXmlValue(session.SessionId)}</sessionid>
        </authentication>
        <content>
            ${functionXml}
        </content>
    </operation>
</request>`;
    }

    // ─── XML Response Parsers ────────────────────────────────────────

    private ParseSessionResponse(xml: string, config: SageIntacctConnectionConfig): SageIntacctSession {
        this.CheckForErrors(xml);
        const sessionId = this.ExtractXmlValue(xml, 'sessionid');
        const endpoint = this.ExtractXmlValue(xml, 'endpoint') || INTACCT_API_ENDPOINT;

        if (!sessionId) {
            throw new Error('SageIntacctConnector: getAPISession did not return a sessionid');
        }

        return {
            SessionId: sessionId,
            Endpoint: endpoint,
            CreatedAt: Date.now(),
            Config: config,
        };
    }

    private ParseReadByQueryResponse(
        xml: string,
        objectName: string,
        pkField: string
    ): FetchBatchResult & { NextCursor?: string } {
        this.CheckForErrors(xml);

        const numRemaining = parseInt(this.ExtractXmlValue(xml, 'numremaining') || '0', 10);
        const resultId = this.ExtractXmlValue(xml, 'resultId') || undefined;
        const records = this.ExtractRecords(xml, objectName);

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectName,
            Fields: r,
            ModifiedAt: r['WHENMODIFIED'] ? new Date(String(r['WHENMODIFIED'])) : undefined,
        }));

        // Compute watermark from the latest WHENMODIFIED in this batch
        const newWatermark = this.ComputeWatermark(records);

        return {
            Records: externalRecords,
            HasMore: numRemaining > 0,
            NewWatermarkValue: newWatermark,
            NextCursor: numRemaining > 0 ? resultId : undefined,
        };
    }

    private ParseSingleRecord(xml: string, objectName: string): Record<string, unknown> | null {
        this.CheckForErrors(xml);
        const records = this.ExtractRecords(xml, objectName);
        return records.length > 0 ? records[0] : null;
    }

    private ParseInspectObjectsResponse(xml: string): string[] {
        this.CheckForErrors(xml);
        const objectNames: string[] = [];

        // inspect with '*' returns <type>OBJECTNAME</type> elements
        const typeRegex = /<type[^>]*>([^<]+)<\/type>/gi;
        let match: RegExpExecArray | null;
        while ((match = typeRegex.exec(xml)) !== null) {
            objectNames.push(match[1].trim());
        }
        return objectNames;
    }

    private ParseInspectFieldsResponse(xml: string): IntacctFieldDef[] {
        this.CheckForErrors(xml);
        const fields: IntacctFieldDef[] = [];

        // inspect returns <Field> elements with <Name>, <DataType>, etc.
        const fieldRegex = /<Field>\s*([\s\S]*?)\s*<\/Field>/gi;
        let match: RegExpExecArray | null;
        while ((match = fieldRegex.exec(xml)) !== null) {
            const fieldXml = match[1];
            const name = this.ExtractXmlValueFromFragment(fieldXml, 'Name');
            const label = this.ExtractXmlValueFromFragment(fieldXml, 'DisplayLabel') || name;
            const dataType = this.ExtractXmlValueFromFragment(fieldXml, 'DataName')
                || this.ExtractXmlValueFromFragment(fieldXml, 'DataType')
                || 'string';
            const isRequired = this.ExtractXmlValueFromFragment(fieldXml, 'Required') === 'true';
            const isReadOnly = this.ExtractXmlValueFromFragment(fieldXml, 'ReadOnly') === 'true'
                || this.ExtractXmlValueFromFragment(fieldXml, 'SystemGenerated') === 'true';

            if (name) {
                fields.push({ Name: name, Label: label, DataType: dataType, IsRequired: isRequired, IsReadOnly: isReadOnly });
            }
        }

        return fields;
    }

    // ─── HTTP Transport ──────────────────────────────────────────────

    /**
     * Sends an XML request to the Sage Intacct API using a session.
     * Handles throttling and retry logic.
     */
    private async SendXMLRequest(session: SageIntacctSession, xml: string): Promise<string> {
        return this.PostXML(session.Endpoint, xml, session.Config);
    }

    /**
     * Posts XML to the Sage Intacct gateway with throttling and retry support.
     */
    private async PostXML(
        url: string,
        xml: string,
        config: SageIntacctConnectionConfig
    ): Promise<string> {
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);

            try {
                const controller = new AbortController();
                const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/xml',
                        'Accept': 'application/xml',
                    },
                    body: xml,
                    signal: controller.signal,
                });

                clearTimeout(timeoutHandle);
                this.lastRequestTime = Date.now();

                const responseText = await response.text();

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 500)}`);
                }

                return responseText;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                const isRetryable = message.includes('abort') || message.includes('timeout')
                    || message.includes('ECONNRESET') || message.includes('429')
                    || message.includes('503');

                if (!isRetryable || attempt === maxRetries) {
                    throw new Error(`Sage Intacct API request failed after ${attempt + 1} attempt(s): ${message}`);
                }

                // Exponential backoff: 1s, 2s, 4s, ...
                const delay = Math.pow(2, attempt) * 1000;
                await this.Sleep(delay);
            }
        }

        throw new Error('Sage Intacct API request failed: max retries exceeded');
    }

    // ─── XML Parsing Helpers ─────────────────────────────────────────

    /**
     * Checks the API response for error elements and throws if found.
     */
    private CheckForErrors(xml: string): void {
        // Check for control-level errors
        const statusMatch = xml.match(/<status>(.*?)<\/status>/i);
        if (statusMatch && statusMatch[1].toLowerCase() === 'failure') {
            const errMsg = this.ExtractErrorMessage(xml);
            throw new Error(`Sage Intacct API error: ${errMsg}`);
        }

        // Check for function-level errors
        const errNoMatch = xml.match(/<errorno>(.*?)<\/errorno>/i);
        if (errNoMatch) {
            const errDesc = this.ExtractXmlValue(xml, 'description2')
                || this.ExtractXmlValue(xml, 'description')
                || this.ExtractXmlValue(xml, 'errormessage')
                || 'Unknown error';
            throw new Error(`Sage Intacct error ${errNoMatch[1]}: ${errDesc}`);
        }
    }

    private ExtractErrorMessage(xml: string): string {
        const desc2 = this.ExtractXmlValue(xml, 'description2');
        if (desc2) return desc2;
        const desc = this.ExtractXmlValue(xml, 'description');
        if (desc) return desc;
        const errMsg = this.ExtractXmlValue(xml, 'errormessage');
        if (errMsg) return errMsg;
        return 'Unknown error (no description in response)';
    }

    /**
     * Extracts the text content of an XML element by tag name.
     * Simple regex-based parsing — sufficient for Sage Intacct's flat response format.
     */
    private ExtractXmlValue(xml: string, tagName: string): string | null {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }

    private ExtractXmlValueFromFragment(fragment: string, tagName: string): string {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
        const match = fragment.match(regex);
        return match ? match[1].trim() : '';
    }

    /**
     * Extracts records from a readByQuery/read response.
     * Records are child elements within the <data> element, tagged by object name
     * (e.g., <CUSTOMER>, <VENDOR>, etc.) or a generic lowercase tag.
     */
    private ExtractRecords(xml: string, objectName: string): Record<string, unknown>[] {
        const records: Record<string, unknown>[] = [];

        // Look for the data section
        const dataMatch = xml.match(/<data[^>]*>([\s\S]*?)<\/data>/i);
        if (!dataMatch) return records;
        const dataContent = dataMatch[1];

        // Extract individual record elements — try both uppercase and lowercase
        const recordRegex = new RegExp(
            `<${objectName}[^>]*>([\\s\\S]*?)</${objectName}>`,
            'gi'
        );
        let match: RegExpExecArray | null;
        while ((match = recordRegex.exec(dataContent)) !== null) {
            const recordXml = match[1];
            const record = this.ParseRecordFields(recordXml);
            records.push(record);
        }

        return records;
    }

    /**
     * Parses field name/value pairs from a record XML fragment.
     * Handles flat fields only (nested objects are returned as string values).
     */
    private ParseRecordFields(recordXml: string): Record<string, unknown> {
        const fields: Record<string, unknown> = {};
        const fieldRegex = /<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
        let match: RegExpExecArray | null;

        while ((match = fieldRegex.exec(recordXml)) !== null) {
            const fieldName = match[1];
            const value = match[2].trim();

            // Attempt to parse numeric values
            if (/^-?\d+$/.test(value)) {
                fields[fieldName] = parseInt(value, 10);
            } else if (/^-?\d+\.\d+$/.test(value)) {
                fields[fieldName] = parseFloat(value);
            } else if (value === '' || value === null) {
                fields[fieldName] = null;
            } else {
                fields[fieldName] = value;
            }
        }

        return fields;
    }

    private ExtractRecordKey(xml: string, objectName: string): string {
        // After create, Sage Intacct typically returns the key in a <RECORDNO> or object-specific PK field
        const pkField = this.GetPrimaryKeyField(objectName);
        const value = this.ExtractXmlValue(xml, pkField)
            || this.ExtractXmlValue(xml, 'RECORDNO')
            || this.ExtractXmlValue(xml, 'key')
            || '';
        return value;
    }

    // ─── Utility Helpers ─────────────────────────────────────────────

    /**
     * Converts an attributes object to XML field elements.
     */
    private AttributesToXml(attributes: Record<string, unknown>): string {
        return Object.entries(attributes)
            .filter(([, v]) => v != null)
            .map(([key, value]) => `<${key}>${this.EscapeXmlValue(String(value))}</${key}>`)
            .join('\n                        ');
    }

    /**
     * Escapes special characters for XML content.
     */
    private EscapeXmlValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Gets the primary key field name for a Sage Intacct object.
     */
    private GetPrimaryKeyField(objectName: string): string {
        return OBJECT_PK_MAP[objectName.toUpperCase()] || 'RECORDNO';
    }

    /**
     * Formats an API object name into a human-readable label.
     */
    private FormatLabel(name: string): string {
        // Convert ALLCAPS to Title Case with spaces before capitals
        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])([A-Z]+)/g, (_match, first: string, rest: string) =>
                first + rest.toLowerCase()
            )
            .replace(/^\w/, c => c.toUpperCase());
    }

    /**
     * Computes the latest WHENMODIFIED watermark from a batch of records.
     */
    private ComputeWatermark(records: Record<string, unknown>[]): string | undefined {
        let latest: string | undefined;
        for (const record of records) {
            const modified = record['WHENMODIFIED'];
            if (modified && typeof modified === 'string') {
                if (!latest || modified > latest) {
                    latest = modified;
                }
            }
        }
        return latest;
    }

    /**
     * Fetches more records using a readMore request with a resultId cursor.
     */
    private async FetchMoreRecords(
        session: SageIntacctSession,
        resultId: string,
        objectName: string,
        pkField: string
    ): Promise<FetchBatchResult & { NextCursor?: string }> {
        const xml = this.BuildReadMoreRequest(session, resultId);
        const response = await this.SendXMLRequest(session, xml);
        return this.ParseReadByQueryResponse(response, objectName, pkField);
    }

    /**
     * Throttles API requests to respect rate limits.
     */
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
export function LoadSageIntacctConnector(): void { /* no-op */ }
