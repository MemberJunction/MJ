import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type ExternalRecord,
} from '@memberjunction/integration-engine';

// ─── Types ─────────────────────────────────────────────────────────────

/**
 * iMIS REST API connection configuration. Supports the OAuth 2.0 Password Grant
 * flow (recommended for server-to-server) and the optional SSO refresh-token
 * flow (when ClientId + ClientSecret + RefreshToken are supplied).
 */
export interface IMISConnectionConfig {
    /** Full base URL to the customer's iMIS API (no trailing slash) */
    BaseUrl: string;
    /** API username (must hold the iMIS RemoteService role) for Password Grant */
    Username: string;
    /** API password for Password Grant */
    Password: string;
    /** Optional OAuth SSO Client ID (only used when switching to SSO refresh-token flow) */
    ClientId?: string;
    /** Optional OAuth SSO Client Secret */
    ClientSecret?: string;
    /** Optional SSO refresh token */
    RefreshToken?: string;

    /** Maximum retries for rate-limited or failed requests. Default: 3 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 60000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 200 */
    MinRequestIntervalMs?: number;
}

/** Runtime auth context — carries the bearer token and config for downstream requests. */
interface IMISAuthContext extends RESTAuthContext {
    Token: string;
    ExpiresAt: Date;
    Config: IMISConnectionConfig;
    BaseUrl: string;
}

/** Shape of the OAuth token endpoint response. */
interface IMISTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
}

/** Shape of iMIS PagedResult envelope for list responses. */
interface IMISPagedResult {
    $type?: string;
    Items?: Record<string, unknown>[];
    Offset?: number;
    Limit?: number;
    Count?: number;
    HasNext?: boolean;
}

/** Shape of a single BOEntityDefinition record. */
interface IMISBOEntityDefinition {
    Name?: string;
    DisplayName?: string;
    Description?: string;
}

/** Shape of the /metadata endpoint response (entity metadata with PropertyDefinitions). */
interface IMISEntityMetadata {
    Name?: string;
    Description?: string;
    PropertyDefinitions?: IMISPropertyDefinition[];
}

/** Shape of a single PropertyDefinition in /{entity}/metadata. */
interface IMISPropertyDefinition {
    Name?: string;
    DisplayName?: string;
    Description?: string;
    PropertyType?: string;
    PropertyTypeData?: { Name?: string };
    IsRequired?: boolean;
    IsReadOnly?: boolean;
    IsPrimaryKey?: boolean;
    MaxLength?: number | null;
}

// ─── Constants ─────────────────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

/** iMIS-to-SQL type mapping used when merging live-discovered field metadata. */
const IMIS_TYPE_MAP: Record<string, string> = {
    'string': 'string',
    'datetime': 'datetime',
    'date': 'date',
    'boolean': 'boolean',
    'int32': 'integer',
    'int64': 'integer',
    'integer': 'integer',
    'long': 'integer',
    'decimal': 'decimal',
    'double': 'decimal',
    'float': 'decimal',
    'guid': 'uuid',
    'uuid': 'uuid',
    'monetaryamountdata': 'decimal',
};

// ─── Connector ─────────────────────────────────────────────────────────

/**
 * Connector for iMIS EMS (Advanced Solutions International) REST API.
 *
 * Extends BaseRESTIntegrationConnector so the generic metadata-driven fetch
 * loop handles pagination, template variables, and record normalization.
 * Adds iMIS-specific:
 *   - OAuth 2.0 Password Grant / SSO refresh-token authentication
 *   - /{entity}/metadata runtime field discovery (merged with static IntegrationObjectField metadata, IsCustom=true)
 *   - /BOEntityDefinition runtime object discovery (customer Business Objects, IsCustom=true)
 *   - PagedResult envelope with Offset/Limit + HasNext flag
 *   - UpdatedOn=gt:&lt;iso-date&gt; watermark filter for incremental sync
 *   - PUT (full replace) for updates with automatic read-modify-write merge
 *
 * Reference: https://developer.imis.com/docs/imis-rest-api-data-models-and-swagger-json-files
 */
