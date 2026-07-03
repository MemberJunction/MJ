import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
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
    type RateLimitPolicy,
    // NOTE: no auth-helper crypto imported — Stripe uses a static secret-key Bearer (no signing, no OAuth flow).
} from '@memberjunction/integration-engine';

// ─── Design note ────────────────────────────────────────────────────────
//
// The Stripe connector is PURE MECHANISM. The object/field catalog (64 IOs, 1450 fields) is NOT baked
// here — it lives in the Declared metadata (metadata/integrations/stripe/.stripe.integration.json),
// seeded from Stripe's credential-free OpenAPI spec (case-1 discovery). Discovery is INHERITED from
// BaseRESTIntegrationConnector: DiscoverObjects / DiscoverFields / IntrospectSchema re-read the persisted
// Declared metadata from the IntegrationEngineBase cache. There is NO hardcoded object list, NO field
// catalog, NO baked PK/FK/required/readonly constants in this file.
//
// What this connector implements — the Stripe protocol shape over REST/JSON:
//  - Auth: single secret-key Bearer (`Authorization: Bearer <sk_...>`) + a `Stripe-Version` header. No refresh.
//  - Reads: standard JSON; list endpoints wrap records in a `data[]` envelope → NormalizeResponse unwraps it.
//  - Pagination: CURSOR — `has_more` flags continuation; `starting_after=<last data[].id>` advances; limit≤100.
//  - Writes: **application/x-www-form-urlencoded** with BRACKET NOTATION for nested/array attrs
//    (`metadata[key]=value`, `items[0][price]=...`) — NEVER JSON. This is the single most Stripe-specific
//    trap; it is handled at the MakeHTTPRequest transport boundary. Update is a POST (not PATCH/PUT),
//    driven by the metadata UpdateMethod column — never hardcoded.
//  - Incremental: WatermarkService + the IO's IncrementalWatermarkField. NOTE the recorded asymmetry —
//    the record-cursor field is the object's own timestamp (`created`, or `date` for invoiceitem), while
//    the list-endpoint date-range filter is ALWAYS the `created[gte]` query param. We track the watermark
//    off the object field but send the documented `created[gte]` list filter.
//
// Generic per-operation CRUD (CreateRecord/UpdateRecord/DeleteRecord/GetRecord) is INHERITED from the base
// — it reads the per-op IO columns (CreateAPIPath/Method/BodyShape/BodyKey/IDLocation, Update*, Delete*)
// and routes create through BuildCreatedResult. We override NONE of the CRUD verbs; the sole Stripe-specific
// write concern (form-encoding) is injected once at the transport boundary, so every writable IO delegates
// to the generic path.

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed Stripe credential. A single long-lived secret key (`sk_live_...` / `sk_test_...`). */
interface StripeCredentials {
    /** Secret key, sent verbatim as `Authorization: Bearer <SecretKey>`. */
    SecretKey: string;
    /** Optional pinned API version (`Stripe-Version` header). Defaults to the account-pinned version when absent. */
    APIVersion?: string;
}

/** Extended auth context carrying the resolved Stripe secret key + optional pinned version. */
interface StripeAuthContext extends RESTAuthContext {
    Token: string;
    APIVersion?: string;
}

/**
 * The Stripe list envelope. Every list endpoint returns records under `data[]`, a boolean `has_more`
 * flag, an `object: "list"` discriminator, and the source `url`. Records themselves are opaque vendor JSON.
 */
