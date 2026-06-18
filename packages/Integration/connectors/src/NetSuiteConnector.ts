/**
 * NetSuiteConnector — Integration connector for Oracle NetSuite (SuiteTalk REST Web Services).
 *
 * API docs: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/ (SuiteTalk REST API Guide)
 *
 * SCOPE: SuiteTalk REST Web Services only — the Record Service (CRUD on standard + custom record
 *        types) + the SuiteQL query service. SOAP / RESTlets / SuiteAnalytics Connect are out of scope.
 *
 * ── Auth (selected per-connection by Configuration / credential) ───────────────────────────────
 *   • OAuth 1.0a TBA (Token-Based Authentication) — the primary documented flow. Long-lived,
 *     non-expiring ConsumerKey/ConsumerSecret + TokenID/TokenSecret, signed per request with
 *     HMAC-SHA256 and a per-account `realm`. Signing is delegated to the shared `OAuth1aSigner`
 *     auth-helper — NEVER inline crypto.
 *   • OAuth 2.0 bearer — the documented alternate (Authorization Code flow). A pre-minted bearer
 *     access token is supplied via the credential/Configuration and sent as `Authorization: Bearer`.
 *     (Refresh, when a refresh token + token URL are present, is delegated to OAuth2TokenManager.)
 *   Mode is chosen by Configuration.AuthFlow ('oauth1-tba' | 'oauth2') or inferred from the
 *   credential keys present (BearerToken/AccessToken ⇒ OAuth2; ConsumerKey+TokenID ⇒ TBA).
 *
 * ── Host (tenant-agnostic — NO baked account) ──────────────────────────────────────────────────
 *   The base URL is built at runtime from Configuration.AccountID:
 *   `https://{accountId}.suitetalk.api.netsuite.com` (e.g. '1234567' prod, '1234567_SB1' sandbox).
 *   Per-account subdomains require the account id be lowercased and '_' → '-' in the subdomain.
 *
 * ── Reads ──────────────────────────────────────────────────────────────────────────────────────
 *   FetchChanges runs SuiteQL: POST /services/rest/query/v1/suiteql with the SQL in the body
 *   `{ q: '<SQL>' }` and the REQUIRED header `Prefer: transient`. This expresses the lastModifiedDate
 *   incremental watermark predicate (a thing the generic GET path cannot), so FetchChanges is the one
 *   genuinely-idiosyncratic override. Everything else rides the base.
 *
 * ── CRUD ───────────────────────────────────────────────────────────────────────────────────────
 *   Create/Update/Delete/Get use the base class's GENERIC per-operation path — they read the IO's
 *   Create/Update/Delete APIPath/Method/BodyShape/BodyKey/IDLocation columns and dispatch. NetSuite's
 *   Record Service CRUD is a plain REST shape (POST collection, PATCH /{id}, DELETE /{id}), so no
 *   override is needed or written.
 *
 * ── Pagination ─────────────────────────────────────────────────────────────────────────────────
 *   Offset/limit (default 1000). Responses carry the HATEOAS envelope { items, count, totalResults,
 *   hasMore, offset, links:[{rel:'next',href}] } — surfaced in NormalizeResponse + ExtractPaginationInfo.
 *
 * ── Incremental ────────────────────────────────────────────────────────────────────────────────
 *   lastModifiedDate watermark (via WatermarkService in the engine; the connector applies the IO's
 *   IncrementalWatermarkField inside the SuiteQL predicate and returns the max-seen on full-batch success).
 *
 * ── Discovery ──────────────────────────────────────────────────────────────────────────────────
 *   Rides the metadata-catalog MECHANISM (no baked catalog): GET /services/rest/record/v1/metadata-catalog
 *   enumerates the record types accessible to the credential; per-type field schema is fetched from the
 *   same catalog (Accept: application/schema+json). DiscoverObjects UNIONS the Declared baseline (the 200+
 *   standard record types + the sublist-access-path children, which the catalog never lists) with the live
 *   catalog's record types — catalog slugs are name-aligned back to the Declared names via each IO's
 *   Configuration.recordTypeSlug so a slug never duplicates an existing Declared object; unknown slugs pass
 *   through as new customs. Discovery is NON-authoritative (DiscoveryIsAuthoritative=false): because the
 *   catalog is a partial enumeration (no sublist children, slug-vs-humanized names), absence proves nothing
 *   and nothing is ever deactivated. Standard baseline lives in the Declared metadata file; a credential
 *   only ADDS the account's custom records on top.
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth1aSigner,
    OAuth2TokenManager,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────────

const NS_DEFAULT_PAGE_SIZE = 1000;
const NS_MAX_RETRIES = 3;
const NS_REQUEST_TIMEOUT_MS = 90_000;
const NS_RECORD_BASE_PATH = '/services/rest/record/v1';
const NS_SUITEQL_PATH = '/services/rest/query/v1/suiteql';
const NS_METADATA_CATALOG_PATH = '/services/rest/record/v1/metadata-catalog';
const NS_SERVERTIME_PATH = '/services/rest/system/v1/serverTime';
// NetSuite REST media type for record bodies (per docs: application/vnd.oracle.resource+json).
const NS_RECORD_MEDIA_TYPE = 'application/vnd.oracle.resource+json';
// Concurrency-governed API (no RPS); the smallest documented tier is 5 concurrent. Stay well under it.
const NS_MAX_CONCURRENCY = 4;

// ─── Config (typed via Zod) ─────────────────────────────────────────────────

/**
 * The per-connection config the connector reads from the credential JSON or
 * CompanyIntegration.Configuration. AccountID is always required; the auth fields
 * present select the auth mode.
 */