@RegisterClass(BaseIntegrationConnector, 'IMISConnector')
export class IMISConnector extends BaseRESTIntegrationConnector {

    private authState: IMISAuthContext | null = null;
    private lastRequestTime = 0;
    /** Current watermark for the in-flight FetchChanges — used by AppendDefaultQueryParams */
    private currentWatermark: string | null = null;

    // ── Capability flags ────────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }
    public override get IntegrationName(): string { return 'iMIS'; }

    // ── Auth + transport (abstract methods from BaseRESTIntegrationConnector) ────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        return this.GetAuth(companyIntegration, contextUser);
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const imisAuth = auth as IMISAuthContext;
        return {
            'Authorization': `Bearer ${imisAuth.Token}`,
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
        const imisAuth = auth as IMISAuthContext;
        const maxRetries = imisAuth.Config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = imisAuth.Config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = imisAuth.Config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        const effectiveHeaders = { ...headers };
        if (body !== undefined && !effectiveHeaders['Content-Type']) {
            effectiveHeaders['Content-Type'] = 'application/json';
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);
            const response = await this.ExecuteFetch(url, method, effectiveHeaders, body, timeoutMs);
            this.lastRequestTime = Date.now();

            if (response.status === 401 && attempt < maxRetries) {
                // Token may have expired mid-request — force refresh and retry once.
                this.authState = null;
                const fresh = await this.GetAuth(imisAuth.Config);
                imisAuth.Token = fresh.Token;
                imisAuth.ExpiresAt = fresh.ExpiresAt;
                effectiveHeaders['Authorization'] = `Bearer ${fresh.Token}`;
                continue;
            }

            if (this.ShouldRetry(response.status) && attempt < maxRetries) {
                const delay = this.ComputeRetryDelay(response, attempt);
                await this.Sleep(delay);
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`iMIS API request failed after ${maxRetries} attempt(s): ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        // PagedResult envelope → Items
        if (this.IsPagedResult(rawBody)) {
            return (rawBody as IMISPagedResult).Items ?? [];
        }

        // Explicit key provided (e.g., "Items")
        if (responseDataKey) {
            const record = rawBody as Record<string, unknown>;
            const data = record[responseDataKey];
            if (Array.isArray(data)) return data as Record<string, unknown>[];
        }

        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];

        // Single-object response (e.g., GET /{Entity}/{id})
        return [rawBody as Record<string, unknown>];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };

        const envelope = this.IsPagedResult(rawBody) ? rawBody as IMISPagedResult : null;
        if (!envelope) {
            // Fallback: no PagedResult envelope → no more pages
            return { HasMore: false };
        }

        const hasMore = envelope.HasNext ?? false;
        const returnedCount = envelope.Items?.length ?? 0;
        const nextOffset = (envelope.Offset ?? currentOffset) + returnedCount;

        return {
            HasMore: hasMore,
            NextOffset: paginationType === 'Offset' ? nextOffset : undefined,
            NextPage: paginationType === 'PageNumber' ? currentPage + 1 : undefined,
            TotalRecords: envelope.Count,
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as IMISAuthContext).BaseUrl;
    }

    /**
     * iMIS pagination uses `Offset` and `Limit` query parameters (capitalized).
     * Override the base class helper to match iMIS's param names.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? 100;
        const separator = basePath.includes('?') ? '&' : '?';

        switch (obj.PaginationType) {
            case 'PageNumber':
                return `${basePath}${separator}Page=${page}&Limit=${pageSize}`;
            case 'Offset':
                return `${basePath}${separator}Offset=${offset}&Limit=${pageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&Limit=${pageSize}`
                    : `${basePath}${separator}Limit=${pageSize}`;
            default:
                return basePath;
        }
    }

    /**
     * Inject watermark filter (UpdatedOn=gt:<iso>) when an incremental sync is active.
     * The iMIS REST API accepts operator-prefixed filter values (`gt:`, `ge:`, `lt:`) on list endpoints.
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        let result = super.AppendDefaultQueryParams(url, obj);
        if (this.currentWatermark && obj.SupportsIncrementalSync) {
            const separator = result.includes('?') ? '&' : '?';
            const param = `UpdatedOn=${encodeURIComponent('gt:' + this.currentWatermark)}`;
            result = `${result}${separator}${param}`;
        }
        return result;
    }

    // ── Public API: Discovery, FetchChanges, CRUD ───────────────────

    /**
     * Test the connection by authenticating and hitting the /Party list endpoint
     * with a minimal page size. Confirms both auth + data-plane connectivity.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser, true);
            const url = `${auth.BaseUrl}/Party?Limit=1`;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return {
                    Success: true,
                    Message: `Connected to iMIS EMS at ${auth.BaseUrl}`,
                    ServerVersion: this.ExtractServerVersion(response.Headers),
                };
            }
            return { Success: false, Message: `iMIS responded HTTP ${response.Status}` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    /**
     * Discover objects by merging:
     *   1. Static IntegrationObject metadata (from MJ: Integration Objects table)
     *   2. Runtime-discovered customer Business Objects via GET /BOEntityDefinition
     *      — marked with IsCustom=true when not already present in static metadata.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const staticObjects = await super.DiscoverObjects(companyIntegration, contextUser);
        const staticNames = new Set(staticObjects.map(o => o.Name.toLowerCase()));

        try {
            const customObjects = await this.DiscoverBusinessObjects(companyIntegration, contextUser);
            const newCustom = customObjects.filter(
                co => !staticNames.has(co.Name.toLowerCase())
            );
            return [...staticObjects, ...newCustom];
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[iMIS] Business Object discovery failed, returning static objects only: ${message}`);
            return staticObjects;
        }
    }

