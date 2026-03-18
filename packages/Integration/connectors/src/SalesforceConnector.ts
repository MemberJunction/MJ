import jwt from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
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
    type SourceSchemaInfo,
    type SourceObjectInfo,
    type SourceFieldInfo,
    type SourceRelationshipInfo,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed Salesforce JWT Bearer credentials */
interface SalesforceCredentials {
    LoginUrl: string;
    ClientId: string;
    Username: string;
    PrivateKey: string;
    ApiVersion: string;
}

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface SalesforceConnectionConfig {
    /** Salesforce login URL */
    LoginUrl: string;
    /** Connected App Consumer Key */
    ClientId: string;
    /** Integration user email */
    Username: string;
    /** PEM-encoded RSA private key */
    PrivateKey: string;
    /** Salesforce REST API version. Default: '61.0' */
    ApiVersion: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 5 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 100 */
    MinRequestIntervalMs?: number;
    /** Batch size for SOQL queries. Default: 2000 */
    DefaultBatchSize?: number;
}

/** Extended auth context carrying Salesforce credentials and cached token */
interface SalesforceAuthContext extends RESTAuthContext {
    /** Salesforce instance URL (pod-specific, e.g., https://na1.salesforce.com) */
    InstanceUrl: string;
    /** API version string */
    ApiVersion: string;
    /** Full config for reference */
    Config: SalesforceConnectionConfig;
}

/** Salesforce API error response format */
interface SalesforceErrorResponse {
    message: string;
    errorCode: string;
    fields?: string[];
}

/** Governor limit tracking state */
interface GovernorLimitState {
    CurrentUsage: number;
    DailyLimit: number;
    LastUpdated: number;
}

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_API_VERSION = '61.0';
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 100;
const DEFAULT_BATCH_SIZE = 2000;

/** Token lifetime — SF tokens last ~2 hours; refresh at 80% (96 min) */
const TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
const TOKEN_REFRESH_THRESHOLD = 0.8;

/** Governor limit thresholds */
const GOVERNOR_THROTTLE_THRESHOLD = 0.8;
const GOVERNOR_PAUSE_THRESHOLD = 0.95;

/** SF compound field types to skip during discovery */
const COMPOUND_FIELD_TYPES = new Set(['address', 'location']);

/** SF system fields that are always read-only */
const SYSTEM_READ_ONLY_FIELDS = new Set([
    'Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById',
    'SystemModstamp', 'IsDeleted', 'LastActivityDate', 'LastViewedDate',
    'LastReferencedDate', 'MasterRecordId',
]);

/** Fields always included in SOQL SELECT */
const REQUIRED_SOQL_FIELDS = ['Id', 'SystemModstamp', 'IsDeleted', 'LastModifiedById'];

// ─── Salesforce Object Metadata for Action Generation ─────────────────