const NetSuiteConfigSchema = z.object({
    /** Per-account id, e.g. '1234567' or '1234567_SB1'. Builds the host subdomain. */
    AccountID: z.string().min(1),
    /**
     * Optional explicit host-root override (no trailing slash). When set, it is used verbatim
     * instead of deriving `https://{accountId}.suitetalk.api.netsuite.com` from AccountID.
     * Production normally leaves this UNSET (host derives from AccountID). It exists for a custom
     * gateway/proxy and for pointing the connector at a mock vendor in credential-free e2e tests —
     * the same `BaseURL`-from-config hook iMIS/Hivebrite/GrowthZone expose.
     */
    HostBaseURL: z.string().url().optional(),
    /** Explicit auth mode; inferred when absent. */
    AuthFlow: z.enum(['oauth1-tba', 'oauth2']).optional(),
    // OAuth 1.0a TBA
    ConsumerKey: z.string().optional(),
    ConsumerSecret: z.string().optional(),
    TokenID: z.string().optional(),
    TokenSecret: z.string().optional(),
    // OAuth 2.0 bearer
    BearerToken: z.string().optional(),
    AccessToken: z.string().optional(),
    RefreshToken: z.string().optional(),
    ClientID: z.string().optional(),
    ClientSecret: z.string().optional(),
    TokenURL: z.string().optional(),
});
type NetSuiteConfig = z.infer<typeof NetSuiteConfigSchema>;

type NSAuthMode = 'oauth1-tba' | 'oauth2';

interface NSAuthContext extends RESTAuthContext {
    Config: NetSuiteConfig;
    Mode: NSAuthMode;
    /** Host root, e.g. https://1234567.suitetalk.api.netsuite.com (no trailing slash, no path). */
    HostBaseURL: string;
    /** Realm value for OAuth 1.0a (account id, '-' → '_', uppercased). */
    Realm: string;
    /** Pre-resolved bearer token for OAuth2 mode (empty for TBA). */
    BearerToken: string;
}

/** NetSuite HATEOAS / SuiteQL paged response envelope. */
interface NSPagedResponse {
    items?: Record<string, unknown>[];
    count?: number;
    totalResults?: number;
    hasMore?: boolean;
    offset?: number;
    links?: Array<{ rel: string; href: string }>;
}

/** metadata-catalog list response: { items: [{ name, ... }] } or { links: [{ rel, href }] }. */
interface NSCatalogResponse {
    items?: Array<{ name?: string; label?: string }>;
    links?: Array<{ rel?: string; href?: string }>;
}

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'NetSuiteConnector')
export class NetSuiteConnector extends BaseRESTIntegrationConnector {
    private oauth2Manager = new OAuth2TokenManager();

    // ── Identity + capabilities ──────────────────────────────────────────

