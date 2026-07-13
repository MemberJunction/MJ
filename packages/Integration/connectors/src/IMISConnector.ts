/**
 * IMISConnector — Integration connector for iMIS EMS (Advanced Solutions International)
 * REST API.
 *
 * ── Auth: OAuth 2.0 PASSWORD grant (resource-owner) ─────────────────────────
 *   Mints/refreshes a bearer ACCESS TOKEN via the shared {@link OAuth2TokenManager}
 *   (no inlined token/crypto logic). iMIS issues tokens via the resource-owner
 *   `grant_type=password` flow — username + password POSTed to the token endpoint:
 *     - default  = `{BaseURL}/token`
 *     - override  = the credential's `TokenURL` (when supplied)
 *     - fallback  = the legacy `{BaseURL}/asiScheduler/token` path (older iMIS builds)
 *   iMIS does NOT require client_id/client_secret for the password grant, so the
 *   OAuth2TokenManager request is configured with empty client credentials in the
 *   body. Every API request sends `Authorization: Bearer {accessToken}`.
 *
 * ── Base URL ────────────────────────────────────────────────────────────────
 *   Comes from the credential's `BaseURL` (the tenant's iMIS API endpoint) — never
 *   a hardcoded host. Credential bytes are resolved at runtime, never at build.
 *
 * ── Catalog (metadata-driven, NOT hardcoded) ───────────────────────────────
 *   The Declared core object/field set comes from the seeded metadata loaded into
 *   the IntegrationEngineBase cache. The connector NEVER bakes an object/field catalog
 *   into code. DiscoverObjects/DiscoverFields express only the MECHANISM: they call the
 *   auth-gated /EntityDefinition + /{entity}/metadata endpoints at runtime to enumerate
 *   the tenant's Business-Object catalog + per-object fields, ADDITIVE to the Declared
 *   baseline. DiscoveryIsAuthoritative stays false (default) — these scoped enumerations
 *   never deactivate Declared metadata on absence.
 *
 * ── Pagination & incremental ───────────────────────────────────────────────
 *   iMIS uses the PagedResult envelope (`{ Items, Offset, Limit, Count, HasNext }`) with
 *   capitalized `Offset`/`Limit` query params; ExtractPaginationInfo reads HasNext/Offset/Limit
 *   and advances Offset by the returned count until HasNext is false. NormalizeResponse
 *   unwraps the Items collection. Incremental sync is metadata-driven: an IO with
 *   SupportsIncrementalSync=true emits its `IncrementalWatermarkField` as a `gt:` filter.
 *
 * ── Write ───────────────────────────────────────────────────────────────────
 *   CRUD rides the generic BaseRESTIntegrationConnector per-operation path: Create/Update/Delete
 *   read the per-operation IO columns (CreateAPIPath/Method/BodyShape/BodyKey/IDLocation, Update*,
 *   Delete*), creates route through BuildCreatedResult (fail loudly on empty ID), and DeleteMethod
 *   is metadata-driven (not assumed DELETE). Capability flags follow the per-operation columns the
 *   metadata declares — no hardcoded `true`, no 501 stubs. Full-record pass-through (Fields=raw).
 *
 * Reference: https://developer.imis.com/docs/imis-rest-api-data-models-and-swagger-json-files
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth2TokenManager,
    type OAuth2TokenRequest,
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
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

// ─── Configuration & Auth Types ──────────────────────────────────────

/**
 * iMIS REST API connection configuration, parsed from the attached MJ Credential
 * (preferred) or the CompanyIntegration.Configuration JSON. Field names are read
 * case-insensitively. NONE of these values are read at build time — they are resolved
 * from the bound credential at runtime.
 */
export interface IMISConnectionConfig {
    /** Full base URL to the tenant's iMIS API (no trailing slash). */
    BaseURL: string;
    /** API username (must hold the iMIS RemoteService/IqaUser role) for the password grant. */
    Username: string;
    /** API password for the password grant. */
    Password: string;
    /** Optional token-endpoint override; defaults to `{base}/token` (legacy `/asiScheduler/token` fallback). */
    TokenURL?: string;
    /** Optional OAuth client identifier (iMIS password grant does not require it). */
    ClientId?: string;
    /** Optional OAuth client secret. */
    ClientSecret?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited / transient failures. Default 3. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default 60000. */
    RequestTimeoutMs?: number;
    /** Minimum ms between requests. Default 200. */
    MinRequestIntervalMs?: number;
}

