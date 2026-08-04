/**
 * CventConnector — Integration connector for the Cvent event-management platform via
 * the Cvent Platform REST API (the `/ea` namespace on `api-platform.cvent.com`).
 *
 * API docs: https://developer.cvent.com/ (OpenAPI spec, published credential-free).
 *
 * ── Auth: OAuth2 client_credentials ──────────────────────────────────────────
 *   Mints/caches a bearer ACCESS TOKEN via the shared {@link OAuth2TokenManager}
 *   (no inlined token/crypto). Cvent runs a 2-legged client-credentials flow:
 *     POST {tokenURL}  body: grant_type=client_credentials
 *     Authorization: Basic base64(client_id:client_secret)
 *   Token lifetime ≈ 60 min; the manager re-acquires via client credentials when the
 *   cached token is near expiry. Every API request sends `Authorization: Bearer {token}`.
 *
 * ── Base URL (region-aware) ──────────────────────────────────────────────────
 *   Default REST host `https://api-platform.cvent.com` (the `/ea` version segment is
 *   carried on the IO APIPaths). An EUR tenant uses `https://api-platform-eur.cvent.com/ea`.
 *   The region/base-URL override is read from the credential/config — never hardcoded.
 *
 * ── Catalog (metadata-driven, NOT hardcoded) ─────────────────────────────────
 *   The 179-object / 2192-field universe comes from the Declared metadata seeded in
 *   `metadata/integrations/cvent/.cvent.integration.json` (case 1 — Cvent publishes its
 *   OpenAPI spec credential-free). The connector NEVER bakes an object/field catalog into
 *   code; DiscoverObjects/DiscoverFields read the engine cache.
 *
 * ── Pagination & incremental ─────────────────────────────────────────────────
 *   Cursor pagination: request `limit` (default 100, max 200) + an opaque `token`; the
 *   next cursor is read from the response body field `paging.nextToken` (null/absent ⇒
 *   last page). Records arrive under `data[]`. Incremental sync is metadata-driven: an IO
 *   with `SupportsIncrementalSync=true` emits its `IncrementalWatermarkField` (a documented
 *   timestamp filter, e.g. `lastModified`/`modified`) carrying the watermark.
 *
 * ── Write ─────────────────────────────────────────────────────────────────────
 *   The generic per-operation CRUD path on the base reads each IO's Create/Update/Delete
 *   columns (BodyShape=flat; Create ID from response body; Update/Delete ID in the path).
 *   Write capability is METADATA-DRIVEN. Create routes through the base's BuildCreatedResult.
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
 * OAuth2 client-credentials connection config for Cvent, parsed from the attached MJ
 * Credential (preferred) or the CompanyIntegration.Configuration JSON. Field names are read
 * case-insensitively. None of these values are read at build time — they are resolved from
 * the bound credential at runtime.
 */
export interface CventConnectionConfig {
    /** OAuth2 client identifier (Cvent API application key). */
    ClientId: string;
    /** OAuth2 client secret (Cvent API application secret). */
    ClientSecret: string;
    /** Optional token-endpoint override; defaults to the documented Cvent token URL. */
    TokenURL?: string;
    /** Optional REST base host override (e.g. the EUR host). Defaults to the US platform host. */
    BaseURL?: string;
    /** Optional space-delimited OAuth2 scopes ({domain}/{resource}:{action}). */
    Scope?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited / transient failures. Default 4. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default 30000. */
    RequestTimeoutMs?: number;
}

/** Extended REST auth context carrying the resolved bearer token + config. */
interface CventAuthContext extends RESTAuthContext {
    /** Bearer access token (from {@link OAuth2TokenManager}). */
    Token: string;
    /** Resolved REST base URL host root. */
    BaseUrl: string;
    /** Parsed connection config for reference in MakeHTTPRequest. */
    Config: CventConnectionConfig;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Documented Cvent token endpoint (client_credentials grant). */
const DEFAULT_TOKEN_URL = 'https://api-platform.cvent.com/ea/oauth2/token';

/** Default REST host (US platform). The `/ea` version segment lives on the IO APIPaths. */
const DEFAULT_BASE_URL = 'https://api-platform.cvent.com/ea';

/** Cursor pagination params (from Configuration.PaginationDefaults). */
const CURSOR_PARAM = 'token';
const PAGE_SIZE_PARAM = 'limit';
/** Server-side max page size; default 100. */
const CVENT_MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;

/** Response field carrying the next cursor (dot-path `paging.nextToken`). */
const NEXT_CURSOR_PATH = ['paging', 'nextToken'];
/** Response field carrying the record array. */
const DATA_KEY = 'data';

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Retry backoff (Configuration.RetryBackoff*): initial 2000ms, exponent 2, max 16000ms. */
const RETRY_BACKOFF_INITIAL_MS = 2_000;
const RETRY_BACKOFF_MAX_MS = 16_000;
const RETRY_BACKOFF_EXPONENT = 2;

/**
 * Conservative sustained rate. Cvent surfaces X-RateLimit-* headers + 429 + Retry-After but
 * does not publish a fixed numeric ceiling for the Platform API; the engine's AIMD token
 * bucket auto-tunes from the observed 429/Retry-After signal off this conservative seed.
 */
const CVENT_TOKENS_PER_SEC = 5;
const CVENT_BURST = 10;

// ─── Connector Implementation ────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'CventConnector')
export class CventConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run. */
    private authCache: CventAuthContext | null = null;