    /**
     * Discover fields by merging:
     *   1. Static IntegrationObjectField metadata (from MJ: Integration Object Fields table)
     *   2. Runtime-discovered fields via GET /{entity}/metadata
     *      — any live field not in the static metadata is appended with IsCustom=true
     *      (surfaced to callers via the IsForeignKey=false / IsReadOnly mix from the live API).
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);

        try {
            const liveFields = await this.DiscoverFieldsFromLiveAPI(companyIntegration, objectName, contextUser);
            return this.MergeFieldSchemas(staticFields, liveFields);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[iMIS] Live field discovery failed for "${objectName}", returning static fields: ${message}`);
            return staticFields;
        }
    }

    /**
     * Override FetchChanges to stash the current watermark so AppendDefaultQueryParams
     * can inject the UpdatedOn filter on list requests.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue;
        try {
            const result = await super.FetchChanges(ctx);
            result.NewWatermarkValue = this.ComputeNewWatermark(result.Records, ctx.WatermarkValue);
            return result;
        } finally {
            this.currentWatermark = null;
        }
    }

    // ── Write operations ────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const url = `${auth.BaseUrl}/${this.NormalizeObjectPath(ctx.ObjectName)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return {
                Success: true,
                ExternalID: this.ExtractIdFromRecord(body),
                StatusCode: response.Status,
            };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const objectPath = this.NormalizeObjectPath(ctx.ObjectName);

        // iMIS PUT is a full replace — do a read-modify-write merge of Attributes
        // into the current record so callers can supply partial updates.
        const current = await this.FetchSingleRecord(auth, objectPath, ctx.ExternalID);
        if (!current) {
            return { Success: false, ErrorMessage: `Record ${ctx.ExternalID} not found`, StatusCode: 404 };
        }
        const merged: Record<string, unknown> = { ...current, ...ctx.Attributes };

        const url = `${auth.BaseUrl}/${objectPath}/${encodeURIComponent(ctx.ExternalID)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'PUT', headers, merged);

        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const url = `${auth.BaseUrl}/${this.NormalizeObjectPath(ctx.ObjectName)}/${encodeURIComponent(ctx.ExternalID)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);

        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const record = await this.FetchSingleRecord(auth, this.NormalizeObjectPath(ctx.ObjectName), ctx.ExternalID);
        if (!record) return null;

        return {
            ExternalID: ctx.ExternalID,
            ObjectType: ctx.ObjectName,
            Fields: record,
        };
    }

    // ── Default configuration / field mappings ──────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'iMIS',
            DefaultObjects: [],
        };
    }

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Party':
            case 'Person':
                return [
                    { SourceFieldName: 'PartyId', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'FullName', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'PrimaryEmail', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'PrimaryPhone', DestinationFieldName: 'Phone' },
                ];
            case 'Event':
                return [
                    { SourceFieldName: 'EventId', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                ];
            default:
                return [];
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //                         Private helpers
    // ─────────────────────────────────────────────────────────────────

    // ── Auth helpers ────────────────────────────────────────────────

    /**
     * Returns a valid auth context, refreshing the access token as needed.
     * Accepts either (companyIntegration, contextUser) for the first call
     * or a pre-parsed config for silent refresh from MakeHTTPRequest.
     */
    private async GetAuth(
        source: MJCompanyIntegrationEntity | IMISConnectionConfig,
        contextUser?: UserInfo,
        forceRefresh = false
    ): Promise<IMISAuthContext> {
        if (!forceRefresh && this.authState && this.IsTokenValid(this.authState)) {
            return this.authState;
        }
        const config = this.IsConfig(source)
            ? source
            : await this.ParseConfig(source as MJCompanyIntegrationEntity, contextUser);
        this.authState = await this.AcquireToken(config);
        return this.authState;
    }

