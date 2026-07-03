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
    OAuth2TokenManager,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
    type RateLimitPolicy,
    type CreateRecordContext,
    type CRUDResult,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

/**
 * BlackbaudConnector — Blackbaud Raiser's Edge NXT (SKY API) integration connector.
 *
 * ── AUTH (TWO credential parts on EVERY request) ────────────────────────────
 * SKY API requires BOTH parts on every call — missing either returns 401
 * (Configuration.AuthFlowNote, confirmed from vendor tutorial repos + live docs):
 *   1. `Authorization: Bearer <access_token>` — OAuth 2.0 authorization-code access
 *      token. Minted/refreshed via the shared {@link OAuth2TokenManager} (the
 *      `refresh_token` grant against `https://oauth2.sky.blackbaud.com/token`); SKY
 *      API is a CONFIDENTIAL app so the exchange carries client_id/client_secret and
 *      returns a rotating refresh_token. No inline crypto — the manager owns the
 *      token round-trip.
 *   2. `bb-api-subscription-key: <subscription_key>` — the developer account's SKY API
 *      subscription key. Vendor docs PROSE title-cases it `Bb-Api-Subscription-Key`;
 *      vendor SAMPLE CODE (2 Blackbaud-owned GitHub tutorial repos) sends the literal
 *      lowercase `bb-api-subscription-key` — HTTP header names are case-insensitive
 *      (RFC 7230), and we send exactly what a working vendor client transmits.
 * Both are injected by {@link BuildHeaders}.
 *
 * ── BASE URL / PER-FAMILY PATHS ─────────────────────────────────────────────
 * SKY API versions each product family via a `/{family}/v1/` path segment
 * (Configuration.APIVersioningStrategy = url-path): `/constituent/v1`, `/gift/v1`,
 * `/fundraising/v1`, `/opportunity/v1`, `/commpref/v1`, `/nxt-data-integration/v1`,
 * `/gift-batch/v1`. Every IO's `APIPath` already carries its family prefix, so the
 * host is a SINGLE constant (`https://api.sky.blackbaud.com`) and {@link GetBaseURL}
 * returns it; the base class concatenates `host + APIPath` (family prefix included).
 * The host is overridable via Configuration.ApiBaseUrl for sandbox/regional tenants.
 *
 * ── DISCOVERY (mechanism only — NO baked catalog) ───────────────────────────
 * The object/field universe is credential-free-documented (the 4 in-scope SKY API
 * OpenAPI specs), so it is seeded as Declared metadata in the integration file.
 * This connector carries NO object/field catalog constant: {@link DiscoverObjects} /
 * {@link DiscoverFields} inherit the base cache-driven implementation that reads the
 * Declared metadata (the sanctioned "case-1 → Declared metadata" mechanism).
 *
 * ── PAGINATION (SKY API limit/offset envelope) ──────────────────────────────
 * Offset pagination via `limit`/`offset` query params; the collection response is
 * `{ count, value: [...] }` with an optional `next_link` hypermedia accelerator
 * (Configuration.PaginationDefaults). The base's Offset `BuildPaginatedURL` already
 * emits `offset=X&limit=Y` (SKY API's exact params), so it is NOT overridden;
 * {@link NormalizeResponse} unwraps `value` and {@link ExtractPaginationInfo} drives
 * the loop off `next_link` + `count`.
 *
 * ── INCREMENTAL SYNC (request/response field-name SPLIT) ─────────────────────
 * Incremental IOs (constituent, gift, fundraising_*, opportunity) filter on the
 * REQUEST query param `last_modified=<watermark>` but track the new high-watermark
 * from the RESPONSE record field `date_modified` — two DIFFERENT names
 * (Configuration.IncrementalSyncNote). {@link FetchChanges} injects `last_modified`
 * for those IOs and computes `NewWatermarkValue` from the max `date_modified` seen.
 *
 * ── CRUD ────────────────────────────────────────────────────────────────────
 * Generic per-operation CRUD from {@link BaseRESTIntegrationConnector} (reads
 * Create/Update APIPath/Method/BodyShape/IDLocation off each IO row) is used as-is;
 * create fails LOUDLY on an empty response ID via `BuildCreatedResult`. Constituent
 * create is the ONE genuinely-idiosyncratic write (split virtual individual/org
 * endpoints, no generic create in v1) — {@link CreateRecord} overrides ONLY that
 * object and delegates everything else to the generic path.
 *
 * ── RATE LIMIT ──────────────────────────────────────────────────────────────
 * 10 req/s, 25,000 calls/day Standard tier (Configuration.RateLimitPolicy, current
 * live vendor value). Surfaced via {@link RateLimitPolicy} + {@link ExtractRetryAfterMs}
 * (SKY API returns a `Retry-After` header in seconds alongside a 429/403 quota body).
 */
