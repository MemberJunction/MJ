import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type DefaultFieldMapping,
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
     * Parses the Configuration JSON from a CompanyIntegration entity.
     */
    protected ParseConfig(companyIntegration: MJCompanyIntegrationEntity): YMConnectionConfig {
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (!configJson) {
            throw new Error('CompanyIntegration.Configuration is null or empty');
        }

        const parsed = JSON.parse(configJson) as Record<string, string>;
        const clientId = parsed['ClientID'];
        const apiKey = parsed['APIKey'];
        const apiPassword = parsed['APIPassword'];

        if (!clientId || !apiKey || !apiPassword) {
            throw new Error('Configuration JSON must contain ClientID, APIKey, and APIPassword');
        }

        return { ClientID: clientId, APIKey: apiKey, APIPassword: apiPassword };
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
        _contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = this.ParseConfig(companyIntegration);
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
        const config = this.ParseConfig(ctx.CompanyIntegration);
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

        const records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

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

        const records = dataArray.map((item: Record<string, unknown>) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

        return { Records: records, HasMore: false };
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

        const records = (data as Record<string, unknown>[]).map((item) =>
            this.BuildRecord(item, objectConfig.PKFields, ctx.ObjectName)
        );

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
}

/** Shape of a GroupType entry from the Groups endpoint */
interface GroupTypeListItem {
    Id?: number;
    TypeName?: string;
    Groups?: Array<{ Id: number; Name: string; [key: string]: unknown }>;
}
