import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
} from '@memberjunction/core-entities';
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
    type DefaultIntegrationConfig,
} from '@memberjunction/integration-engine';
import * as crypto from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Connection configuration for Mailchimp Marketing API.
 *
 * Mailchimp uses an API key with an embedded data-center suffix
 * (e.g. `abc123def-us20`). The data-center suffix determines the base URL
 * (`https://us20.api.mailchimp.com/3.0`). The optional `ServerPrefix` field
 * overrides auto-detection for keys without a suffix or when using an
 * OAuth bearer token.
 */
export interface MailchimpConnectionConfig {
    /** Mailchimp API key (optionally suffixed with `-<dc>`, e.g. 'abc-us20'). */
    ApiKey: string;
    /** Explicit data-center prefix (e.g. 'us20'). Overrides the auto-parsed suffix. */
    ServerPrefix?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited or transient failures. Default: 5. */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 100. */
    MinRequestIntervalMs?: number;
}

/** Extended auth context carrying Mailchimp config. */
interface MailchimpAuthContext extends RESTAuthContext {
    /** Resolved data-center prefix (e.g. 'us20'). */
    DataCenter: string;
    /** Full parsed config. */
    Config: MailchimpConnectionConfig;
}

/** Mailchimp error response envelope. */
interface MailchimpErrorResponse {
    type?: string;
    title?: string;
    status?: number;
    detail?: string;
    instance?: string;
    errors?: Array<{ field?: string; message?: string }>;
}

/** List-merge-field response shape (used for runtime custom-field discovery). */
interface MailchimpMergeField {
    merge_id: number;
    tag: string;
    name: string;
    type: string;
    required: boolean;
    default_value?: string;
    public?: boolean;
    display_order?: number;
    options?: Record<string, unknown>;
    help_text?: string;
    list_id?: string;
}

/** OAuth2 metadata endpoint response. */
interface MailchimpOAuthMetadata {
    dc?: string;
    role?: string;
    accountname?: string;
    user_id?: number;
    login?: { email?: string; login_name?: string };
    api_endpoint?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const MAILCHIMP_OAUTH_METADATA_URL = 'https://login.mailchimp.com/oauth2/metadata';

/** Default page size for list endpoints (Mailchimp max is 1000). */
const DEFAULT_PAGE_SIZE = 200;

/** Absolute max records per page enforced by the API. */
const MAX_PAGE_SIZE = 1000;

/** Default max retries for 429 / 503 / transient errors. */
const DEFAULT_MAX_RETRIES = 5;

/** Default HTTP timeout (ms). */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default throttle between requests (ms). */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 100;

/** Sentinel token replaced at request time with the active watermark ISO value. */
const WATERMARK_TOKEN = '{watermark}';

// ─── Connector ───────────────────────────────────────────────────────

/**
 * Connector for the Mailchimp Marketing API (v3.0).
 *
 * Data-center discovery:
 *   - API Key with suffix `-<dc>` (e.g. `abc-us20`) → data center `us20`
 *   - Explicit `ServerPrefix` in credentials overrides parsed suffix
 *   - OAuth access tokens (bearer) → fetched from `/oauth2/metadata`
 *
 * Authentication:
 *   HTTP Basic with username=`anystring`, password=`<api_key>`
 *
 * Features:
 *   - Offset/count pagination on all list endpoints
 *   - Hierarchical per-parent endpoints via APIPath template variables
 *     (e.g. `/lists/{list_id}/members`), driven by IO metadata
 *   - Incremental sync via per-endpoint server-side date filters
 *     (e.g. `since_last_changed` for members)
 *   - Runtime custom field discovery (merge fields per-list)
 *   - 429 / 503 exponential backoff; bounded parallelism (10 concurrent, enforced
 *     by the engine via BatchMaxRequestCount metadata, this connector itself is
 *     single-threaded per `MakeHTTPRequest` call)
 */
@RegisterClass(BaseIntegrationConnector, 'MailchimpConnector')
export class MailchimpConnector extends BaseRESTIntegrationConnector {

    // ── State ──────────────────────────────────────────────────────

    /** Cached auth context (resolved once per connector instance). */
    private cachedAuth: MailchimpAuthContext | null = null;

    /** Timestamp of the last HTTP request — used for client-side throttling. */
    private lastRequestTime = 0;

    /** Active watermark for the current FetchChanges call (used to template query params). */
    private currentWatermark: string | null = null;

    // ── Capability getters ────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'Mailchimp'; }