    public override get IntegrationName(): string { return 'NetSuite'; }

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * NON-authoritative for deactivation (deliberately false — the T3-deadlock-safe posture).
     *
     * The metadata-catalog enumerates the Record-Service record types (standard + custom) — but it is
     * NOT the complete gamut of this connector's emitted IOs: the contract retains sublist-access-path
     * children (InvoiceItem, SalesOrderItem) that are reachable as nested graph children and NEVER
     * appear in the record-type catalog (SublistScopeExtension). It also returns lowercase record-type
     * SLUGS (`phonecall`) while Declared standard objects are humanized (`Phone Call`). An authoritative
     * (deactivating) refresh would therefore wrongly Disable every Declared sublist child and any object
     * whose catalog slug doesn't byte-match the Declared name. Per the convention rule — a partial/scoped
     * enumeration is NEVER authoritative — absence here proves nothing, so we deactivate nothing. The
     * standard universe is the Declared metadata baseline; a credential only ADDS the account's customs.
     */
    public override get DiscoveryIsAuthoritative(): boolean { return false; }

    /**
     * NetSuite governs by CONCURRENT-request limit (5–50 by tier), not requests/sec. We cap inner
     * concurrency conservatively below the smallest tier; the engine's adaptive controller ramps within it.
     */
    public override get MaxConcurrencyHint(): number { return NS_MAX_CONCURRENCY; }

    /** No documented RPS policy — concurrency-governed. Return null so the engine derives a conservative rate. */
    public override get RateLimitPolicy(): RateLimitPolicy | null { return null; }

    /**
     * SuiteQL fetches in `ORDER BY lastModifiedDate` and an updated record always re-surfaces at a new,
     * higher modstamp — so the last batch's max IS the true high-water mark. Safe for the engine to use
     * the returned watermark to narrow the next incremental.
     */
    public override get MonotonicWatermark(): boolean { return true; }

    /**
     * For watermark-less objects, NetSuite's universal numeric `id` is a stable monotonic ordering key
     * usable for keyset/seek resume.
     */
    public override StableOrderingKey(_objectName: string): string | null { return 'id'; }

    /** Parse NetSuite's 429 Retry-After (seconds) into ms; concurrency limit errors carry no precise hint. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const m = msg.match(/retry-after[:\s]+(\d+)/i);
        if (m) return parseInt(m[1], 10) * 1000;
        return undefined;
    }

    // ── Config / credential parsing ──────────────────────────────────────

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<NetSuiteConfig> {
        // Credential JSON takes precedence over the non-secret Configuration JSON.
        if (companyIntegration.CredentialID) {
            const md = provider ?? new Metadata();
            const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await cred.Load(companyIntegration.CredentialID);
            if (loaded && cred.Values) {
                return this.ValidateConfig(JSON.parse(cred.Values) as Record<string, unknown>);
            }
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration) as Record<string, unknown>);
        }
        throw new Error(
            'NetSuite connector requires a CredentialID or Configuration JSON carrying AccountID + auth credentials.'
        );
    }

    private ValidateConfig(raw: Record<string, unknown>): NetSuiteConfig {
        const parsed = NetSuiteConfigSchema.safeParse(raw);
        if (!parsed.success) {
            throw new Error(`NetSuite Configuration is invalid: ${parsed.error.issues.map(i => i.message).join('; ')}`);
        }
        return parsed.data;
    }

    /** Determines the auth mode from explicit AuthFlow or the credential keys present. */
    private ResolveAuthMode(config: NetSuiteConfig): NSAuthMode {
        if (config.AuthFlow === 'oauth2') return 'oauth2';
        if (config.AuthFlow === 'oauth1-tba') return 'oauth1-tba';
        if (config.BearerToken || config.AccessToken || config.RefreshToken) return 'oauth2';
        return 'oauth1-tba';
    }

    // ── Auth ─────────────────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const mode = this.ResolveAuthMode(config);
        const subdomain = config.AccountID.toLowerCase().replace(/_/g, '-');
        // Host derives from AccountID by default; an explicit Configuration.HostBaseURL (custom
        // gateway / mock vendor in e2e) wins when present. Trailing slash trimmed so APIPath joins clean.
        const hostBaseURL = (config.HostBaseURL && config.HostBaseURL.trim().length > 0)
            ? config.HostBaseURL.replace(/\/+$/, '')
            : `https://${subdomain}.suitetalk.api.netsuite.com`;
        const realm = config.AccountID.replace(/-/g, '_').toUpperCase();