/** Extended REST auth context carrying the resolved bearer token + config. */
interface IMISAuthContext extends RESTAuthContext {
    /** Bearer access token (from {@link OAuth2TokenManager}). */
    Token: string;
    /** Resolved base URL (no trailing slash). */
    BaseUrl: string;
    /** Parsed connection config for reference in MakeHTTPRequest. */
    Config: IMISConnectionConfig;
}

/** iMIS PagedResult envelope for list responses. */
interface IMISPagedResult {
    $type?: string;
    Items?: Record<string, unknown>[];
    Offset?: number;
    Limit?: number;
    Count?: number;
    HasNext?: boolean;
}

/** A single EntityDefinition record (runtime-discovered Business Object). */
interface IMISEntityDefinition {
    Name?: string;
    DisplayName?: string;
    Description?: string;
}

/** The /{entity}/metadata response (entity metadata with PropertyDefinitions). */
interface IMISEntityMetadata {
    Name?: string;
    Description?: string;
    PropertyDefinitions?: IMISPropertyDefinition[];
}

/** A single PropertyDefinition in /{entity}/metadata. */
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

// ─── Constants ───────────────────────────────────────────────────────

/** The canonical MJ: Integrations.Name — part of the three-way invariant. */
const INTEGRATION_NAME = 'iMIS';

/** Default token endpoint path appended to the base when no TokenURL override is supplied. */
const DEFAULT_TOKEN_PATH = '/token';
/** Legacy token endpoint path for older iMIS deployments (documented fallback). */
const LEGACY_TOKEN_PATH = '/asiScheduler/token';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;
const DEFAULT_PAGE_SIZE = 100;

/** iMIS-to-generic type mapping used when merging live-discovered field metadata. */
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