    // ── Default configuration ─────────────────────────────────────

    /** Minimal out-of-box sync proposal — audiences + members. */
    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'Mailchimp',
            DefaultObjects: [
                {
                    SourceObjectName: 'lists',
                    TargetTableName: 'MailchimpList',
                    TargetEntityName: 'Mailchimp Lists',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
                {
                    SourceObjectName: 'lists.members',
                    TargetTableName: 'MailchimpListMember',
                    TargetEntityName: 'Mailchimp List Members',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
                {
                    SourceObjectName: 'campaigns',
                    TargetTableName: 'MailchimpCampaign',
                    TargetEntityName: 'Mailchimp Campaigns',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    // ── TestConnection ────────────────────────────────────────────

    /**
     * Pings the Mailchimp API root to verify connectivity and authentication.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const url = `${this.GetBaseURL(companyIntegration, auth)}/ping`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status >= 200 && response.Status < 300) {
                const body = response.Body as { health_status?: string };
                return {
                    Success: true,
                    Message: `Successfully connected to Mailchimp (${auth.DataCenter}): ${body.health_status ?? 'OK'}`,
                    ServerVersion: 'Mailchimp Marketing API v3.0',
                };
            }
            return {
                Success: false,
                Message: `Mailchimp API returned ${response.Status}: ${this.previewBody(response.Body)}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ── FetchChanges override (watermark templating) ──────────────

    /**
     * Overrides the base implementation to expose the watermark to
     * `AppendDefaultQueryParams`, where the `{watermark}` token is replaced
     * with the active ISO 8601 value.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue;
        try {
            return await super.FetchChanges(ctx);
        } finally {
            this.currentWatermark = null;
        }
    }

    /**
     * Overrides base to substitute the active watermark into query-param templates.
     * Any DefaultQueryParam value equal to `{watermark}` is replaced with the current
     * watermark; when there is no watermark, the param is dropped entirely.
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        if (!obj.DefaultQueryParams) return super.AppendDefaultQueryParams(url, obj);

        let patched = obj.DefaultQueryParams;
        try {
            const parsed = JSON.parse(obj.DefaultQueryParams) as Record<string, string>;
            const resolved: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
                if (v === WATERMARK_TOKEN) {
                    if (this.currentWatermark) resolved[k] = this.currentWatermark;
                    // else: drop — no watermark → skip this filter param
                } else {
                    resolved[k] = v;
                }
            }
            patched = JSON.stringify(resolved);
        } catch {
            // Leave DefaultQueryParams as-is if unparseable — base will warn.
        }

        // Temporarily swap DefaultQueryParams so the base class sees resolved values.
        const originalRaw = obj.DefaultQueryParams;
        try {
            (obj as unknown as { DefaultQueryParams: string }).DefaultQueryParams = patched;
            return super.AppendDefaultQueryParams(url, obj);
        } finally {
            (obj as unknown as { DefaultQueryParams: string }).DefaultQueryParams = originalRaw;
        }
    }

    // ── Runtime custom-field discovery ────────────────────────────

    /**
     * Discovers fields for a Mailchimp object. For `lists.members`, this
     * additionally calls `/lists/{list_id}/merge-fields` on a representative
     * list (the first active list returned by `/lists?count=1`) to surface
     * per-list merge fields as IsCustom fields on top of the static metadata.
     *
     * Merge-field schema varies per audience, so the returned set is a
     * best-effort sample. Production sync should call this per-list.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ReturnType<BaseRESTIntegrationConnector['DiscoverFields']> extends Promise<infer R> ? R : never> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);
        if (objectName !== 'lists.members') return staticFields;

        try {
            const merge = await this.fetchSampleMergeFields(companyIntegration, contextUser);
            const existingNames = new Set(staticFields.map(f => f.Name));
            for (const m of merge) {
                const field = `merge_fields.${m.tag}`;
                if (existingNames.has(field)) continue;
                staticFields.push({
                    Name: field,
                    Label: m.name,
                    Description: `Mailchimp merge field [${m.type}]${m.help_text ? ` — ${m.help_text}` : ''}`,
                    DataType: this.mapMergeTypeToDataType(m.type),
                    IsRequired: Boolean(m.required),
                    IsUniqueKey: false,
                    IsReadOnly: false,
                    IsForeignKey: false,
                    ForeignKeyTarget: null,
                });
            }
        } catch (err) {
            console.warn(`[Mailchimp] Merge-field discovery skipped: ${err instanceof Error ? err.message : String(err)}`);
        }

        return staticFields;
    }

    /**
     * Fetches merge-field definitions from the first active list.
     * Returns an empty array if no lists exist.
     */
    private async fetchSampleMergeFields(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<MailchimpMergeField[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const listsURL = `${base}/lists?count=1&fields=lists.id`;
        const listsResponse = await this.MakeHTTPRequest(auth, listsURL, 'GET', this.BuildHeaders(auth));
        const listsBody = listsResponse.Body as { lists?: Array<{ id?: string }> };
        const listId = listsBody.lists?.[0]?.id;
        if (!listId) return [];

        const mergeURL = `${base}/lists/${encodeURIComponent(listId)}/merge-fields?count=${MAX_PAGE_SIZE}`;
        const mergeResponse = await this.MakeHTTPRequest(auth, mergeURL, 'GET', this.BuildHeaders(auth));
        const mergeBody = mergeResponse.Body as { merge_fields?: MailchimpMergeField[] };
        return mergeBody.merge_fields ?? [];
    }

    /** Maps a Mailchimp merge-field type string to a generic DataType label. */
    private mapMergeTypeToDataType(mergeType: string): string {
        switch (mergeType.toLowerCase()) {
            case 'number': return 'decimal';
            case 'date': case 'birthday': return 'date';
            case 'address': return 'address';
            case 'phone': return 'phone';
            case 'url': case 'imageurl': return 'url';
            case 'zip': return 'string';
            case 'dropdown': case 'radio': return 'string';
            default: return 'string';
        }
    }

    // ── CRUD ───────────────────────────────────────────────────────

    /**
     * Creates a new record. For `lists.members`, uses upsert semantics
     * (PUT with subscriber hash) when an `email_address` is supplied.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const path = this.resolveObjectPath(ctx.ObjectName, ctx.Attributes);
        const method = this.isListMembersUpsert(ctx.ObjectName, ctx.Attributes) ? 'PUT' : 'POST';
        const url = this.buildCrudURL(base, path, method === 'PUT', ctx.Attributes);
        return this.executeCRUD(auth, url, method, ctx.Attributes, ctx.ObjectName, 'CreateRecord');
    }

    /**
     * Updates an existing record via PATCH (partial update).
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const path = this.resolveObjectPath(ctx.ObjectName, ctx.Attributes);
        const url = `${base}/${path}/${encodeURIComponent(ctx.ExternalID)}`;
        return this.executeCRUD(auth, url, 'PATCH', ctx.Attributes, ctx.ObjectName, 'UpdateRecord');
    }

    /**
     * Deletes (or archives) a record via DELETE.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const path = this.resolveObjectPath(ctx.ObjectName, {});
        const url = `${base}/${path}/${encodeURIComponent(ctx.ExternalID)}`;
        return this.executeCRUD(auth, url, 'DELETE', null, ctx.ObjectName, 'DeleteRecord');
    }

    /**
     * Retrieves a single record by ID.
     */
    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const path = this.resolveObjectPath(ctx.ObjectName, {});
        const url = `${base}/${path}/${encodeURIComponent(ctx.ExternalID)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status === 404) return null;
        if (response.Status < 200 || response.Status >= 300) return null;
        const body = response.Body as Record<string, unknown>;
        return {
            ExternalID: String(body['id'] ?? ctx.ExternalID),
            ObjectType: ctx.ObjectName,
            Fields: body,
        };
    }

    /** Searches via Mailchimp's `search-members` / `search-campaigns` helpers when available. */
    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const pageSize = Math.min(ctx.PageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const offset = ctx.Page != null && ctx.Page > 1 ? (ctx.Page - 1) * pageSize : 0;

        const queryParts = Object.entries(ctx.Filters).map(
            ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
        );
        queryParts.push(`count=${pageSize}`, `offset=${offset}`);
        const url = `${base}/${ctx.ObjectName}?${queryParts.join('&')}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) {
            return { Records: [], TotalCount: 0, HasMore: false };
        }
        const body = response.Body as { total_items?: number } & Record<string, unknown>;
        const records = this.extractCollection(body, ctx.ObjectName);
        return {
            Records: records.map(r => ({
                ExternalID: String(r['id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: r,
            })),
            TotalCount: typeof body.total_items === 'number' ? body.total_items : records.length,
            HasMore: records.length >= pageSize,
        };
    }

    /** Cursor-free paginated listing using offset/count. */
    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const base = this.GetBaseURL(companyIntegration, auth);
        const pageSize = Math.min(ctx.PageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const cursorOffset = ctx.Cursor ? parseInt(ctx.Cursor, 10) : 0;

        const params: string[] = [`count=${pageSize}`, `offset=${cursorOffset}`];
        if (ctx.Filter) {
            for (const [k, v] of Object.entries(ctx.Filter)) {
                params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
            }
        }
        const url = `${base}/${ctx.ObjectName}?${params.join('&')}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) {
            return { Records: [], HasMore: false };
        }
        const body = response.Body as Record<string, unknown>;
        const records = this.extractCollection(body, ctx.ObjectName);
        const hasMore = records.length >= pageSize;
        return {
            Records: records.map(r => ({
                ExternalID: String(r['id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: r,
            })),
            HasMore: hasMore,
            NextCursor: hasMore ? String(cursorOffset + records.length) : undefined,
        };
    }

    // ── BaseRESTIntegrationConnector implementations ─────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<MailchimpAuthContext> {
        if (this.cachedAuth) return this.cachedAuth;
        const config = await this.parseConfig(companyIntegration, contextUser);
        const dc = await this.resolveDataCenter(config);
        const auth: MailchimpAuthContext = {
            Token: config.ApiKey,
            DataCenter: dc,
            Config: config,
        };
        this.cachedAuth = auth;
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const mc = auth as MailchimpAuthContext;
        // Mailchimp supports HTTP Basic (username=anystring, password=api_key)
        // OR Bearer <access_token> for OAuth2 tokens.
        const isBearer = mc.Config.ApiKey.startsWith('Bearer ');
        if (isBearer) {
            return {
                'Authorization': mc.Config.ApiKey,
                'Accept': 'application/json',
            };
        }
        const basic = Buffer.from(`mj:${mc.Config.ApiKey}`).toString('base64');
        return {
            'Authorization': `Basic ${basic}`,
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
        const mc = auth as MailchimpAuthContext;
        const maxRetries = mc.Config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = mc.Config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = mc.Config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        const finalHeaders = { ...headers };
        if (body !== undefined && !finalHeaders['Content-Type']) {
            finalHeaders['Content-Type'] = 'application/json';
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.throttle(minInterval);
            const response = await this.fetchWithTimeout(url, method, finalHeaders, body, timeoutMs);
            this.lastRequestTime = Date.now();

            if (response.status === 429 || response.status === 503) {
                const delayMs = this.computeBackoff(response, attempt);
                console.warn(`[Mailchimp] ${response.status} ${method} ${url} — retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                await this.sleep(delayMs);
                continue;
            }

            const parsed = await this.parseResponseBody(response);
            return {
                Status: response.status,
                Body: parsed,
                Headers: this.headersToRecord(response.headers),
            };
        }

        throw new Error(`Mailchimp API request failed after ${maxRetries} retries: ${method} ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (!rawBody) return [];

        // If response is the raw array itself
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];

        if (!responseDataKey) return [rawBody as Record<string, unknown>];

        const body = rawBody as Record<string, unknown>;
        const direct = body[responseDataKey];
        if (Array.isArray(direct)) return direct as Record<string, unknown>[];

        // Common alternates for certain endpoints
        for (const alt of ['lists', 'members', 'campaigns', 'orders', 'customers',
                           'products', 'variants', 'templates', 'segments',
                           'emails', 'folders', 'files', 'reports', 'automations',
                           'interest_categories', 'interests', 'webhooks',
                           'merge_fields', 'tags', 'goals', 'notes', 'messages',
                           'conversations', 'queue', 'feedback', 'activity',
                           'carts', 'promo_rules', 'promo_codes', 'results']) {
            const val = body[alt];
            if (Array.isArray(val)) return val as Record<string, unknown>[];
        }

        // Single-object response
        return [body];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };

        const body = rawBody as { total_items?: number };
        const total = typeof body?.total_items === 'number' ? body.total_items : undefined;
        const records = this.NormalizeResponse(rawBody, null);
        const fetched = records.length;

        if (paginationType === 'Offset') {
            const nextOffset = currentOffset + fetched;
            const hasMore = total != null ? nextOffset < total : fetched >= pageSize;
            return {
                HasMore: hasMore,
                NextOffset: hasMore ? nextOffset : undefined,
                TotalRecords: total,
            };
        }

        if (paginationType === 'PageNumber') {
            const hasMore = fetched >= pageSize;
            return {
                HasMore: hasMore,
                NextPage: hasMore ? currentPage + 1 : undefined,
                TotalRecords: total,
            };
        }

        return { HasMore: false };
    }

    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = Math.min(effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}count=${pageSize}&offset=${offset}`;
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        const mc = auth as MailchimpAuthContext;
        return `https://${mc.DataCenter}.api.mailchimp.com/3.0`;
    }

    // ─── Helpers ──────────────────────────────────────────────────

    /** Parses credentials from the attached MJ Credential or the Configuration JSON. */
    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<MailchimpConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.loadFromCredential(credentialID, contextUser);
            if (fromCred) return fromCred;
        }

        const configJson = companyIntegration.Configuration;
        if (configJson) return this.parseConfigJson(configJson);

        throw new Error('Mailchimp connector: no credentials or Configuration JSON found on CompanyIntegration.');
    }

    /** Loads the credential entity and parses its Values JSON. */
    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MailchimpConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        try {
            return this.parseConfigJson(credential.Values);
        } catch {
            return null;
        }
    }

    /** Parses and validates a Mailchimp config JSON string. */
    private parseConfigJson(json: string): MailchimpConnectionConfig {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const apiKey = (parsed['ApiKey'] ?? parsed['apiKey'] ?? parsed['API_Key']) as string | undefined;
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('Mailchimp config must include a non-empty ApiKey.');
        }
        const parseInt32 = (k: string): number | undefined => {
            const raw = parsed[k];
            if (raw == null) return undefined;
            const n = Number(raw);
            return Number.isFinite(n) ? Math.floor(n) : undefined;
        };
        return {
            ApiKey: apiKey,
            ServerPrefix: typeof parsed['ServerPrefix'] === 'string'
                ? parsed['ServerPrefix'] as string
                : undefined,
            MaxRetries: parseInt32('MaxRetries'),
            RequestTimeoutMs: parseInt32('RequestTimeoutMs'),
            MinRequestIntervalMs: parseInt32('MinRequestIntervalMs'),
        };
    }

