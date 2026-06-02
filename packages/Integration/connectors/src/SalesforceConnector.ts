import jwt from 'jsonwebtoken';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
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
    type IntrospectSchemaOptions,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Supported Salesforce auth flows */
type SalesforceAuthFlow = 'jwt_bearer' | 'client_credentials';

/**
 * Salesforce API family routing hint. Drives which endpoint URLs and SOQL
 * dialect a given IntegrationObject uses. Encoded in
 * IntegrationObject.DefaultQueryParams as `{"api_family": "<value>"}`.
 *
 * - `sobject` (default): Standard REST SObjects at /services/data/vXX/sobjects
 *   and SOQL via /query or /queryAll
 * - `tooling`: Tooling API at /services/data/vXX/tooling/sobjects with SOQL
 *   via /tooling/query
 * - `knowledge`: Knowledge articles via /services/data/vXX/support/knowledgeArticles
 * - `analytics_report`: Read-only Reports API at /services/data/vXX/analytics/reports
 * - `analytics_dashboard`: Read-only Dashboards API at /services/data/vXX/analytics/dashboards
 * - `bulk_ingest`: Bulk API 2.0 Ingest jobs at /services/data/vXX/jobs/ingest
 * - `bulk_query`: Bulk API 2.0 Query jobs at /services/data/vXX/jobs/query
 * - `composite`: Composite request batching at /services/data/vXX/composite
 */
type SalesforceAPIFamily =
    | 'sobject'
    | 'tooling'
    | 'knowledge'
    | 'analytics_report'
    | 'analytics_dashboard'
    | 'bulk_ingest'
    | 'bulk_query'
    | 'composite';