// ─── Connector Implementation ────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'IMISConnector')
export class IMISConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run. */
    private authCache: IMISAuthContext | null = null;

    /** Shared OAuth2 token manager — owns the token round-trip + cache. */
    private readonly tokenManager = new OAuth2TokenManager();

    /** Timestamp of the last API request, for client-side throttling. */
    private lastRequestTime = 0;

    /** Current watermark value, emitted as the IO's IncrementalWatermarkField on the request. */
    private currentWatermark: string | undefined;

    // Returns the EXACT MJ: Integrations.Name string LITERAL so the T1 ThreeWayName invariant can
    // statically parse the getter's returned value from connector source.
    public override get IntegrationName(): string { return 'iMIS'; }

    // ── Capability getters: METADATA-DRIVEN (no hardcoded answer) ─────
    //
    // Write capability FOLLOWS the per-operation CRUD columns on the cached IntegrationObjects
    // (Declared metadata). An object is create-capable when it declares both CreateAPIPath +
    // CreateMethod; same for update/delete. With no write metadata authored the surface is
    // read-only (returns false) — but the moment a writable object's per-operation columns are
    // populated, the capability flips on and the base generic CRUD path executes it.

    public override get SupportsCreate(): boolean {
        return this.anyObjectDeclares(o => !!o.CreateAPIPath && !!o.CreateMethod);
    }
    public override get SupportsUpdate(): boolean {
        return this.anyObjectDeclares(o => !!o.UpdateAPIPath && !!o.UpdateMethod);
    }
    public override get SupportsDelete(): boolean {
        return this.anyObjectDeclares(o => !!o.DeleteAPIPath && !!o.DeleteMethod);
    }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }

    /** True when any cached IntegrationObject satisfies the predicate. []→false when the engine
     *  cache is unavailable (e.g. capability probed before configuration) — fail-safe read-only. */
    private anyObjectDeclares(pred: (o: MJIntegrationObjectEntity) => boolean): boolean {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName(INTEGRATION_NAME);
        if (!integration) return false;
        return IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID).some(pred);
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    /**
     * OAuth 2.0 password-grant authentication. Mints/refreshes the access token via the shared
     * {@link OAuth2TokenManager} (no inlined token/crypto logic). One token exchange per run is
     * cached and reused across every request.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const baseUrl = this.ResolveBaseUrl(config);
        const token = await this.MintToken(config, baseUrl);

        const auth: IMISAuthContext = { Token: token, BaseUrl: baseUrl, Config: config };
        this.authCache = auth;
        return auth;
    }

    /**
     * Runs the password-grant token round-trip through OAuth2TokenManager. Tries the resolved
     * token endpoint first, then the legacy `/asiScheduler/token` path on failure (older iMIS).
     */
    private async MintToken(config: IMISConnectionConfig, baseUrl: string): Promise<string> {
        const primaryURL = this.ResolveTokenURL(config, baseUrl);
        const req = this.BuildTokenRequest(config, primaryURL);
        try {
            const token = await this.tokenManager.GetAccessToken(req, 'password');
            return token.AccessToken;
        } catch (primaryErr) {
            // Legacy fallback only when no explicit override was given and the legacy path differs.
            const legacyURL = `${baseUrl}${LEGACY_TOKEN_PATH}`;
            if (config.TokenURL || legacyURL === primaryURL) throw primaryErr;
            this.tokenManager.Reset();
            const token = await this.tokenManager.GetAccessToken(
                { ...req, TokenURL: legacyURL }, 'password'
            );
            return token.AccessToken;
        }
    }

    /** Builds the OAuth2 password-grant request. iMIS does not require client credentials. */
    private BuildTokenRequest(config: IMISConnectionConfig, tokenURL: string): OAuth2TokenRequest {
        return {
            TokenURL: tokenURL,
            ClientId: config.ClientId ?? '',
            ClientSecret: config.ClientSecret ?? '',
            Username: config.Username,
            Password: config.Password,
            TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
    }

    /**
     * Extracts the new record's external ID from a create response. iMIS returns the created
     * object with a vendor-specific ID field (Id / PartyId / EventId / InvoiceId / …); the base
     * scanner only knows the generic `id` family, so widen it for iMIS's `{Object}Id` convention.
     * The empty-ID case still routes through BuildCreatedResult, which fails loudly.
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        if ((!idLocation || idLocation === 'body') && response.Body && typeof response.Body === 'object') {
            const b = response.Body as Record<string, unknown>;
            const candidates = ['Id', 'ID', 'PartyId', 'UniformId', 'EventId', 'InvoiceId', 'PaymentId', 'id', 'externalID', 'ExternalID'];
            for (const k of candidates) {
                const v = b[k];
                if (typeof v === 'string' || typeof v === 'number') {
                    const s = String(v).trim();
                    if (s.length > 0) return s;
                }
            }
            return undefined;
        }
        return super.ExtractIDFromResponse(response, idLocation);
    }

    /** Sends the OAuth2 bearer token on every request. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as IMISAuthContext).Token ?? auth.Token ?? '';
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as IMISAuthContext).BaseUrl;
    }

    /**
     * Unwraps the iMIS PagedResult envelope to the Items collection. Handles the envelope,
     * an explicit responseDataKey, a raw array, and a single-object detail response. The FULL
     * source record passes through (no field filtering) so the framework's custom-column capture
     * sees everything the source returned.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        // PagedResult envelope → Items (ResponseDataKey is typically "Items")
        if (this.IsPagedResult(rawBody)) {
            return (rawBody as IMISPagedResult).Items ?? [];
        }

        if (responseDataKey) {
            const record = rawBody as Record<string, unknown>;
            const data = record[responseDataKey];
            if (Array.isArray(data)) return data as Record<string, unknown>[];
        }

        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];

        // Single-object detail response (GET /{Entity}/{id}).
        return [rawBody as Record<string, unknown>];
    }

    /**
     * Derives Offset/Limit pagination state from the iMIS PagedResult envelope: advance Offset by
     * the number of Items returned and continue while HasNext is true (terminate when HasNext is false).
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };

        const envelope = this.IsPagedResult(rawBody) ? rawBody as IMISPagedResult : null;
        if (!envelope) {
            // No PagedResult envelope → cannot advance → no more pages.
            return { HasMore: false };
        }

        const returnedCount = envelope.Items?.length ?? 0;
        const hasMore = (envelope.HasNext ?? false) && returnedCount > 0;
        const nextOffset = (envelope.Offset ?? currentOffset) + returnedCount;

        return {
            HasMore: hasMore,
            NextOffset: paginationType === 'Offset' ? nextOffset : undefined,
            NextPage: paginationType === 'PageNumber' ? currentPage + 1 : undefined,
            TotalRecords: envelope.Count,
        };
    }

    /**
     * iMIS pagination uses capitalized `Offset` / `Limit` query parameters. Override the base
     * helper to match iMIS's param names.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
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
     * Injects the incremental watermark filter when a sync is active. The param NAME is fully
     * METADATA-DRIVEN: it comes from the IO's `IncrementalWatermarkField` and is emitted only when
     * SupportsIncrementalSync=true AND a watermark value is in context. iMIS accepts operator-prefixed
     * filter values (`gt:`) on list endpoints.
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        let result = super.AppendDefaultQueryParams(url, obj);
        const watermarkField = obj.IncrementalWatermarkField;
        if (obj.SupportsIncrementalSync && watermarkField && this.currentWatermark) {
            const separator = result.includes('?') ? '&' : '?';
            const param = `${encodeURIComponent(watermarkField)}=${encodeURIComponent('gt:' + this.currentWatermark)}`;
            result = `${result}${separator}${param}`;
        }
        return result;
    }

    /** Executes an HTTP request with client-side throttling + retry for 401/429/5xx. */
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

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.ThrottleIfNeeded(minInterval);

            const fetchOptions: RequestInit = {
                method,
                headers: effectiveHeaders,
                signal: AbortSignal.timeout(timeoutMs),
            };
            if (body !== undefined && method !== 'GET') {
                fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            }

            let response: Response;
            try {
                response = await fetch(url, fetchOptions);
            } catch (err) {
                if (attempt < maxRetries && this.IsTransientNetworkError(err)) {
                    await this.Sleep(this.BackoffDelay(attempt));
                    continue;
                }
                throw err;
            }
            this.lastRequestTime = Date.now();

            // Token expired mid-run — force a fresh mint and retry once with the new bearer.
            if (response.status === 401 && attempt < maxRetries) {
                this.tokenManager.Reset();
                this.authCache = null;
                const fresh = await this.MintToken(imisAuth.Config, imisAuth.BaseUrl);
                imisAuth.Token = fresh;
                this.authCache = imisAuth;
                effectiveHeaders['Authorization'] = `Bearer ${fresh}`;
                continue;
            }

            if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
                console.warn(`[iMIS] HTTP ${response.status} from ${url} — backing off`);
                await this.Sleep(this.RetryAfterMs(response) ?? this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`iMIS request failed after ${maxRetries + 1} attempts: ${url}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by minting a password-grant token and listing one Party record. A 2xx
     * confirms the OAuth2 credentials + base URL are valid against the live API.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as IMISAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.BaseUrl}/Party?Limit=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `iMIS returned HTTP ${response.Status} from ${url}` };
            }
            return {
                Success: true,
                Message: `Connected to iMIS EMS at ${auth.BaseUrl}`,
                ServerVersion: this.ExtractServerVersion(response.Headers),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (metadata-driven baseline + runtime mechanism) ────

    /**
     * Discovers objects: the Declared core baseline from the IntegrationEngineBase cache, ADDITIVELY
     * extended at runtime via the auth-gated /EntityDefinition endpoint (the tenant's customer
     * Business-Object catalog). The catalog is NEVER baked into code — DiscoverObjects expresses only
     * the discovery MECHANISM. Failures degrade gracefully to the Declared baseline.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const declared = await super.DiscoverObjects(companyIntegration, contextUser);
        const declaredNames = new Set(declared.map(o => o.Name.toLowerCase()));

        try {
            const discovered = await this.DiscoverEntityDefinitions(companyIntegration, contextUser);
            const additive = discovered.filter(d => !declaredNames.has(d.Name.toLowerCase()));
            return [...declared, ...additive];
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[iMIS] EntityDefinition discovery failed, returning declared objects only: ${message}`);
            return declared;
        }
    }

    /**
     * Discovers fields: the Declared baseline from the cache, ADDITIVELY extended at runtime via the
     * auth-gated /{entity}/metadata endpoint (the tenant's PropertyDefinitions). The field set is
     * NEVER baked in code. Failures degrade gracefully to the Declared baseline.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const declared = await super.DiscoverFields(companyIntegration, objectName, contextUser);

        try {
            const live = await this.DiscoverFieldsFromLiveAPI(companyIntegration, objectName, contextUser);
            return this.MergeFieldSchemas(declared, live);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[iMIS] Live field discovery failed for "${objectName}", returning declared fields: ${message}`);
            return declared;
        }
    }

    // ─── FetchChanges override (watermark wiring) ────────────────────

    /**
     * Sets the watermark context the URL builder needs, delegates the walk to the base (which handles
     * pagination + nested template-var paths), then advances the watermark from the returned records
     * on the FINAL batch only (partial-failure-safe — a mid-stream failure leaves the watermark unchanged).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue ?? undefined;
        try {
            const result = await super.FetchChanges(ctx);
            const isFinal = !result.HasMore;
            result.NewWatermarkValue = isFinal
                ? this.ComputeNewWatermark(result.Records, ctx.WatermarkValue)
                : undefined;
            return result;
        } finally {
            this.currentWatermark = undefined;
        }
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

    // ── Runtime discovery (Business Objects + field metadata) ───────

    private async DiscoverEntityDefinitions(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = (await this.Authenticate(companyIntegration, contextUser)) as IMISAuthContext;
        const url = `${auth.BaseUrl}/EntityDefinition?Limit=500`;
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return [];

        const records = this.NormalizeResponse(response.Body, 'Items') as IMISEntityDefinition[];
        return records
            .filter(d => !!d.Name)
            .map(d => ({
                Name: String(d.Name),
                Label: d.DisplayName ?? String(d.Name),
                Description: d.Description ?? 'Tenant-defined Business Object (runtime-discovered)',
                SupportsIncrementalSync: true,
                SupportsWrite: false,
            }));
    }

    private async DiscoverFieldsFromLiveAPI(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = (await this.Authenticate(companyIntegration, contextUser)) as IMISAuthContext;
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
            // Provable-only: the source explicitly distinguishes PK; only set PK when stated.
            IsPrimaryKey: prop.IsPrimaryKey === true ? true : undefined,
            IsUniqueKey: !!prop.IsPrimaryKey,
            IsReadOnly: !!prop.IsReadOnly,
            MaxLength: prop.MaxLength ?? undefined,
        };
    }

    /**
     * Merge live-discovered fields with the Declared baseline. Live-only fields are appended;
     * Declared fields win on matching names (the curated MJ schema is authoritative for the baseline).
     */
    private MergeFieldSchemas(
        declared: ExternalFieldSchema[],
        live: ExternalFieldSchema[]
    ): ExternalFieldSchema[] {
        const declaredNames = new Set(declared.map(f => f.Name.toLowerCase()));
        const liveOnly = live.filter(f => !declaredNames.has(f.Name.toLowerCase()));
        return [...declared, ...liveOnly];
    }

    /**
     * Resolve an object name to its API path. Prefers the configured APIPath from IntegrationObject
     * metadata; falls back to `/{ObjectName}` for runtime-discovered Business Objects.
     */
    private ResolveObjectPath(integrationID: string, objectName: string): string {
        try {
            const obj = this.GetCachedObject(integrationID, objectName);
            if (obj.APIPath) {
                return obj.APIPath.startsWith('/') ? obj.APIPath : `/${obj.APIPath}`;
            }
        } catch {
            // Not in Declared metadata — a runtime-discovered Business Object.
        }
        return `/${objectName}`;
    }

    // ── Config parsing ──────────────────────────────────────────────

    /**
     * Parses the connection config, preferring the attached MJ Credential over the raw Configuration
     * JSON. Credential bytes are resolved at runtime — never at build.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<IMISConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('iMIS connector requires either CredentialID or Configuration JSON');
    }

    /** Loads the config from the MJ: Credentials entity Values JSON. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<IMISConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('iMIS credential could not be loaded or has no Values JSON');
        }
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are case-insensitive. */
    private ValidateConfig(raw: unknown): IMISConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('iMIS configuration is not a valid object');
        }
        const obj = raw as Record<string, unknown>;
        const getStr = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const lower = key.toLowerCase();
                for (const [k, v] of Object.entries(obj)) {
                    if (k.toLowerCase() === lower && typeof v === 'string' && v.length > 0) return v;
                }
            }
            return undefined;
        };
        const getNum = (...keys: string[]): number | undefined => {
            for (const key of keys) {
                const lower = key.toLowerCase();
                for (const [k, v] of Object.entries(obj)) {
                    if (k.toLowerCase() === lower && typeof v === 'number') return v;
                }
            }
            return undefined;
        };

        const baseURL = getStr('baseurl', 'base_url');
        if (!baseURL) throw new Error('iMIS configuration missing required field: BaseURL');
        const username = getStr('username', 'user');
        const password = getStr('password', 'pass');
        if (!username) throw new Error('iMIS configuration missing required field: Username');
        if (!password) throw new Error('iMIS configuration missing required field: Password');

        return {
            BaseURL: baseURL,
            Username: username,
            Password: password,
            TokenURL: getStr('tokenurl', 'token_url'),
            ClientId: getStr('clientid', 'client_id'),
            ClientSecret: getStr('clientsecret', 'client_secret'),
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: getNum('minrequestintervalms') ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    /** Resolves the API base URL from the credential's BaseURL (never a hardcoded host). */
    private ResolveBaseUrl(config: IMISConnectionConfig): string {
        return config.BaseURL.replace(/\/+$/, '');
    }

    /**
     * Resolves the token endpoint: credential TokenURL override, else `{base}/token`. iMIS issues
     * tokens at the host root (not under /api/), so a trailing /api segment is stripped.
     */
    private ResolveTokenURL(config: IMISConnectionConfig, baseUrl: string): string {
        if (config.TokenURL && config.TokenURL.length > 0) return config.TokenURL;
        const root = baseUrl.replace(/\/api$/i, '');
        return `${root}${DEFAULT_TOKEN_PATH}`;
    }

    // ── Watermark helper ────────────────────────────────────────────

    private ComputeNewWatermark(
        records: { Fields: Record<string, unknown> }[],
        current: string | null | undefined
    ): string | undefined {
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

    /** Throttle to respect the configured minimum request interval. */
    private async ThrottleIfNeeded(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) await this.Sleep(minIntervalMs - elapsed);
    }

    /** Parses a Retry-After header (seconds or http-date) into ms, if present. */
    private RetryAfterMs(response: Response): number | undefined {
        const header = response.headers.get('retry-after');
        if (!header) return undefined;
        const asSeconds = Number(header);
        if (!isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
        const asDate = new Date(header).getTime();
        if (!isNaN(asDate)) return Math.max(0, asDate - Date.now());
        return undefined;
    }

    /** Exponential backoff delay for retry attempts (capped at 15s). */
    private BackoffDelay(attempt: number): number {
        return Math.min(1_000 * Math.pow(2, attempt), 15_000);
    }

    /** Checks whether an error is transient (network/timeout). */
    private IsTransientNetworkError(err: unknown): boolean {
        if (!(err instanceof Error)) return false;
        const msg = err.message.toLowerCase();
        return msg.includes('timeout') || msg.includes('abort') ||
               msg.includes('econnreset') || msg.includes('econnrefused') ||
               msg.includes('fetch failed');
    }

    /** Builds the normalized RESTResponse from a fetch Response. */
    private async BuildRESTResponse(response: Response): Promise<RESTResponse> {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

        const text = await response.text();
        let body: unknown = null;
        if (text.length > 0) {
            try { body = JSON.parse(text); } catch { body = text; }
        }
        return { Status: response.status, Body: body, Headers: headers };
    }

    private ExtractServerVersion(headers: Record<string, string>): string | undefined {
        return headers['x-imis-version'] ?? headers['server'] ?? 'iMIS REST API';
    }

    /** True when a body is the iMIS PagedResult envelope (Items[] + Offset/Limit/HasNext). */
    private IsPagedResult(body: unknown): boolean {
        if (body == null || typeof body !== 'object' || Array.isArray(body)) return false;
        const record = body as Record<string, unknown>;
        return Array.isArray(record['Items']) && (
            'Offset' in record || 'Limit' in record || 'HasNext' in record
        );
    }

    /** Promise-wrapped setTimeout. */
    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/** Tree-shaking prevention — import and call from the package entry point. */
export function LoadIMISConnector(): void { /* no-op */ }