    /**
     * Resolves the data-center prefix (e.g. 'us20') using:
     *   1. Explicit `ServerPrefix` config field
     *   2. Suffix after the last '-' in the API key (e.g. 'abc-us20' → 'us20')
     *   3. OAuth metadata endpoint lookup (fallback for bearer tokens)
     */
    private async resolveDataCenter(config: MailchimpConnectionConfig): Promise<string> {
        if (config.ServerPrefix) return config.ServerPrefix;
        const parsed = this.parseDataCenterFromKey(config.ApiKey);
        if (parsed) return parsed;
        return this.fetchDataCenterFromOAuthMetadata(config.ApiKey);
    }

    /** Extracts '<dc>' from a Mailchimp API key of the form '<secret>-<dc>'. */
    private parseDataCenterFromKey(apiKey: string): string | null {
        const idx = apiKey.lastIndexOf('-');
        if (idx < 0 || idx >= apiKey.length - 1) return null;
        const suffix = apiKey.slice(idx + 1).toLowerCase();
        if (!/^[a-z]{2}\d{1,3}$/.test(suffix)) return null;
        return suffix;
    }

    /** Calls `/oauth2/metadata` to discover the data center for a bearer token. */
    private async fetchDataCenterFromOAuthMetadata(token: string): Promise<string> {
        const bearer = token.startsWith('Bearer ') ? token : `OAuth ${token}`;
        const response = await fetch(MAILCHIMP_OAUTH_METADATA_URL, {
            method: 'GET',
            headers: { 'Authorization': bearer, 'Accept': 'application/json' },
        });
        if (!response.ok) {
            throw new Error(`Mailchimp /oauth2/metadata returned ${response.status}; cannot resolve data center. Set ServerPrefix explicitly.`);
        }
        const body = await response.json() as MailchimpOAuthMetadata;
        if (!body.dc) {
            throw new Error('Mailchimp /oauth2/metadata did not include a dc field.');
        }
        return body.dc;
    }

