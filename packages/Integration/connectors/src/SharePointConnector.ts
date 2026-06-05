import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
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
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
} from '@memberjunction/integration-engine';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Connection configuration parsed from CompanyIntegration credentials.
 * SharePoint is accessed through Microsoft Graph v1.0 using Azure AD
 * client-credentials (app-only) authentication.
 */
export interface SharePointConnectionConfig {
    /** Azure AD tenant GUID */
    TenantId: string;
    /** App (client) registration GUID */
    ClientId: string;
    /** App client secret */
    ClientSecret: string;
    /** Optional override for the Graph base URL. Default: https://graph.microsoft.com/v1.0 */
    GraphBaseUrl?: string;
    /** OAuth scope. Default: https://graph.microsoft.com/.default */
    Scope?: string;

    // ── Performance overrides ───────────────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 5 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 250 */
    MinRequestIntervalMs?: number;
}

/** Extended auth context holding the Graph bearer token + config. */
interface SharePointAuthContext extends RESTAuthContext {
    Config: SharePointConnectionConfig;
    BaseUrl: string;
}

/** Shape of a Graph OAuth token response. */
interface GraphTokenResponse {
    token_type: string;
    expires_in: number;
    ext_expires_in?: number;
    access_token: string;
}

/** Shape of a Graph OData collection response. */
interface GraphCollectionResponse<T> {
    '@odata.context'?: string;
    '@odata.nextLink'?: string;
    '@odata.deltaLink'?: string;
    value: T[];
}

/** Graph column definition, used during runtime custom field discovery. */
interface GraphColumnDefinition {
    id?: string;
    name?: string;
    displayName?: string;
    description?: string;
    columnGroup?: string;
    hidden?: boolean;
    readOnly?: boolean;
    required?: boolean;
    isSealed?: boolean;
    [key: string]: unknown;
}

/** Graph site summary used for list discovery per site. */
interface GraphSite {
    id: string;
    displayName?: string;
    name?: string;
    webUrl?: string;
    description?: string;
}