interface StripeListEnvelope {
    object?: string;
    data?: unknown[];
    has_more?: boolean;
    url?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Stripe API host. Fixed base — the version segment (`/v1`) lives in each object's APIPath (metadata-driven). */
const STRIPE_API_BASE = 'https://api.stripe.com';

/** Stripe list page size cap (docs: limit range 1–100, default 10). We request the max to minimize round-trips. */
const STRIPE_LIST_MAX_PAGE = 100;

/**
 * Default pinned Stripe API version. Overridable per-connection via the credential/Configuration JSON
 * (APIVersion / stripeVersion). Omitting the header falls back to the key's account-default version;
 * we pin a known-good date-version so the response shape is stable across accounts. Source:
 * Configuration.APIVersioningStrategy (OpenAPI info.version + docs.stripe.com/api).
 */
const STRIPE_DEFAULT_API_VERSION = '2026-06-24.dahlia';

// ─── StripeConnector ───────────────────────────────────────────────────

/**
 * Stripe connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 *
 * Discovery, generic per-operation CRUD, template-var traversal (nested paths like
 * `/v1/accounts/{account}/persons`), and the paginated GET loop are inherited. This class supplies only
 * the Stripe-specific protocol surface: secret-key Bearer auth + version header, the `starting_after`
 * cursor over the `data[]` envelope, form-encoded bracket-notation write bodies, the `created[gte]`
 * incremental filter, connection testing, and the §7/§10 sync-efficiency hooks the contract evidences.
 */
@RegisterClass(BaseIntegrationConnector, 'StripeConnector')
export class StripeConnector extends BaseRESTIntegrationConnector {

    /** Cached auth for the lifetime of a single sync run (Stripe secret keys don't expire). */
    private cachedAuth: StripeAuthContext | null = null;

    // ── Identity (T1 three-way invariant) ────────────────────────────

    /** Verbatim `MJ: Integrations.Name`. Load-bearing: the T1 three-way name check compares this === metadata Name. */
    public override get IntegrationName(): string {
        return 'stripe';
    }

    // ── Capability getters (kept in lockstep with the per-op metadata columns) ──

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Absence in a refresh proves
     * nothing → never deactivate. Matches Configuration.DiscoveryIsAuthoritative semantics for a Declared connector.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ── Sync-efficiency hooks (§7/§10 — populated from frozen-contract Configuration facts) ──

    /**
     * From Configuration.RateLimitPolicy: LIVE mode 100 req/s per account, TEST mode 25 req/s. We pace at
     * the conservative test-mode figure (the credential-free / self-serve path uses sk_test_ keys) with a
     * live-mode burst headroom; the engine's AIMD bucket ramps toward the live ceiling on clean traffic and
     * backs off on a 429. Per-resource overrides (payout create 15/s, etc.) are documented but not modeled —
     * the account-wide baseline is the binding ceiling for the single shared bucket.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 25, Burst: 100 };
    }

    /**
     * Stripe returns `Retry-After` (seconds) on a 429 (`lock_timeout` / `rate_limit` errors). Parse it to ms
     * so the engine's AIMD bucket backs off by Stripe's actual instruction rather than a guess.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const headers = this.ExtractHeadersFromError(error);
        if (!headers) return undefined;
        const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
        if (retryAfter != null) {
            const secs = Number(retryAfter);
            if (!isNaN(secs) && secs >= 0) return Math.ceil(secs * 1000);
        }
        return undefined;
    }

    /** Conservative in-flight cap. Stripe tolerates parallelism but the per-account req/s is the real ceiling. */
    public override get MaxConcurrencyHint(): number | null {
        return 4;
    }

    /**
     * No-watermark objects (payment_method, subscription_item, and the nested reporting lists) resume by the
     * universal `id` keyset — Stripe lists are stably id-ordered within the reverse-chronological page, and the
     * `starting_after` cursor IS an id keyset. Read the object's declared StableOrderingKey (typically `id`),
     * else its PK. Returns null when no stable key exists or the cache is unavailable (unit-test context).
     */
    public override StableOrderingKey(objectName: string): string | null {
        const obj = this.TryGetCachedObject(objectName);
        if (!obj) return null;
        const declared = (obj as unknown as { StableOrderingKey?: string | null }).StableOrderingKey;
        if (declared && declared.trim().length > 0) return declared.trim();
        const pk = this.GetCachedFields(obj.ID).find(f => f.IsPrimaryKey);
        return pk?.Name ?? null;
    }

    // ── Abstract REST hooks ──────────────────────────────────────────