    /**
     * Resolves the object name to an API path, substituting template vars from the
     * provided attribute bag (e.g. `lists.members` → `lists/<list_id>/members`).
     * For objects without template vars, returns the dotted path as a slash path.
     */
    private resolveObjectPath(objectName: string, attributes: Record<string, unknown>): string {
        // Dotted name like `ecommerce.stores.orders` → slash path
        const pathSegments = objectName.split('.').join('/');

        // Inject template vars from attributes when the segment references a known parent id
        // Convention: the attribute key matches the path template var name (list_id, store_id, campaign_id, etc.)
        return pathSegments.replace(/\{([^}]+)\}/g, (_m, varName) => {
            const val = attributes[varName];
            if (val == null) return `{${varName}}`;
            return encodeURIComponent(String(val));
        });
    }

    /** True when creating a list member with an email and the object is `lists.members`. */
    private isListMembersUpsert(objectName: string, attributes: Record<string, unknown>): boolean {
        if (objectName !== 'lists.members') return false;
        return typeof attributes['email_address'] === 'string' && (attributes['email_address'] as string).length > 0;
    }

    /**
     * Builds the CRUD URL. When doing a member upsert, appends the computed
     * subscriber hash as the trailing path segment.
     */
    private buildCrudURL(
        base: string,
        path: string,
        isUpsertByHash: boolean,
        attributes: Record<string, unknown>
    ): string {
        if (!isUpsertByHash) return `${base}/${path}`;
        const email = String(attributes['email_address']);
        const hash = this.computeSubscriberHash(email);
        return `${base}/${path}/${hash}`;
    }