    /** Shared OAuth2 token manager — owns the token round-trip + cache (no inline crypto). */
    private readonly tokenManager = new OAuth2TokenManager();

    /** Current watermark value, emitted as the IO's IncrementalWatermarkField on the request. */
    private currentWatermark: string | undefined;

    // Returns the EXACT MJ: Integrations.Name string LITERAL so the T1 ThreeWayName invariant can
    // statically parse the getter's returned value. Verbatim from the identity-establisher handoff
    // (metadata.fields.Name === 'Cvent').
    public override get IntegrationName(): string { return 'Cvent'; }

    // ── Capability getters: METADATA-DRIVEN (no hardcoded answer) ─────
    //
    // Write capability FOLLOWS the per-operation CRUD columns on the cached IntegrationObjects
    // (Declared metadata). An object is create-capable when it declares CreateAPIPath + CreateMethod;
    // same for update/delete. The base BaseRESTIntegrationConnector generic CRUD path executes the
    // verb off those columns (BodyShape=flat, Create ID from response body, Update/Delete ID in path);
    // Cvent's writes are standard flat-body REST that the generic per-operation path handles, so this
    // connector wires no idiosyncratic write override.

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
     *  cache is unavailable (capability probed before configuration) — fail-safe read-only. */
    private anyObjectDeclares(pred: (o: MJIntegrationObjectEntity) => boolean): boolean {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName('Cvent');
        if (!integration) return false;
        return IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID).some(pred);
    }

    // ── Sync-efficiency hooks (evidence from the frozen contract) ─────

    /**
     * Conservative seed rate; the engine's AIMD token bucket auto-tunes from the observed
     * X-RateLimit / 429 / Retry-After signal. ThrottleBackoffFactor halves the rate on a throttle.
     */
    public override get RateLimitPolicy(): RateLimitPolicy {
        return {
            TokensPerSec: CVENT_TOKENS_PER_SEC,
            Burst: CVENT_BURST,
            ThrottleBackoffFactor: 0.5,
        };
    }

    /**
     * Parses a `Retry-After` header (seconds or http-date) or an `X-RateLimit-Reset` epoch into ms.
     * Cvent returns `429` + `Retry-After` and `X-RateLimit-*` headers per the frozen contract.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const headers = (error as { Headers?: Record<string, string> }).Headers;
        if (!headers) return undefined;

        const retryAfter = headers['retry-after'];
        if (retryAfter) {
            const asSeconds = Number(retryAfter);
            if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
            const asDate = new Date(retryAfter).getTime();
            if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
        }

        // X-RateLimit-Reset is an epoch-seconds instant in Cvent's headers.
        const reset = headers['x-ratelimit-reset'];
        if (reset) {
            const resetEpoch = Number(reset);
            if (!Number.isNaN(resetEpoch)) return Math.max(0, resetEpoch * 1_000 - Date.now());
        }
        return undefined;
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    /**
     * OAuth2 client-credentials authentication. Mints/caches the access token via the shared
     * {@link OAuth2TokenManager} (Basic-auth client credentials, grant_type=client_credentials).
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const baseUrl = this.ResolveBaseUrl(config);
        const token = await this.MintToken(config);

        const auth: CventAuthContext = { Token: token, BaseUrl: baseUrl, Config: config };
        this.authCache = auth;
        return auth;
    }

    /**
     * Resolves the token endpoint. An absolute `TokenURL` is used verbatim; a relative one is
     * resolved against the configured `BaseURL`'s origin (Cvent's token + API share a host, so a
     * region/base-URL override — or a test origin — carries the token endpoint with it).
     */
    private resolveTokenURL(config: CventConnectionConfig): string {
        const raw = config.TokenURL ?? DEFAULT_TOKEN_URL;
        try {
            return new URL(raw).toString();
        } catch {
            const base = config.BaseURL && config.BaseURL.length > 0 ? config.BaseURL : DEFAULT_BASE_URL;
            return new URL(raw, base).toString();
        }
    }

    /** Runs the client_credentials token round-trip through OAuth2TokenManager (Basic auth). */
    private async MintToken(config: CventConnectionConfig): Promise<string> {
        const req: OAuth2TokenRequest = {
            TokenURL: this.resolveTokenURL(config),
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
            // Cvent expects base64(client_id:client_secret) in a Basic Authorization header on
            // the token request (client creds NOT in the form body).
            UseBasicAuth: true,
            Scopes: config.Scope,
            ScopeParam: 'scope',
            TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
        const token = await this.tokenManager.GetAccessToken(req, 'client_credentials');
        return token.AccessToken;
    }

    /** Sends the OAuth2 bearer token on every request. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as CventAuthContext).Token ?? auth.Token ?? '';
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
        // The /ea version segment is part of the resolved base URL; IO APIPaths are relative to it.
        return (auth as CventAuthContext).BaseUrl;
    }

    /**
     * Normalizes Cvent responses. Cvent list endpoints return `{ data: [...], paging: {...} }`;
     * detail (GET /resource/{id}) endpoints return a single object. An IO may declare its own
     * ResponseDataKey; otherwise the connector reads the standard `data[]` envelope. Empty strings
     * are coerced to null so date/optional columns persist cleanly. The FULL source record passes
     * through (no field filtering) so the framework's custom-column capture sees everything returned.
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

            const key = responseDataKey ?? DATA_KEY;
            if (Array.isArray(body[key])) {
                return (body[key] as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
            }

            // Genuine single-object detail record (no data[] envelope).
            return [this.NormalizeRecord(body)];
        }

        return [];
    }

    /**
     * Derives Cursor pagination state from the response `paging.nextToken` field. A non-empty
     * nextToken means another page exists; null/absent means this was the last page. The base
     * pagination loop carries the cursor internally (NextCursor → next BuildPaginatedURL `token`).
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        const nextToken = this.ReadNextCursor(rawBody);
        if (nextToken && nextToken.length > 0) {
            return { HasMore: true, NextCursor: nextToken };
        }
        return { HasMore: false };
    }

    /**
     * Emits Cvent cursor params (`token`/`limit`) plus, for an incremental IO, the vendor watermark
     * param. The watermark behaviour is fully METADATA-DRIVEN: the param NAME comes from the IO's
     * `IncrementalWatermarkField` and is emitted only when `SupportsIncrementalSync=true` AND a
     * watermark value is in context. `limit` is clamped to the server cap (200).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const requested = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const limit = Math.min(Math.max(requested, 1), CVENT_MAX_PAGE_SIZE);
        const separator = basePath.includes('?') ? '&' : '?';
        const params = new URLSearchParams();

        const watermarkField = obj.IncrementalWatermarkField;
        // Only send the watermark on the FIRST page (no cursor yet); subsequent pages ride the cursor.
        // Cvent's incremental filter is the `filter` DSL param (spec: `filter='field' comparisonType
        // 'value'`, comparison types eq/le/ge/gt/lt) — NOT a bare `<field>=` query key (Cvent exposes
        // none). Use `ge` for an inclusive server-side watermark on the record's last-modified field.
        if (!cursor && obj.SupportsIncrementalSync && watermarkField && this.currentWatermark) {
            params.set('filter', `${watermarkField} ge '${this.currentWatermark}'`);
        }
        if (cursor) {
            params.set(CURSOR_PARAM, cursor);
        }
        params.set(PAGE_SIZE_PARAM, String(limit));

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
        const cvAuth = auth as CventAuthContext;
        const maxRetries = cvAuth.Config?.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = cvAuth.Config?.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

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
                console.warn(`[Cvent] HTTP ${response.status} from ${url} — backing off`);
                await this.Sleep(this.RetryAfterMs(response) ?? this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`Cvent request failed after ${maxRetries + 1} attempts: ${url}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by minting a client_credentials token and listing one Event record.
     * A 2xx confirms the OAuth2 credentials + base URL are valid against the live API.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as CventAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${this.GetBaseURL(companyIntegration, auth)}/events?${PAGE_SIZE_PARAM}=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    Message: `Cvent returned HTTP ${response.Status} from ${url}`,
                };
            }
            return {
                Success: true,
                Message: `Connected to Cvent at ${auth.BaseUrl}`,
                ServerVersion: 'Cvent Platform REST API',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (metadata-driven, no hardcoded catalog) ───────────

    /**
     * Discovers the full object universe from the IntegrationEngineBase cache (the Declared
     * metadata). Cvent publishes its catalog credential-free (OpenAPI spec), so the baseline is
     * Declared metadata — never hardcoded here, never sampled at build. A live credential is
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
     * Sets the watermark context the page URL builder needs, delegates the cursor walk to the base
     * (which descends nested template-var paths via FK metadata so nested IOs never silently return
     * 0 rows), then advances the watermark from the returned records on the final batch only
     * (partial-failure-safe — the watermark stays unchanged if the batch did not fully drain).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue ?? undefined;

        const result = await super.FetchChanges(ctx);

        const isFinal = !result.HasMore;
        const newWatermark = isFinal
            ? (this.ExtractLatestWatermark(result.Records, ctx) ?? ctx.WatermarkValue ?? undefined)
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
    ): Promise<CventConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('Cvent connector requires either CredentialID or Configuration JSON');
    }

    /** Loads the OAuth2 config from the MJ: Credentials entity Values JSON. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<CventConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('Cvent credential could not be loaded or has no Values JSON');
        }
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are case-insensitive. */
    private ValidateConfig(raw: unknown): CventConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Cvent configuration is not a valid object');
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

        const clientId = getStr('clientid', 'client_id', 'apikey', 'api_key');
        const clientSecret = getStr('clientsecret', 'client_secret', 'apisecret', 'api_secret');
        if (!clientId || !clientSecret) {
            throw new Error('Cvent OAuth2 configuration missing required field: ClientId / ClientSecret');
        }

        return {
            ClientId: clientId,
            ClientSecret: clientSecret,
            TokenURL: getStr('tokenurl', 'token_url'),
            BaseURL: getStr('baseurl', 'base_url', 'resthost', 'rest_host'),
            Scope: getStr('scope', 'scopes'),
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
    }

    /** Resolves the REST base URL from the credential override (e.g. EUR host), else the US default. Strips a trailing slash. */
    private ResolveBaseUrl(config: CventConnectionConfig): string {
        const base = config.BaseURL && config.BaseURL.length > 0 ? config.BaseURL : DEFAULT_BASE_URL;
        return base.replace(/\/+$/, '');
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

    /** Reads the `paging.nextToken` dot-path cursor from a response body, if present. */
    private ReadNextCursor(rawBody: unknown): string | undefined {
        if (!rawBody || typeof rawBody !== 'object') return undefined;
        let node: unknown = rawBody;
        for (const seg of NEXT_CURSOR_PATH) {
            if (!node || typeof node !== 'object') return undefined;
            node = (node as Record<string, unknown>)[seg];
        }
        return typeof node === 'string' && node.length > 0 ? node : undefined;
    }

    /**
     * Extracts the latest watermark value across a batch for incremental advancement. Uses the IO's
     * declared IncrementalWatermarkField when resolvable, falling back to common timestamp keys.
     */
    private ExtractLatestWatermark(
        records: { Fields: Record<string, unknown> }[],
        ctx: FetchContext
    ): string | null {
        const fieldName = this.ResolveWatermarkField(ctx.ObjectName);
        let latest: Date | null = null;
        for (const rec of records) {
            const raw = (fieldName && rec.Fields?.[fieldName])
                ?? rec.Fields?.lastModified ?? rec.Fields?.modified ?? rec.Fields?.updatedAt;
            if (typeof raw !== 'string' || raw.length === 0) continue;
            const d = new Date(raw);
            if (!Number.isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
        }
        return latest ? latest.toISOString() : null;
    }

    /** Resolves the IncrementalWatermarkField for an object from the engine cache. */
    private ResolveWatermarkField(objectName: string): string | undefined {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName('Cvent');
        if (!integration) return undefined;
        const io = IntegrationEngineBase.Instance
            .GetActiveIntegrationObjects(integration.ID)
            .find(o => o.Name === objectName);
        return io?.IncrementalWatermarkField ?? undefined;
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

    /** Exponential backoff delay for retry attempts (initial 2000ms, exponent 2, capped at 16000ms). */
    private BackoffDelay(attempt: number): number {
        return Math.min(
            RETRY_BACKOFF_INITIAL_MS * Math.pow(RETRY_BACKOFF_EXPONENT, attempt),
            RETRY_BACKOFF_MAX_MS
        );
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
export function LoadCventConnector(): void { /* no-op */ }