    /**
     * Resolves the Stripe secret key (and optional pinned API version) from the linked Credential entity
     * (preferred) or the CompanyIntegration Configuration JSON (fallback). Cached for the run.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.cachedAuth) return this.cachedAuth;
        const creds = await this.LoadCredentials(companyIntegration, contextUser);
        this.cachedAuth = { Token: creds.SecretKey, APIVersion: creds.APIVersion };
        return this.cachedAuth;
    }

    /**
     * Stripe auth: secret-key Bearer + the `Stripe-Version` header pinning the response shape. `Accept`
     * is JSON (all reads/writes return JSON). The write Content-Type (`application/x-www-form-urlencoded`)
     * is NOT set here — it is applied at MakeHTTPRequest only for requests that carry a body, because GET
     * reads must not advertise a form content type.
     */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const ctx = auth as StripeAuthContext;
        return {
            'Authorization': `Bearer ${ctx.Token}`,
            'Stripe-Version': ctx.APIVersion && ctx.APIVersion.length > 0 ? ctx.APIVersion : STRIPE_DEFAULT_API_VERSION,
            'Accept': 'application/json',
        };
    }

    /**
     * HTTP transport (fetch). Owns the wire boundary; test subclasses override this to capture requests.
     *
     * Stripe write bodies are **form-encoded** with bracket notation (NEVER JSON) — the single most
     * Stripe-specific trap. When a body is present we serialize it via {@link EncodeFormBody} and set
     * `Content-Type: application/x-www-form-urlencoded`. GET reads carry no body and no form content type.
     */
    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        let fetchBody: string | undefined;
        const outHeaders: Record<string, string> = { ...headers };
        if (body !== undefined && body !== null) {
            fetchBody = this.EncodeFormBody(body);
            outHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        const response = await fetch(url, { method, headers: outHeaders, body: fetchBody });
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });
        const text = await response.text();
        let parsed: unknown = null;
        if (text.length > 0) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        return { Status: response.status, Body: parsed, Headers: respHeaders };
    }

    /**
     * Strips the Stripe list envelope. List endpoints nest records under `data[]` (the metadata sets
     * ResponseDataKey='data'); a bare-array or single-object body (get-one, delete-ack) is the record itself.
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;
            const key = responseDataKey ?? 'data';
            const arr = body[key];
            if (Array.isArray(arr)) return arr as Record<string, unknown>[];
            // get-one / delete-ack / non-list shape: the body IS the record.
            return [body];
        }
        return [];
    }

    /**
     * Stripe pagination is ALWAYS cursor-based: `has_more` in the list envelope flags continuation, and the
     * next cursor is the `id` of the LAST object in the current `data[]` page (passed back as
     * `starting_after` by BuildPaginatedURL). currentPage/offset/pageSize are unused for cursor pagination.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (rawBody && typeof rawBody === 'object') {
            const env = rawBody as StripeListEnvelope;
            if (env.has_more === true && Array.isArray(env.data) && env.data.length > 0) {
                const last = env.data[env.data.length - 1];
                const lastId = this.ExtractStripeID(last as Record<string, unknown>);
                if (lastId.length > 0) {
                    return { HasMore: true, NextCursor: lastId };
                }
            }
        }
        return { HasMore: false };
    }

    /**
     * The Stripe API host. Defaults to the fixed production host, but is overridable via a `BaseURL`
     * key on `CompanyIntegration.Configuration` — required so the credential-free e2e mock can point the
     * REAL connector at a local mock server, and useful for a Stripe-compatible proxy. The `/v1` version
     * segment stays metadata-driven (per-object APIPath).
     */
    protected override GetBaseURL(companyIntegration?: MJCompanyIntegrationEntity): string {
        const cfg = companyIntegration?.Configuration;
        if (cfg) {
            try {
                const parsed = JSON.parse(cfg) as Record<string, unknown>;
                const override = parsed.BaseURL ?? parsed.baseURL ?? parsed.BaseUrl;
                if (typeof override === 'string' && override.trim().length > 0) {
                    return override.trim().replace(/\/+$/, '');
                }
            } catch { /* Configuration is not JSON — fall through to the default host */ }
        }
        return STRIPE_API_BASE;
    }

    /**
     * Stripe uses the `starting_after` cursor query param (NOT the base default `cursor=`). On the first
     * page no cursor is sent; subsequent pages send `starting_after=<last data[].id>`. `limit` caps the
     * page size (≤100).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = Math.min(effectivePageSize ?? obj.DefaultPageSize ?? STRIPE_LIST_MAX_PAGE, STRIPE_LIST_MAX_PAGE);
        const separator = basePath.includes('?') ? '&' : '?';
        const parts = [`limit=${pageSize}`];
        if (cursor) parts.push(`starting_after=${encodeURIComponent(cursor)}`);
        return `${basePath}${separator}${parts.join('&')}`;
    }

    // ── FetchChanges override (incremental: created[gte] range filter + watermark tracking) ──

    /**
     * OVERRIDDEN because Stripe's incremental mechanism must inject a `created[gte]=<unix>` range filter
     * into the list URL AND compute the new watermark from each record's own timestamp field — neither of
     * which the base flat/paginated fetch does. The base's `starting_after` cursor paging (via our
     * BuildPaginatedURL / ExtractPaginationInfo overrides) and full-record pass-through are reused.
     *
     * Routing:
     *  - A list-capable object WITH a watermark this run (SupportsIncrementalSync + a WatermarkValue) →
     *    the incremental path: append `created[gte]` to the base path, run the inherited pagination loop,
     *    then compute NewWatermarkValue from the max object-timestamp seen (only on full drain).
     *  - Everything else (first full pull, no-watermark objects, nested template-var paths) → the inherited
     *    base fetch, which handles the `starting_after` cursor and template-var traversal unchanged.
     *
     * The asymmetry the contract records: the record-cursor field is the object's own timestamp
     * (IncrementalWatermarkField — `created` for most, `date` for invoiceitem), but the list-endpoint filter
     * param is ALWAYS `created[gte]`. We track the watermark off the object field; we send `created[gte]`.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (!this.UseIncremental(obj, ctx)) {
            return super.FetchChanges(ctx);
        }
        return this.FetchChangesIncremental(obj, ctx);
    }

    /**
     * Incremental applies only when the object supports it, carries a watermark this run, and its APIPath is
     * a flat list endpoint (no template vars — nested reporting lists don't take a `created` filter and are
     * left to the base template-var traversal).
     */
    private UseIncremental(obj: MJIntegrationObjectEntity, ctx: FetchContext): boolean {
        if (!obj.SupportsIncrementalSync) return false;
        if (ctx.WatermarkValue == null || ctx.WatermarkValue.length === 0) return false;
        if (/\{[A-Za-z]+\}/.test(obj.APIPath)) return false;
        return true;
    }

    /**
     * Incremental fetch: append `created[gte]=<unix>` to the list APIPath, run the inherited paginated GET
     * loop (which uses `starting_after` + `limit` and unwraps `data[]`), then advance the watermark to the
     * max object-timestamp seen — but only on a fully-drained batch (HasMore=false), so a partial batch
     * never advances the watermark (partial-failure safety; the engine persists it on full-batch success).
     */
    private async FetchChangesIncremental(obj: MJIntegrationObjectEntity, ctx: FetchContext): Promise<FetchBatchResult> {
        const watermarkField = obj.IncrementalWatermarkField ?? 'created';
        const sinceUnix = this.WatermarkToUnix(ctx.WatermarkValue);

        // Append the documented list-endpoint range filter (`created[gte]`) to the APIPath WITHOUT mutating
        // the shared engine-cache row — we build the URL string locally and drive the pagination loop directly.
        const separator = obj.APIPath.includes('?') ? '&' : '?';
        const filteredPath = `${obj.APIPath}${separator}created[gte]=${sinceUnix}`;

        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = this.FindPrimaryKeyFieldNamesLocal(fields);
        const baseURL = this.GetBaseURL();
        const basePath = `${baseURL}${filteredPath.startsWith('/') ? '' : '/'}${filteredPath}`;

        const { records, hasMore, maxWatermark } = await this.RunIncrementalPagination(
            auth, basePath, obj, fields, ctx, watermarkField, sinceUnix, pkFieldNames
        );

        if (hasMore) {
            return { Records: records, HasMore: true, NextCursor: this.CursorFromLast(records) };
        }
        return { Records: records, HasMore: false, NewWatermarkValue: String(maxWatermark) };
    }

    /**
     * Runs the paginated `starting_after` loop against a `created[gte]`-filtered base path, accumulating up
     * to BatchSize records, tracking the max object-timestamp seen. Resumes from ctx.CurrentCursor.
     */
    private async RunIncrementalPagination(
        auth: RESTAuthContext,
        basePath: string,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        ctx: FetchContext,
        watermarkField: string,
        sinceUnix: number,
        pkFieldNames: string[]
    ): Promise<{ records: ExternalRecord[]; hasMore: boolean; maxWatermark: number }> {
        const headers = this.BuildHeaders(auth);
        const batchLimit = ctx.BatchSize ?? Number.MAX_SAFE_INTEGER;
        const out: ExternalRecord[] = [];
        let cursor = ctx.CurrentCursor;
        let maxWatermark = sinceUnix;
        let hasMore = true;

        while (hasMore && out.length < batchLimit) {
            const remaining = batchLimit - out.length;
            const url = this.BuildPaginatedURL(basePath, obj, 1, 0, cursor, remaining);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) {
                throw new Error(`[stripe] incremental fetch failed for "${obj.Name}": HTTP ${response.Status}`);
            }
            const raw = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
            if (raw.length === 0) { hasMore = false; break; }

            for (const r of raw) {
                out.push(this.RawToExternalRecord(this.applyTransformPreservingKeys(r, obj, fields), obj.Name, pkFieldNames));
                const ts = this.ReadTimestamp(r, watermarkField);
                if (ts != null && ts > maxWatermark) maxWatermark = ts;
            }

            const page = this.ExtractPaginationInfo(response.Body, obj.PaginationType, 1, 0, obj.DefaultPageSize ?? raw.length);
            hasMore = page.HasMore;
            cursor = page.NextCursor;
        }

        return { records: out, hasMore, maxWatermark };
    }

    // ── CRUD ──────────────────────────────────────────────────────────
    //
    // Every writable IO (customer, charge, product, subscription, invoice, …) uses the INHERITED generic
    // CreateRecord / UpdateRecord / DeleteRecord / GetRecord from BaseRESTIntegrationConnector, which read
    // the per-operation IO columns (CreateAPIPath/Method, CreateBodyShape='flat', CreateIDLocation='body',
    // UpdateMethod='POST', UpdateIDLocation='path', DeleteMethod/Location) and handle the path-substituted
    // id + the loud-on-empty-id BuildCreatedResult correctly. Stripe's ONLY write idiosyncrasy —
    // form-encoded bracket-notation bodies — is injected once at the MakeHTTPRequest transport boundary
    // (EncodeFormBody), so NO CRUD verb needs overriding. Update-is-POST is metadata-driven (UpdateMethod),
    // NOT hardcoded to PATCH. The ONE path-shaping override needed is SubstituteIDInPath below, because
    // Stripe names its id placeholder after the resource ({customer}/{invoice}/…), which the generic base
    // (which only knows {id}/{ID}/{ExternalID}) cannot substitute.

    /**
     * Substitute the record id into a Stripe single-resource path. Stripe names its id placeholder after
     * the resource (`/v1/customers/{customer}`, `/v1/invoices/{invoice}`,
     * `/v1/subscriptions/{subscription_exposed_id}`) rather than the generic `{id}`/`{ID}`/`{ExternalID}`
     * the base handles, and it ALWAYS carries the update/delete target id in the PATH (never the request
     * body). We let the base run first (a harmless no-op on a named placeholder), then substitute the
     * TRAILING `{placeholder}` — the record's own id — leaving any LEADING parent placeholder (e.g. the
     * `{account}` in `/v1/accounts/{account}/persons/{person}`) for parent-chain resolution. Substitution
     * is driven by the path SHAPE (a trailing placeholder is unambiguously an id slot), not the metadata
     * IDLocation — so it is correct even where an object's DeleteIDLocation was recorded as `body`.
     */
    protected override SubstituteIDInPath(path: string, externalID: string, idLocation: string | null): string {
        const base = super.SubstituteIDInPath(path, externalID, idLocation);
        if (!/\{[^}]+\}$/.test(base)) return base;
        return base.replace(/\{[^}]+\}$/, encodeURIComponent(externalID));
    }

    // ── Connection test ──────────────────────────────────────────────

    /**
     * Tests the connection by hitting the balance endpoint (`GET /v1/balance`) — a cheap, always-present,
     * account-scoped read. A 2xx confirms the secret key is valid; 401 → auth failure; anything else → error.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const url = `${this.GetBaseURL(companyIntegration)}/v1/balance`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: 'Stripe connection successful.' };
            }
            if (response.Status === 401) {
                return { Success: false, Message: 'Stripe authentication failed (HTTP 401). Check the secret key (sk_live_… / sk_test_…).' };
            }
            return { Success: false, Message: `Stripe connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Stripe connection test error: ${msg}` };
        }
    }

    // ── Credential loading ───────────────────────────────────────────

    /** Reads the secret key (+ optional version) from the linked Credential entity, or the Configuration JSON fallback. */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<StripeCredentials> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const creds = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (creds) return creds;
        }
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const creds = this.ParseCredentialJson(configJson);
            if (creds) return creds;
        }
        throw new Error(
            'No Stripe credential found. Attach a credential carrying a secret key ' +
            '(secretKey / apiKey / Token), or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /** Loads a credential row and parses its Values JSON. */
    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<StripeCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /** Extracts a Stripe secret key (+ optional pinned version) from a credential/config JSON string. */
    private ParseCredentialJson(json: string): StripeCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            const key = this.FirstString(parsed, ['secretKey', 'SecretKey', 'apiKey', 'ApiKey', 'Token', 'token']);
            if (!key) return null;
            const version = this.FirstString(parsed, ['stripeVersion', 'StripeVersion', 'apiVersion', 'APIVersion']);
            return { SecretKey: key, APIVersion: version };
        } catch {
            return null;
        }
    }

    // ── Form-encoding (Stripe write bodies) ──────────────────────────

    /**
     * Serializes an attributes object to `application/x-www-form-urlencoded` with Stripe BRACKET NOTATION
     * for nested objects and arrays. This is the binding Stripe write idiosyncrasy — the API accepts ZERO
     * JSON request bodies (spec S4.1). Examples:
     *   { name: 'A', metadata: { tier: 'gold' } }        → name=A&metadata[tier]=gold
     *   { expand: ['customer'] }                          → expand[]=customer
     *   { items: [{ price: 'price_1' }] }                 → items[0][price]=price_1
     * Null/undefined values are omitted (Stripe treats an absent param as unset, not clear-to-null).
     */
    private EncodeFormBody(body: unknown): string {
        const pairs: string[] = [];
        this.FlattenFormPairs('', body, pairs);
        return pairs.join('&');
    }

    /** Recursively flattens a value into `key[...]=value` form pairs using Stripe bracket notation. */
    private FlattenFormPairs(prefix: string, value: unknown, out: string[]): void {
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) {
            if (value.length === 0) return;
            value.forEach((item, i) => {
                // Scalars in an array use `key[]=v`; objects/arrays are indexed `key[i]...`.
                const isScalar = item === null || typeof item !== 'object';
                const childPrefix = isScalar ? `${prefix}[]` : `${prefix}[${i}]`;
                this.FlattenFormPairs(childPrefix, item, out);
            });
            return;
        }
        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                const childPrefix = prefix.length === 0 ? k : `${prefix}[${k}]`;
                this.FlattenFormPairs(childPrefix, v, out);
            }
            return;
        }
        // Scalar leaf. After excluding null/undefined/array/object above, narrow the residual `unknown`
        // to the primitive types Stripe form values actually take; coerce any other residual defensively.
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(this.ScalarToString(value))}`);
        } else {
            out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
        }
    }

    /** Coerces a scalar (string/number/boolean) to its Stripe form value string. */
    private ScalarToString(value: string | number | boolean): string {
        return typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /** Gets an IO from the cache without throwing (used by StableOrderingKey, which may be called early). */
    private TryGetCachedObject(objectName: string): MJIntegrationObjectEntity | null {
        try {
            const integ = IntegrationEngineBase.Instance.GetIntegrationByName(this.IntegrationName);
            if (!integ) return null;
            return IntegrationEngineBase.Instance.GetIntegrationObject(integ.ID, objectName) ?? null;
        } catch {
            return null;
        }
    }

    /** Returns the first present, non-empty string value among the given keys. */
    private FirstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }

    /** PK field names in Sequence order (falls back to ['id'] — Stripe's universal PK — when unmarked). */
    private FindPrimaryKeyFieldNamesLocal(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
        return pk.length > 0 ? pk : ['id'];
    }

    /**
     * Builds an ExternalRecord with the FULL source record in Fields (full-record pass-through — the
     * framework's custom-column capture diffs keys(Fields) against the field maps). ExternalID is the
     * composite PK (when every component is present + non-empty) or the raw Stripe `id`.
     */
    private RawToExternalRecord(raw: Record<string, unknown>, objectType: string, pkFieldNames: string[]): ExternalRecord {
        const allPresent = pkFieldNames.length > 0 && pkFieldNames.every(n => raw[n] != null && String(raw[n]).length > 0);
        const externalID = allPresent
            ? pkFieldNames.map(n => String(raw[n])).join('|')
            : this.ExtractStripeID(raw);
        return { ExternalID: externalID, ObjectType: objectType, Fields: raw };
    }

    /** Stripe's system id lives at the object root as `id` (e.g. `cus_...`, `ch_...`, `in_...`). */
    private ExtractStripeID(raw: Record<string, unknown>): string {
        return raw.id != null ? String(raw.id) : '';
    }

    /** The `starting_after` cursor for the next page is the id of the last record emitted this batch. */
    private CursorFromLast(records: ExternalRecord[]): string | undefined {
        if (records.length === 0) return undefined;
        const last = records[records.length - 1];
        return last.ExternalID.length > 0 ? last.ExternalID : undefined;
    }

    /**
     * Converts a watermark value to a Stripe UNIX-seconds integer (Stripe's `created[gte]` filter compares
     * against a unix timestamp). Accepts an ISO date, a unix-seconds string, an epoch-ms string, or null
     * (→ 0, i.e. full pull). Epoch-ms is down-converted to seconds.
     */
    private WatermarkToUnix(watermark: string | null): number {
        if (!watermark || watermark.length === 0) return 0;
        if (/^\d+$/.test(watermark)) {
            const n = Number(watermark);
            // Heuristic: values > ~10 digits are epoch-ms → convert to seconds. Stripe unix seconds are 10 digits.
            return n > 9_999_999_999 ? Math.floor(n / 1000) : n;
        }
        const t = Date.parse(watermark);
        return isNaN(t) ? 0 : Math.floor(t / 1000);
    }

    /**
     * Reads a record's watermark timestamp as unix seconds. Stripe timestamp fields (`created`, `date`) are
     * unix seconds already; tolerates a string form. Returns null when absent/unparseable.
     */
    private ReadTimestamp(raw: Record<string, unknown>, watermarkField: string): number | null {
        const v = raw[watermarkField];
        if (v == null) return null;
        if (typeof v === 'number') return v;
        const s = String(v);
        if (/^\d+$/.test(s)) return Number(s);
        const t = Date.parse(s);
        return isNaN(t) ? null : Math.floor(t / 1000);
    }

    /** Best-effort extraction of response headers from an error object (for ExtractRetryAfterMs). */
    private ExtractHeadersFromError(error: unknown): Record<string, string> | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const e = error as Record<string, unknown>;
        const resp = (e.response as Record<string, unknown> | undefined) ?? e;
        if (resp && typeof resp === 'object') {
            const headers = (resp as Record<string, unknown>).headers ?? (resp as Record<string, unknown>).Headers;
            if (headers && typeof headers === 'object') return headers as Record<string, string>;
        }
        return undefined;
    }
}