    /** Mailchimp subscriber hash — MD5 of the lowercased email address. */
    private computeSubscriberHash(email: string): string {
        return crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
    }

    /**
     * Executes a CRUD HTTP request and maps the response to a CRUDResult.
     */
    private async executeCRUD(
        auth: MailchimpAuthContext,
        url: string,
        method: string,
        body: unknown,
        objectName: string,
        operation: string
    ): Promise<CRUDResult> {
        try {
            const response = await this.MakeHTTPRequest(auth, url, method, this.BuildHeaders(auth), body ?? undefined);
            if (response.Status >= 200 && response.Status < 300) {
                const created = response.Body as Record<string, unknown>;
                return {
                    Success: true,
                    ExternalID: String(created?.['id'] ?? ''),
                    StatusCode: response.Status,
                };
            }
            return {
                Success: false,
                ErrorMessage: `[Mailchimp] ${operation} ${objectName} failed (HTTP ${response.Status}): ${this.extractErrorMessage(response.Body)}`,
                StatusCode: response.Status,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                ErrorMessage: `[Mailchimp] ${operation} ${objectName} failed: ${message}`,
                StatusCode: 500,
            };
        }
    }

    /** Extracts an error message from a Mailchimp error body. */
    private extractErrorMessage(body: unknown): string {
        if (body && typeof body === 'object') {
            const err = body as MailchimpErrorResponse;
            if (err.title || err.detail) {
                return [err.title, err.detail].filter(Boolean).join(' — ');
            }
        }
        return this.previewBody(body);
    }