@RegisterClass(BaseIntegrationConnector, 'BlackbaudConnector')
export class BlackbaudConnector extends BaseRESTIntegrationConnector {

    /** OAuth2 token manager (one per connector instance; caches + refreshes the access token). */
    private tokenManager = new OAuth2TokenManager();

    /**
     * The `last_modified=<watermark>` query fragment to append to the NEXT flat paginated request,
     * set for the duration of a SINGLE incremental {@link FetchChanges} call. Consumed by
     * {@link AppendDefaultQueryParams}. Single-threaded: the engine awaits each FetchChanges fully
     * before the next, and incremental IOs are all FLAT (no concurrent parent-iteration), so this
     * per-call field never races across objects. Cleared in a `finally`.
     */
    private pendingWatermarkFilter: string | null = null;

    /** Verbatim three-way invariant name: IntegrationName getter === MJ: Integrations.Name ('blackbaud'). */
    public override get IntegrationName(): string {
        return 'blackbaud';
    }

    // ─── Capability surface ──────────────────────────────────────────────────
    // The Declared metadata drives per-object capability (SupportsCreate/Update on each IO row);
    // these connector-level getters affirm the connector CAN do the verb so the generic per-operation
    // CRUD path is reachable. Delete is NOT surfaced: the frozen contract found DELETE support sparse
    // (a single constituent-sub-object endpoint), and NO IO row carries DeleteAPIPath/DeleteMethod —
    // so SupportsDelete stays false (null-capability honesty; a true getter with null columns crashes).

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }

    // ─── Auth ────────────────────────────────────────────────────────────────

    /**
     * Mints/refreshes the OAuth2 access token AND resolves the subscription key. Both credential
     * parts ride the returned auth context so {@link BuildHeaders} can inject both on every request.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<BlackbaudAuthContext> {
        const creds = await this.LoadCredentials(companyIntegration, contextUser);

        // Prefer refreshing an access token via the shared manager (confidential app → refresh_token
        // grant). When no client_id/refresh_token is available but a static access token is provided,
        // fall back to sending that token directly (e.g. reference-mode / short-lived test token).
        let token = creds.AccessToken;
        if (creds.ClientID && creds.ClientSecret && creds.RefreshToken) {
            const minted = await this.tokenManager.GetAccessToken(
                {
                    TokenURL: creds.TokenURL,
                    ClientId: creds.ClientID,
                    ClientSecret: creds.ClientSecret,
                    RefreshToken: creds.RefreshToken,
                    UseBasicAuth: true, // SKY API accepts client auth as HTTP Basic on the token endpoint
                },
                'refresh_token'
            );
            token = minted.AccessToken;
        }

        if (!token) {
            throw new Error(
                'No Blackbaud access token available — provide (ClientID + ClientSecret + RefreshToken) to refresh, ' +
                'or a static AccessToken, on the credential or Configuration JSON.'
            );
        }
        if (!creds.SubscriptionKey) {
            throw new Error('No Blackbaud SubscriptionKey found — the bb-api-subscription-key header is required on every SKY API call.');
        }

        return {
            Token: token,
            TokenType: 'Bearer',
            SubscriptionKey: creds.SubscriptionKey,
            ApiBaseUrl: creds.ApiBaseUrl,
        };
    }

    /**
     * Builds request headers with BOTH required SKY API credential parts. `bb-api-subscription-key`
     * casing matches the vendor's own sample code (case-insensitive on the wire per RFC 7230).
     */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const bb = auth as BlackbaudAuthContext;
        return {
            'Authorization': `Bearer ${bb.Token}`,
            'bb-api-subscription-key': bb.SubscriptionKey,
            'Accept': 'application/json',
        };
    }

    // ─── Base URL (single host; family prefix rides each IO's APIPath) ─────────

    protected override GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const bb = auth as BlackbaudAuthContext;
        const host = bb.ApiBaseUrl ?? BLACKBAUD_API_HOST;
        return host.replace(/\/+$/, '');
    }

    // ─── TestConnection ────────────────────────────────────────────────────────

    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const url = `${this.GetBaseURL(companyIntegration, auth)}/constituent/v1/constituents?limit=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                const body = (response.Body ?? {}) as { count?: number };
                const count = typeof body.count === 'number' ? body.count : undefined;
                return {
                    Success: true,
                    Message: `Connected to Blackbaud SKY API${count != null ? ` — ${count} constituents visible` : ''}.`,
                };
            }
            return {
                Success: false,
                Message: `Blackbaud SKY API returned HTTP ${response.Status}: ${this.ExtractErrorMessage(response) ?? 'authentication or subscription-key failure'}.`,
            };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── Response parsing (SKY API `{ count, value: [...] }` envelope) ──────────

    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        // Vendor-declared envelope key wins when the IO names one; else SKY API's canonical `value`.
        const key = responseDataKey ?? 'value';
        if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        if (Array.isArray(body['value'])) return body['value'] as Record<string, unknown>[];
        // A single-record (get-one) response has no envelope — treat the object itself as one record.
        return Object.keys(body).length > 0 ? [body] : [];
    }

    /**
     * Drives the offset-pagination loop from the SKY API envelope: continue while a `next_link` is
     * present, advancing `offset` by the count of records seen. When `next_link` is absent, the page
     * is the last one. `count` is the total (used only for diagnostics).
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        _pageSize: number
    ): PaginationState {
        const body = (rawBody ?? {}) as { count?: number; next_link?: unknown; value?: unknown[] };
        const pageCount = Array.isArray(body.value) ? body.value.length : 0;
        const hasMore = typeof body.next_link === 'string' && body.next_link.length > 0;
        return {
            HasMore: hasMore,
            NextOffset: currentOffset + pageCount,
            TotalRecords: typeof body.count === 'number' ? body.count : undefined,
        };
    }

    // ─── Incremental watermark injection ────────────────────────────────────────

    /**
     * Wraps the base fetch to (1) inject the `last_modified=<watermark>` filter for incremental IOs
     * and (2) compute `NewWatermarkValue` from the max RESPONSE `date_modified` — the request/response
     * field-name split the frozen contract calls out. Everything else (pagination loop, parent-chain
     * walking, transform, PK assembly) is the base's; this only adds the watermark param + high-water
     * tracking, so nested-graph objects and generic flat objects flow through unchanged.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const watermarkField = obj.IncrementalWatermarkField ?? null;
        const wantsWatermark = obj.SupportsIncrementalSync && !!ctx.WatermarkValue && !!watermarkField;

        this.pendingWatermarkFilter = wantsWatermark
            ? `last_modified=${encodeURIComponent(String(ctx.WatermarkValue))}`
            : null;
        try {
            const batch = await super.FetchChanges(ctx);
            if (obj.SupportsIncrementalSync && watermarkField) {
                const maxSeen = this.MaxWatermark(batch.Records, watermarkField);
                if (maxSeen) batch.NewWatermarkValue = maxSeen;
            }
            return batch;
        } finally {
            this.pendingWatermarkFilter = null;
        }
    }

    /**
     * Appends the pending incremental watermark filter (set by {@link FetchChanges}) to a flat
     * paginated request, on top of whatever DefaultQueryParams the base appends. Skips injection when
     * the URL already carries `last_modified` (idempotent across the pagination loop's pages).
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        let out = super.AppendDefaultQueryParams(url, obj);
        if (this.pendingWatermarkFilter && !/[?&]last_modified=/i.test(out)) {
            out += (out.includes('?') ? '&' : '?') + this.pendingWatermarkFilter;
        }
        return out;
    }

    /** Highest RESPONSE `date_modified` (lexical ISO-8601 compare) across a batch, or undefined. */
    private MaxWatermark(records: ExternalRecord[], watermarkField: string): string | undefined {
        let max: string | undefined;
        for (const rec of records) {
            const v = rec.Fields?.[watermarkField];
            if (typeof v === 'string' && v.length > 0 && (!max || v > max)) max = v;
        }
        return max;
    }

    // ─── Idiosyncratic write: Constituent split-virtual create ──────────────────

    /**
     * Constituent create is genuinely idiosyncratic: SKY API v1 has NO generic
     * `POST /constituent/v1/constituents` — creation goes through split virtual endpoints
     * (`/constituent/v1/virtual/individuals` vs `/virtual/organizations`), chosen by the record's
     * `type` (Configuration.createMechanism = 'split-virtual-endpoints'). All OTHER objects delegate
     * to the base's generic per-operation CRUD; this override only special-cases `constituent`.
     * Still routes through {@link BuildCreatedResult} so an empty-ID create fails LOUDLY (write-path invariant).
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        if (ctx.ObjectName.toLowerCase() !== 'constituent') {
            return super.CreateRecord(ctx);
        }
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(ci, contextUser);
        const headers = this.BuildHeaders(auth);
        const type = String((ctx.Attributes as Record<string, unknown>)['type'] ?? '').toLowerCase();
        const path = type === 'organization'
            ? '/constituent/v1/virtual/organizations'
            : '/constituent/v1/virtual/individuals';
        const url = `${this.GetBaseURL(ci, auth)}${path}`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', { ...headers, 'Content-Type': 'application/json' }, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const id = this.ExtractIDFromResponse(response, 'body');
            return this.BuildCreatedResult(id, response.Status, ctx.ObjectName);
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on constituent create`,
        };
    }

    // ─── Sync-efficiency hooks (filled from the frozen contract's rate-limit facts) ──

    /** SKY API Standard tier: 10 req/s (Configuration.RateLimitPolicy, current live vendor value). */
    public override get RateLimitPolicy(): RateLimitPolicy {
        return { TokensPerSec: 10, Burst: 10 };
    }

    /**
     * SKY API returns a `Retry-After` header (seconds) on 429 (rate limit) and 403 (quota) responses
     * (Configuration.ErrorResponseShapeNote). Parse it to ms so the engine backs off precisely.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const headers = (error as { Headers?: Record<string, string> } | undefined)?.Headers;
        const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
        if (typeof raw === 'string') {
            const secs = parseInt(raw, 10);
            if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
        }
        return undefined;
    }

    // ─── HTTP transport ──────────────────────────────────────────────────────

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body != null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                opts.body = JSON.stringify(body);
            }
            const response = await fetch(url, opts);
            const parsedBody = await this.ParseBody(response);
            const hdrs: Record<string, string> = {};
            response.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
            return { Status: response.status, Body: parsedBody, Headers: hdrs };
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Blackbaud SKY API request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeout);
        }
    }

    private async ParseBody(response: Response): Promise<unknown> {
        const ct = response.headers.get('content-type') ?? '';
        if (ct.includes('json')) {
            try { return await response.json(); } catch { return null; }
        }
        const text = await response.text();
        return text.length > 0 ? text : null;
    }

    // ─── Credential resolution (secret bytes never leave this scope) ────────────

    /**
     * Resolves the two credential parts (OAuth2 client/refresh + subscription key) plus non-secret
     * host config from the linked Credential entity, falling back to CompanyIntegration.Configuration.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<BlackbaudCredentials> {
        let creds: Partial<BlackbaudCredentials> = {};

        if (companyIntegration.CredentialID) {
            const fromCred = await this.LoadFromCredentialEntity(companyIntegration.CredentialID, contextUser);
            if (fromCred) creds = { ...creds, ...this.compact(fromCred) };
        }

        // Non-secret host config (and, for reference mode, a static token) may also live on Configuration.
        if (companyIntegration.Configuration) {
            const fromConfig = this.ParseConfigJson(companyIntegration.Configuration);
            if (fromConfig) {
                // Credential entity wins for secrets already resolved; Configuration fills the gaps.
                for (const [k, v] of Object.entries(this.compact(fromConfig))) {
                    if ((creds as Record<string, unknown>)[k] == null) (creds as Record<string, unknown>)[k] = v;
                }
            }
        }

        if (!creds.SubscriptionKey && !creds.AccessToken && !creds.ClientID) {
            throw new Error(
                'No Blackbaud credentials found — set SubscriptionKey plus either (ClientID+ClientSecret+RefreshToken) ' +
                'or a static AccessToken on the credential Values or CompanyIntegration.Configuration JSON.'
            );
        }

        return {
            ClientID: creds.ClientID ?? '',
            ClientSecret: creds.ClientSecret ?? '',
            SubscriptionKey: creds.SubscriptionKey ?? '',
            AccessToken: creds.AccessToken ?? '',
            RefreshToken: creds.RefreshToken ?? '',
            TokenURL: creds.TokenURL ?? BLACKBAUD_TOKEN_URL,
            ApiBaseUrl: creds.ApiBaseUrl,
        };
    }

    /** Loads credential fields from a Credential entity's Values JSON. */
    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Partial<BlackbaudCredentials> | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseConfigJson(credential.Values);
    }

    /** Parses a JSON string into credential/config fields (tolerant of casing aliases). */
    private ParseConfigJson(json: string): Partial<BlackbaudCredentials> | null {
        try {
            const result = BlackbaudConfigSchema.safeParse(JSON.parse(json));
            if (!result.success) return null;
            const p = result.data;
            return {
                ClientID: p.ClientID ?? p.clientId ?? p.ClientId,
                ClientSecret: p.ClientSecret ?? p.clientSecret,
                SubscriptionKey: p.SubscriptionKey ?? p.subscriptionKey ?? p['bb-api-subscription-key'],
                AccessToken: p.AccessToken ?? p.accessToken ?? p.Token ?? p.token,
                RefreshToken: p.RefreshToken ?? p.refreshToken,
                TokenURL: p.TokenURL ?? p.tokenUrl,
                ApiBaseUrl: p.ApiBaseUrl ?? p.apiBaseUrl,
            };
        } catch {
            return null;
        }
    }

    /** Drops undefined/empty-string entries so a later fallback source can fill them. */
    private compact(o: Partial<BlackbaudCredentials>): Partial<BlackbaudCredentials> {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) {
            if (v != null && v !== '') out[k] = v;
        }
        return out as Partial<BlackbaudCredentials>;
    }

}

