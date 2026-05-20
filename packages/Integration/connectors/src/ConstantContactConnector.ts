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
 * Constant Contact V3 OAuth 2.0 connection configuration (Authorization Code flow).
 * Access tokens live for 24 hours; refresh tokens rotate on every use and the
 * newest refresh token returned by the token endpoint must be persisted.
 */
export interface ConstantContactConnectionConfig {
    /** OAuth 2.0 Client ID (also called API Key in the Constant Contact developer portal) */
    ClientId: string;
    /** OAuth 2.0 Client Secret (also called App Secret) */
    ClientSecret: string;
    /** Current OAuth 2.0 access token — refreshed automatically when expired */
    AccessToken?: string;
    /** Current OAuth 2.0 refresh token — rotates on every refresh */
    RefreshToken: string;
    /** Redirect URI registered with the app (required by the token endpoint) */
    RedirectUri?: string;

    /** Maximum retries for rate-limited or failed requests. Default: 4 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 60000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 260 (keeps the 4/s rate limit) */
    MinRequestIntervalMs?: number;
}

/** Runtime auth context — carries the bearer token and config for downstream requests. */
interface CCAuthContext extends RESTAuthContext {
    Token: string;
    ExpiresAt: Date;
    Config: ConstantContactConnectionConfig;
    BaseUrl: string;
}

/** OAuth token response envelope. */
interface CCTokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
}

/** _links envelope used on list responses for cursor pagination. */
interface CCLinksEnvelope {
    next?: { href?: string };
    self?: { href?: string };
}

// ─── Constants ─────────────────────────────────────────────────────────

const CC_BASE_URL = 'https://api.cc.email/v3';
const CC_TOKEN_URL = 'https://authz.constantcontact.com/oauth2/default/v1/token';
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
/** Keeps us below the 4 req/sec rate limit (~250ms * 4 = 1 sec). */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 260;
const TOKEN_REFRESH_BUFFER_MS = 60_000;

// ─── Connector ─────────────────────────────────────────────────────────

/**
 * Connector for the Constant Contact V3 REST API.
 *
 * Extends BaseRESTIntegrationConnector so the generic metadata-driven fetch
 * loop handles pagination, template variables, and record normalization.
 *
 * Constant Contact-specific behavior:
 *   - OAuth 2.0 Authorization Code flow with rotating refresh tokens
 *     (the connector persists the newest refresh token after each refresh)
 *   - Cursor pagination via `_links.next.href` (full URL)
 *   - Incremental sync via `updated_after=<iso>` query param on list endpoints
 *   - Async bulk operations via the `/activities` endpoint family (read-only here;
 *     creation of activity jobs is exposed as separate actions)
 *
 * Rate limits: 10,000 calls/day and 4 calls/sec per account.
 * Reference: https://developer.constantcontact.com/api_reference/
 */
@RegisterClass(BaseIntegrationConnector, 'ConstantContactConnector')
export class ConstantContactConnector extends BaseRESTIntegrationConnector {

    private authState: CCAuthContext | null = null;
    private lastRequestTime = 0;
    /** Current watermark for the in-flight FetchChanges — used by AppendDefaultQueryParams */
    private currentWatermark: string | null = null;
    /** Cursor URL returned by the previous page — keeps the base class cursor loop happy. */
    private lastNextCursorUrl: string | null = null;

    // ── Capability flags ────────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }
    public override get IntegrationName(): string { return 'Constant Contact'; }