    /** Best-effort collection extractor for search/list fallbacks. */
    private extractCollection(body: Record<string, unknown>, objectName: string): Record<string, unknown>[] {
        // Try the last path segment of the object name first
        const last = objectName.split('.').pop() ?? objectName;
        const direct = body[last];
        if (Array.isArray(direct)) return direct as Record<string, unknown>[];
        const normalized = this.NormalizeResponse(body, null);
        return normalized.filter(r => typeof r === 'object');
    }

    /** Enforces a minimum inter-request interval. */
    private async throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.sleep(minIntervalMs - elapsed);
        }
    }

    /** Executes a fetch with an abort-based timeout. */
    private async fetchWithTimeout(
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
                body: body === undefined || body === null
                    ? undefined
                    : typeof body === 'string' ? body : JSON.stringify(body),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }
    }

    /** Parses the response body as JSON; falls back to text. */
    private async parseResponseBody(response: Response): Promise<unknown> {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json') || contentType.includes('application/problem+json')) {
            try {
                return await response.json() as unknown;
            } catch {
                return null;
            }
        }
        try {
            return await response.text();
        } catch {
            return null;
        }
    }

    /** Converts response Headers to a lowercase-keyed record. */
    private headersToRecord(headers: Headers): Record<string, string> {
        const out: Record<string, string> = {};
        headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
        return out;
    }

    /** Computes exponential backoff delay, honoring Retry-After when present. */
    private computeBackoff(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number(retryAfter);
            if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 60_000);
        }
        const base = 500 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        return Math.min(base + jitter, 30_000);
    }

    /** Sleep helper. */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Short preview of a response body for error messages. */
    private previewBody(body: unknown): string {
        if (body == null) return '(no body)';
        if (typeof body === 'string') return body.slice(0, 400);
        try { return JSON.stringify(body).slice(0, 400); } catch { return String(body).slice(0, 400); }
    }
}

/** Tree-shaking prevention — call from module entry point. */
export function LoadMailchimpConnector(): void { /* no-op */ }