// ─── Module-level constants (mechanism, NOT a catalog) ────────────────────────

/** SKY API host root; the `/{family}/v1/...` path rides each IO's APIPath. Overridable via Configuration.ApiBaseUrl. */
const BLACKBAUD_API_HOST = 'https://api.sky.blackbaud.com';
/** OAuth2 token endpoint (authorization-code / refresh_token grant). */
const BLACKBAUD_TOKEN_URL = 'https://oauth2.sky.blackbaud.com/token';
/** Per-request timeout. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Auth context: resolved bearer token + subscription key + optional host override. */
interface BlackbaudAuthContext extends RESTAuthContext {
    Token: string;
    SubscriptionKey: string;
    ApiBaseUrl?: string;
}

/** Resolved Blackbaud credentials/config (both secret parts + non-secret host config). */
interface BlackbaudCredentials {
    ClientID: string;
    ClientSecret: string;
    SubscriptionKey: string;
    AccessToken: string;
    RefreshToken: string;
    TokenURL: string;
    ApiBaseUrl?: string;
}

/** Zod schema for the credential/Configuration JSON shape (tolerant of casing aliases). */
const BlackbaudConfigSchema = z.object({
    ClientID: z.string().optional(),
    clientId: z.string().optional(),
    ClientId: z.string().optional(),
    ClientSecret: z.string().optional(),
    clientSecret: z.string().optional(),
    SubscriptionKey: z.string().optional(),
    subscriptionKey: z.string().optional(),
    'bb-api-subscription-key': z.string().optional(),
    AccessToken: z.string().optional(),
    accessToken: z.string().optional(),
    Token: z.string().optional(),
    token: z.string().optional(),
    RefreshToken: z.string().optional(),
    refreshToken: z.string().optional(),
    TokenURL: z.string().optional(),
    tokenUrl: z.string().optional(),
    ApiBaseUrl: z.string().optional(),
    apiBaseUrl: z.string().optional(),
});

// Tree-shaking prevention — REQUIRED so @RegisterClass survives bundling.
export function LoadBlackbaudConnector(): void { /* intentionally empty */ }