/** Graph list summary used when discovering per-site lists. */
interface GraphList {
    id: string;
    name?: string;
    displayName?: string;
    description?: string;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Default Graph base URL (production tenant, v1.0). */
const GRAPH_V1_BASE_URL = 'https://graph.microsoft.com/v1.0';

/** Default OAuth scope for app-only Graph access. */
const DEFAULT_SCOPE = 'https://graph.microsoft.com/.default';

/** Azure AD token endpoint template. */
const AAD_TOKEN_ENDPOINT = (tenantId: string): string =>
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

/** Default minimum interval between API calls (Graph baseline is ~4 req/s). */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;

/** Default HTTP request timeout. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default retry count for retryable errors. */
const DEFAULT_MAX_RETRIES = 5;

/** Buffer before token expiry at which to refresh (60s). */
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

/** Object name used to match the SiteListColumns IntegrationObject during runtime field discovery. */
const LIST_ITEM_OBJECT = 'SiteListItems';

// ─── SharePoint Object Metadata for Action Generation ─────────────────

const SHAREPOINT_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Sites',
        DisplayName: 'Site',
        Description: 'A SharePoint site (team, communication, hub, or personal OneDrive site).',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Site ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Composite site identifier (hostname,site-collection-guid,web-guid).' },
            { Name: 'displayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Human-readable site name.' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal site name.' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full URL to the site.' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Site description.' },
            { Name: 'createdDateTime', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Site creation timestamp.' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp.' },
        ],
    },
    {
        Name: 'SiteLists',
        DisplayName: 'List',
        Description: 'A list within a SharePoint site (custom list, document library, or calendar).',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'List ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'List GUID.' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Internal list name.' },
            { Name: 'displayName', DisplayName: 'Display Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'List title shown in the UI.' },
            { Name: 'description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'List description.' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'URL to the list in SharePoint.' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp.' },
        ],
    },
    {
        Name: 'SiteListItems',
        DisplayName: 'List Item',
        Description: 'A row within a SharePoint list. Dynamic custom columns live in the fields dictionary.',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'Item ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Per-list auto-increment integer.' },
            { Name: 'createdDateTime', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item creation timestamp.' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item modification timestamp.' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full URL to the item.' },
            { Name: 'fields', DisplayName: 'Fields', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Dynamic dictionary keyed by list column names.' },
        ],
    },
    {
        Name: 'Drives',
        DisplayName: 'Drive',
        Description: 'A SharePoint document library or OneDrive personal drive.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'Drive ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Drive GUID.' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Drive name.' },
            { Name: 'driveType', DisplayName: 'Drive Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'personal, business, or documentLibrary.' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'URL to the drive.' },
        ],
    },
    {
        Name: 'DriveItems',
        DisplayName: 'Drive Item',
        Description: 'A file or folder in a SharePoint drive.',
        SupportsWrite: true,
        Fields: [
            { Name: 'id', DisplayName: 'Item ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Drive item GUID.' },
            { Name: 'name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'File or folder name.' },
            { Name: 'size', DisplayName: 'Size', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'File size in bytes.' },
            { Name: 'webUrl', DisplayName: 'Web URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Full URL to the item.' },
            { Name: 'lastModifiedDateTime', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item modification timestamp.' },
        ],
    },
];

// ─── Connector Implementation ────────────────────────────────────────

/**
 * Connector for Microsoft SharePoint Online via Microsoft Graph v1.0.
 *
 * Extends BaseRESTIntegrationConnector — inherits pagination + template variable
 * substitution from metadata. Template vars like `{id}` / `{siteId}` are resolved
 * per-parent using IntegrationObject FK / PK metadata, so object hierarchies
 * (sites -> lists -> list items) traverse automatically.
 *
 * Auth flow:
 *   1. Client-credentials OAuth 2.0 against Azure AD
 *   2. Bearer token attached to every Graph request
 *   3. Token is refreshed proactively before expiry
 *
 * Pagination: `@odata.nextLink` cursor (per OData convention).
 *
 * Incremental sync: `/delta?token=...` endpoints for drives and list items.
 */
@RegisterClass(BaseIntegrationConnector, 'SharePointConnector')
export class SharePointConnector extends BaseRESTIntegrationConnector {

    // ── State ────────────────────────────────────────────────────────

    private cachedAuth: SharePointAuthContext | null = null;
    private tokenExpiresAt = 0;
    private lastRequestTime = 0;

    // ── Capability Getters ───────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override get IntegrationName(): string { return 'SharePoint'; }

    // ── Action Generation ────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return SHAREPOINT_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;

        return {
            IntegrationName: 'SharePoint',
            CategoryName: 'SharePoint',
            IconClass: 'fa-brands fa-microsoft',
            Objects: objects,
            IncludeSearch: false,
            IncludeList: false,
            CategoryDescription: 'Microsoft SharePoint integration actions (via Graph)',
            ParentCategoryName: 'Business Apps',
        };
    }

    // ── Default Configuration ────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return {
            DefaultSchemaName: 'SharePoint',
            DefaultObjects: [
                {
                    SourceObjectName: 'Sites',
                    TargetTableName: 'SharePoint_Site',
                    TargetEntityName: 'SharePoint Sites',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Sites', 'Contacts'),
                },
                {
                    SourceObjectName: 'SiteLists',
                    TargetTableName: 'SharePoint_List',
                    TargetEntityName: 'SharePoint Lists',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('SiteLists', 'Lists'),
                },
                {
                    SourceObjectName: 'SiteListItems',
                    TargetTableName: 'SharePoint_ListItem',
                    TargetEntityName: 'SharePoint List Items',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('SiteListItems', 'ListItems'),
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Sites':
                return [
                    { SourceFieldName: 'id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'displayName', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'webUrl', DestinationFieldName: 'URL' },
                    { SourceFieldName: 'description', DestinationFieldName: 'Description' },
                ];
            case 'SiteLists':
                return [
                    { SourceFieldName: 'id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'displayName', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'description', DestinationFieldName: 'Description' },
                ];
            case 'SiteListItems':
                return [
                    { SourceFieldName: 'id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                ];
            default:
                return [];
        }
    }

    // ── TestConnection ───────────────────────────────────────────────

    /**
     * Verifies the service principal can reach Graph by fetching the tenant's
     * organization record. Forces a token refresh so credentials are validated.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser, true);
            const url = `${auth.BaseUrl}/organization?$select=id,displayName`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            this.ValidateResponse(response, url);

            const body = response.Body as GraphCollectionResponse<{ id: string; displayName?: string }>;
            const orgName = body.value?.[0]?.displayName ?? 'unknown';
            return {
                Success: true,
                Message: `Successfully connected to Microsoft Graph (tenant: ${orgName})`,
                ServerVersion: 'Microsoft Graph v1.0',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ── DiscoverObjects / DiscoverFields ─────────────────────────────

    /**
     * Returns the static IntegrationObject list. Discovery of per-site custom
     * lists happens via the SiteLists IntegrationObject's FetchChanges loop, not
     * here — this is a capability catalog, not a live enumeration.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return super.DiscoverObjects(companyIntegration, contextUser);
    }

    /**
     * Returns static field metadata from IntegrationEngineBase, plus — for
     * SiteListItems — augments with live list-column discovery per list.
     * Custom columns are marked via the IsReadOnly=false / isSealed=false
     * Graph-reported flags; callers downstream can set IsCustom accordingly.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);
        if (objectName !== LIST_ITEM_OBJECT) return staticFields;

        const custom = await this.DiscoverListColumnsForAllLists(companyIntegration, contextUser, staticFields);
        return [...staticFields, ...custom];
    }

    // ── FetchChanges (Template Variable / Delta hooks) ───────────────

    /**
     * Top-level FetchChanges delegates to BaseRESTIntegrationConnector for
     * template-variable resolution and pagination. We intercept the top-level
     * Sites endpoint because the /sites?search=* syntax is not a standard GET
     * collection — we normalise its response to the value array ourselves.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        // Delta sync path — when watermark is present and object supports it,
        // use /delta endpoints rather than full re-enumeration.
        if (ctx.WatermarkValue && obj.SupportsIncrementalSync && this.SupportsDeltaForObject(obj)) {
            return this.FetchChangesViaDelta(ctx, obj);
        }
        return super.FetchChanges(ctx);
    }

    // ── CRUD operations ──────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);

        try {
            const url = this.BuildCRUDUrl(auth, companyIntegration.IntegrationID, ctx.ObjectName, null);
            const response = await this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), ctx.Attributes);
            this.ValidateResponse(response, url);
            const body = response.Body as { id?: string };
            return this.BuildCreatedResult(body.id, response.Status, ctx.ObjectName);
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'CreateRecord', ctx.ObjectName);
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);

        try {
            const url = this.BuildCRUDUrl(auth, companyIntegration.IntegrationID, ctx.ObjectName, ctx.ExternalID);
            const response = await this.MakeHTTPRequest(auth, url, 'PATCH', this.BuildHeaders(auth), ctx.Attributes);
            this.ValidateResponse(response, url);
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'UpdateRecord', ctx.ObjectName);
        }
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);

        try {
            const url = this.BuildCRUDUrl(auth, companyIntegration.IntegrationID, ctx.ObjectName, ctx.ExternalID);
            const response = await this.MakeHTTPRequest(auth, url, 'DELETE', this.BuildHeaders(auth));
            if (response.Status === 404) {
                return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 404 };
            }
            this.ValidateResponse(response, url);
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'DeleteRecord', ctx.ObjectName);
        }
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);

        try {
            const url = this.BuildCRUDUrl(auth, companyIntegration.IntegrationID, ctx.ObjectName, ctx.ExternalID);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status === 404) return null;
            this.ValidateResponse(response, url);
            const body = response.Body as Record<string, unknown>;
            return {
                ExternalID: String(body['id'] ?? ctx.ExternalID),
                ObjectType: ctx.ObjectName,
                Fields: body,
            };
        } catch {
            return null;
        }
    }

    // ─── Abstract BaseRESTIntegrationConnector hooks ────────────────

    /**
     * Authenticates with Azure AD via client-credentials flow.
     * Caches the bearer token until within TOKEN_REFRESH_BUFFER_MS of expiry.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<SharePointAuthContext> {
        if (!forceRefresh && this.cachedAuth && this.IsTokenValid()) {
            return this.cachedAuth;
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const token = await this.RequestGraphToken(config);
        const baseUrl = config.GraphBaseUrl ?? GRAPH_V1_BASE_URL;

        const auth: SharePointAuthContext = {
            Token: token.access_token,
            ExpiresAt: new Date(Date.now() + token.expires_in * 1000),
            Config: config,
            BaseUrl: baseUrl,
        };
        this.cachedAuth = auth;
        this.tokenExpiresAt = Date.now() + token.expires_in * 1000;
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = auth.Token ?? '';
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    /**
     * HTTP transport with rate-limit throttling, Retry-After honoring, and
     * exponential backoff on 429/503.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const spAuth = auth as SharePointAuthContext;
        const config = spAuth.Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);
            const response = await this.ExecuteOneRequest(url, method, headers, body, timeoutMs);
            if (this.IsRetryable(response) && attempt < maxRetries) {
                const delay = this.ComputeBackoffDelay(attempt, response.Headers['retry-after']);
                await this.Sleep(delay);
                continue;
            }
            return response;
        }
        throw new Error(`SharePointConnector: exhausted ${maxRetries + 1} attempts for ${method} ${url}`);
    }

    /**
     * Extracts the `value` array from a Graph response envelope. The base class
     * already passes `ResponseDataKey` from metadata — we default to the `value`
     * convention when responseDataKey is null.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        const body = rawBody as Record<string, unknown>;
        const key = responseDataKey ?? 'value';
        const data = body[key];
        if (Array.isArray(data)) return data as Record<string, unknown>[];
        // Single-record response fallback
        if (body && typeof body === 'object' && 'id' in body) return [body];
        return [];
    }

    /**
     * Extracts pagination state from the Graph `@odata.nextLink` annotation.
     * Graph uses opaque URL cursors — we store the full nextLink URL in the
     * cursor so the next iteration issues the exact request Graph expects.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        const body = rawBody as GraphCollectionResponse<unknown>;
        const nextLink = body?.['@odata.nextLink'];
        return {
            HasMore: typeof nextLink === 'string' && nextLink.length > 0,
            NextCursor: nextLink,
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        const spAuth = auth as SharePointAuthContext;
        return spAuth.BaseUrl;
    }

    /**
     * Overrides the base pagination URL builder. Graph's nextLink is an absolute
     * URL that encodes the full continuation request. When we have a cursor we
     * use it directly; otherwise we rely on the base path (already wired with
     * $top / $select via DefaultQueryParams).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        if (cursor && cursor.length > 0) return cursor;

        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? 200;
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}$top=${pageSize}`;
    }

    // ─── Token Management ────────────────────────────────────────────

    private IsTokenValid(): boolean {
        if (!this.cachedAuth || !this.cachedAuth.Token) return false;
        return Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS;
    }

    private async RequestGraphToken(config: SharePointConnectionConfig): Promise<GraphTokenResponse> {
        const url = AAD_TOKEN_ENDPOINT(config.TenantId);
        const scope = config.Scope ?? DEFAULT_SCOPE;
        const form = new URLSearchParams({
            client_id: config.ClientId,
            scope,
            client_secret: config.ClientSecret,
            grant_type: 'client_credentials',
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: form.toString(),
        });

        const text = await response.text();
        if (!response.ok) {
            throw new Error(`SharePointConnector: Azure AD token request failed (${response.status}): ${text.slice(0, 500)}`);
        }
        return JSON.parse(text) as GraphTokenResponse;
    }

    // ─── Configuration Parsing ───────────────────────────────────────

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SharePointConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const config = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (config) return config;
        }

        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Partial<SharePointConnectionConfig>;
            return this.ValidateConfig(parsed);
        }

        throw new Error('SharePointConnector: No credentials or configuration found on CompanyIntegration');
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<SharePointConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            const raw = JSON.parse(credential.Values) as Record<string, unknown>;
            const parsed: Partial<SharePointConnectionConfig> = {
                TenantId: raw.tenantId as string | undefined ?? raw.TenantId as string | undefined,
                ClientId: raw.clientId as string | undefined ?? raw.ClientId as string | undefined,
                ClientSecret: raw.clientSecret as string | undefined ?? raw.ClientSecret as string | undefined,
                GraphBaseUrl: raw.graphBaseUrl as string | undefined ?? raw.GraphBaseUrl as string | undefined,
                Scope: raw.scope as string | undefined ?? raw.Scope as string | undefined,
            };
            return this.ValidateConfig(parsed);
        } catch {
            return null;
        }
    }

    private ValidateConfig(raw: Partial<SharePointConnectionConfig>): SharePointConnectionConfig {
        if (!raw.TenantId) throw new Error('SharePointConnector: TenantId is required');
        if (!raw.ClientId) throw new Error('SharePointConnector: ClientId is required');
        if (!raw.ClientSecret) throw new Error('SharePointConnector: ClientSecret is required');

        return {
            TenantId: raw.TenantId,
            ClientId: raw.ClientId,
            ClientSecret: raw.ClientSecret,
            GraphBaseUrl: raw.GraphBaseUrl,
            Scope: raw.Scope,
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    // ─── HTTP Helpers ────────────────────────────────────────────────

    private async ExecuteOneRequest(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body !== undefined && method !== 'GET' && method !== 'DELETE'
                    ? JSON.stringify(body)
                    : undefined,
                signal: controller.signal,
            });
            this.lastRequestTime = Date.now();
            const responseHeaders = this.ExtractHeaders(response.headers);
            const parsedBody = await this.ParseResponseBody(response);
            return { Status: response.status, Body: parsedBody, Headers: responseHeaders };
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    private async ParseResponseBody(response: Response): Promise<unknown> {
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text) as unknown;
        } catch {
            return text;
        }
    }

    private ExtractHeaders(headers: Headers): Record<string, string> {
        const map: Record<string, string> = {};
        headers.forEach((value, key) => {
            map[key.toLowerCase()] = value;
        });
        return map;
    }

    private IsRetryable(response: RESTResponse): boolean {
        return response.Status === 429 || response.Status === 503 || response.Status === 504;
    }

    private ComputeBackoffDelay(attempt: number, retryAfterHeader?: string): number {
        if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                return Math.min(parsed * 1000, 60000);
            }
        }
        return Math.min(Math.pow(2, attempt) * 1000, 30000);
    }

    private async Throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.Sleep(minIntervalMs - elapsed);
        }
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private ValidateResponse(response: RESTResponse, url: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            const preview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            throw new Error(`Graph HTTP ${response.Status} from ${url}: ${preview}`);
        }
    }

    // ─── CRUD URL builder ────────────────────────────────────────────

    /**
     * Builds a CRUD-target URL for a given object + external ID.
     *
     * The APIPath from metadata may contain template variables (e.g.,
     * `/sites/{siteId}/lists/{id}/items`). For a CRUD call we resolve those
     * variables from the composite external ID: if the object has N template
     * variables and an optional terminal ID, the external ID is a pipe-delimited
     * string of N+1 parts (e.g., `siteId|listId|itemId`).
     */
    private BuildCRUDUrl(
        auth: SharePointAuthContext,
        integrationID: string,
        objectName: string,
        externalID: string | null
    ): string {
        const obj = this.GetCachedObject(integrationID, objectName);
        const apiPath = this.ResolveTemplatePath(obj.APIPath, externalID);
        const base = auth.BaseUrl;
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        return `${base}${path}`;
    }

    /**
     * Resolves template variables in an API path using a pipe-delimited
     * external ID (e.g., `site-id|list-id|item-id`).
     */
    private ResolveTemplatePath(apiPath: string, externalID: string | null): string {
        const templateVars = this.DetectTemplateVariables(apiPath);
        if (templateVars.length === 0) {
            // Flat path — append externalID if present
            if (externalID) return `${apiPath}/${encodeURIComponent(externalID)}`;
            return apiPath;
        }
        if (!externalID) return apiPath;
        const parts = externalID.split('|');
        let resolved = apiPath;
        templateVars.forEach((varName, idx) => {
            const value = parts[idx] ?? '';
            resolved = resolved.replace(`{${varName}}`, encodeURIComponent(value));
        });
        // If there is an extra parts element beyond the template vars, treat it
        // as the terminal ID (e.g., list item id)
        if (parts.length > templateVars.length) {
            const terminalId = parts[parts.length - 1];
            resolved = `${resolved}/${encodeURIComponent(terminalId)}`;
        }
        return resolved;
    }

    private DetectTemplateVariables(apiPath: string): string[] {
        const matches = apiPath.match(/\{(\w+)\}/g);
        return matches ? matches.map(m => m.slice(1, -1)) : [];
    }

    // ─── Delta sync ──────────────────────────────────────────────────

    /**
     * Detects whether an IntegrationObject supports Graph delta queries.
     * Currently: DriveItems and SiteListItems.
     */
    private SupportsDeltaForObject(obj: MJIntegrationObjectEntity): boolean {
        return obj.Name === 'DriveItems' || obj.Name === 'SiteListItems';
    }

    /**
     * Fetches changed records via Graph's /delta endpoint. The `WatermarkValue`
     * holds either a full delta URL (from the previous batch) or a token to
     * append to the delta endpoint.
     */
    private async FetchChangesViaDelta(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const deltaUrl = this.BuildDeltaUrl(auth, obj, ctx.WatermarkValue);

        const response = await this.MakeHTTPRequest(auth, deltaUrl, 'GET', this.BuildHeaders(auth));
        this.ValidateResponse(response, deltaUrl);

        const body = response.Body as GraphCollectionResponse<Record<string, unknown>>;
        const records = body.value ?? [];
        const nextLink = body['@odata.nextLink'];
        const deltaLink = body['@odata.deltaLink'];

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['id'] ?? ''),
            ObjectType: ctx.ObjectName,
            Fields: r,
            ModifiedAt: typeof r['lastModifiedDateTime'] === 'string'
                ? new Date(r['lastModifiedDateTime']) : undefined,
            // Microsoft Graph delta deletion semantics: driveItem and listItem use the
            // `deleted` facet (e.g. `"deleted": { "state": "deleted" }`). The legacy
            // `@removed` shape applies to directoryObjects (users/groups) only. Check
            // both so we catch deletions across the resource types this connector reaches.
            IsDeleted:
                (typeof r['deleted'] === 'object' && r['deleted'] !== null) ||
                (typeof r['@removed'] === 'object' && r['@removed'] !== null),
        }));

        return {
            Records: externalRecords,
            HasMore: Boolean(nextLink),
            NewWatermarkValue: deltaLink ?? nextLink,
            NextCursor: nextLink,
        };
    }

    private BuildDeltaUrl(
        auth: SharePointAuthContext,
        obj: MJIntegrationObjectEntity,
        watermark: string | null
    ): string {
        // If watermark is already a full URL, use it as-is
        if (watermark && watermark.startsWith('http')) return watermark;

        // Translate object's APIPath into its /delta sibling
        const base = auth.BaseUrl;
        const path = obj.Name === 'DriveItems'
            ? '/drives/{id}/root/delta'
            : '/sites/{siteId}/lists/{id}/items/delta';
        const deltaBase = `${base}${path}`;
        if (watermark) return `${deltaBase}?token=${encodeURIComponent(watermark)}`;
        return deltaBase;
    }

    // ─── Runtime List-Column Discovery (Custom Fields) ───────────────

    /**
     * Enumerates every accessible (site, list) pair and fetches each list's
     * column definitions, returning a deduplicated array of fields not already
     * present in the static metadata.
     *
     * Note: For large tenants this can be expensive. Callers typically scope
     * this to specific sites via ExtraFilter / configuration.
     */
    private async DiscoverListColumnsForAllLists(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        staticFields: ExternalFieldSchema[]
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const sites = await this.ListAllSites(auth);
            const staticFieldNames = new Set(staticFields.map(f => f.Name.toLowerCase()));
            const seen = new Set<string>();
            const results: ExternalFieldSchema[] = [];

            for (const site of sites) {
                const lists = await this.ListListsForSite(auth, site.id);
                for (const list of lists) {
                    const columns = await this.ListColumnsForList(auth, site.id, list.id);
                    for (const col of columns) {
                        const name = col.name ?? col.id;
                        if (!name) continue;
                        const key = name.toLowerCase();
                        if (staticFieldNames.has(key) || seen.has(key)) continue;
                        seen.add(key);
                        results.push(this.GraphColumnToFieldSchema(col));
                    }
                }
            }
            return results;
        } catch {
            // Best-effort — degrade gracefully if live discovery fails
            return [];
        }
    }

    private async ListAllSites(auth: SharePointAuthContext): Promise<GraphSite[]> {
        const url = `${auth.BaseUrl}/sites?search=*&$select=id,displayName,name,webUrl`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        this.ValidateResponse(response, url);
        const body = response.Body as GraphCollectionResponse<GraphSite>;
        return body.value ?? [];
    }

    private async ListListsForSite(auth: SharePointAuthContext, siteId: string): Promise<GraphList[]> {
        const url = `${auth.BaseUrl}/sites/${encodeURIComponent(siteId)}/lists?$select=id,name,displayName`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status >= 400) return [];
        const body = response.Body as GraphCollectionResponse<GraphList>;
        return body.value ?? [];
    }

    private async ListColumnsForList(
        auth: SharePointAuthContext,
        siteId: string,
        listId: string
    ): Promise<GraphColumnDefinition[]> {
        const url = `${auth.BaseUrl}/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/columns`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status >= 400) return [];
        const body = response.Body as GraphCollectionResponse<GraphColumnDefinition>;
        return body.value ?? [];
    }

    private GraphColumnToFieldSchema(col: GraphColumnDefinition): ExternalFieldSchema {
        return {
            Name: col.name ?? col.id ?? 'unknown',
            Label: col.displayName ?? col.name ?? col.id ?? 'unknown',
            Description: col.description ?? undefined,
            DataType: this.InferGraphColumnType(col),
            IsRequired: col.required === true,
            IsUniqueKey: false,
            IsReadOnly: col.readOnly === true,
            IsForeignKey: false,
            ForeignKeyTarget: null,
        };
    }

    private InferGraphColumnType(col: GraphColumnDefinition): string {
        if (col.text) return 'string';
        if (col.number) return 'decimal';
        if (col.boolean) return 'boolean';
        if (col.dateTime) return 'datetime';
        if (col.choice) return 'string';
        if (col.currency) return 'decimal';
        if (col.lookup) return 'string';
        if (col.personOrGroup) return 'string';
        if (col.hyperlinkOrPicture) return 'string';
        return 'string';
    }

    // ─── CRUD helpers ────────────────────────────────────────────────

    private BuildCRUDError(err: unknown, operation: string, objectName: string): CRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return {
            Success: false,
            ErrorMessage: `${operation} failed for ${objectName}: ${message}`,
            StatusCode: 500,
        };
    }
}

/** Tree-shaking prevention function — import and call from module entry point. */
export function LoadSharePointConnector(): void { /* no-op */ }