    // ── Abstract method implementations ─────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        return this.GetAuth(companyIntegration, contextUser);
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const ccAuth = auth as CCAuthContext;
        return {
            'Authorization': `Bearer ${ccAuth.Token}`,
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
        const ccAuth = auth as CCAuthContext;
        const maxRetries = ccAuth.Config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = ccAuth.Config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = ccAuth.Config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        const effectiveHeaders = { ...headers };
        if (body !== undefined && !effectiveHeaders['Content-Type']) {
            effectiveHeaders['Content-Type'] = 'application/json';
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);
            const response = await this.ExecuteFetch(url, method, effectiveHeaders, body, timeoutMs);
            this.lastRequestTime = Date.now();

            if (response.status === 401 && attempt < maxRetries) {
                this.authState = null;
                const fresh = await this.GetAuth(ccAuth.Config);
                ccAuth.Token = fresh.Token;
                ccAuth.ExpiresAt = fresh.ExpiresAt;
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

        throw new Error(`Constant Contact API request failed after ${maxRetries} attempt(s): ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        // Capture cursor link for the next page, regardless of data key
        if (typeof rawBody === 'object' && !Array.isArray(rawBody)) {
            const record = rawBody as Record<string, unknown>;
            const links = record['_links'] as CCLinksEnvelope | undefined;
            this.lastNextCursorUrl = links?.next?.href ?? null;

            if (responseDataKey && Array.isArray(record[responseDataKey])) {
                return record[responseDataKey] as Record<string, unknown>[];
            }

            // Single-object response (e.g., GET /contacts/{id})
            if (!responseDataKey) {
                return [record];
            }

            return [];
        }

        if (Array.isArray(rawBody)) {
            this.lastNextCursorUrl = null;
            return rawBody as Record<string, unknown>[];
        }

        return [];
    }

    protected ExtractPaginationInfo(
        _rawBody: unknown,
        paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };

        const nextUrl = this.lastNextCursorUrl;
        if (!nextUrl) return { HasMore: false };

        return { HasMore: true, NextCursor: nextUrl };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        _auth: RESTAuthContext
    ): string {
        return CC_BASE_URL;
    }

    /**
     * Constant Contact pagination uses a full `_links.next.href` URL. When the
     * engine supplies a cursor that is already an absolute URL we honor it as-is;
     * otherwise we append the `limit` query param to the base path.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        if (cursor && this.IsAbsoluteURL(cursor)) {
            return cursor;
        }
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? 50;
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}limit=${pageSize}`;
    }

    /**
     * Inject watermark filter (updated_after=<iso>) when an incremental sync is active.
     * Skip the injection when the URL is already an absolute cursor URL (the
     * cursor preserves the original filter state on subsequent pages).
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        if (this.IsAbsoluteCursorURL(url)) return url;

        let result = super.AppendDefaultQueryParams(url, obj);
        if (this.currentWatermark && obj.SupportsIncrementalSync) {
            const separator = result.includes('?') ? '&' : '?';
            result = `${result}${separator}updated_after=${encodeURIComponent(this.currentWatermark)}`;
        }
        return result;
    }

    // ── Public API: TestConnection, FetchChanges, CRUD ──────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser, true);
            const url = `${auth.BaseUrl}/account/summary`;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return {
                    Success: true,
                    Message: 'Connected to Constant Contact V3 API',
                    ServerVersion: 'Constant Contact V3',
                };
            }
            return { Success: false, Message: `Constant Contact responded HTTP ${response.Status}` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);

        // For Contacts, custom fields are account-defined. Runtime-discover them
        // so mapping UIs can present them even if they aren't in static metadata.
        if (objectName.toLowerCase() === 'contacts' || objectName.toLowerCase() === 'contact') {
            try {
                const customFieldDefs = await this.FetchCustomFieldDefinitions(companyIntegration, contextUser);
                const customFields = customFieldDefs.map(cf => this.CustomFieldToSchema(cf));
                return this.MergeFieldSchemas(staticFields, customFields);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[Constant Contact] Custom field discovery failed: ${message}`);
            }
        }

        return staticFields;
    }

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue;
        this.lastNextCursorUrl = null;
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
        const path = this.ResolveCRUDPath(ctx.ObjectName);
        const url = `${auth.BaseUrl}${path}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return {
                Success: true,
                ExternalID: this.ExtractIdFromRecord(body, ctx.ObjectName),
                StatusCode: response.Status,
            };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const path = this.ResolveCRUDPath(ctx.ObjectName);
        const url = `${auth.BaseUrl}${path}/${encodeURIComponent(ctx.ExternalID)}`;
        const headers = this.BuildHeaders(auth);
        const method = this.PreferredUpdateMethod(ctx.ObjectName);
        const response = await this.MakeHTTPRequest(auth, url, method, headers, ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const path = this.ResolveCRUDPath(ctx.ObjectName);
        const url = `${auth.BaseUrl}${path}/${encodeURIComponent(ctx.ExternalID)}`;
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
        const path = this.ResolveCRUDPath(ctx.ObjectName);
        const url = `${auth.BaseUrl}${path}/${encodeURIComponent(ctx.ExternalID)}`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return null;
        if (response.Body == null || typeof response.Body !== 'object') return null;

        return {
            ExternalID: ctx.ExternalID,
            ObjectType: ctx.ObjectName,
            Fields: response.Body as Record<string, unknown>,
        };
    }

    // ── Default configuration / field mappings ──────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'ConstantContact',
            DefaultObjects: [],
        };
    }

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Contacts':
                return [
                    { SourceFieldName: 'contact_id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'email_address', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'first_name', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'last_name', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'company_name', DestinationFieldName: 'CompanyName' },
                    { SourceFieldName: 'job_title', DestinationFieldName: 'JobTitle' },
                    { SourceFieldName: 'created_at', DestinationFieldName: 'CreatedAt' },
                    { SourceFieldName: 'updated_at', DestinationFieldName: 'UpdatedAt' },
                ];
            case 'ContactLists':
                return [
                    { SourceFieldName: 'list_id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'description', DestinationFieldName: 'Description' },
                    { SourceFieldName: 'membership_count', DestinationFieldName: 'MembershipCount' },
                ];
            case 'EmailCampaigns':
                return [
                    { SourceFieldName: 'campaign_id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'current_status', DestinationFieldName: 'Status' },
                    { SourceFieldName: 'type', DestinationFieldName: 'CampaignType' },
                    { SourceFieldName: 'created_at', DestinationFieldName: 'CreatedAt' },
                    { SourceFieldName: 'updated_at', DestinationFieldName: 'UpdatedAt' },
                ];
            default:
                return [];
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //                         Private helpers
    // ─────────────────────────────────────────────────────────────────

    // ── Auth helpers ────────────────────────────────────────────────

    private async GetAuth(
        source: MJCompanyIntegrationEntity | ConstantContactConnectionConfig,
        contextUser?: UserInfo,
        forceRefresh = false
    ): Promise<CCAuthContext> {
        if (!forceRefresh && this.authState && this.IsTokenValid(this.authState)) {
            return this.authState;
        }
        const config = this.IsConfig(source)
            ? source
            : await this.ParseConfig(source as MJCompanyIntegrationEntity, contextUser);
        this.authState = await this.RefreshAccessToken(config, source as MJCompanyIntegrationEntity, contextUser);
        return this.authState;
    }

    private IsConfig(src: MJCompanyIntegrationEntity | ConstantContactConnectionConfig): src is ConstantContactConnectionConfig {
        return (src as ConstantContactConnectionConfig).ClientId !== undefined
            && (src as ConstantContactConnectionConfig).RefreshToken !== undefined;
    }

    private IsTokenValid(auth: CCAuthContext): boolean {
        return auth.ExpiresAt.getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS;
    }

    private async RefreshAccessToken(
        config: ConstantContactConnectionConfig,
        companyIntegration: MJCompanyIntegrationEntity | null,
        contextUser: UserInfo | undefined
    ): Promise<CCAuthContext> {
        const basicAuth = Buffer.from(`${config.ClientId}:${config.ClientSecret}`).toString('base64');
        const body = new URLSearchParams();
        body.set('grant_type', 'refresh_token');
        body.set('refresh_token', config.RefreshToken);

        const response = await fetch(CC_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: body.toString(),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Constant Contact token refresh failed (${response.status}): ${text.slice(0, 300)}`);
        }

        const payload = await response.json() as CCTokenResponse;
        config.AccessToken = payload.access_token;
        // Refresh tokens rotate — persist the newest one or auth will break on next refresh.
        config.RefreshToken = payload.refresh_token;
        const expiresAt = new Date(Date.now() + (payload.expires_in ?? 86_400) * 1000);

        // Best-effort: persist the rotated refresh token back to the Credential record.
        if (companyIntegration?.CredentialID && contextUser) {
            await this.PersistRotatedRefreshToken(companyIntegration.CredentialID, contextUser, config);
        }

        return {
            Token: payload.access_token,
            ExpiresAt: expiresAt,
            Config: config,
            BaseUrl: CC_BASE_URL,
        };
    }

    /**
     * Persist the newly-rotated refresh token back to the MJ: Credentials record
     * so the next cold-start refresh uses the correct token.
     */
    private async PersistRotatedRefreshToken(
        credentialID: string,
        contextUser: UserInfo,
        config: ConstantContactConnectionConfig
    ): Promise<void> {
        try {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (!loaded || !credential.Values) return;

            const parsed = JSON.parse(credential.Values) as Record<string, string>;
            const updated: Record<string, string> = {
                ...parsed,
                RefreshToken: config.RefreshToken,
            };
            if (config.AccessToken) updated.AccessToken = config.AccessToken;

            credential.Values = JSON.stringify(updated);
            const saved = await credential.Save();
            if (!saved) {
                const detail = credential.LatestResult?.CompleteMessage ?? 'unknown';
                console.warn(`[Constant Contact] Failed to persist rotated refresh token: ${detail}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[Constant Contact] Refresh-token persistence error: ${message}`);
        }
    }

    // ── Configuration parsing ───────────────────────────────────────

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<ConstantContactConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const config = await this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
            if (config) return config;
        }
        if (companyIntegration.Configuration) {
            const parsed = JSON.parse(companyIntegration.Configuration) as Record<string, string>;
            return this.ExtractConfig(parsed);
        }
        throw new Error('Constant Contact connector requires either CredentialID or Configuration JSON');
    }

    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo
    ): Promise<ConstantContactConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        const values = JSON.parse(credential.Values) as Record<string, string>;
        return this.ExtractConfig(values);
    }

    private ExtractConfig(values: Record<string, string>): ConstantContactConnectionConfig {
        const get = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const hit = Object.entries(values).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (hit) return String(hit[1] ?? '');
            }
            return undefined;
        };

        const clientId = get('ClientId', 'clientId', 'client_id', 'apiKey', 'api_key');
        const clientSecret = get('ClientSecret', 'clientSecret', 'client_secret', 'appSecret', 'app_secret');
        const refreshToken = get('RefreshToken', 'refreshToken', 'refresh_token');
        if (!clientId) throw new Error('Constant Contact configuration missing required field: ClientId');
        if (!clientSecret) throw new Error('Constant Contact configuration missing required field: ClientSecret');
        if (!refreshToken) throw new Error('Constant Contact configuration missing required field: RefreshToken');

        return {
            ClientId: clientId,
            ClientSecret: clientSecret,
            RefreshToken: refreshToken,
            AccessToken: get('AccessToken', 'accessToken', 'access_token'),
            RedirectUri: get('RedirectUri', 'redirectUri', 'redirect_uri'),
        };
    }

    // ── Custom field discovery ──────────────────────────────────────

    private async FetchCustomFieldDefinitions(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<Record<string, unknown>[]> {
        const auth = await this.GetAuth(companyIntegration, contextUser);
        const url = `${auth.BaseUrl}/contact_custom_fields?limit=100`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return [];

        const body = response.Body as Record<string, unknown>;
        const arr = body['custom_fields'];
        return Array.isArray(arr) ? arr as Record<string, unknown>[] : [];
    }

    private CustomFieldToSchema(cf: Record<string, unknown>): ExternalFieldSchema {
        const name = String(cf['name'] ?? cf['label'] ?? 'custom_field');
        const label = String(cf['label'] ?? name);
        const type = String(cf['type'] ?? 'string');
        return {
            Name: `custom.${name}`,
            Label: `Custom: ${label}`,
            Description: `Account custom field (type: ${type})`,
            DataType: this.MapCustomFieldType(type),
            IsRequired: false,
            IsUniqueKey: false,
            IsReadOnly: false,
        };
    }

    private MapCustomFieldType(type: string): string {
        switch (type.toLowerCase()) {
            case 'number': return 'decimal';
            case 'boolean': return 'boolean';
            case 'date': return 'date';
            case 'datetime': return 'datetime';
            case 'currency': return 'decimal';
            default: return 'string';
        }
    }

    private MergeFieldSchemas(
        staticFields: ExternalFieldSchema[],
        extra: ExternalFieldSchema[]
    ): ExternalFieldSchema[] {
        const staticNames = new Set(staticFields.map(f => f.Name.toLowerCase()));
        return [...staticFields, ...extra.filter(f => !staticNames.has(f.Name.toLowerCase()))];
    }

    // ── Path + response helpers ─────────────────────────────────────

    /**
     * Map MJ IntegrationObject names to Constant Contact REST paths for CRUD.
     * Object names follow the MJ naming (PascalCase) while the API paths use snake_case.
     */
    private ResolveCRUDPath(objectName: string): string {
        switch (objectName) {
            case 'Contacts': return '/contacts';
            case 'ContactLists': return '/contact_lists';
            case 'ContactCustomFields': return '/contact_custom_fields';
            case 'ContactTags': return '/contact_tags';
            case 'EmailCampaigns': return '/emails';
            case 'EmailCampaignActivities': return '/emails/activities';
            case 'Segments': return '/segments';
            case 'Activities': return '/activities';
            default: return `/${objectName}`;
        }
    }

    /**
     * Some Constant Contact resources accept PATCH for partial updates; most
     * require PUT for full replace. Default to PUT and promote the handful of
     * resources that are known to support PATCH.
     */
    private PreferredUpdateMethod(objectName: string): string {
        const patchSupported = new Set(['ContactCustomFields', 'Segments', 'ContactTags']);
        return patchSupported.has(objectName) ? 'PATCH' : 'PUT';
    }

    private ExtractIdFromRecord(body: Record<string, unknown>, objectName: string): string {
        // Each Constant Contact resource has a named PK; try the most likely ones first.
        const order: Record<string, string[]> = {
            Contacts: ['contact_id'],
            ContactLists: ['list_id'],
            ContactCustomFields: ['custom_field_id'],
            ContactTags: ['tag_id'],
            EmailCampaigns: ['campaign_id'],
            EmailCampaignActivities: ['campaign_activity_id'],
            Segments: ['segment_id'],
            Activities: ['activity_id'],
        };
        const candidates = order[objectName] ?? ['id'];
        for (const key of [...candidates, 'id']) {
            const value = body[key];
            if (value !== undefined && value !== null) return String(value);
        }
        return '';
    }

    private ComputeNewWatermark(records: ExternalRecord[], current: string | null): string | undefined {
        const candidateKeys = ['updated_at', 'edited_at', 'modified_at', 'last_updated_at'];
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

    private IsAbsoluteURL(value: string): boolean {
        return /^https?:\/\//i.test(value);
    }

    private IsAbsoluteCursorURL(url: string): boolean {
        return this.IsAbsoluteURL(url) && url.startsWith(CC_BASE_URL);
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const body = response.Body;
        let detail: string;
        if (typeof body === 'string') {
            detail = body.slice(0, 500);
        } else if (body && typeof body === 'object') {
            const asRecord = body as Record<string, unknown>;
            const msg = asRecord['error_message'] ?? asRecord['message'] ?? asRecord['error_key'];
            detail = msg !== undefined ? String(msg) : JSON.stringify(body).slice(0, 500);
        } else {
            detail = `HTTP ${response.Status}`;
        }
        return {
            Success: false,
            ErrorMessage: `Constant Contact ${operation} failed on ${objectName}: ${detail}`,
            StatusCode: response.Status,
        };
    }
}

/** Tree-shaking prevention — import and call from module entry point */
export function LoadConstantContactConnector(): void { /* no-op */ }