    private IsConfig(source: MJCompanyIntegrationEntity | IMISConnectionConfig): source is IMISConnectionConfig {
        return (source as IMISConnectionConfig).BaseUrl !== undefined
            && (source as IMISConnectionConfig).Username !== undefined;
    }

    private IsTokenValid(auth: IMISAuthContext): boolean {
        return auth.ExpiresAt.getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS;
    }

    private async AcquireToken(config: IMISConnectionConfig): Promise<IMISAuthContext> {
        const baseUrl = this.StripTrailingSlash(config.BaseUrl);
        const tokenUrl = this.ResolveTokenEndpoint(baseUrl);
        const body = this.BuildTokenRequestBody(config);

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`iMIS token request failed (${response.status}): ${text.slice(0, 300)}`);
        }

        const payload = await response.json() as IMISTokenResponse;
        const expiresAt = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000);
        if (payload.refresh_token) {
            config.RefreshToken = payload.refresh_token;
        }

        return {
            Token: payload.access_token,
            ExpiresAt: expiresAt,
            Config: config,
            BaseUrl: baseUrl,
        };
    }

    /**
     * iMIS issues tokens at the scheduler path, not under /api/. Strip /api[/]
     * from the BaseUrl when constructing the token endpoint.
     */
    private ResolveTokenEndpoint(baseUrl: string): string {
        const trimmed = baseUrl.replace(/\/api\/?$/i, '');
        // Vendor-canonical path is lowercase '/token/' per developer.imis.com docs.
        // IIS is normally case-insensitive on URL paths so '/Token' usually works,
        // but a few customer reverse-proxies enforce case strictness — match docs.
        return `${trimmed}/token/`;
    }

    private BuildTokenRequestBody(config: IMISConnectionConfig): string {
        const params = new URLSearchParams();
        if (config.ClientId && config.ClientSecret && config.RefreshToken) {
            params.set('grant_type', 'refresh_token');
            params.set('refresh_token', config.RefreshToken);
            params.set('client_id', config.ClientId);
            params.set('client_secret', config.ClientSecret);
            return params.toString();
        }
        params.set('grant_type', 'password');
        params.set('username', config.Username);
        params.set('password', config.Password);
        return params.toString();
    }

    // ── Configuration parsing ───────────────────────────────────────

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<IMISConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const config = await this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
            if (config) return config;
        }
        if (companyIntegration.Configuration) {
            const parsed = JSON.parse(companyIntegration.Configuration) as Record<string, string>;
            return this.ExtractConfig(parsed);
        }
        throw new Error('iMIS connector requires either CredentialID or Configuration JSON');
    }

    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo
    ): Promise<IMISConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        const values = JSON.parse(credential.Values) as Record<string, string>;
        return this.ExtractConfig(values);
    }

    private ExtractConfig(values: Record<string, string>): IMISConnectionConfig {
        const get = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const hit = Object.entries(values).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (hit) return String(hit[1] ?? '');
            }
            return undefined;
        };

        const baseUrl = get('BaseUrl', 'baseUrl', 'base_url');
        const username = get('Username', 'username', 'user');
        const password = get('Password', 'password', 'pass');
        if (!baseUrl) throw new Error('iMIS configuration missing required field: BaseUrl');
        if (!username) throw new Error('iMIS configuration missing required field: Username');
        if (!password) throw new Error('iMIS configuration missing required field: Password');

        return {
            BaseUrl: this.StripTrailingSlash(baseUrl),
            Username: username,
            Password: password,
            ClientId: get('ClientId', 'clientId', 'client_id'),
            ClientSecret: get('ClientSecret', 'clientSecret', 'client_secret'),
            RefreshToken: get('RefreshToken', 'refreshToken', 'refresh_token'),
        };
    }

    // ── Runtime discovery (BOs + field metadata) ────────────────────

    private async DiscoverBusinessObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const url = `${auth.BaseUrl}/BOEntityDefinition?Limit=500`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return [];

        const records = this.NormalizeResponse(response.Body, 'Items') as IMISBOEntityDefinition[];
        return records
            .filter(bo => !!bo.Name)
            .map(bo => ({
                Name: String(bo.Name),
                Label: bo.DisplayName ?? String(bo.Name),
                Description: bo.Description ?? `Customer-defined Business Object (runtime-discovered)`,
                SupportsIncrementalSync: true,
                SupportsWrite: true,
            }));
    }

    private async DiscoverFieldsFromLiveAPI(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const path = this.ResolveObjectPath(companyIntegration.IntegrationID, objectName);
        const url = `${auth.BaseUrl}${path}/metadata`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return [];

        const meta = response.Body as IMISEntityMetadata;
        const propDefs = meta?.PropertyDefinitions ?? [];
        return propDefs
            .filter(p => !!p.Name)
            .map(p => this.PropertyDefinitionToFieldSchema(p));
    }

    private PropertyDefinitionToFieldSchema(prop: IMISPropertyDefinition): ExternalFieldSchema {
        const rawType = (prop.PropertyType ?? prop.PropertyTypeData?.Name ?? 'string').toLowerCase();
        const genericType = IMIS_TYPE_MAP[rawType] ?? 'string';
        return {
            Name: String(prop.Name),
            Label: prop.DisplayName ?? String(prop.Name),
            Description: prop.Description,
            DataType: genericType,
            IsRequired: !!prop.IsRequired,
            IsUniqueKey: !!prop.IsPrimaryKey,
            IsReadOnly: !!prop.IsReadOnly,
        };
    }

    /**
     * Merge live-discovered fields with static metadata. Live-only fields are
     * treated as custom — surfaced with whatever properties the live API reports.
     * Static fields override live fields on matching names (static metadata
     * reflects the curated MJ schema).
     */
    private MergeFieldSchemas(
        staticFields: ExternalFieldSchema[],
        liveFields: ExternalFieldSchema[]
    ): ExternalFieldSchema[] {
        const staticNames = new Set(staticFields.map(f => f.Name.toLowerCase()));
        const liveOnly = liveFields.filter(f => !staticNames.has(f.Name.toLowerCase()));
        return [...staticFields, ...liveOnly];
    }

    /**
     * Resolve an object name to its API path. Prefers the configured APIPath
     * from IntegrationObject metadata; falls back to `/{ObjectName}` for
     * runtime-discovered Business Objects.
     */
    private ResolveObjectPath(integrationID: string, objectName: string): string {
        try {
            const obj = this.GetCachedObject(integrationID, objectName);
            if (obj.APIPath) {
                return obj.APIPath.startsWith('/') ? obj.APIPath : `/${obj.APIPath}`;
            }
        } catch {
            // Not in static metadata — this is a runtime-discovered Business Object.
        }
        return `/${objectName}`;
    }

    /** Derive the URL path segment used by CRUD operations (no leading slash). */
    private NormalizeObjectPath(objectName: string): string {
        return objectName.startsWith('/') ? objectName.slice(1) : objectName;
    }

    // ── Record / watermark helpers ──────────────────────────────────

    private async FetchSingleRecord(
        auth: IMISAuthContext,
        objectPath: string,
        id: string
    ): Promise<Record<string, unknown> | null> {
        const url = `${auth.BaseUrl}/${objectPath}/${encodeURIComponent(id)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return null;
        if (response.Body == null || typeof response.Body !== 'object') return null;
        return response.Body as Record<string, unknown>;
    }

    private ExtractIdFromRecord(body: Record<string, unknown>): string {
        const candidates = ['Id', 'ID', 'PartyId', 'UniformId', 'EventId', 'InvoiceId', 'PaymentId'];
        for (const key of candidates) {
            const value = body[key];
            if (value !== undefined && value !== null) return String(value);
        }
        return '';
    }

    private ComputeNewWatermark(records: ExternalRecord[], current: string | null): string | undefined {
        const candidateKeys = ['UpdatedOn', 'UpdateDate', 'ModifiedOn', 'LastUpdatedAt'];
        let latest: string | undefined;
        for (const record of records) {
            for (const key of candidateKeys) {
                const value = record.Fields[key];
                if (typeof value === 'string' && (!latest || value > latest)) latest = value;
            }
        }
        if (!latest) return current ?? undefined;
        if (current && latest <= current) return current;
        return latest;
    }

    // ── HTTP helpers ────────────────────────────────────────────────

    private async ExecuteFetch(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
    }

    private async BuildRESTResponse(response: Response): Promise<RESTResponse> {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

        const contentType = headers['content-type'] ?? '';
        let bodyValue: unknown;
        if (contentType.includes('application/json')) {
            bodyValue = await this.ParseJsonSafely(response);
        } else {
            bodyValue = await response.text();
        }

        return { Status: response.status, Body: bodyValue, Headers: headers };
    }

    private async ParseJsonSafely(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    private ShouldRetry(status: number): boolean {
        return status === 429 || status === 502 || status === 503 || status === 504;
    }

    private ComputeRetryDelay(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number.parseInt(retryAfter, 10);
            if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
        }
        return Math.min(Math.pow(2, attempt) * 1000, 15_000);
    }

    private async Throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) await this.Sleep(minIntervalMs - elapsed);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private ExtractServerVersion(headers: Record<string, string>): string | undefined {
        return headers['x-imis-version'] ?? headers['server'] ?? 'iMIS REST API';
    }

    private IsPagedResult(body: unknown): boolean {
        if (body == null || typeof body !== 'object' || Array.isArray(body)) return false;
        const record = body as Record<string, unknown>;
        return Array.isArray(record['Items']) && (
            'Offset' in record || 'Limit' in record || 'HasNext' in record
        );
    }

    private StripTrailingSlash(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const body = response.Body;
        let detail: string;
        if (typeof body === 'string') {
            detail = body.slice(0, 500);
        } else if (body && typeof body === 'object') {
            const asRecord = body as Record<string, unknown>;
            const msg = asRecord['Message'] ?? asRecord['error_description'] ?? asRecord['error'];
            detail = msg !== undefined ? String(msg) : JSON.stringify(body).slice(0, 500);
        } else {
            detail = `HTTP ${response.Status}`;
        }
        return {
            Success: false,
            ErrorMessage: `iMIS ${operation} failed on ${objectName}: ${detail}`,
            StatusCode: response.Status,
        };
    }
}

/** Tree-shaking prevention — import and call from module entry point */
export function LoadIMISConnector(): void { /* no-op */ }
