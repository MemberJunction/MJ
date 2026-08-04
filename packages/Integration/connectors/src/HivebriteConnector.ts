/**
 * HivebriteConnector — Integration connector for the Hivebrite community-management
 * platform Admin API (v1 / v2 / v3).
 *
 * API docs: https://api-docs.hivebrite.com/ (OpenAPI spec — 174 paths across three
 * concurrent version namespaces: /api/admin/v1, /api/admin/v2, /api/admin/v3).
 *
 * ── Auth: OAuth2 (password + refresh_token grants) ───────────────────────────
 *   Mints/refreshes a bearer ACCESS TOKEN via the shared {@link OAuth2TokenManager}
 *   (no inlined token/crypto logic). Hivebrite runs a Doorkeeper/WineBouncer OAuth2
 *   server (RFC 6749 §4.3 resource-owner password credentials grant):
 *     - PRIMARY grant   = `refresh_token` (refresh_token + client_id + client_secret
 *                          POSTed to `{base}/api/oauth/token`) when a refresh token exists.
 *     - FALLBACK grant  = `password` (admin_email + password + client_id + client_secret
 *                          + scope=admin) when no refresh token is supplied.
 *   Hivebrite names the password-grant username param `admin_email` (not the spec's
 *   `username`); the token manager's `UsernameParam` field carries that divergence —
 *   the crypto/round-trip itself stays in the shared helper.
 *   Every API request sends `Authorization: Bearer {accessToken}`.
 *
 * ── Base URL (per-community) ─────────────────────────────────────────────────
 *   The base host is per-community and comes from the credential/config `BaseURL`
 *   (e.g. `https://{community}.hivebrite.com` or the operator's custom domain). Never
 *   a hardcoded host. Object APIPaths in the metadata already carry the `/admin/vN`
 *   prefix; the connector prepends a `/api` segment to reach the live host root.
 *
 * ── Catalog (metadata-driven, NOT hardcoded) ─────────────────────────────────
 *   The 98-object / 1185-field universe comes from the Declared metadata seeded in
 *   `metadata/integrations/hivebrite/.hivebrite.integration.json` (case 1 — Hivebrite
 *   publishes its OpenAPI spec credential-free). The connector NEVER bakes an
 *   object/field catalog into code; DiscoverObjects/DiscoverFields read the cache.
 *
 * ── Pagination & incremental ─────────────────────────────────────────────────
 *   PageNumber pagination via `page` (1-based) + `per_page` (max 100, recommended 25).
 *   Hivebrite returns a bare JSON array per page plus RFC-5988 `Link` headers; the base
 *   pagination loop terminates on an empty page, and this connector additionally treats
 *   a short page (fewer rows than the requested `per_page`) as end-of-stream. Incremental
 *   sync is fully metadata-driven: an IO with `SupportsIncrementalSync=true` emits its
 *   `IncrementalWatermarkField` param (`updated_since` / `created_since` / `deleted_since`)
 *   carrying the watermark; every other IO is a full pull (engine content-hash dedup).
 *
 * ── Write ─────────────────────────────────────────────────────────────────────
 *   Most resources support full CRUD; the generic per-operation CRUD path on the base
 *   reads the IO's Create/Update/Delete columns. Write capability is METADATA-DRIVEN
 *   (follows the per-operation columns on the cached objects) — read-only when none are
 *   authored. Create routes through the base's `BuildCreatedResult` (loud empty-ID fail).
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth2TokenManager,
    type OAuth2GrantType,
    type OAuth2TokenRequest,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type RateLimitPolicy,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

// ─── Configuration & Auth Types ──────────────────────────────────────

/**
 * OAuth2 connection configuration for Hivebrite, parsed from the attached MJ Credential
 * (preferred) or the CompanyIntegration.Configuration JSON. Field names are read
 * case-insensitively. None of these values are read at build time — they are resolved
 * from the bound credential at runtime.
 */