        let bearerToken = '';
        if (mode === 'oauth2') {
            bearerToken = await this.ResolveBearerToken(config);
        } else {
            this.AssertTBACredentials(config);
        }

        return {
            Token: bearerToken,
            TokenType: mode === 'oauth2' ? 'Bearer' : 'OAuth1',
            Config: config,
            Mode: mode,
            HostBaseURL: hostBaseURL,
            Realm: realm,
            BearerToken: bearerToken,
        } as NSAuthContext;
    }

    private AssertTBACredentials(config: NetSuiteConfig): void {
        if (!config.ConsumerKey || !config.ConsumerSecret || !config.TokenID || !config.TokenSecret) {
            throw new Error(
                'NetSuite TBA (OAuth 1.0a) requires ConsumerKey, ConsumerSecret, TokenID, and TokenSecret.'
            );
        }
    }

    /**
     * Resolves a bearer token for OAuth2 mode. A pre-minted BearerToken/AccessToken is used directly
     * (NetSuite OAuth2 access tokens are supplied by the operator). When a RefreshToken + TokenURL +
     * client credentials are present, the shared OAuth2TokenManager refreshes — crypto-free token round-trip.
     */
    private async ResolveBearerToken(config: NetSuiteConfig): Promise<string> {
        const direct = config.BearerToken ?? config.AccessToken;
        if (config.RefreshToken && config.TokenURL && config.ClientID && config.ClientSecret) {
            const token = await this.oauth2Manager.GetAccessToken({
                TokenURL: config.TokenURL,
                ClientId: config.ClientID,
                ClientSecret: config.ClientSecret,
                RefreshToken: config.RefreshToken,
            }, 'refresh_token');
            return token.AccessToken;
        }
        if (direct) return direct;
        throw new Error(
            'NetSuite OAuth2 mode requires either a BearerToken/AccessToken, or RefreshToken + TokenURL + ClientID + ClientSecret.'
        );
    }

    // ── Headers ──────────────────────────────────────────────────────────

    /**
     * Base headers WITHOUT an Authorization value — the auth header is per-request (OAuth 1.0a signs
     * each URL+method) so it's injected in MakeHTTPRequest, not here. The base class calls BuildHeaders
     * for its generic CRUD / pagination GETs; MakeHTTPRequest stamps the signed/bearer Authorization.
     */
    protected override BuildHeaders(_auth: RESTAuthContext): Record<string, string> {
        return {
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    /** Builds the Authorization header for a specific URL + method (TBA signs per request; OAuth2 is static). */
    private BuildAuthorizationHeader(auth: NSAuthContext, url: string, method: string): string {
        if (auth.Mode === 'oauth2') {
            return `Bearer ${auth.BearerToken}`;
        }
        return OAuth1aSigner.BuildAuthorizationHeader({
            ConsumerKey: auth.Config.ConsumerKey!,
            ConsumerSecret: auth.Config.ConsumerSecret!,
            TokenId: auth.Config.TokenID!,
            TokenSecret: auth.Config.TokenSecret!,
            Method: method,
            Url: url,
            Realm: auth.Realm,
            SignatureMethod: 'HMAC-SHA256',
        });
    }

    // ── URL building ─────────────────────────────────────────────────────

    /** Base URL = host root; the IO's APIPath already carries the full /services/rest/... path. */
    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as NSAuthContext).HostBaseURL;
    }

    // ── HTTP transport ───────────────────────────────────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const nsAuth = auth as NSAuthContext;
        const effectiveHeaders = { ...headers, 'Authorization': this.BuildAuthorizationHeader(nsAuth, url, method) };
        if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
            // Record bodies use NetSuite's vendor media type unless a caller (SuiteQL) set its own.
            if (!effectiveHeaders['Content-Type']) effectiveHeaders['Content-Type'] = NS_RECORD_MEDIA_TYPE;
        }

        for (let attempt = 0; attempt <= NS_MAX_RETRIES; attempt++) {
            let response: Response;
            try {
                const opts: RequestInit = {
                    method,
                    headers: effectiveHeaders,
                    signal: AbortSignal.timeout(NS_REQUEST_TIMEOUT_MS),
                };
                if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
                    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
                }
                response = await fetch(url, opts);
            } catch (err) {
                if (attempt < NS_MAX_RETRIES && this.IsTransientNetworkError(err)) {
                    await this.Sleep(this.BackoffDelay(attempt));
                    continue;
                }
                throw err;
            }

            // Concurrency-limit rejection (429) or transient 5xx — back off + retry within budget.
            if ((response.status === 429 || response.status >= 500) && attempt < NS_MAX_RETRIES) {
                const retryAfter = this.ParseRetryAfterHeader(response);
                await this.Sleep(retryAfter ?? this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }
        throw new Error(`NetSuite request failed after ${NS_MAX_RETRIES + 1} attempts: ${url}`);
    }

    private async BuildRESTResponse(response: Response): Promise<RESTResponse> {
        const hdrs: Record<string, string> = {};
        response.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
        const ct = hdrs['content-type'] ?? '';
        let parsed: unknown;
        if (ct.includes('json')) {
            const text = await response.text();
            parsed = text.length > 0 ? JSON.parse(text) : {};
        } else {
            parsed = await response.text();
        }
        return { Status: response.status, Body: parsed, Headers: hdrs };
    }

    private ParseRetryAfterHeader(response: Response): number | undefined {
        const ra = response.headers.get('retry-after');
        if (!ra) return undefined;
        const secs = parseInt(ra, 10);
        return Number.isFinite(secs) ? secs * 1000 : undefined;
    }

    private IsTransientNetworkError(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return /econnreset|etimedout|enotfound|eai_again|socket hang up|network|fetch failed|timeout/i.test(msg);
    }

    private BackoffDelay(attempt: number): number {
        return Math.min(1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500), 30_000);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Response parsing ─────────────────────────────────────────────────

    /** Strips the NetSuite HATEOAS envelope: { items: [...] } → the items array; bare object → [object]. */
    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (!rawBody || typeof rawBody !== 'object') return [];
        const body = rawBody as NSPagedResponse & Record<string, unknown>;
        if (Array.isArray(body.items)) return body.items;
        // A single-record GET returns the record object directly (with a `links` HATEOAS array).
        if (Object.keys(body).length > 0) return [body];
        return [];
    }

    /** Offset pagination: hasMore flag + offset advance (or the next-link href when present). */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        const body = (rawBody && typeof rawBody === 'object') ? (rawBody as NSPagedResponse) : {};
        const records = this.NormalizeResponse(rawBody, null);
        // Prefer the explicit hasMore flag; fall back to "got a full page".
        const hasMore = body.hasMore ?? (records.length >= (pageSize || NS_DEFAULT_PAGE_SIZE));
        const nextOffset = this.NextOffsetFromLinks(body) ?? currentOffset + records.length;
        return {
            HasMore: hasMore,
            NextOffset: nextOffset,
            TotalRecords: body.totalResults,
        };
    }

    /** Reads the `offset` query param from the HATEOAS rel='next' link when the envelope provides one. */
    private NextOffsetFromLinks(body: NSPagedResponse): number | undefined {
        const next = body.links?.find(l => l.rel === 'next');
        if (!next?.href) return undefined;
        const qIdx = next.href.indexOf('?');
        if (qIdx === -1) return undefined;
        const off = new URLSearchParams(next.href.substring(qIdx + 1)).get('offset');
        const n = off != null ? parseInt(off, 10) : NaN;
        return Number.isFinite(n) ? n : undefined;
    }

    // ── TestConnection ───────────────────────────────────────────────────

    /** Validates credentials + host by running a trivial SuiteQL probe (no record dependency). */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NSAuthContext;
            // serverTime is the cheapest authenticated read and seeds the incremental watermark.
            const url = `${auth.HostBaseURL}${NS_SERVERTIME_PATH}`;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                const st = (response.Body as { time?: string; serverTime?: string } | undefined);
                const t = st?.serverTime ?? st?.time ?? 'unknown';
                return { Success: true, Message: `Connected to NetSuite (${auth.Mode}); server time ${t}` };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `NetSuite authentication failed: HTTP ${response.Status}` };
            }
            return { Success: false, Message: `NetSuite returned HTTP ${response.Status} from ${NS_SERVERTIME_PATH}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── Discovery (auth-gated metadata-catalog MECHANISM — no baked catalog) ──

    /**
     * Discovers objects by UNIONING the Declared baseline with the live metadata-catalog (case-2
     * auth-gated discovery). The Declared metadata (200+ standard record types + the sublist-access-path
     * children that the catalog never lists) is the floor — it is ALWAYS surfaced so a refresh can't drop
     * it. The catalog's record-type SLUGS (`phonecall`) are name-aligned back to the Declared name via the
     * cached Configuration.recordTypeSlug so a slug never duplicates an existing Declared object; an
     * unknown slug passes through as a NEW custom record. Net: standard universe always present + tenant
     * customs added. Non-authoritative (DiscoveryIsAuthoritative=false), so no object is ever deactivated.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const declared = await this.GetDeclaredObjects(companyIntegration, contextUser);
        const slugToDeclaredName = this.BuildSlugToDeclaredNameMap(companyIntegration.IntegrationID);
        const declaredNamesLower = new Set(declared.map(o => o.Name.toLowerCase()));

        const auth = await this.Authenticate(companyIntegration, contextUser) as NSAuthContext;
        const url = `${auth.HostBaseURL}${NS_METADATA_CATALOG_PATH}`;
        const headers = { ...this.BuildHeaders(auth), 'Accept': 'application/schema+json' };
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`NetSuite metadata-catalog returned HTTP ${response.Status} — cannot enumerate record types.`);
        }
        const slugs = this.ExtractCatalogNames(response.Body as NSCatalogResponse);

        const out: ExternalObjectSchema[] = [...declared];
        for (const slug of slugs) {
            // Name-align to the Declared name this slug maps to; for an UNKNOWN slug (a new custom record)
            // keep the slug VERBATIM as the Name — the slug is the API-addressable record-type identity, so
            // it must survive untouched for the discovered custom's CRUD/SuiteQL paths. (Label is humanized.)
            const name = slugToDeclaredName.get(slug.toLowerCase()) ?? slug;
            if (declaredNamesLower.has(name.toLowerCase())) continue; // already in the Declared floor
            declaredNamesLower.add(name.toLowerCase());
            out.push({
                Name: name,
                Label: this.HumanizeName(slug),
                Description: `NetSuite ${this.HumanizeName(slug)} record`,
                SupportsIncrementalSync: true,
                SupportsWrite: true,
            });
        }
        return out;
    }

    /**
     * The Declared (cached) baseline objects — the floor DiscoverObjects always surfaces. Seam over the
     * base class's cache read so the union logic is unit-testable without a DB-backed engine.
     */
    protected GetDeclaredObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return super.DiscoverObjects(companyIntegration, contextUser);
    }

    /** Maps each Declared IO's Configuration.recordTypeSlug → its Declared Name (for catalog name-alignment). */
    protected BuildSlugToDeclaredNameMap(integrationID: string): Map<string, string> {
        const map = new Map<string, string>();
        const objects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID);
        for (const obj of objects) {
            const slug = this.ReadRecordTypeSlug(obj.Configuration);
            if (slug) map.set(slug.toLowerCase(), obj.Name);
        }
        return map;
    }

    /**
     * Resolves the metadata-catalog slug for an object name: the cached IO's Configuration.recordTypeSlug
     * when present (the authoritative slug, e.g. `phonecall` for `Phone Call`), else a name collapse.
     */
    private ResolveRecordTypeSlug(integrationID: string, objectName: string): string {
        try {
            const obj = this.GetCachedObject(integrationID, objectName);
            const slug = this.ReadRecordTypeSlug(obj.Configuration);
            if (slug) return slug;
        } catch {
            // object not in cache (a freshly-discovered custom) — fall through to name collapse
        }
        return objectName.toLowerCase().replace(/\s+/g, '');
    }

    /** Tolerantly reads Configuration.recordTypeSlug from an IO's Configuration JSON. */
    private ReadRecordTypeSlug(configuration: string | null | undefined): string | undefined {
        if (!configuration) return undefined;
        try {
            const cfg = JSON.parse(configuration) as Record<string, unknown>;
            return typeof cfg.recordTypeSlug === 'string' ? cfg.recordTypeSlug : undefined;
        } catch {
            return undefined;
        }
    }

    /** Pulls record-type names from the catalog's `items[].name` or `links[].href` trailing segment. */
    private ExtractCatalogNames(body: NSCatalogResponse): string[] {
        const out: string[] = [];
        for (const it of body.items ?? []) {
            if (it.name) out.push(it.name);
        }
        if (out.length === 0) {
            for (const lk of body.links ?? []) {
                if (lk.rel === 'self' || !lk.href) continue;
                const seg = lk.href.split('/').filter(Boolean).pop();
                if (seg) out.push(seg);
            }
        }
        return out;
    }

    /**
     * Discovers fields for a record type from the metadata-catalog JSON-schema for that type. The schema
     * `properties` map → fields; `required` → IsRequired; `readOnly`/computed markers → IsReadOnly; the
     * universal numeric `id` is the PK. Falls back to the cached Declared fields when the catalog can't
     * describe this type.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as NSAuthContext;
        // Prefer the IO's Configuration.recordTypeSlug (authoritative slug); else collapse the name.
        const slug = this.ResolveRecordTypeSlug(companyIntegration.IntegrationID, objectName);
        const url = `${auth.HostBaseURL}${NS_METADATA_CATALOG_PATH}/${encodeURIComponent(slug)}`;
        const headers = { ...this.BuildHeaders(auth), 'Accept': 'application/schema+json' };
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status >= 200 && response.Status < 300) {
            const parsed = this.ParseFieldSchema(response.Body);
            if (parsed.length > 0) return parsed;
        }
        // Could not describe via catalog — defer to the Declared metadata (cache) the base class returns.
        return super.DiscoverFields(companyIntegration, objectName, contextUser);
    }

    /** Maps a JSON-schema describe body to ExternalFieldSchema[] (provable-only: only stated flags). */
    private ParseFieldSchema(body: unknown): ExternalFieldSchema[] {
        if (!body || typeof body !== 'object') return [];
        const schema = body as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
        if (!schema.properties) return [];
        const required = new Set(schema.required ?? []);
        const fields: ExternalFieldSchema[] = [];
        for (const [name, prop] of Object.entries(schema.properties)) {
            const isId = name === 'id';
            fields.push({
                Name: name,
                Label: String(prop['title'] ?? this.HumanizeName(name)),
                Description: typeof prop['description'] === 'string' ? prop['description'] : undefined,
                DataType: this.MapSchemaType(prop),
                IsRequired: required.has(name),
                IsPrimaryKey: isId || undefined,
                IsUniqueKey: isId,
                IsReadOnly: prop['readOnly'] === true || isId,
            });
        }
        if (!fields.some(f => f.Name === 'id')) {
            fields.unshift({
                Name: 'id', Label: 'Internal ID', Description: 'NetSuite internal record ID',
                DataType: 'string', IsRequired: false, IsPrimaryKey: true, IsUniqueKey: true, IsReadOnly: true,
            });
        }
        return fields;
    }

    /** Maps a JSON-schema property to a generic source type. */
    private MapSchemaType(prop: Record<string, unknown>): string {
        const t = String(prop['type'] ?? '').toLowerCase();
        const fmt = String(prop['format'] ?? '').toLowerCase();
        if (fmt.includes('date') || fmt.includes('time')) return 'datetime';
        if (t === 'integer') return 'number';
        if (t === 'number') return 'decimal';
        if (t === 'boolean') return 'boolean';
        return 'string';
    }

    private HumanizeName(name: string): string {
        return name
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]/g, ' ')
            .trim()
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ') || name;
    }

    // ── FetchChanges — SuiteQL (the one idiosyncratic override) ──────────
    //
    // OVERRIDE RATIONALE: NetSuite reads run through SuiteQL (POST with SQL in the body + the required
    // `Prefer: transient` header) so the lastModifiedDate incremental predicate can be expressed — a
    // shape the base class's generic GET path cannot produce. CRUD stays on the generic per-operation path.

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NSAuthContext;

        const cfg = this.ReadIOConfig(obj);
        // SuiteQL table = the IO's configured suiteQLTable; fall back to the catalog slug (collapsed name).
        const table = cfg.suiteQLTable ?? this.ResolveRecordTypeSlug(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const watermarkField = obj.IncrementalWatermarkField ?? 'lastModifiedDate';
        const offset = ctx.CurrentOffset ?? 0;
        const pageSize = obj.DefaultPageSize ?? cfg.defaultPageSize ?? NS_DEFAULT_PAGE_SIZE;

        const sql = this.BuildSuiteQL(table, watermarkField, ctx.WatermarkValue);
        const url = `${auth.HostBaseURL}${NS_SUITEQL_PATH}?limit=${pageSize}&offset=${offset}`;
        // SuiteQL bodies are plain JSON and REQUIRE the `Prefer: transient` header.
        const headers = {
            ...this.BuildHeaders(auth),
            'Content-Type': 'application/json',
            'Prefer': 'transient',
        };
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, { q: sql });
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(
                `NetSuite SuiteQL read failed for "${ctx.ObjectName}": HTTP ${response.Status} — ${this.PreviewBody(response.Body)}`
            );
        }

        const body = response.Body as NSPagedResponse;
        const rawRecords = this.NormalizeResponse(body, null);
        const pkFieldNames = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);
        const records: ExternalRecord[] = rawRecords.map(raw =>
            this.BuildExternalRecord(raw, ctx.ObjectName, pkFieldNames)
        );

        const hasMore = body.hasMore ?? (rawRecords.length >= pageSize);
        // Track the max watermark and persist it ONLY when the full result set has been drained
        // (partial-failure semantics: a mid-iteration stop leaves the watermark unchanged).
        const newWatermark = !hasMore ? this.MaxWatermark(rawRecords, watermarkField) : undefined;

        return {
            Records: records,
            HasMore: hasMore,
            NextOffset: offset + rawRecords.length,
            NewWatermarkValue: newWatermark,
        };
    }

    /** Builds the SuiteQL SELECT, applying the incremental watermark predicate when a watermark exists. */
    private BuildSuiteQL(table: string, watermarkField: string, watermark: string | null): string {
        const where = watermark
            ? ` WHERE ${watermarkField} > ${this.QuoteSuiteQLDate(watermark)}`
            : '';
        return `SELECT * FROM ${table}${where} ORDER BY ${watermarkField}`;
    }

    /** Quotes a watermark value for SuiteQL — wraps a NetSuite datetime in TO_DATE/quotes, escaping quotes. */
    private QuoteSuiteQLDate(value: string): string {
        const escaped = value.replace(/'/g, "''");
        return `'${escaped}'`;
    }

    /** Returns the maximum value of the watermark field across the batch (string compare on ISO timestamps). */
    private MaxWatermark(records: Record<string, unknown>[], field: string): string | undefined {
        let max: string | undefined;
        for (const r of records) {
            const v = r[field];
            if (typeof v === 'string' && v.length > 0 && (!max || v > max)) max = v;
        }
        return max;
    }

    /**
     * Builds an ExternalRecord carrying the FULL source record in Fields (full-record pass-through, so the
     * framework's custom-column capture sees every key) and the universal `id` as the ExternalID. Mirrors
     * the base class's composite-PK + content-hash fallback at the connector boundary for hand-built records.
     */
    private BuildExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        const keys = pkFieldNames.length > 0 ? pkFieldNames : ['id'];
        const parts = keys.map(k => {
            const v = raw[k];
            return v == null ? '' : String(v);
        });
        const allPresent = parts.every(p => p.length > 0);
        const externalID = allPresent ? parts.join('|') : String(raw['id'] ?? '');
        return {
            ExternalID: externalID,
            ObjectType: objectType,
            Fields: raw,
        };
    }

    /** Reads the IO's Configuration JSON (suiteQLTable, defaultPageSize) tolerantly. */
    private ReadIOConfig(obj: { Configuration?: string | null }): { suiteQLTable?: string; defaultPageSize?: number } {
        if (!obj.Configuration) return {};
        try {
            const cfg = JSON.parse(obj.Configuration) as Record<string, unknown>;
            return {
                suiteQLTable: typeof cfg.suiteQLTable === 'string' ? cfg.suiteQLTable : undefined,
                defaultPageSize: typeof cfg.defaultPageSize === 'number' ? cfg.defaultPageSize : undefined,
            };
        } catch {
            return {};
        }
    }

    private PreviewBody(body: unknown): string {
        const s = typeof body === 'string' ? body : JSON.stringify(body);
        return s ? s.substring(0, 300) : '';
    }
}

// Tree-shaking prevention — REQUIRED so @RegisterClass survives bundling.
export function LoadNetSuiteConnector(): void { /* intentionally empty */ }