const SALESFORCE_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Account', DisplayName: 'Account',
        Description: 'A company, organization, or consumer in Salesforce CRM', SupportsWrite: true,
        Fields: [
            { Name: 'Name', DisplayName: 'Account Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account name' },
            { Name: 'Industry', DisplayName: 'Industry', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account industry' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account phone number' },
            { Name: 'Website', DisplayName: 'Website', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account website URL' },
            { Name: 'BillingStreet', DisplayName: 'Billing Street', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billing street address' },
            { Name: 'BillingCity', DisplayName: 'Billing City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billing city' },
            { Name: 'BillingState', DisplayName: 'Billing State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billing state/province' },
            { Name: 'BillingPostalCode', DisplayName: 'Billing Postal Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billing postal code' },
            { Name: 'BillingCountry', DisplayName: 'Billing Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billing country' },
            { Name: 'Description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account description' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account type' },
            { Name: 'AnnualRevenue', DisplayName: 'Annual Revenue', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Annual revenue' },
            { Name: 'NumberOfEmployees', DisplayName: 'Employees', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Number of employees' },
            { Name: 'Id', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Contact', DisplayName: 'Contact',
        Description: 'A person associated with an account in Salesforce CRM', SupportsWrite: true,
        Fields: [
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact email address' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact last name' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact phone number' },
            { Name: 'MobilePhone', DisplayName: 'Mobile Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mobile phone number' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact title' },
            { Name: 'Department', DisplayName: 'Department', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact department' },
            { Name: 'MailingStreet', DisplayName: 'Mailing Street', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing street address' },
            { Name: 'MailingCity', DisplayName: 'Mailing City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing city' },
            { Name: 'MailingState', DisplayName: 'Mailing State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing state/province' },
            { Name: 'MailingPostalCode', DisplayName: 'Mailing Postal Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing postal code' },
            { Name: 'MailingCountry', DisplayName: 'Mailing Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing country' },
            { Name: 'AccountId', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent account ID' },
            { Name: 'Id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Lead', DisplayName: 'Lead',
        Description: 'A prospective customer/lead in Salesforce CRM', SupportsWrite: true,
        Fields: [
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead email address' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead last name' },
            { Name: 'Company', DisplayName: 'Company', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead company name' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead phone number' },
            { Name: 'Title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead title' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Lead status' },
            { Name: 'Id', DisplayName: 'Lead ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Opportunity', DisplayName: 'Opportunity',
        Description: 'A sales opportunity in Salesforce CRM', SupportsWrite: true,
        Fields: [
            { Name: 'Name', DisplayName: 'Opportunity Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Opportunity name' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Opportunity amount' },
            { Name: 'StageName', DisplayName: 'Stage', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Current stage' },
            { Name: 'CloseDate', DisplayName: 'Close Date', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expected close date' },
            { Name: 'AccountId', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent account ID' },
            { Name: 'Description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Opportunity description' },
            { Name: 'Id', DisplayName: 'Opportunity ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Task', DisplayName: 'Task',
        Description: 'A task or to-do item in Salesforce', SupportsWrite: true,
        Fields: [
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task subject' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task status' },
            { Name: 'Priority', DisplayName: 'Priority', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Task priority' },
            { Name: 'WhoId', DisplayName: 'Who ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Related Contact or Lead ID' },
            { Name: 'WhatId', DisplayName: 'What ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Related Account, Opportunity, etc. ID' },
            { Name: 'Id', DisplayName: 'Task ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Event', DisplayName: 'Event',
        Description: 'A calendar event in Salesforce', SupportsWrite: true,
        Fields: [
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event subject' },
            { Name: 'StartDateTime', DisplayName: 'Start', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event start date/time' },
            { Name: 'EndDateTime', DisplayName: 'End', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event end date/time' },
            { Name: 'WhoId', DisplayName: 'Who ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Related Contact or Lead ID' },
            { Name: 'Id', DisplayName: 'Event ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Case', DisplayName: 'Case',
        Description: 'A support case in Salesforce', SupportsWrite: true,
        Fields: [
            { Name: 'Subject', DisplayName: 'Subject', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Case subject' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Case status' },
            { Name: 'Priority', DisplayName: 'Priority', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Case priority' },
            { Name: 'AccountId', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent account ID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Related contact ID' },
            { Name: 'Description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Case description' },
            { Name: 'Id', DisplayName: 'Case ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'Campaign', DisplayName: 'Campaign',
        Description: 'A marketing campaign in Salesforce', SupportsWrite: true,
        Fields: [
            { Name: 'Name', DisplayName: 'Campaign Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign name' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign status' },
            { Name: 'Type', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign type' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign start date' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Campaign end date' },
            { Name: 'Id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        ],
    },
    {
        Name: 'User', DisplayName: 'User',
        Description: 'A Salesforce user (reference only, not writable)', SupportsWrite: false,
        IncludeInActionGeneration: false,
        Fields: [
            { Name: 'Username', DisplayName: 'Username', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User login name' },
            { Name: 'Name', DisplayName: 'Full Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full name' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User email' },
            { Name: 'Id', DisplayName: 'User ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce user ID' },
        ],
    },
];

// ─── SalesforceConnector ──────────────────────────────────────────────

/**
 * Production Salesforce CRM connector using the Salesforce REST API v61.0.
 *
 * Supports:
 * - OAuth 2.0 JWT Bearer Token authentication (RS256)
 * - Live schema discovery via SF Describe API
 * - SOQL-based incremental sync with SystemModstamp watermarks
 * - Full CRUD (Create, Update, Delete) via SObject REST API
 * - SOQL/SOSL search support
 * - Comprehensive SF error code handling and governor limit management
 *
 * Extends BaseRESTIntegrationConnector but overrides FetchChanges entirely
 * because Salesforce uses SOQL queries instead of standard REST list endpoints.
 */
@RegisterClass(BaseIntegrationConnector, 'SalesforceConnector')
export class SalesforceConnector extends BaseRESTIntegrationConnector {

    // ── Token cache ─────────────────────────────────────────────────
    private cachedAuth: SalesforceAuthContext | null = null;
    private tokenObtainedAt = 0;

    // ── Rate limit / governor tracking ──────────────────────────────
    private lastRequestTime = 0;
    private governorState: GovernorLimitState = { CurrentUsage: 0, DailyLimit: 15000, LastUpdated: 0 };

    // ── Pagination state for SOQL queryMore ─────────────────────────
    private queryLocator: string | null = null;

    // ── Config ──────────────────────────────────────────────────────
    private _config: SalesforceConnectionConfig | null = null;

    private get effectiveMaxRetries(): number { return this._config?.MaxRetries ?? DEFAULT_MAX_RETRIES; }
    private get effectiveRequestTimeoutMs(): number { return this._config?.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS; }
    private get effectiveMinRequestIntervalMs(): number { return this._config?.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS; }
    private get effectiveBatchSize(): number { return this._config?.DefaultBatchSize ?? DEFAULT_BATCH_SIZE; }

    // ─── Capability Getters ──────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }

    public override get IntegrationName(): string { return 'Salesforce'; }

    // ─── Action Metadata ─────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return SALESFORCE_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-brands fa-salesforce';
        return config;
    }

    // ─── TestConnection ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/`;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status >= 200 && response.Status < 300) {
                return {
                    Success: true,
                    Message: `Successfully connected to Salesforce (${auth.InstanceUrl})`,
                    ServerVersion: `Salesforce REST API v${auth.ApiVersion}`,
                };
            }

            return {
                Success: false,
                Message: `Salesforce API returned ${response.Status}: ${this.PreviewBody(response.Body)}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (Live from SF Describe API) ───────────────────────

    /**
     * Discovers available objects by calling the SF SObjects API.
     * Returns all queryable objects including custom objects (__c).
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as { sobjects?: SObjectDescribe[] };
        const sobjects = body.sobjects ?? [];

        return sobjects
            .filter(obj => obj.queryable)
            .map(obj => ({
                Name: obj.name,
                Label: obj.label,
                Description: obj.custom ? `Custom object: ${obj.label}` : undefined,
                SupportsIncrementalSync: true,
                SupportsWrite: obj.createable || obj.updateable,
            }));
    }

    /**
     * Discovers fields on a specific SF object via the Describe API.
     * Skips compound fields (address, location) — their component fields are included individually.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${objectName}/describe`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as { fields?: SFieldDescribe[] };
        const fields = body.fields ?? [];

        return fields
            .filter(f => !COMPOUND_FIELD_TYPES.has(f.type))
            .map(f => this.MapSFFieldToSchema(f));
    }

    /**
     * Full schema introspection — builds object graph with relationships.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const objects = await this.DiscoverObjects(companyIntegration, contextUser);
        const result: SourceSchemaInfo = { Objects: [] };

        for (const obj of objects) {
            try {
                const sourceObj = await this.BuildSourceObjectFromDescribe(
                    companyIntegration, contextUser, obj.Name
                );
                result.Objects.push(sourceObj);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[Salesforce] Skipping "${obj.Name}" during introspection: ${msg}`);
            }
        }

        return result;
    }

    // ─── FetchChanges (SOQL-based — overrides base class entirely) ───

    /**
     * Fetches changed records using SOQL queries with SystemModstamp watermarks.
     * Completely overrides the base class REST pagination because SF uses
     * SOQL + queryMore, not standard REST list endpoints.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const batchSize = ctx.BatchSize || this.effectiveBatchSize;

        // If we have a queryLocator from a previous call, use queryMore
        if (this.queryLocator && ctx.CurrentCursor) {
            return this.FetchNextPage(auth, ctx.CurrentCursor);
        }

        // Build and execute SOQL query
        const fields = await this.GetQueryableFieldNames(auth, ctx.ObjectName);
        const soql = this.BuildSOQLQuery(ctx.ObjectName, fields, ctx.WatermarkValue, batchSize, true);
        return this.ExecuteSOQLQuery(auth, soql, ctx.ObjectName);
    }

    // ─── CRUD Operations ─────────────────────────────────────────────

    /**
     * Creates a new record in Salesforce.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${ctx.ObjectName}/`;

        const body = this.StripReadOnlyFields(ctx.Attributes);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);

        if (response.Status === 201 || (response.Status >= 200 && response.Status < 300)) {
            const created = response.Body as { id?: string; success?: boolean };
            return {
                Success: true,
                ExternalID: created.id ?? '',
                StatusCode: response.Status,
            };
        }

        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    /**
     * Updates an existing record in Salesforce (PATCH — only changed fields).
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${ctx.ObjectName}/${ctx.ExternalID}`;

        const body = this.StripReadOnlyFields(ctx.Attributes);
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, body);

        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return {
                Success: true,
                ExternalID: ctx.ExternalID,
                StatusCode: response.Status,
            };
        }

        return this.HandleWriteError(response, 'UpdateRecord', ctx.ObjectName, ctx.ExternalID, auth, headers, url, body);
    }

    /**
     * Deletes a record from Salesforce.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${ctx.ObjectName}/${ctx.ExternalID}`;

        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);

        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }

        // ENTITY_IS_DELETED means it's already gone — treat as success
        if (this.HasSFErrorCode(response, 'ENTITY_IS_DELETED')) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        }

        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    /**
     * Retrieves a single record by its Salesforce ID.
     */
    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${ctx.ObjectName}/${ctx.ExternalID}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        this.ValidateResponse(response, url);

        const raw = response.Body as Record<string, unknown>;
        return this.RawToExternalRecord(raw, ctx.ObjectName);
    }

    // ─── Search (SOQL) ───────────────────────────────────────────────

    /**
     * Searches records using SOQL WHERE clauses built from the provided filters.
     */
    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);

        const fields = await this.GetQueryableFieldNames(auth, ctx.ObjectName);
        const whereClause = this.BuildWhereClauseFromFilters(ctx.Filters);
        const limit = ctx.PageSize ?? 100;
        const offset = ctx.Page != null && ctx.Page > 1 ? (ctx.Page - 1) * limit : 0;

        let soql = `SELECT ${fields.join(', ')} FROM ${ctx.ObjectName}`;
        if (whereClause) soql += ` WHERE ${whereClause}`;
        if (ctx.Sort) soql += ` ORDER BY ${ctx.Sort}`;
        soql += ` LIMIT ${limit}`;
        if (offset > 0) soql += ` OFFSET ${offset}`;

        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/query?q=${encodeURIComponent(soql)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as SOQLQueryResponse;
        const records = (body.records ?? []).map(r => this.RawToExternalRecord(r, ctx.ObjectName));

        return {
            Records: records,
            TotalCount: body.totalSize ?? records.length,
            HasMore: !body.done,
        };
    }

    // ─── Default Field Mappings ──────────────────────────────────────

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Contact': return this.GetContactMappings();
            case 'Account': return this.GetAccountMappings();
            case 'Lead': return this.GetLeadMappings();
            default: return [];
        }
    }

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'Salesforce',
            DefaultObjects: [
                {
                    SourceObjectName: 'Account',
                    TargetTableName: 'SalesforceAccount',
                    TargetEntityName: 'Salesforce Account',
                    SyncEnabled: true,
                    FieldMappings: this.GetAccountMappings(),
                },
                {
                    SourceObjectName: 'Contact',
                    TargetTableName: 'SalesforceContact',
                    TargetEntityName: 'Salesforce Contact',
                    SyncEnabled: true,
                    FieldMappings: this.GetContactMappings(),
                },
                {
                    SourceObjectName: 'Lead',
                    TargetTableName: 'SalesforceLead',
                    TargetEntityName: 'Salesforce Lead',
                    SyncEnabled: true,
                    FieldMappings: this.GetLeadMappings(),
                },
            ],
        };
    }

    // ─── BaseRESTIntegrationConnector abstract implementations ───────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SalesforceAuthContext> {
        // Return cached auth if still valid
        if (this.cachedAuth && this.IsTokenValid()) {
            return this.cachedAuth;
        }

        console.log('[Salesforce] Authenticating via JWT Bearer Token...');
        const credentials = await this.LoadCredentials(companyIntegration, contextUser);
        const config = this.BuildConnectionConfig(credentials, companyIntegration);
        this._config = config;

        const jwtAssertion = this.BuildJWTAssertion(config);
        const tokenResponse = await this.ExchangeJWTForToken(config.LoginUrl, jwtAssertion);

        this.cachedAuth = {
            Token: tokenResponse.access_token,
            InstanceUrl: tokenResponse.instance_url,
            ApiVersion: config.ApiVersion,
            Config: config,
        };
        this.tokenObtainedAt = Date.now();

        console.log(`[Salesforce] Authenticated, instance: ${tokenResponse.instance_url}`);
        return this.cachedAuth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
        };
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        await this.ThrottleIfNeeded();
        await this.CheckGovernorLimits();

        const maxRetries = this.effectiveMaxRetries;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            // Parse governor limits from response
            this.ParseGovernorLimits(response.headers);

            // Handle 401 — token expired, re-authenticate
            if (response.status === 401 && attempt === 0) {
                console.warn('[Salesforce] Token expired (401), re-authenticating...');
                this.cachedAuth = null;
                // Caller should re-authenticate; for now return the error
            }

            // Handle 429 — rate limited
            if (response.status === 429) {
                const delayMs = this.CalculateRetryDelay(attempt);
                console.warn(
                    `[Salesforce] Rate limited (429), retrying in ${delayMs}ms ` +
                    `(attempt ${attempt + 1}/${maxRetries})`
                );
                await this.Sleep(delayMs);
                continue;
            }

            // Handle UNABLE_TO_LOCK_ROW — retry with backoff
            if (response.status === 400) {
                const responseBody = await this.SafeParseJSON(response);
                if (this.IsLockRowError(responseBody) && attempt < maxRetries) {
                    const delayMs = this.CalculateRetryDelay(attempt);
                    console.warn(`[Salesforce] Row lock contention, retrying in ${delayMs}ms`);
                    await this.Sleep(delayMs);
                    continue;
                }
                return this.BuildRESTResponse(response, responseBody);
            }

            // Handle 204 No Content (successful DELETE/PATCH)
            if (response.status === 204) {
                return { Status: 204, Body: {}, Headers: this.ExtractHeaders(response) };
            }

            const responseBody = await this.SafeParseJSON(response);
            return this.BuildRESTResponse(response, responseBody);
        }

        throw new Error(`Salesforce API request failed after ${maxRetries} retries: ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        _responseDataKey: string | null
    ): Record<string, unknown>[] {
        // SF SOQL responses have records at body.records
        const body = rawBody as SOQLQueryResponse;
        return (body.records ?? []) as Record<string, unknown>[];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        // Not used — we override FetchChanges entirely for SOQL
        const body = rawBody as SOQLQueryResponse;
        return {
            HasMore: !body.done,
            NextCursor: body.nextRecordsUrl ?? undefined,
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        const sfAuth = auth as SalesforceAuthContext;
        return sfAuth.InstanceUrl;
    }

    // ─── SOQL Query Engine ───────────────────────────────────────────

    /**
     * Builds a SOQL query string with optional watermark filter.
     */
    private BuildSOQLQuery(
        objectName: string,
        fields: string[],
        watermarkValue: string | null,
        batchSize: number,
        includeDeleted: boolean
    ): string {
        const dedupedFields = [...new Set([...REQUIRED_SOQL_FIELDS, ...fields])];
        let soql = `SELECT ${dedupedFields.join(', ')} FROM ${objectName}`;

        if (watermarkValue) {
            soql += ` WHERE SystemModstamp > ${this.FormatSOQLDateTime(watermarkValue)}`;
        }

        soql += ' ORDER BY SystemModstamp ASC';
        soql += ` LIMIT ${batchSize}`;

        return soql;
    }

    /**
     * Executes a SOQL query and returns records as a FetchBatchResult.
     */
    private async ExecuteSOQLQuery(
        auth: SalesforceAuthContext,
        soql: string,
        objectName: string
    ): Promise<FetchBatchResult> {
        // Use queryAll to include deleted records (IsDeleted=true)
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/queryAll?q=${encodeURIComponent(soql)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        return this.ParseSOQLResponse(response.Body as SOQLQueryResponse, objectName);
    }

    /**
     * Fetches the next page of results using a queryMore locator.
     */
    private async FetchNextPage(
        auth: SalesforceAuthContext,
        queryLocator: string
    ): Promise<FetchBatchResult> {
        // queryLocator is a relative URL like /services/data/v61.0/query/01gxx...
        const url = `${auth.InstanceUrl}${queryLocator}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as SOQLQueryResponse;
        // Extract object name from the first record's attributes
        const firstRecord = body.records?.[0] as Record<string, unknown> | undefined;
        const attrs = firstRecord?.['attributes'] as { type?: string } | undefined;
        const objectName = attrs?.type ?? 'Unknown';

        return this.ParseSOQLResponse(body, objectName);
    }

    /**
     * Parses a SOQL query response into a FetchBatchResult.
     */
    private ParseSOQLResponse(
        body: SOQLQueryResponse,
        objectName: string
    ): FetchBatchResult {
        const records = (body.records ?? []).map(r => {
            const raw = r as Record<string, unknown>;
            const record = this.RawToExternalRecord(raw, objectName);
            record.IsDeleted = raw['IsDeleted'] === true;
            record.ModifiedAt = raw['SystemModstamp']
                ? new Date(raw['SystemModstamp'] as string)
                : undefined;
            return record;
        });

        // Compute new watermark from the max SystemModstamp in this batch
        const newWatermark = this.ExtractMaxWatermark(body.records ?? []);

        return {
            Records: records,
            HasMore: !body.done,
            NewWatermarkValue: newWatermark ?? undefined,
            NextCursor: body.nextRecordsUrl ?? undefined,
        };
    }

    /**
     * Extracts the maximum SystemModstamp value from a batch of records.
     */
    private ExtractMaxWatermark(records: unknown[]): string | null {
        let maxTimestamp: string | null = null;

        for (const record of records) {
            const raw = record as Record<string, unknown>;
            const stamp = raw['SystemModstamp'] as string | undefined;
            if (stamp && (!maxTimestamp || stamp > maxTimestamp)) {
                maxTimestamp = stamp;
            }
        }

        return maxTimestamp;
    }

    /**
     * Gets queryable field names for a SF object via the Describe API.
     */
    private async GetQueryableFieldNames(
        auth: SalesforceAuthContext,
        objectName: string
    ): Promise<string[]> {
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${objectName}/describe`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as { fields?: SFieldDescribe[] };
        const fields = body.fields ?? [];

        return fields
            .filter(f => !COMPOUND_FIELD_TYPES.has(f.type))
            .map(f => f.name);
    }

    // ─── JWT Authentication ──────────────────────────────────────────

    /**
     * Builds a signed JWT assertion for the SF JWT Bearer Token flow.
     */
    private BuildJWTAssertion(config: SalesforceConnectionConfig): string {
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            iss: config.ClientId,
            sub: config.Username,
            aud: config.LoginUrl,
            exp: now + 300, // 5 minutes
        };

        return jwt.sign(payload, config.PrivateKey, { algorithm: 'RS256' });
    }

    /**
     * Exchanges a JWT assertion for an access token at the SF token endpoint.
     */
    private async ExchangeJWTForToken(
        loginUrl: string,
        jwtAssertion: string
    ): Promise<{ access_token: string; instance_url: string }> {
        const tokenUrl = `${loginUrl}/services/oauth2/token`;
        const body = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwtAssertion)}`;

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(this.effectiveRequestTimeoutMs),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `Salesforce JWT token exchange failed (HTTP ${response.status}): ${errorBody}`
            );
        }

        const result = await response.json() as { access_token: string; instance_url: string; token_type: string };
        if (!result.access_token || !result.instance_url) {
            throw new Error('Salesforce token response missing access_token or instance_url');
        }

        return result;
    }

    /**
     * Checks if the cached token is still valid (within 80% of lifetime).
     */
    private IsTokenValid(): boolean {
        if (!this.cachedAuth || this.tokenObtainedAt === 0) return false;
        const elapsed = Date.now() - this.tokenObtainedAt;
        return elapsed < TOKEN_LIFETIME_MS * TOKEN_REFRESH_THRESHOLD;
    }

    // ─── Credential Loading ──────────────────────────────────────────

    /**
     * Loads credentials from the Credential entity or Configuration JSON.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SalesforceCredentials> {
        // Try Credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const creds = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (creds) return creds;
        }

        // Fallback: Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const creds = this.ParseCredentialJson(configJson);
            if (creds) return creds;
        }

        throw new Error(
            'No Salesforce credentials found. Attach a credential of type "Salesforce JWT Bearer" ' +
            'or set Configuration JSON on the CompanyIntegration with loginUrl, clientId, username, and privateKey.'
        );
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<SalesforceCredentials | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    private ParseCredentialJson(json: string): SalesforceCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, string>;
            const privateKey = parsed['privateKey'] ?? parsed['PrivateKey'];
            const clientId = parsed['clientId'] ?? parsed['ClientId'];
            const username = parsed['username'] ?? parsed['Username'];

            if (!privateKey || !clientId || !username) return null;

            return {
                LoginUrl: parsed['loginUrl'] ?? parsed['LoginUrl'] ?? 'https://login.salesforce.com',
                ClientId: clientId,
                Username: username,
                PrivateKey: privateKey,
                ApiVersion: parsed['apiVersion'] ?? parsed['ApiVersion'] ?? DEFAULT_API_VERSION,
            };
        } catch {
            return null;
        }
    }

    private BuildConnectionConfig(
        credentials: SalesforceCredentials,
        companyIntegration: MJCompanyIntegrationEntity
    ): SalesforceConnectionConfig {
        const config: SalesforceConnectionConfig = {
            LoginUrl: credentials.LoginUrl,
            ClientId: credentials.ClientId,
            Username: credentials.Username,
            PrivateKey: credentials.PrivateKey,
            ApiVersion: credentials.ApiVersion,
        };

        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            this.ApplyConfigOverrides(config, configJson);
        }

        return config;
    }

    private ApplyConfigOverrides(config: SalesforceConnectionConfig, json: string): void {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            const parseOptionalInt = (key: string): number | undefined => {
                const v = parsed[key];
                if (v == null) return undefined;
                const n = Number(v);
                return isNaN(n) ? undefined : Math.floor(n);
            };

            config.MaxRetries = parseOptionalInt('MaxRetries');
            config.RequestTimeoutMs = parseOptionalInt('RequestTimeoutMs');
            config.MinRequestIntervalMs = parseOptionalInt('MinRequestIntervalMs');
            config.DefaultBatchSize = parseOptionalInt('DefaultBatchSize');
        } catch {
            // Configuration JSON may not be valid — ignore
        }
    }

    // ─── Rate Limit / Governor Limit Management ──────────────────────

    /**
     * Throttles requests to respect minimum interval between API calls.
     */
    private async ThrottleIfNeeded(): Promise<void> {
        const minInterval = this.effectiveMinRequestIntervalMs;
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minInterval) {
            await this.Sleep(minInterval - elapsed);
        }
    }

    /**
     * Checks governor limits and pauses if approaching the daily API limit.
     */
    private async CheckGovernorLimits(): Promise<void> {
        const { CurrentUsage, DailyLimit } = this.governorState;
        if (DailyLimit === 0) return;

        const ratio = CurrentUsage / DailyLimit;

        if (ratio >= GOVERNOR_PAUSE_THRESHOLD) {
            throw new Error(
                `Salesforce governor limit critical: ${CurrentUsage}/${DailyLimit} API calls used ` +
                `(${Math.round(ratio * 100)}%). Sync paused to prevent REQUEST_LIMIT_EXCEEDED.`
            );
        }

        if (ratio >= GOVERNOR_THROTTLE_THRESHOLD) {
            console.warn(
                `[Salesforce] Governor limit warning: ${CurrentUsage}/${DailyLimit} ` +
                `(${Math.round(ratio * 100)}%). Adding throttle delay.`
            );
            await this.Sleep(500); // Extra delay when approaching limit
        }
    }

    /**
     * Parses the Sforce-Limit-Info header from every SF response.
     */
    private ParseGovernorLimits(headers: Headers): void {
        const limitInfo = headers.get('sforce-limit-info');
        if (!limitInfo) return;

        // Format: "api-usage=25/15000"
        const match = limitInfo.match(/api-usage=(\d+)\/(\d+)/);
        if (match) {
            this.governorState = {
                CurrentUsage: parseInt(match[1], 10),
                DailyLimit: parseInt(match[2], 10),
                LastUpdated: Date.now(),
            };
        }
    }

    // ─── HTTP Helpers ────────────────────────────────────────────────

    private async FetchWithTimeout(
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<Response> {
        const fetchOptions: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(this.effectiveRequestTimeoutMs),
        };

        if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        return fetch(url, fetchOptions);
    }

    private BuildRESTResponse(response: Response, body: unknown): RESTResponse {
        return {
            Status: response.status,
            Body: body,
            Headers: this.ExtractHeaders(response),
        };
    }

    private ExtractHeaders(response: Response): Record<string, string> {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });
        return headers;
    }

    private async SafeParseJSON(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            return {};
        }
    }

    private CalculateRetryDelay(attempt: number): number {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 30s)
        return Math.min(1000 * Math.pow(2, attempt), 30000);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── SF Type Mapping ─────────────────────────────────────────────

    /**
     * Maps a Salesforce field describe to an ExternalFieldSchema.
     */
    private MapSFFieldToSchema(f: SFieldDescribe): ExternalFieldSchema {
        return {
            Name: f.name,
            Label: f.label,
            Description: f.inlineHelpText ?? undefined,
            DataType: this.MapSalesforceType(f.type),
            IsRequired: !f.nillable && !f.defaultedOnCreate,
            IsUniqueKey: f.externalId || f.name === 'Id',
            IsReadOnly: f.calculated || !f.updateable || SYSTEM_READ_ONLY_FIELDS.has(f.name),
            IsForeignKey: f.type === 'reference' && f.referenceTo.length > 0,
            ForeignKeyTarget: f.referenceTo.length > 0 ? f.referenceTo[0] : null,
        };
    }

    /**
     * Maps a Salesforce field type to a generic integration type.
     */
    private MapSalesforceType(sfType: string): string {
        switch (sfType) {
            case 'string':
            case 'textarea':
            case 'url':
            case 'email':
            case 'phone':
            case 'picklist':
            case 'multipicklist':
            case 'combobox':
                return 'string';
            case 'int':
                return 'integer';
            case 'double':
            case 'currency':
            case 'percent':
                return 'decimal';
            case 'boolean':
                return 'boolean';
            case 'date':
                return 'date';
            case 'datetime':
                return 'datetime';
            case 'time':
                return 'time';
            case 'id':
            case 'reference':
                return 'nvarchar(18)';
            case 'base64':
            case 'encryptedstring':
                return 'text';
            default:
                return 'string';
        }
    }

    // ─── SOQL Helpers ────────────────────────────────────────────────

    /**
     * Formats a watermark value as a SOQL datetime literal.
     */
    private FormatSOQLDateTime(value: string): string {
        // If it's already in ISO 8601 format, it works directly in SOQL
        // SOQL accepts: 2026-03-13T10:30:00.000Z or 2026-03-13T10:30:00.000+00:00
        if (value.includes('T')) return value;
        // If it's just a date, append time
        return `${value}T00:00:00.000Z`;
    }

    /**
     * Builds a SOQL WHERE clause from a Filters map.
     */
    private BuildWhereClauseFromFilters(filters: Record<string, string>): string | null {
        const conditions = Object.entries(filters).map(([field, value]) => {
            const escaped = value.replace(/'/g, "\\'");
            return `${field} = '${escaped}'`;
        });

        return conditions.length > 0 ? conditions.join(' AND ') : null;
    }

    // ─── Error Handling ──────────────────────────────────────────────

    /**
     * Checks if a response contains a specific SF error code.
     */
    private HasSFErrorCode(response: RESTResponse, errorCode: string): boolean {
        const errors = this.ExtractSFErrors(response);
        return errors.some(e => e.errorCode === errorCode);
    }

    /**
     * Extracts SF error objects from a response.
     */
    private ExtractSFErrors(response: RESTResponse): SalesforceErrorResponse[] {
        const body = response.Body;
        if (Array.isArray(body)) {
            return body as SalesforceErrorResponse[];
        }
        if (body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)) {
            return [body as SalesforceErrorResponse];
        }
        return [];
    }

    /**
     * Checks if a response body contains an UNABLE_TO_LOCK_ROW error.
     */
    private IsLockRowError(body: unknown): boolean {
        if (!Array.isArray(body)) return false;
        return body.some((e: Record<string, unknown>) => e['errorCode'] === 'UNABLE_TO_LOCK_ROW');
    }

    /**
     * Builds a CRUDResult for error responses.
     */
    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const errors = this.ExtractSFErrors(response);
        const message = errors.length > 0
            ? errors.map(e => `${e.errorCode}: ${e.message}`).join('; ')
            : `[Salesforce] ${operation} on ${objectName} failed (HTTP ${response.Status})`;

        return {
            Success: false,
            ErrorMessage: message,
            StatusCode: response.Status,
        };
    }

    /**
     * Handles write errors with special retry logic for UNABLE_TO_LOCK_ROW.
     */
    private async HandleWriteError(
        response: RESTResponse,
        operation: string,
        objectName: string,
        externalID: string,
        auth: SalesforceAuthContext,
        headers: Record<string, string>,
        url: string,
        body: Record<string, unknown>
    ): Promise<CRUDResult> {
        // UNABLE_TO_LOCK_ROW — retry once more
        if (this.HasSFErrorCode(response, 'UNABLE_TO_LOCK_ROW')) {
            console.warn(`[Salesforce] Row lock contention on ${objectName}/${externalID}, retrying...`);
            await this.Sleep(1000);
            const retry = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, body);
            if (retry.Status === 204 || (retry.Status >= 200 && retry.Status < 300)) {
                return { Success: true, ExternalID: externalID, StatusCode: retry.Status };
            }
        }

        return this.BuildCRUDError(response, operation, objectName);
    }

    // ─── Record Conversion ───────────────────────────────────────────

    /**
     * Converts a raw SF API record to an ExternalRecord.
     * Strips the SF `attributes` metadata object from the fields.
     */
    private RawToExternalRecord(raw: Record<string, unknown>, objectType: string): ExternalRecord {
        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (key === 'attributes') continue; // SF metadata, not a data field
            fields[key] = value;
        }

        return {
            ExternalID: String(raw['Id'] ?? ''),
            ObjectType: objectType,
            Fields: fields,
            ModifiedAt: raw['SystemModstamp']
                ? new Date(raw['SystemModstamp'] as string)
                : undefined,
        };
    }

    /**
     * Strips read-only and system fields from an attributes map before write operations.
     */
    private StripReadOnlyFields(attributes: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(attributes)) {
            if (SYSTEM_READ_ONLY_FIELDS.has(key)) continue;
            if (value === undefined) continue;
            result[key] = value;
        }
        return result;
    }

    // ─── Schema Building ─────────────────────────────────────────────

    private async BuildSourceObjectFromDescribe(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        objectName: string
    ): Promise<SourceObjectInfo> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/sobjects/${objectName}/describe`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as { fields?: SFieldDescribe[]; label?: string };
        const sfFields = (body.fields ?? []).filter(f => !COMPOUND_FIELD_TYPES.has(f.type));

        const fields: SourceFieldInfo[] = sfFields.map(f => ({
            Name: f.name,
            Label: f.label,
            Description: f.inlineHelpText ?? undefined,
            SourceType: this.MapSalesforceType(f.type),
            IsRequired: !f.nillable && !f.defaultedOnCreate,
            MaxLength: f.length > 0 ? f.length : null,
            Precision: f.precision > 0 ? f.precision : null,
            Scale: f.scale > 0 ? f.scale : null,
            DefaultValue: f.defaultValue != null ? String(f.defaultValue) : null,
            IsPrimaryKey: f.name === 'Id',
            IsForeignKey: f.type === 'reference' && f.referenceTo.length > 0,
            ForeignKeyTarget: f.referenceTo.length > 0 ? f.referenceTo[0] : null,
        }));

        const relationships: SourceRelationshipInfo[] = sfFields
            .filter(f => f.type === 'reference' && f.referenceTo.length > 0)
            .map(f => ({
                FieldName: f.name,
                TargetObject: f.referenceTo[0],
                TargetField: 'Id',
            }));

        return {
            ExternalName: objectName,
            ExternalLabel: body.label ?? objectName,
            Description: undefined,
            Fields: fields,
            PrimaryKeyFields: ['Id'],
            Relationships: relationships,
        };
    }

    // ─── Default Field Mappings ──────────────────────────────────────

    private GetContactMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'Email', DestinationFieldName: 'Email', IsKeyField: true },
            { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
            { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
            { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
            { SourceFieldName: 'MobilePhone', DestinationFieldName: 'MobilePhone' },
            { SourceFieldName: 'Title', DestinationFieldName: 'Title' },
            { SourceFieldName: 'Department', DestinationFieldName: 'Department' },
            { SourceFieldName: 'MailingStreet', DestinationFieldName: 'Address1' },
            { SourceFieldName: 'MailingCity', DestinationFieldName: 'City' },
            { SourceFieldName: 'MailingState', DestinationFieldName: 'StateOrProvince' },
            { SourceFieldName: 'MailingPostalCode', DestinationFieldName: 'PostalCode' },
            { SourceFieldName: 'MailingCountry', DestinationFieldName: 'Country' },
        ];
    }

    private GetAccountMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'Name', DestinationFieldName: 'Name', IsKeyField: true },
            { SourceFieldName: 'BillingStreet', DestinationFieldName: 'Address1' },
            { SourceFieldName: 'BillingCity', DestinationFieldName: 'City' },
            { SourceFieldName: 'BillingState', DestinationFieldName: 'StateOrProvince' },
            { SourceFieldName: 'BillingPostalCode', DestinationFieldName: 'PostalCode' },
            { SourceFieldName: 'BillingCountry', DestinationFieldName: 'Country' },
            { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
            { SourceFieldName: 'Website', DestinationFieldName: 'WebSite' },
            { SourceFieldName: 'Industry', DestinationFieldName: 'Industry' },
            { SourceFieldName: 'Description', DestinationFieldName: 'Description' },
        ];
    }

    private GetLeadMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'Email', DestinationFieldName: 'Email', IsKeyField: true },
            { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
            { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
            { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
            { SourceFieldName: 'Company', DestinationFieldName: 'CompanyName' },
            { SourceFieldName: 'Title', DestinationFieldName: 'Title' },
        ];
    }

    // ─── Validation Helpers ──────────────────────────────────────────

    private ValidateResponse(response: RESTResponse, url: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            const preview = this.PreviewBody(response.Body);
            throw new Error(`HTTP ${response.Status} from ${url}: ${preview}`);
        }
    }

    private PreviewBody(body: unknown): string {
        if (typeof body === 'string') return body.slice(0, 500);
        return JSON.stringify(body).slice(0, 500);
    }
}

// ─── SF Describe API Type Definitions ─────────────────────────────────

/** Salesforce SObject describe response entry */
interface SObjectDescribe {
    name: string;
    label: string;
    custom: boolean;
    createable: boolean;
    updateable: boolean;
    deletable: boolean;
    queryable: boolean;
    searchable: boolean;
}

/** Salesforce field describe response entry */
interface SFieldDescribe {
    name: string;
    label: string;
    type: string;
    length: number;
    precision: number;
    scale: number;
    nillable: boolean;
    createable: boolean;
    updateable: boolean;
    custom: boolean;
    calculated: boolean;
    externalId: boolean;
    defaultedOnCreate: boolean;
    defaultValue: unknown;
    inlineHelpText: string | null;
    referenceTo: string[];
    relationshipName: string | null;
}

/** Salesforce SOQL query response */
interface SOQLQueryResponse {
    totalSize: number;
    done: boolean;
    records: Record<string, unknown>[];
    nextRecordsUrl?: string;
}