export interface HivebriteConnectionConfig {
    /** OAuth2 client identifier (Hivebrite community OAuth application). */
    ClientId: string;
    /** OAuth2 client secret. */
    ClientSecret: string;
    /** Long-lived refresh token — drives the PRIMARY `refresh_token` grant. */
    RefreshToken?: string;
    /** Admin email — drives the FALLBACK `password` grant (sent as `admin_email`). */
    AdminEmail?: string;
    /** Admin password — drives the FALLBACK `password` grant. */
    Password?: string;
    /** OAuth2 scope. Defaults to `admin` per the Hivebrite Admin API. */
    Scope?: string;
    /** Per-community API base URL (e.g. https://{community}.hivebrite.com). */
    BaseURL: string;
    /** Optional token-endpoint override; defaults to `{base}/api/oauth/token`. */
    TokenURL?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited / transient failures. Default 3. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default 30000. */
    RequestTimeoutMs?: number;
}

/** Extended REST auth context carrying the resolved bearer token + config. */
interface HivebriteAuthContext extends RESTAuthContext {
    /** Bearer access token (from {@link OAuth2TokenManager}). */
    Token: string;
    /** Resolved API base URL (e.g. https://{community}.hivebrite.com). */
    BaseUrl: string;
    /** Parsed connection config for reference in MakeHTTPRequest. */
    Config: HivebriteConnectionConfig;
}

// ─── Constants ───────────────────────────────────────────────────────

/** The canonical MJ: Integrations.Name — part of the three-way invariant. */
const INTEGRATION_NAME = 'Hivebrite';

/** Token endpoint path appended to the base when no TokenURL override is supplied. */
const DEFAULT_TOKEN_PATH = '/api/oauth/token';

/** Default OAuth2 scope for the Hivebrite Admin API. */
const DEFAULT_SCOPE = 'admin';

/**
 * Hivebrite PageNumber pagination params. `page` is 1-based; `per_page` max is 100
 * (recommended 25). Documented in the OpenAPI spec info.description.
 */
const PAGE_PARAM = 'page';
const PER_PAGE_PARAM = 'per_page';
/** Server-side hard cap on per_page (spec: "The maximum value for our APIs per_page param is 100"). */
const HIVEBRITE_MAX_PER_PAGE = 100;

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Documented rate limit: 300 requests / minute = 5 requests / second. */
const HIVEBRITE_TOKENS_PER_SEC = 5;
const HIVEBRITE_BURST = 10;