/** Parsed Salesforce credentials — supports JWT Bearer and Client Credentials flows */
interface SalesforceCredentials {
    AuthFlow: SalesforceAuthFlow;
    LoginUrl: string;
    ClientId: string;
    ApiVersion: string;
    /** JWT Bearer only — integration user email */
    Username?: string;
    /** JWT Bearer only — PEM-encoded RSA private key */
    PrivateKey?: string;
    /** Client Credentials only — Connected App client secret */
    ClientSecret?: string;
    /** Optional — token endpoint URL if different from LoginUrl (e.g. My Domain URL for JWT flow) */
    TokenUrl?: string;
}

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface SalesforceConnectionConfig {
    /** Auth flow to use */
    AuthFlow: SalesforceAuthFlow;
    /** Salesforce login URL (e.g. https://login.salesforce.com or https://myorg.my.salesforce.com) */
    LoginUrl: string;
    /** Connected App Consumer Key */
    ClientId: string;
    /** Salesforce REST API version. Default: '61.0' */
    ApiVersion: string;
    /** JWT Bearer only — Integration user email */
    Username?: string;
    /** JWT Bearer only — PEM-encoded RSA private key */
    PrivateKey?: string;
    /** Client Credentials only — Connected App client secret */
    ClientSecret?: string;
    /** Optional — token endpoint URL if different from LoginUrl (e.g. My Domain URL for JWT flow) */
    TokenUrl?: string;

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

/**
 * Objects that SF exposes through the main `/sobjects/` endpoint but that only
 * function correctly through the Tooling API. The Data API describes them as
 * `queryable=true` so they'd otherwise land in the picker, but syncing them
 * produces one or more of: duplicate-key violations (pagination returns the
 * same record across pages), sentinel `000000000000000AAA` IDs, or
 * `MALFORMED_QUERY` on fields like `Metadata`/`FullName` that SF permits only
 * one-row-at-a-time in Tooling queries.
 *
 * Observed causing errors in production syncs; blacklisting here eliminates
 * ~960 errors per cold apply and ~10 per incremental without any value loss
 * (these are metadata/telemetry tables, not business data).
 */
const TOOLING_API_DENYLIST = new Set([
    'EntityDefinition',
    'DataType',
    'AuraDefinitionInfo',
    'AuraDefinitionBundleInfo',
    'FormulaFunction',
    'AppDefinition',
    'UserSetupEntityAccess',
    'PlatformEventUsageMetric',
    'EventBusSubscriber',
    'ApexClass',
    'ApexPage',
    'ApexTrigger',
    'ApexComponent',
    'Publisher',
    'ExternalString',
    'CustomHttpHeader',
    'FormulaFunctionCategory',
]);

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
     * Returns user-relevant queryable objects: standard CRM objects + custom
     * (__c). Filters out audit/system noise (~1,866 → ~150-300 typically).
     * Set MJ_SALESFORCE_INCLUDE_ALL_SOBJECTS=true to bypass the filter and
     * return the full catalog (useful for debugging or unusual integrations).
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

        const includeAll = process.env.MJ_SALESFORCE_INCLUDE_ALL_SOBJECTS === 'true';

        const filtered = sobjects.filter(obj => {
            if (!obj.queryable) return false;
            if (TOOLING_API_DENYLIST.has(obj.name)) return false;
            if (includeAll) return true;
            return this.isUserRelevantSObject(obj);
        });

        if (!includeAll) {
            const removed = sobjects.length - filtered.length;
            console.log(`[Salesforce] DiscoverObjects: filtered ${sobjects.length} → ${filtered.length} (excluded ${removed} system/audit objects; set MJ_SALESFORCE_INCLUDE_ALL_SOBJECTS=true to bypass)`);
        }

        return filtered.map(obj => ({
            Name: obj.name,
            Label: obj.label,
            Description: obj.custom ? `Custom object: ${obj.label}` : undefined,
            SupportsIncrementalSync: true,
            SupportsWrite: obj.createable || obj.updateable,
        }));
    }

    /**
     * Heuristic for "user-relevant" SF object: customer data (custom objects
     * with __c suffix) OR createable standard CRM objects, excluding audit
     * tables, system metadata, and managed-package telemetry.
     *
     * Standard SF orgs return ~1,866 sobjects from describeGlobal — most are
     * audit/internal noise that don't represent business data the user wants
     * to sync into MJ. This drops them to ~150-300.
     */
    private isUserRelevantSObject(obj: SObjectDescribe): boolean {
        // Custom objects always pass — they're customer-defined data
        if (obj.custom) return true;

        const name = obj.name;

        // STRICT exclusions only. Don't filter anything that could possibly
        // hold customer data. Each exclusion below is a category SF defines
        // as pure audit/internal/metadata with no customer-meaningful rows:
        //
        //   *ChangeEvent: CDC stream, transient, replicated by replication API
        //   *Feed:        Chatter feed entries (separate "Feed" sync if wanted)
        //   *History:     audit tables — every value-change is one row
        //   *FieldHistory: same as *History but per-field tracking
        //   *Share:       SF row-level access control entries (security metadata)
        //   *OwnerSharingRule / *CriteriaBasedSharingRule: security rules
        //   *PermissionSet*: profile/permission internals
        //
        // Things we used to exclude that we now LET THROUGH because they CAN
        // be customer data: EmailMessage (email log), CaseComment / FeedComment
        // (customer interactions), EntitySubscription (notification subs),
        // Vote (idea/feedback), Tag (content tagging), Solution (knowledge),
        // ProcessInstance (workflow approvals), Domain (tenant config).
        if (/(?:ChangeEvent|Feed|History|FieldHistory|Share|OwnerSharingRule|CriteriaBasedSharingRule)$/.test(name)) {
            return false;
        }

        // SF tooling/setup metadata: Apex code, permissions, setup audit, login
        // history, async job framework, sandbox/cron internals, network/site
        // metadata, theme/branding, package licenses. None of these are
        // business data the integration should sync.
        if (/^(Apex|Permission|Setup|Login|Async|Sandbox|Auth|Network|Stamp|Site|FlowDefinition|FlowInterview|FlowVariableView|EventLog|CronTrigger|StreamingChannel|InstalledMobileApp|UserPackageLicense|PackageLicense|Theme)/.test(name)) {
            return false;
        }

        // Specific system catalog objects — schema-of-the-schema metadata,
        // not customer data. These are readable but represent SF's own
        // structural definitions, never user-entered records.
        if (/^(EntityDefinition|FieldDefinition|EntityParticle|RelationshipInfo|RelationshipDomain|StandardAction|UserAppMenuItem|UserListView|UserPreference|UserShare|GroupMember|FiscalYearSettings|Period|RecordType|BusinessProcess|PicklistValueInfo)$/.test(name)) {
            return false;
        }

        // NOTE: we intentionally do NOT exclude `!obj.createable`. Many SF
        // objects are flagged non-createable because they're auto-populated
        // by SF (rollups, attachment-link junctions, history-style records)
        // but they DO carry real customer data we want to sync. The
        // targeted exclusions above already cover the audit/security/CDC
        // categories that have no business value.
        return true;
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
     *
     * If `options.ObjectNames` is provided, only those objects are described
     * (fast path for user-selected subsets). Without a filter, every
     * queryable sobject is described — ~70s even with parallelism on a
     * large org — and the result is cached per-org for 5 minutes so
     * back-to-back resolver calls don't re-describe.
     *
     * Filtered calls bypass the cache on purpose: the subset is typically
     * small and cheap, and the full-schema cache would shadow newer results
     * if a user selects a previously-unknown object.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions
    ): Promise<SourceSchemaInfo> {
        const filtered = options?.ObjectNames && options.ObjectNames.length > 0;
        if (filtered) {
            return this.DoIntrospectSchema(companyIntegration, contextUser, options);
        }

        // Dedupe back-to-back introspection requests from the same org.
        // Three separate resolvers call IntrospectSchema; without this, the
        // UI's "discover then apply" flow re-describes every object twice.
        const cacheKey = companyIntegration.ID;
        const cached = SalesforceConnector.introspectCache.get(cacheKey);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            const remainingSec = Math.round((cached.expiresAt - now) / 1000);
            console.log(`[Salesforce] IntrospectSchema: reusing in-flight/cached result (${remainingSec}s TTL remaining)`);
            return cached.promise;
        }

        const promise = this.DoIntrospectSchema(companyIntegration, contextUser);
        SalesforceConnector.introspectCache.set(cacheKey, {
            promise,
            expiresAt: now + SalesforceConnector.INTROSPECT_CACHE_TTL_MS,
        });
        // If the run fails, evict so the next request can retry
        promise.catch(() => SalesforceConnector.introspectCache.delete(cacheKey));
        return promise;
    }

    private async DoIntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions
    ): Promise<SourceSchemaInfo> {
        const allObjects = await this.DiscoverObjects(companyIntegration, contextUser);
        const wanted = options?.ObjectNames && options.ObjectNames.length > 0
            ? new Set(options.ObjectNames)
            : null;
        const objects = wanted ? allObjects.filter(o => wanted.has(o.Name)) : allObjects;
        const total = objects.length;
        const startMs = Date.now();
        const CONCURRENCY = 8;
        console.log(`[Salesforce] IntrospectSchema: describing ${total} queryable objects (parallel×${CONCURRENCY})...`);

        const result: SourceSchemaInfo = { Objects: [] };
        let nextIdx = 0;
        let succeeded = 0;
        let skipped = 0;

        const worker = async (): Promise<void> => {
            while (true) {
                const myIdx = nextIdx++;
                if (myIdx >= total) return;
                const obj = objects[myIdx];
                try {
                    const sourceObj = await this.BuildSourceObjectFromDescribe(
                        companyIntegration, contextUser, obj.Name
                    );
                    result.Objects.push(sourceObj);
                    succeeded++;
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    skipped++;
                    console.warn(`[Salesforce] Skipping "${obj.Name}" during introspection: ${msg}`);
                }
                const done = succeeded + skipped;
                if (done % 100 === 0 || done === total) {
                    const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
                    const etaSec = done < total
                        ? (((Date.now() - startMs) / done) * (total - done) / 1000).toFixed(0)
                        : '0';
                    console.log(`[Salesforce] IntrospectSchema progress: ${done}/${total} (ok=${succeeded}, skipped=${skipped}) — ${elapsedSec}s elapsed, ~${etaSec}s remaining`);
                }
            }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

        console.log(`[Salesforce] IntrospectSchema complete: ${succeeded}/${total} objects in ${((Date.now() - startMs) / 1000).toFixed(1)}s`);
        return result;
    }

    // ─── Introspection cache (module-scoped via static) ──────────────
    // Resolver creates a fresh connector per request, so instance-level
    // caching is useless. Static Map survives across requests in the same
    // process. TTL is modest to allow schema refresh on demand.
    private static readonly INTROSPECT_CACHE_TTL_MS = 5 * 60 * 1000;
    private static readonly introspectCache = new Map<string, { promise: Promise<SourceSchemaInfo>; expiresAt: number }>();

    // ─── FetchChanges (SOQL-based — overrides base class entirely) ───

    /**
     * Fetches changed records using SOQL queries with SystemModstamp watermarks.
     * Completely overrides the base class REST pagination because SF uses
     * SOQL + queryMore, not standard REST list endpoints.
     *
     * Dispatches to family-specific fetch routines based on the
     * IntegrationObject metadata's `DefaultQueryParams.api_family` hint:
     * tooling → Tooling API, analytics_report/dashboard → Analytics API,
     * bulk_* / composite → not intended for listing (returns empty batch),
     * everything else → standard SObject SOQL flow.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const batchSize = ctx.BatchSize || this.effectiveBatchSize;
        const family = this.ResolveAPIFamily(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);

        // Continuation: SF returned a nextRecordsUrl on the previous call,
        // and the engine passed it back as CurrentCursor. Re-issue against
        // the same query state via /query/<locator> rather than re-running
        // the original SOQL (which would just return the first page again
        // and silently truncate the dataset to one batch). Pre-existing bug:
        // a dead `this.queryLocator` member shadowed this branch with an
        // always-false condition, so every "next batch" call re-executed
        // the initial SOQL and produced duplicate first-page results until
        // the engine's duplicate-batch guard aborted the entity.
        if (ctx.CurrentCursor) {
            return this.FetchNextPage(auth, ctx.CurrentCursor);
        }

        if (family === 'analytics_report' || family === 'analytics_dashboard') {
            return this.FetchAnalyticsList(auth, family, ctx.ObjectName);
        }

        if (family === 'bulk_ingest' || family === 'bulk_query') {
            return this.FetchBulkJobs(auth, family, ctx.ObjectName);
        }

        if (family === 'composite') {
            // Composite is a per-request construct, not a queryable endpoint
            return { Records: [], HasMore: false };
        }

        if (family === 'knowledge') {
            const page = ctx.CurrentPage ?? 1;
            return this.FetchKnowledgeArticles(auth, ctx.ObjectName, ctx.WatermarkValue, batchSize, page);
        }

        // Standard SObject (sobject) and Tooling (tooling) both use SOQL —
        // just against different endpoints.
        const fields = await this.GetQueryableFieldNames(auth, ctx.ObjectName, family);
        const soql = this.BuildSOQLQuery(ctx.ObjectName, fields, ctx.WatermarkValue, batchSize, true);
        return this.ExecuteSOQLQuery(auth, soql, ctx.ObjectName, family);
    }

    /**
     * Resolves the API family for a given IntegrationObject by reading its
     * `DefaultQueryParams.api_family` flag from the engine cache. Defaults to
     * `sobject` when no metadata is available (common in unit tests).
     */
    private ResolveAPIFamily(integrationID: string, objectName: string): SalesforceAPIFamily {
        try {
            const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
            if (!obj || !obj.DefaultQueryParams) return 'sobject';
            const parsed = JSON.parse(obj.DefaultQueryParams) as { api_family?: string };
            if (this.IsValidFamily(parsed.api_family)) return parsed.api_family;
            return 'sobject';
        } catch {
            return 'sobject';
        }
    }

    private IsValidFamily(v: string | undefined): v is SalesforceAPIFamily {
        return v === 'sobject' || v === 'tooling' || v === 'knowledge'
            || v === 'analytics_report' || v === 'analytics_dashboard'
            || v === 'bulk_ingest' || v === 'bulk_query' || v === 'composite';
    }

    /**
     * Returns the REST path prefix for an SObject in the given API family.
     * Used by CRUD operations and field discovery.
     */
    private SObjectBasePath(auth: SalesforceAuthContext, family: SalesforceAPIFamily): string {
        const base = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}`;
        return family === 'tooling' ? `${base}/tooling/sobjects` : `${base}/sobjects`;
    }

    /**
     * Returns the SOQL query endpoint for the given API family.
     * Standard uses /query + /queryAll; Tooling uses /tooling/query.
     */
    private SOQLEndpoint(auth: SalesforceAuthContext, family: SalesforceAPIFamily, includeDeleted: boolean): string {
        const base = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}`;
        if (family === 'tooling') return `${base}/tooling/query`;
        return includeDeleted ? `${base}/queryAll` : `${base}/query`;
    }

    // ─── CRUD Operations ─────────────────────────────────────────────

    /**
     * Creates a new record in Salesforce. Dispatches to the appropriate API
     * family endpoint (standard SObjects, Tooling, Bulk Ingest/Query jobs, or
     * Composite) based on the IntegrationObject metadata.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const family = this.ResolveAPIFamily(companyIntegration.IntegrationID, ctx.ObjectName);

        if (family === 'bulk_ingest' || family === 'bulk_query') {
            return this.CreateBulkJob(auth, family, ctx.Attributes);
        }

        if (family === 'composite') {
            return this.ExecuteCompositeRequest(auth, ctx.Attributes);
        }

        if (family === 'analytics_report' || family === 'analytics_dashboard' || family === 'knowledge') {
            return {
                Success: false,
                ErrorMessage: `[Salesforce] Create is not supported for API family "${family}" (${ctx.ObjectName})`,
                StatusCode: 405,
            };
        }

        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${this.SObjectBasePath(auth, family)}/${ctx.ObjectName}/`;

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
     * Honors API family routing; Tooling uses `/tooling/sobjects/`, everything
     * else uses standard `/sobjects/`.
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const family = this.ResolveAPIFamily(companyIntegration.IntegrationID, ctx.ObjectName);

        if (family !== 'sobject' && family !== 'tooling') {
            return {
                Success: false,
                ErrorMessage: `[Salesforce] Update is not supported for API family "${family}" (${ctx.ObjectName})`,
                StatusCode: 405,
            };
        }

        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${this.SObjectBasePath(auth, family)}/${ctx.ObjectName}/${ctx.ExternalID}`;

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
     * Deletes a record from Salesforce. For Bulk Job families, delete aborts
     * the job. For standard and Tooling SObjects, performs a soft delete
     * (Recycle Bin, 15-day retention). Analytics/Composite/Knowledge do not
     * support deletion through this path.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const family = this.ResolveAPIFamily(companyIntegration.IntegrationID, ctx.ObjectName);

        if (family === 'bulk_ingest' || family === 'bulk_query') {
            return this.AbortBulkJob(auth, family, ctx.ExternalID);
        }

        if (family !== 'sobject' && family !== 'tooling') {
            return {
                Success: false,
                ErrorMessage: `[Salesforce] Delete is not supported for API family "${family}" (${ctx.ObjectName})`,
                StatusCode: 405,
            };
        }

        const headers = this.BuildHeaders(auth);
        const url = `${this.SObjectBasePath(auth, family)}/${ctx.ObjectName}/${ctx.ExternalID}`;

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
     * Retrieves a single record by its Salesforce ID. Routes to the API family
     * endpoint indicated by IntegrationObject metadata.
     */
    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const family = this.ResolveAPIFamily(companyIntegration.IntegrationID, ctx.ObjectName);

        if (family === 'analytics_report') {
            return this.GetAnalyticsReport(auth, ctx.ExternalID);
        }
        if (family === 'analytics_dashboard') {
            return this.GetAnalyticsDashboard(auth, ctx.ExternalID);
        }
        if (family === 'bulk_ingest' || family === 'bulk_query') {
            return this.GetBulkJob(auth, family, ctx.ExternalID);
        }
        if (family === 'composite') {
            return null;
        }

        const headers = this.BuildHeaders(auth);
        const url = `${this.SObjectBasePath(auth, family)}/${ctx.ObjectName}/${ctx.ExternalID}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        this.ValidateResponse(response, url);

        const raw = response.Body as Record<string, unknown>;
        return this.RawToExternalRecord(raw, ctx.ObjectName);
    }

    // ─── Search (SOQL) ───────────────────────────────────────────────

    /**
     * Searches records using SOQL WHERE clauses built from the provided filters.
     * Search is supported for Standard SObjects and Tooling SObjects; other API
     * families return an empty result.
     */
    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const family = this.ResolveAPIFamily(companyIntegration.IntegrationID, ctx.ObjectName);

        if (family !== 'sobject' && family !== 'tooling') {
            return { Records: [], TotalCount: 0, HasMore: false };
        }

        const fields = await this.GetQueryableFieldNames(auth, ctx.ObjectName, family);
        const whereClause = this.BuildWhereClauseFromFilters(ctx.Filters);
        const limit = ctx.PageSize ?? 100;
        const offset = ctx.Page != null && ctx.Page > 1 ? (ctx.Page - 1) * limit : 0;

        let soql = `SELECT ${fields.join(', ')} FROM ${ctx.ObjectName}`;
        if (whereClause) soql += ` WHERE ${whereClause}`;
        if (ctx.Sort) soql += ` ORDER BY ${ctx.Sort}`;
        soql += ` LIMIT ${limit}`;
        if (offset > 0) soql += ` OFFSET ${offset}`;

        const url = `${this.SOQLEndpoint(auth, family, false)}?q=${encodeURIComponent(soql)}`;
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

        const credentials = await this.LoadCredentials(companyIntegration, contextUser);
        const config = this.BuildConnectionConfig(credentials, companyIntegration);
        this._config = config;

        console.log(`[Salesforce] Authenticating via ${config.AuthFlow === 'client_credentials' ? 'Client Credentials' : 'JWT Bearer Token'}...`);

        const tokenResponse = config.AuthFlow === 'client_credentials'
            ? await this.ExchangeClientCredentialsForToken(config)
            : await this.ExchangeJWTForToken(config.TokenUrl ?? config.LoginUrl, this.BuildJWTAssertion(config));

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
        // Many SF system/tooling/meta objects lack one or more of the "standard"
        // audit fields (SystemModstamp, IsDeleted, LastModifiedById). Assuming
        // they're always present produces `INVALID_FIELD` errors. Build the
        // SELECT from what the object's describe actually exposes.
        const available = new Set(fields);
        const requiredPresent = REQUIRED_SOQL_FIELDS.filter(f => available.has(f));
        const dedupedFields = [...new Set([...requiredPresent, ...fields])];

        // Pick the best available watermark/ordering column.
        // Preference: SystemModstamp > LastModifiedDate > CreatedDate > (none)
        const watermarkCol = available.has('SystemModstamp')
            ? 'SystemModstamp'
            : available.has('LastModifiedDate')
                ? 'LastModifiedDate'
                : available.has('CreatedDate')
                    ? 'CreatedDate'
                    : null;

        let soql = `SELECT ${dedupedFields.join(', ')} FROM ${objectName}`;

        if (watermarkValue && watermarkCol) {
            // `>=` not `>` — strict greater-than misses records modified
            // at exactly the watermark instant. SF's SystemModstamp has
            // millisecond precision but bulk updates can produce multiple
            // records with the identical modstamp; only the last one shapes
            // the saved watermark. Without `>=`, any record colliding on
            // that exact ms after watermark save is permanently dropped
            // (the watermark advances past it next sync). Engine dedupe
            // handles the cheap cost of re-fetching boundary records.
            soql += ` WHERE ${watermarkCol} >= ${this.FormatSOQLDateTime(watermarkValue)}`;
        }

        if (watermarkCol) {
            soql += ` ORDER BY ${watermarkCol} ASC`;
        }

        // NO `LIMIT batchSize`. SF's REST API natively paginates the result
        // via `done` / `nextRecordsUrl` — the engine loop drives subsequent
        // pages. A SOQL LIMIT here would cap the ENTIRE result set at
        // batchSize records and SF would (correctly) report done=true at
        // that count, silently dropping every record past the limit. The
        // worst part: incremental syncs advance the watermark past the
        // dropped records, so they're never re-fetched on subsequent runs.
        // Per-page batch size is controlled by the `Sforce-Query-Options`
        // header (or SF default) and does not need a SOQL LIMIT.
        // _ = batchSize  // intentionally unused — preserved param for API stability
        void batchSize;

        return soql;
    }

    /**
     * Executes a SOQL query and returns records as a FetchBatchResult.
     * For the standard SObject family this uses `queryAll` so that soft-deleted
     * records are returned (IsDeleted=true). For the Tooling family, the
     * Tooling API's `/tooling/query` endpoint is used — `queryAll` is not
     * supported there.
     */
    private async ExecuteSOQLQuery(
        auth: SalesforceAuthContext,
        soql: string,
        objectName: string,
        family: SalesforceAPIFamily = 'sobject'
    ): Promise<FetchBatchResult> {
        const includeDeleted = family === 'sobject';
        const url = `${this.SOQLEndpoint(auth, family, includeDeleted)}?q=${encodeURIComponent(soql)}`;
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
        const rawRecords = body.records ?? [];

        // Some Salesforce system/metadata objects (e.g. TabDefinition,
        // FormulaFunctionAllowedType) return many rows that all share the
        // placeholder `Id = '000000000000000AAA'` — SF treats Id as
        // non-unique on those objects, but MJ's auto-generated UQ_<table>_PK
        // rejects the duplicates and produces one error per record after
        // the first. Dedupe on Id within the batch (keep first occurrence)
        // before returning to the engine.
        const seenIds = new Set<string>();
        const dedupedRaw: unknown[] = [];
        let duplicatesDropped = 0;
        for (const r of rawRecords) {
            const raw = r as Record<string, unknown>;
            const id = raw['Id'] as string | undefined;
            if (id) {
                if (seenIds.has(id)) {
                    duplicatesDropped++;
                    continue;
                }
                seenIds.add(id);
            }
            dedupedRaw.push(r);
        }
        if (duplicatesDropped > 0) {
            console.warn(
                `[Salesforce] ${objectName}: dropped ${duplicatesDropped} record(s) with duplicate Id ` +
                `(SF returned non-unique Ids for this object — typical for system/metadata sObjects ` +
                `like TabDefinition, FormulaFunctionAllowedType where Id is a placeholder).`
            );
        }

        const records = dedupedRaw.map(r => {
            const raw = r as Record<string, unknown>;
            const record = this.RawToExternalRecord(raw, objectName);
            record.IsDeleted = raw['IsDeleted'] === true;
            record.ModifiedAt = raw['SystemModstamp']
                ? new Date(raw['SystemModstamp'] as string)
                : undefined;
            return record;
        });

        // Compute new watermark from the max SystemModstamp in this batch
        const newWatermark = this.ExtractMaxWatermark(dedupedRaw);

        return {
            Records: records,
            HasMore: !body.done,
            NewWatermarkValue: newWatermark ?? undefined,
            NextCursor: body.nextRecordsUrl ?? undefined,
        };
    }

    /**
     * Extracts the maximum SystemModstamp value from a batch of records and
     * advances it by 1ms so the next sync's `WHERE SystemModstamp >= <wm>`
     * filter excludes the boundary cluster.
     *
     * Why advance: the SOQL filter uses `>=` (not `>`) on purpose so we don't
     * drop records that share the modstamp instant of the previous max. But
     * if the saved watermark equals the new max, every subsequent incremental
     * re-pulls the same boundary cluster forever and the watermark plateaus.
     * Observed in the wild: 1,800 EmailMessage records bulk-imported with
     * identical SystemModstamp re-fetched on every run with `Updated` count
     * never decreasing.
     *
     * SF's SystemModstamp is millisecond-precision, so adding 1ms cannot
     * skip a real record — there is nothing scheduled between `max` and
     * `max + 1ms`. The connector returns the advanced value as
     * `NewWatermarkValue`; the engine persists it; the next run picks up
     * cleanly past the cluster.
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

        if (!maxTimestamp) return null;
        const parsed = new Date(maxTimestamp);
        if (Number.isNaN(parsed.getTime())) return maxTimestamp;
        return new Date(parsed.getTime() + 1).toISOString();
    }

    /**
     * Gets queryable field names for a SF object via the Describe API. When
     * `family === 'tooling'`, calls the Tooling describe endpoint instead of
     * the standard one.
     */
    private async GetQueryableFieldNames(
        auth: SalesforceAuthContext,
        objectName: string,
        family: SalesforceAPIFamily = 'sobject'
    ): Promise<string[]> {
        const url = `${this.SObjectBasePath(auth, family)}/${objectName}/describe`;
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

        const pem = this.NormalizePem(config.PrivateKey);
        return jwt.sign(payload, pem, { algorithm: 'RS256' });
    }

    /**
     * Normalize a PEM private key that may have had its newlines stripped or
     * replaced with spaces / literal "\n" sequences. Rebuilds the standard
     * BEGIN header / 64-char body / END footer layout that OpenSSL requires.
     */
    private NormalizePem(key: string): string {
        if (!key) return key;
        // First, normalize escaped newlines to real ones
        let normalized = key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
        // If real newlines exist already, trust them
        if (normalized.includes('\n')) return normalized;
        // Split out header / footer / body and rebuild with real newlines
        const headerMatch = normalized.match(/^(-----BEGIN [^-]+-----)/);
        const footerMatch = normalized.match(/(-----END [^-]+-----)\s*$/);
        if (!headerMatch || !footerMatch) return normalized;
        const header = headerMatch[1];
        const footer = footerMatch[1];
        const bodyRaw = normalized.slice(header.length, normalized.length - footer.length);
        const body = bodyRaw.replace(/\s+/g, '');
        const chunked = body.match(/.{1,64}/g)?.join('\n') ?? body;
        return `${header}\n${chunked}\n${footer}`;
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
     * Exchanges Client Credentials for an access token.
     * Used with Connected Apps configured for the OAuth 2.0 Client Credentials flow.
     */
    private async ExchangeClientCredentialsForToken(
        config: SalesforceConnectionConfig
    ): Promise<{ access_token: string; instance_url: string }> {
        if (!config.ClientSecret) {
            throw new Error('Client Credentials flow requires clientSecret');
        }

        const tokenUrl = `${config.LoginUrl}/services/oauth2/token`;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.ClientId,
            client_secret: config.ClientSecret,
        }).toString();

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(this.effectiveRequestTimeoutMs),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(
                `Salesforce Client Credentials token exchange failed (HTTP ${response.status}): ${errorBody}`
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
            'No Salesforce credentials found. Set Configuration JSON with either ' +
            '(a) clientId + clientSecret for Client Credentials flow, or ' +
            '(b) clientId + username + privateKey for JWT Bearer flow.'
        );
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<SalesforceCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    private ParseCredentialJson(json: string): SalesforceCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, string>;
            const clientId = parsed['clientId'] ?? parsed['ClientId'];
            if (!clientId) return null;

            const loginUrl = parsed['loginUrl'] ?? parsed['LoginUrl'] ?? 'https://login.salesforce.com';
            const apiVersion = parsed['apiVersion'] ?? parsed['ApiVersion'] ?? DEFAULT_API_VERSION;
            const tokenUrl = parsed['tokenUrl'] ?? parsed['TokenUrl'];

            // Detect auth flow: if clientSecret is present, use client_credentials;
            // otherwise require privateKey + username for JWT Bearer
            const clientSecret = parsed['clientSecret'] ?? parsed['ClientSecret'];
            const privateKey = parsed['privateKey'] ?? parsed['PrivateKey'];
            const username = parsed['username'] ?? parsed['Username'];
            const explicitFlow = parsed['authFlow'] ?? parsed['AuthFlow'];

            if (explicitFlow === 'client_credentials' || (clientSecret && !privateKey)) {
                if (!clientSecret) return null;
                return {
                    AuthFlow: 'client_credentials',
                    LoginUrl: loginUrl,
                    ClientId: clientId,
                    ClientSecret: clientSecret,
                    ApiVersion: apiVersion,
                    TokenUrl: tokenUrl,
                };
            }

            // JWT Bearer flow
            if (!privateKey || !username) return null;
            return {
                AuthFlow: 'jwt_bearer',
                LoginUrl: loginUrl,
                ClientId: clientId,
                Username: username,
                PrivateKey: privateKey,
                ApiVersion: apiVersion,
                TokenUrl: tokenUrl,
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
            AuthFlow: credentials.AuthFlow,
            LoginUrl: credentials.LoginUrl,
            ClientId: credentials.ClientId,
            ApiVersion: credentials.ApiVersion,
            Username: credentials.Username,
            PrivateKey: credentials.PrivateKey,
            ClientSecret: credentials.ClientSecret,
            TokenUrl: credentials.TokenUrl,
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
     * Custom fields can be detected by callers via the `__c` suffix in the
     * field name — Salesforce standardizes this convention for all custom
     * fields on both standard and custom SObjects.
     */
    private MapSFFieldToSchema(f: SFieldDescribe): ExternalFieldSchema {
        // Salesforce's `Id` is the universal PK on every SObject (standard + custom).
        // The /describe response sets type='id' on the PK field but doesn't carry
        // an explicit IsPrimaryKey signal, so we have to stamp it here.  Without
        // this, UpsertField's new-field path would persist `Id` with no PK flag
        // and the downstream SoftPKClassifier becomes the only safety net.
        const isPK = f.name === 'Id' || f.type === 'id';
        return {
            Name: f.name,
            Label: f.label,
            Description: f.inlineHelpText ?? undefined,
            DataType: this.MapSalesforceType(f.type),
            IsRequired: !f.nillable && !f.defaultedOnCreate,
            IsPrimaryKey: isPK,
            IsUniqueKey: isPK || f.externalId,
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

    // ─── Analytics API (Reports & Dashboards) ────────────────────────

    /**
     * Lists Analytics Reports or Dashboards via the Analytics API. Read-only;
     * no incremental-sync support at this endpoint.
     */
    private async FetchAnalyticsList(
        auth: SalesforceAuthContext,
        family: 'analytics_report' | 'analytics_dashboard',
        objectName: string
    ): Promise<FetchBatchResult> {
        const segment = family === 'analytics_report' ? 'reports' : 'dashboards';
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/analytics/${segment}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as AnalyticsListResponse;
        const list = body.reports ?? body.dashboards ?? [];
        const records = list.map(item => this.AnalyticsItemToRecord(item, objectName));
        return { Records: records, HasMore: false };
    }

    private AnalyticsItemToRecord(item: AnalyticsListItem, objectType: string): ExternalRecord {
        return {
            ExternalID: String(item.id ?? ''),
            ObjectType: objectType,
            Fields: { ...item },
        };
    }

    private async GetAnalyticsReport(auth: SalesforceAuthContext, id: string): Promise<ExternalRecord | null> {
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/analytics/reports/${id}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        this.ValidateResponse(response, url);
        return {
            ExternalID: id,
            ObjectType: 'Report',
            Fields: response.Body as Record<string, unknown>,
        };
    }

    private async GetAnalyticsDashboard(auth: SalesforceAuthContext, id: string): Promise<ExternalRecord | null> {
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/analytics/dashboards/${id}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        this.ValidateResponse(response, url);
        return {
            ExternalID: id,
            ObjectType: 'Dashboard',
            Fields: response.Body as Record<string, unknown>,
        };
    }

    // ─── Knowledge Articles ──────────────────────────────────────────

    /**
     * Fetches published Knowledge article versions. This endpoint is
     * paginated via `pageNumber`/`pageSize` (not cursor). The connector
     * returns a single batch; callers that need pagination can issue
     * additional requests via SearchRecords.
     */
    private async FetchKnowledgeArticles(
        auth: SalesforceAuthContext,
        objectName: string,
        watermarkValue: string | null,
        batchSize: number,
        page: number = 1
    ): Promise<FetchBatchResult> {
        const params = new URLSearchParams({ pageSize: String(batchSize), pageNumber: String(page) });
        if (watermarkValue) {
            params.set('publishStatus', 'Online');
        }
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/support/knowledgeArticles?${params}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as KnowledgeArticlesResponse;
        const records = (body.articles ?? []).map(a => ({
            ExternalID: String(a.id ?? ''),
            ObjectType: objectName,
            Fields: a as unknown as Record<string, unknown>,
        }));

        // Knowledge Articles uses page-based pagination. The endpoint doesn't
        // return a documented total/has-more signal in its body, so treat a
        // full page as "potentially more" — same defensive pattern used for
        // SI and YM. Engine loop drives subsequent pages via NextPage; an
        // empty next-page response terminates naturally. Without this guard
        // sync silently caps at batchSize records per object — identical to
        // the SOQL LIMIT bug we already fixed in this session.
        const hasMore = records.length >= batchSize;
        return {
            Records: records,
            HasMore: hasMore,
            NextPage: hasMore ? page + 1 : undefined,
        };
    }

    // ─── Bulk API 2.0 (Ingest & Query Jobs) ──────────────────────────

    /**
     * Lists in-flight Bulk API 2.0 jobs. Useful for monitoring background
     * imports/queries the integration previously started.
     */
    private async FetchBulkJobs(
        auth: SalesforceAuthContext,
        family: 'bulk_ingest' | 'bulk_query',
        objectName: string
    ): Promise<FetchBatchResult> {
        const segment = family === 'bulk_ingest' ? 'ingest' : 'query';
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/jobs/${segment}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.ValidateResponse(response, url);

        const body = response.Body as BulkJobListResponse;
        const records = (body.records ?? []).map(r => ({
            ExternalID: String(r.id ?? ''),
            ObjectType: objectName,
            Fields: r as unknown as Record<string, unknown>,
            ModifiedAt: r.systemModstamp ? new Date(r.systemModstamp) : undefined,
        }));
        return {
            Records: records,
            HasMore: !body.done,
            NextCursor: body.nextRecordsUrl ?? undefined,
        };
    }

    /**
     * Creates (starts) a new Bulk API 2.0 ingest or query job using the
     * provided attributes. Required fields differ by operation; we pass
     * attributes straight through to Salesforce after stripping any readonly
     * fields. For ingest, CSV data is uploaded in a separate request (PUT) —
     * callers must issue that themselves via UploadBulkData once the job ID
     * is known.
     */
    private async CreateBulkJob(
        auth: SalesforceAuthContext,
        family: 'bulk_ingest' | 'bulk_query',
        attrs: Record<string, unknown>
    ): Promise<CRUDResult> {
        const segment = family === 'bulk_ingest' ? 'ingest' : 'query';
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/jobs/${segment}`;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const body = this.StripReadOnlyFields(attrs);

        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            const created = response.Body as { id?: string };
            return { Success: true, ExternalID: created.id ?? '', StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateBulkJob', family);
    }

    /**
     * Aborts a running Bulk API 2.0 job by PATCHing state=Aborted.
     */
    private async AbortBulkJob(
        auth: SalesforceAuthContext,
        family: 'bulk_ingest' | 'bulk_query',
        jobId: string
    ): Promise<CRUDResult> {
        const segment = family === 'bulk_ingest' ? 'ingest' : 'query';
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/jobs/${segment}/${jobId}`;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, { state: 'Aborted' });
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: jobId, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'AbortBulkJob', family);
    }

    private async GetBulkJob(
        auth: SalesforceAuthContext,
        family: 'bulk_ingest' | 'bulk_query',
        jobId: string
    ): Promise<ExternalRecord | null> {
        const segment = family === 'bulk_ingest' ? 'ingest' : 'query';
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/jobs/${segment}/${jobId}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        this.ValidateResponse(response, url);
        return {
            ExternalID: jobId,
            ObjectType: family === 'bulk_ingest' ? 'BulkIngestJob' : 'BulkQueryJob',
            Fields: response.Body as Record<string, unknown>,
        };
    }

    // ─── Composite Requests ──────────────────────────────────────────

    /**
     * Executes a composite request — up to 25 sub-requests in one HTTP call.
     * The `attrs` payload is expected to be the full composite body or at
     * least a `compositeRequest` array. Returns the overall composite
     * response as the created record's ExternalID (Salesforce returns
     * per-sub-request results; callers should inspect Fields for details).
     */
    private async ExecuteCompositeRequest(
        auth: SalesforceAuthContext,
        attrs: Record<string, unknown>
    ): Promise<CRUDResult> {
        const url = `${auth.InstanceUrl}/services/data/v${auth.ApiVersion}/composite`;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        // Either pass the whole payload through or wrap a bare array
        const body = Array.isArray((attrs as { compositeRequest?: unknown[] }).compositeRequest)
            ? attrs
            : { allOrNone: true, compositeRequest: [attrs] };
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: 'composite', StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'ExecuteCompositeRequest', 'CompositeRequest');
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

/** Salesforce Analytics API list item for reports/dashboards */
interface AnalyticsListItem {
    id: string;
    name?: string;
    url?: string;
    describeUrl?: string;
    type?: string;
    folderId?: string;
    folderName?: string;
    reportType?: { type: string; label: string };
}

/** Salesforce Analytics API list response */
interface AnalyticsListResponse {
    reports?: AnalyticsListItem[];
    dashboards?: AnalyticsListItem[];
}

/** Salesforce Knowledge Article API list response */
interface KnowledgeArticlesResponse {
    articles: KnowledgeArticleSummary[];
    currentPageUrl?: string;
    pageNumber?: number;
    nextPageUrl?: string | null;
    previousPageUrl?: string | null;
}

interface KnowledgeArticleSummary {
    id: string;
    title: string;
    urlName?: string;
    summary?: string;
    lastPublishedDate?: string;
    publishStatus?: string;
    articleNumber?: string;
}

/** Salesforce Bulk API 2.0 job list response */
interface BulkJobListResponse {
    done: boolean;
    records: BulkJobInfo[];
    nextRecordsUrl?: string;
}

interface BulkJobInfo {
    id: string;
    operation: string;
    object?: string;
    state: string;
    createdDate?: string;
    systemModstamp?: string;
    numberRecordsProcessed?: number;
    numberRecordsFailed?: number;
    contentType?: string;
}