// ─── Connector Implementation ────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'HivebriteConnector')
export class HivebriteConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run. */
    private authCache: HivebriteAuthContext | null = null;

    /** Shared OAuth2 token manager — owns the token round-trip + cache (no inline crypto). */
    private readonly tokenManager = new OAuth2TokenManager();

    /** Current watermark value, emitted as the IO's IncrementalWatermarkField on the request. */
    private currentWatermark: string | undefined;

    // Returns the EXACT MJ: Integrations.Name string LITERAL so the T1 ThreeWayName invariant can
    // statically parse the getter's returned value from connector source. Verbatim from the
    // identity-establisher handoff (metadata.fields.Name === 'Hivebrite').
    public override get IntegrationName(): string { return 'Hivebrite'; }

    // ── Capability getters: METADATA-DRIVEN (no hardcoded answer) ─────
    //
    // Write capability FOLLOWS the per-operation CRUD columns on the cached IntegrationObjects
    // (Declared metadata). An object is create-capable when it declares both CreateAPIPath +
    // CreateMethod; same for update/delete. The base BaseRESTIntegrationConnector generic CRUD path
    // executes the verb off those columns; this connector wires no idiosyncratic write override —
    // Hivebrite's writes are flat-body PUT/POST/DELETE that the generic per-operation path handles.

    public override get SupportsCreate(): boolean {
        return this.anyObjectDeclares(o => !!o.CreateAPIPath && !!o.CreateMethod);
    }
    public override get SupportsUpdate(): boolean {
        return this.anyObjectDeclares(o => !!o.UpdateAPIPath && !!o.UpdateMethod);
    }
    public override get SupportsDelete(): boolean {
        return this.anyObjectDeclares(o => !!o.DeleteAPIPath && !!o.DeleteMethod);
    }

    /** True when any cached IntegrationObject satisfies the predicate. []→false when the engine
     *  cache is unavailable (e.g. capability probed before configuration) — fail-safe read-only. */
    private anyObjectDeclares(pred: (o: MJIntegrationObjectEntity) => boolean): boolean {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName(INTEGRATION_NAME);
        if (!integration) return false;
        return IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID).some(pred);
    }

    // ── Sync-efficiency hooks (evidence from the frozen contract) ─────

    /**
     * Hivebrite documents a 300 req/min limit (5 req/sec). A secondary throttle triggers after
     * 15 HTTP 500+ errors/min. The engine's AIMD token bucket honors this; we set a conservative
     * burst and a slower-than-default recovery so a throttle doesn't immediately re-spike.
     */
    public override get RateLimitPolicy(): RateLimitPolicy {
        return {
            TokensPerSec: HIVEBRITE_TOKENS_PER_SEC,
            Burst: HIVEBRITE_BURST,
            ThrottleBackoffFactor: 0.5,
        };
    }

    /**
     * Parses a `Retry-After` header (seconds or http-date) into ms. Hivebrite does not document a
     * Retry-After header, but Doorkeeper-fronted 429/503 responses may carry one; honor it when present.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const headers = (error as { Headers?: Record<string, string> }).Headers;
        const raw = headers?.['retry-after'];
        if (!raw) return undefined;
        const asSeconds = Number(raw);
        if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
        const asDate = new Date(raw).getTime();
        if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
        return undefined;
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    /**
     * OAuth2 bearer authentication. Mints/refreshes the access token via the shared
     * {@link OAuth2TokenManager}: PRIMARY `refresh_token` grant when a refresh token is
     * present, otherwise the documented FALLBACK `password` grant (admin_email + password).
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const baseUrl = this.ResolveBaseUrl(config);
        const token = await this.MintToken(config, baseUrl);

        const auth: HivebriteAuthContext = { Token: token, BaseUrl: baseUrl, Config: config };
        this.authCache = auth;
        return auth;
    }

    /** Selects the grant and runs the token round-trip through OAuth2TokenManager. */
    private async MintToken(config: HivebriteConnectionConfig, baseUrl: string): Promise<string> {
        const tokenURL = this.ResolveTokenURL(config, baseUrl);
        const grant: OAuth2GrantType = config.RefreshToken ? 'refresh_token' : 'password';
        const req: OAuth2TokenRequest = {
            TokenURL: tokenURL,
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
            RefreshToken: config.RefreshToken,
            Username: config.AdminEmail,
            Password: config.Password,
            // Hivebrite names the password-grant username param `admin_email` (Doorkeeper divergence).
            UsernameParam: 'admin_email',
            Scopes: config.Scope ?? DEFAULT_SCOPE,
            ScopeParam: 'scope',
            TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
        const token = await this.tokenManager.GetAccessToken(req, grant);
        return token.AccessToken;
    }

    /** Sends the OAuth2 bearer token on every request. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as HivebriteAuthContext).Token ?? auth.Token ?? '';
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
        // Object APIPaths carry the `/admin/vN/...` prefix; the live host root is `{base}/api`.
        return `${(auth as HivebriteAuthContext).BaseUrl}/api`;
    }

    /**
     * Normalizes Hivebrite responses. Handles three real shapes:
     *   1. bare array — list endpoints return a top-level JSON array of records
     *   2. `{ <key>: [...] }` envelope — when an IO declares a ResponseDataKey
     *   3. single object — detail (GET /resource/{id}) endpoints return ONE record
     * Empty strings are coerced to null so date/optional columns persist cleanly.
     * The FULL source record passes through (no field filtering) so the framework's
     * custom-column capture sees everything the source returned.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        if (Array.isArray(rawBody)) {
            return (rawBody as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
        }

        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;

            if (responseDataKey && Array.isArray(body[responseDataKey])) {
                return (body[responseDataKey] as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
            }

            // Some envelope endpoints expose a single array property (e.g. postal_addresses).
            const arrayValues = Object.values(body).filter(v => Array.isArray(v)) as unknown[][];
            if (arrayValues.length === 1 && Object.keys(body).length === 1) {
                return (arrayValues[0] as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
            }

            // Genuine single-object detail record.
            return [this.NormalizeRecord(body)];
        }

        return [];
    }

    /**
     * Derives PageNumber pagination state. Hivebrite returns a bare array per page and signals
     * the next page via the RFC-5988 `Link` header — which the base pagination loop does not pass
     * to this method (it receives only the parsed body). The safe, header-free terminator is a
     * SHORT page: fewer rows than the requested `per_page` means the last page was reached. A FULL
     * page means more may remain. The base loop also independently stops on an empty page and on a
     * duplicate-first-record page, so this never loops unboundedly.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        currentPage: number,
        _currentOffset: number,
        pageSize: number
    ): PaginationState {
        const records = Array.isArray(rawBody)
            ? (rawBody as unknown[])
            : this.extractSingleArrayLength(rawBody);
        const effectivePerPage = Math.min(pageSize || DEFAULT_PAGE_SIZE, HIVEBRITE_MAX_PER_PAGE);

        if (records.length === 0) return { HasMore: false };
        // A full page (>= the requested per_page) implies another page may exist.
        if (records.length >= effectivePerPage) {
            return { HasMore: true, NextPage: currentPage + 1 };
        }
        return { HasMore: false };
    }

    /** Returns the rows of a single-array-property envelope body (else []). */
    private extractSingleArrayLength(rawBody: unknown): unknown[] {
        if (!rawBody || typeof rawBody !== 'object') return [];
        const arrays = Object.values(rawBody as Record<string, unknown>).filter(Array.isArray) as unknown[][];
        return arrays.length === 1 ? arrays[0] : [];
    }

    /**
     * Emits Hivebrite PageNumber params (`page`/`per_page`) plus, for an incremental IO, the vendor
     * watermark param. The watermark behaviour is fully METADATA-DRIVEN: the param NAME comes from
     * the IO's `IncrementalWatermarkField` (e.g. `updated_since` / `created_since` / `deleted_since`)
     * and is emitted only when `SupportsIncrementalSync=true` AND a watermark value is in context.
     * `per_page` is clamped to the server cap (100).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        _offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const requested = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const perPage = Math.min(requested, HIVEBRITE_MAX_PER_PAGE);
        const separator = basePath.includes('?') ? '&' : '?';
        const params = new URLSearchParams();

        const watermarkField = obj.IncrementalWatermarkField;
        if (obj.SupportsIncrementalSync && watermarkField && this.currentWatermark) {
            params.set(watermarkField, this.currentWatermark);
        }
        params.set(PAGE_PARAM, String(page));
        params.set(PER_PAGE_PARAM, String(perPage));

        return `${basePath}${separator}${params.toString()}`;
    }

    /** Executes an HTTP request with retry/backoff for 429/503 + transient network errors. */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const hbAuth = auth as HivebriteAuthContext;
        const maxRetries = hbAuth.Config?.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = hbAuth.Config?.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const fetchOptions: RequestInit = {
                method,
                headers,
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

            if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
                console.warn(`[Hivebrite] HTTP ${response.status} from ${url} — backing off`);
                await this.Sleep(this.RetryAfterMs(response) ?? this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`Hivebrite request failed after ${maxRetries + 1} attempts: ${url}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by minting an OAuth2 token and listing one User record. A 2xx
     * confirms the OAuth2 credentials + per-community base URL are valid against the live API.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as HivebriteAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${this.GetBaseURL(companyIntegration, auth)}/admin/v1/users?${PER_PAGE_PARAM}=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    Message: `Hivebrite returned HTTP ${response.Status} from ${url}`,
                };
            }
            return {
                Success: true,
                Message: `Connected to Hivebrite at ${auth.BaseUrl}`,
                ServerVersion: 'Hivebrite Admin API',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (metadata-driven, no hardcoded catalog) ───────────

    /**
     * Discovers the full object universe from the IntegrationEngineBase cache (the Declared
     * metadata). Hivebrite publishes its catalog credential-free (OpenAPI spec), so the baseline
     * is Declared metadata — never hardcoded here, never sampled at build. A live credential is
     * ADDITIVE (tenant-specific custom fields surfaced at sync via the framework's custom-column
     * capture), never the baseline — so credential-free discovery re-yields the standard universe.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return super.DiscoverObjects(companyIntegration, contextUser);
    }

    /** Discovers fields for an object from the cached Declared metadata. */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        return super.DiscoverFields(companyIntegration, objectName, contextUser);
    }

    // ─── FetchChanges override ──────────────────────────────────────

    /**
     * Sets the watermark context the page URL builder needs, delegates the actual walk to the
     * base (which descends nested Door→Segment template-var paths via FK metadata so nested IOs
     * never silently return 0 rows), then advances the watermark from the returned records on the
     * final batch only (partial-failure-safe).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue ?? undefined;

        const result = await super.FetchChanges(ctx);

        const isFinal = !result.HasMore;
        const newWatermark = isFinal
            ? (this.ExtractLatestUpdatedAt(result.Records) ?? ctx.WatermarkValue ?? undefined)
            : undefined;

        return { ...result, NewWatermarkValue: newWatermark };
    }

    // ─── Config parsing ──────────────────────────────────────────────

    /**
     * Parses the OAuth2 connection config, preferring the attached MJ Credential over the raw
     * Configuration JSON. Credential bytes are resolved at runtime — never at build.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<HivebriteConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('Hivebrite connector requires either CredentialID or Configuration JSON');
    }

    /** Loads the OAuth2 config from the MJ: Credentials entity Values JSON. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<HivebriteConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('Hivebrite credential could not be loaded or has no Values JSON');
        }
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are case-insensitive. */
    private ValidateConfig(raw: unknown): HivebriteConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Hivebrite configuration is not a valid object');
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

        const baseURL = getStr('baseurl', 'base_url', 'communityurl', 'community_url');
        if (!baseURL) {
            throw new Error('Hivebrite configuration missing required field: BaseURL');
        }
        const clientId = getStr('clientid', 'client_id');
        const clientSecret = getStr('clientsecret', 'client_secret');
        if (!clientId || !clientSecret) {
            throw new Error('Hivebrite OAuth2 configuration missing required field: ClientId / ClientSecret');
        }

        const refreshToken = getStr('refreshtoken', 'refresh_token');
        const adminEmail = getStr('adminemail', 'admin_email', 'username', 'email');
        const password = getStr('password', 'pass');
        if (!refreshToken && !(adminEmail && password)) {
            throw new Error(
                'Hivebrite OAuth2 configuration requires a RefreshToken (primary grant) ' +
                'or AdminEmail + Password (fallback grant)'
            );
        }

        return {
            ClientId: clientId,
            ClientSecret: clientSecret,
            RefreshToken: refreshToken,
            AdminEmail: adminEmail,
            Password: password,
            Scope: getStr('scope', 'scopes'),
            BaseURL: baseURL,
            TokenURL: getStr('tokenurl', 'token_url'),
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
    }

    /** Resolves the API base URL from the credential's BaseURL (never a hardcoded host). Strips a trailing /api. */
    private ResolveBaseUrl(config: HivebriteConnectionConfig): string {
        return config.BaseURL.replace(/\/+$/, '').replace(/\/api$/i, '');
    }

    /** Resolves the OAuth2 token endpoint: credential TokenURL override, else `{base}/api/oauth/token`. */
    private ResolveTokenURL(config: HivebriteConnectionConfig, baseUrl: string): string {
        if (config.TokenURL && config.TokenURL.length > 0) return config.TokenURL;
        return `${baseUrl}${DEFAULT_TOKEN_PATH}`;
    }

    // ─── Normalization helpers ───────────────────────────────────────

    /** Normalizes a raw record's top-level values (empty-string → null). */
    private NormalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            out[key] = value === '' ? null : value;
        }
        return out;
    }

    /** Extracts the latest updated_at / created_at across a batch for watermark advancement. */
    private ExtractLatestUpdatedAt(records: { Fields: Record<string, unknown> }[]): string | null {
        let latest: Date | null = null;
        for (const rec of records) {
            const raw = rec.Fields?.updated_at ?? rec.Fields?.created_at ?? rec.Fields?.deleted_at;
            if (typeof raw !== 'string' || raw.length === 0) continue;
            const d = new Date(raw);
            if (!Number.isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
        }
        return latest ? latest.toISOString() : null;
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /** Parses a Retry-After header (seconds or http-date) into ms, if present. */
    private RetryAfterMs(response: Response): number | undefined {
        const header = response.headers.get('retry-after');
        if (!header) return undefined;
        const asSeconds = Number(header);
        if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
        const asDate = new Date(header).getTime();
        if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
        return undefined;
    }

    /** Exponential backoff delay for retry attempts (capped at 30s). */
    private BackoffDelay(attempt: number): number {
        return Math.min(2_000 * Math.pow(2, attempt), 30_000);
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

    /** Promise-wrapped setTimeout. */
    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/** Tree-shaking prevention — import and call from the package entry point. */
export function LoadHivebriteConnector(): void { /* no-op */ }
