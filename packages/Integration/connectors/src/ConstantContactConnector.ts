import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
} from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth2TokenManager,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type RateLimitPolicy,
    type SourceSchemaInfo,
    type CreateRecordContext,
    type CRUDResult,
} from '@memberjunction/integration-engine';
import { mergeDeclaredWithSampledFields } from '@memberjunction/connector-schema-merge';

// ─── Design note ──────────────────────────────────────────────────────────
//
// The connector is PURE MECHANISM. The object/field catalog is NOT baked here — it lives in the Declared
// metadata (metadata/integrations/constant-contact/.constant-contact.integration.json), seeded from the
// credential-free Constant Contact V3 OpenAPI spec (case-1 discovery). Discovery is INHERITED from
// BaseRESTIntegrationConnector: DiscoverObjects / DiscoverFields / IntrospectSchema read the persisted
// Declared metadata from the IntegrationEngineBase cache. There is NO hardcoded object list, NO field
// catalog, NO baked PK/FK/required/readonly constants in this file.
//
// What this class implements (the Constant Contact V3 protocol shape over REST/JSON):
//  - Auth: OAuth 2.0 Authorization-Code flow with ROTATING refresh tokens. The token round-trip runs
//    through the shared OAuth2TokenManager auth-helper (grant_type=refresh_token, HTTP-Basic client auth) —
//    NO inline crypto/base64. On every refresh that rotates the token, the NEWEST refresh_token is persisted
//    back to the Credential record (a single-use rotating token; not persisting it breaks the next refresh).
//  - Pagination: cursor pagination via `_links.next.href` (the opaque `cursor` query param), `limit` first page.
//  - Incremental: two IOs declare a documented incremental filter (contacts → updated_after, emails →
//    after_date) via Configuration.incrementalFilterFormat; the connector injects it and tracks the max
//    IncrementalWatermarkField value seen, advancing the watermark only on a fully-drained batch.
//  - Write: GENERIC per-operation CRUD (metadata-driven) is the default for every write-capable IO. Simple
//    synchronous creates route straight through the base `super.CreateRecord`; Constant Contact's named PK
//    (`contact_id`, `list_id`, …) is surfaced by a narrow `ExtractIDFromResponse` override (the base seam),
//    NOT by taking over CreateRecord. Update/Delete/Get use the inherited generic path (with the named-var
//    `SubstituteIDInPath` override so `{segment_id}`/`{event_id}` template correctly).
//    `CreateRecord` is overridden ONLY for the two genuinely idiosyncratic write shapes the generic path
//    cannot express: (a) nested-resource create paths carrying PARENT template vars filled from the record's
//    own attributes (the base never templates create paths), and (b) the ASYNC BULK-ACTIVITY jobs — a
//    `POST /activities/*` returns a job handle that must be polled at `GET /activities/{activity_id}` until a
//    terminal `state`. Everything else stays on the generic dispatch.

// ─── Types ────────────────────────────────────────────────────────────────

/** Parsed Constant Contact OAuth2 credential (Authorization-Code flow with rotating refresh token). */
interface ConstantContactCredentials {
    /** OAuth2 client id (a.k.a. API key). */
    ClientId?: string;
    /** OAuth2 client secret (a.k.a. app secret). */
    ClientSecret?: string;
    /** Current rotating refresh token — replaced on every token exchange. */
    RefreshToken?: string;
    /** Current access token (optional cache — the manager mints a fresh one when absent/expired). */
    AccessToken?: string;
}

/** Extended auth context carrying the resolved bearer token + its expiry. */
interface CCAuthContext extends RESTAuthContext {
    /** OAuth2 bearer access token. */
    Token: string;
    /** Absolute expiry of the access token. */
    ExpiresAt: Date;
    /** Optional Configuration base-URL override (sandbox / test / mock) — production sets none. */
    BaseURLOverride?: string;
}

/** Constant Contact `_links` cursor-pagination envelope (list responses). */
interface CCLinksEnvelope {
    _links?: { next?: { href?: string } | null; self?: { href?: string } | null } | null;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Constant Contact V3 API base URL (version embedded in the path segment). */
const CC_BASE_URL = 'https://api.cc.email/v3';
/** OAuth2 token endpoint (Authorization-Code flow). */
const CC_TOKEN_URL = 'https://authz.constantcontact.com/oauth2/default/v1/token';
/** Access-token lifetime fallback (seconds) when the token response omits expires_in — 24h per the vendor. */
const CC_ACCESS_TOKEN_LIFETIME_S = 86_400;
/** Re-mint when within this many ms of expiry. */
const CC_TOKEN_REFRESH_BUFFER_MS = 60_000;
/** Default page size when the IO metadata declares none (most Constant Contact collections default to 50). */
const CC_DEFAULT_PAGE_SIZE = 50;

// ─── Bulk-activity async-job state machine ────────────────────────────────
// Every `POST /activities/*` (resourceTag "Bulk Activities") returns an Activity JOB resource whose
// completion is polled via `GET /activities/{activity_id}`. The documented `state` values are
// processing | completed | cancelled | failed | time_out | unknown (from the V3 OpenAPI ActivityStatus).

/** The only non-terminal state — keep polling while the job reports this. */
const CC_BULK_STATE_PROCESSING = 'processing';
/** The success terminal state. */
const CC_BULK_STATE_COMPLETED = 'completed';
/** Fallback when the poll response carries no readable `state`. */
const CC_BULK_STATE_UNKNOWN = 'unknown';
/** Configuration.resourceTag that marks an object as an async Bulk-Activity job endpoint. */
const CC_BULK_ACTIVITY_TAG = 'Bulk Activities';
/** Default poll ceiling (attempts) + interval (ms) — ~2 min max; per-IO Configuration may override. */
const CC_BULK_POLL_MAX_ATTEMPTS = 60;
const CC_BULK_POLL_INTERVAL_MS = 2_000;

// ─── ConstantContactConnector ─────────────────────────────────────────────

/**
 * Constant Contact V3 connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 *
 * Discovery, template-var read traversal (second-layer objects resolve their parent via
 * Configuration.parentObjectName), and the paginated GET loop are inherited. This class supplies only the
 * Constant Contact-specific protocol surface: OAuth2 auth with rotating-refresh persistence, cursor
 * pagination, documented incremental filters, generic per-operation CRUD, and the §7/§10 sync-efficiency
 * hooks the frozen contract evidences.
 */
@RegisterClass(BaseIntegrationConnector, 'ConstantContactConnector')
export class ConstantContactConnector extends BaseRESTIntegrationConnector {

    /** One token manager per connector instance — caches the access token across a run + tracks rotation. */
    private readonly tokenManager = new OAuth2TokenManager();
    /** Cached auth context for the run (rebuilt when the token nears expiry). */
    private cachedAuth: CCAuthContext | null = null;
    /** The most recently seen/persisted rotating refresh token, so we only persist on an actual rotation. */
    private currentRefreshToken: string | undefined;
    /** In-flight watermark for the current FetchChanges — consumed by AppendDefaultQueryParams. */
    private currentWatermark: string | null = null;

    // ── Identity (T1 three-way invariant) ────────────────────────────────

    /** Verbatim `MJ: Integrations.Name`. Load-bearing: the T1 three-way name check compares this === metadata Name. */
    public override get IntegrationName(): string {
        return 'constant-contact';
    }

    // ── Capability getters (kept in lockstep with the per-op metadata columns) ──

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Constant Contact V3 exposes no
     * complete describe endpoint — the OpenAPI spec is the only complete-schema source and is seeded at build
     * as Declared metadata; per-tenant custom fields flow through runtime sampling + the framework's
     * custom-column capture. Absence in a refresh proves nothing → never deactivate. Matches
     * Configuration.DiscoveryIsAuthoritative=false in the frozen contract.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ── Sync-efficiency hooks (§7/§10 — populated from frozen-contract Configuration facts) ──

    /**
     * From Configuration.RateLimitPolicy: 4 requests/sec + 10,000/day per account. TokensPerSec=4 is the
     * vendor-wide safe ceiling; the engine's AIMD bucket backs off on the documented 429 (`throttled` /
     * `quota_exceeded`) bodies. No Retry-After header is documented (see ExtractRetryAfterMs left at default).
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 4, Burst: 4 };
    }

    /** Conservative in-flight cap — 4 req/sec is the ceiling, so a small parallel fan-out is safe. */
    public override get MaxConcurrencyHint(): number | null { return 2; }

    /**
     * No-watermark objects resume by the object's StableOrderingKey — read from the IO metadata (the extractor
     * emits `StableOrderingKey`; else the declared PK — Constant Contact's `<resource>_id`). Returns null when
     * the object declares no stable key or the cache is unavailable (unit-test context).
     */
    public override StableOrderingKey(objectName: string): string | null {
        const obj = this.tryGetCachedObject(objectName);
        if (!obj) return null;
        const declared = (obj as unknown as { StableOrderingKey?: string | null }).StableOrderingKey;
        if (declared && declared.trim().length > 0) return declared.trim();
        const pk = this.GetCachedFields(obj.ID).find(f => f.IsPrimaryKey);
        return pk?.Name ?? null;
    }

    /**
     * Sample-union enrichment (MJ connector standard): the Declared metadata is spec-derived and can miss a
     * tenant's custom contact fields. After the base cache-driven introspection, sample each object's live read
     * shape via `DiscoverFieldsViaFetch` and UNION it into the declared field set with
     * `mergeDeclaredWithSampledFields` — never-shrink, declared-wins, capacities widened. Best-effort + parallel;
     * a sample failure leaves the declared set untouched. NOTE: we override `IntrospectSchema` (NOT
     * `DiscoverFields` — that would recurse into `DiscoverFieldsViaFetch`'s own fallback). Connector-agnostic.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<SourceSchemaInfo> {
        const info = await super.IntrospectSchema(companyIntegration, contextUser);
        await Promise.all(
            info.Objects.map(async (obj) => {
                try {
                    const sampled = await this.DiscoverFieldsViaFetch(companyIntegration, obj.ExternalName, contextUser);
                    obj.Fields = mergeDeclaredWithSampledFields(obj.Fields, sampled);
                } catch {
                    /* best-effort — a sample failure leaves the declared fields as-is */
                }
            }),
        );
        return info;
    }

    // ── Abstract REST hooks ──────────────────────────────────────────────

    /**
     * Mints/refreshes the OAuth2 access token via the shared OAuth2TokenManager (grant_type=refresh_token,
     * HTTP-Basic client auth) — NO inline crypto. Constant Contact rotates the refresh token on every
     * exchange; when the returned refresh token differs from the one we sent, we PERSIST the newest one back
     * to the Credential record (a single-use token — the next refresh fails if we don't). Cached for the run.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<RESTAuthContext> {
        if (this.cachedAuth && this.cachedAuth.ExpiresAt.getTime() > Date.now() + CC_TOKEN_REFRESH_BUFFER_MS) {
            return this.cachedAuth;
        }
        const creds = await this.loadCredentials(companyIntegration, contextUser);
        if (!creds.ClientId || !creds.ClientSecret) {
            throw new Error('Constant Contact credential incomplete: ClientId and ClientSecret are required.');
        }
        if (!this.currentRefreshToken) this.currentRefreshToken = creds.RefreshToken;
        if (!this.currentRefreshToken) {
            throw new Error('Constant Contact credential incomplete: a RefreshToken is required for the Authorization-Code flow.');
        }

        const token = await this.tokenManager.GetAccessToken(
            {
                TokenURL: this.resolveTokenURLOverride(companyIntegration) ?? CC_TOKEN_URL,
                ClientId: creds.ClientId,
                ClientSecret: creds.ClientSecret,
                RefreshToken: this.currentRefreshToken,
                UseBasicAuth: true,
            },
            'refresh_token',
        );

        // Rotating refresh token: persist the newest value the moment it changes.
        if (token.RefreshToken && token.RefreshToken !== this.currentRefreshToken) {
            const rotated = token.RefreshToken;
            this.currentRefreshToken = rotated;
            await this.persistRotatedRefreshToken(companyIntegration, contextUser, rotated, token.AccessToken);
        }

        this.cachedAuth = {
            Token: token.AccessToken,
            ExpiresAt: new Date(token.ExpiresAt),
            BaseURLOverride: this.resolveBaseURLOverride(companyIntegration) ?? undefined,
        };
        return this.cachedAuth;
    }

    /** Bearer auth header + JSON accept/content-type. */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${(auth as CCAuthContext).Token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    /** HTTP transport (fetch). Owns the wire boundary; test subclasses override this to capture requests. */
    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown,
    ): Promise<RESTResponse> {
        const response = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
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
     * Strips the Constant Contact list envelope to the per-object resource array (`{ contacts: [...] }` →
     * ResponseDataKey='contacts'). A get-one / singleton response (`/contacts/{id}`, `/account/summary`) is a
     * bare object with no resource key → returned as a single-element array. A bare array is returned as-is.
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return body[responseDataKey] as Record<string, unknown>[];
        }
        // Single-object / singleton response (get-one, account summary) — no list envelope present.
        return [body];
    }

    /**
     * Constant Contact cursor pagination: the response carries `_links.next.href`
     * (e.g. `/v3/contacts?cursor=<opaque>`). Extract the opaque `cursor` value and surface it as NextCursor;
     * absence of `_links.next` (or PaginationType='None') ends the loop.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number,
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };
        if (!rawBody || typeof rawBody !== 'object') return { HasMore: false };
        const href = (rawBody as CCLinksEnvelope)._links?.next?.href;
        if (typeof href !== 'string' || href.length === 0) return { HasMore: false };
        const cursor = this.extractCursorFromHref(href);
        if (!cursor) return { HasMore: false };
        return { HasMore: true, NextCursor: cursor };
    }

    /**
     * Base API host. `/v3` version segment is embedded in CC_BASE_URL; each object's APIPath is appended.
     * An explicit Configuration base-URL override (sandbox / test / mock) wins so the connector can be
     * redirected by data alone — production sets no override.
     */
    protected override GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const ctx = auth as CCAuthContext;
        if (ctx.BaseURLOverride) return ctx.BaseURLOverride.replace(/\/+$/, '');
        return CC_BASE_URL;
    }

    /**
     * Constant Contact pagination params: first page `?limit=<n>`; subsequent pages `?cursor=<opaque>` (the
     * opaque cursor already encodes the limit + any active incremental filter, so it is passed alone).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number,
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';
        if (cursor) return `${basePath}${separator}cursor=${encodeURIComponent(cursor)}`;
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? CC_DEFAULT_PAGE_SIZE;
        return `${basePath}${separator}limit=${pageSize}`;
    }

    /**
     * Injects the documented incremental filter on the FIRST page of an incremental fetch. The filter param
     * name varies per object (contacts → `updated_after`, emails → `after_date`) so it is read from the IO's
     * Configuration.incrementalFilterFormat template (`<param>={value}`), never assumed. Skipped once a cursor
     * is present — the opaque cursor already carries the filter forward, so re-appending would double it.
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        let result = super.AppendDefaultQueryParams(url, obj);
        if (this.currentWatermark && obj.SupportsIncrementalSync && !/[?&]cursor=/.test(result)) {
            const filterFormat = this.readConfigString(obj, 'incrementalFilterFormat');
            if (filterFormat && filterFormat.includes('{value}')) {
                const param = filterFormat.replace('{value}', encodeURIComponent(this.currentWatermark));
                const separator = result.includes('?') ? '&' : '?';
                result = `${result}${separator}${param}`;
            }
        }
        return result;
    }

    // ── FetchChanges (incremental filter injection + watermark tracking) ──

    /**
     * Wraps the inherited fetch to (1) expose the incremental watermark to AppendDefaultQueryParams, and
     * (2) compute the new watermark from the max IncrementalWatermarkField value seen — advanced ONLY on a
     * fully-drained batch (HasMore=false) so a mid-sync partial never persists a premature watermark. For
     * non-incremental objects this is a transparent pass-through to the base fetch.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        this.currentWatermark = obj.SupportsIncrementalSync ? ctx.WatermarkValue : null;
        try {
            const result = await super.FetchChanges(ctx);
            if (obj.SupportsIncrementalSync && !result.HasMore) {
                const newWatermark = this.computeNewWatermark(obj, result.Records, ctx.WatermarkValue);
                if (newWatermark) result.NewWatermarkValue = newWatermark;
            }
            return result;
        } finally {
            this.currentWatermark = null;
        }
    }

    // ── CRUD ──────────────────────────────────────────────────────────────
    //
    // GENERIC per-operation dispatch is the default. Update / Delete / Get use the INHERITED base methods
    // verbatim (they read the per-operation IO columns and route through the named-var SubstituteIDInPath
    // override below). Simple synchronous creates ALSO use the inherited base — the only reason the base needs
    // help is Constant Contact's named PK, which the narrow ExtractIDFromResponse override supplies. CreateRecord
    // is overridden ONLY to branch the two idiosyncratic write shapes the generic path can't express.

    /**
     * OVERRIDDEN ONLY to branch Constant Contact's two idiosyncratic create shapes; the common case falls
     * straight through to the GENERIC base `super.CreateRecord`:
     *  1. Nested-resource create paths carry PARENT template vars (e.g.
     *     `/emails/activities/{campaign_activity_id}/abtest`, `/events/{event_id}/copy`) filled from the
     *     record's own Attributes — the base never templates create paths.
     *  2. ASYNC BULK-ACTIVITY jobs (resourceTag "Bulk Activities"): a `POST /activities/*` returns a job
     *     handle whose completion is polled at `GET /activities/{activity_id}` until a terminal `state`.
     * A plain create (no path vars, not a bulk job) delegates to the base so the generic per-operation path
     * (+ the ExtractIDFromResponse named-PK seam + loud-on-empty-id BuildCreatedResult) runs unchanged.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        const needsPathVars = !!obj.CreateAPIPath && /\{\w+\}/.test(obj.CreateAPIPath);
        const isAsyncBulk = this.isAsyncBulkActivity(obj);
        // Common case → GENERIC base per-operation create (named PK surfaced by ExtractIDFromResponse).
        if ((!needsPathVars && !isAsyncBulk) || !obj.CreateAPIPath || !obj.CreateMethod) {
            return super.CreateRecord(ctx);
        }
        // Idiosyncratic path: nested create-path templating and/or async bulk-activity job.
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const path = this.substitutePathVarsFromAttributes(obj.CreateAPIPath, ctx.Attributes);
        const url = this.joinURL(baseURL, path);
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, body);
        if (response.Status < 200 || response.Status >= 300) {
            return {
                Success: false,
                StatusCode: response.Status,
                ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on create`,
            };
        }
        if (isAsyncBulk) {
            return this.finishAsyncBulkActivity(ctx.ObjectName, obj, auth, baseURL, headers, response);
        }
        const externalID = this.ExtractIDFromResponse(response, obj.CreateIDLocation);
        return this.BuildCreatedResult(externalID, response.Status, ctx.ObjectName);
    }

    /**
     * Narrow base seam (NOT a CreateRecord takeover): after the standard id/ID/Id scan, surface Constant
     * Contact's NAMED primary key — the new resource is returned with a `<resource>_id` (`contact_id`,
     * `list_id`, `segment_id`, `activity_id`, …). Reads the first top-level `*_id` field. This is what lets the
     * GENERIC base `CreateRecord` handle every simple create with no override.
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        const generic = super.ExtractIDFromResponse(response, idLocation);
        if (generic) return generic;
        if ((!idLocation || idLocation === 'body') && response.Body && typeof response.Body === 'object' && !Array.isArray(response.Body)) {
            for (const [k, v] of Object.entries(response.Body as Record<string, unknown>)) {
                if (/_id$/i.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length > 0) {
                    return String(v);
                }
            }
        }
        return undefined;
    }

    /**
     * IDIOSYNCRATIC — async bulk-activity completion poll. The `POST /activities/*` create returned a job
     * handle (`activity_id`); poll `GET /activities/{activity_id}` until the `state` leaves `processing`.
     * `completed` → success (ExternalID = activity_id, via the loud-on-empty BuildCreatedResult); any other
     * terminal state (`cancelled`/`failed`/`time_out`/`unknown`) or an exhausted poll budget → a loud failure
     * that still carries the activity_id so a re-sync is idempotent rather than duplicating the job.
     */
    private async finishAsyncBulkActivity(
        objectName: string,
        obj: MJIntegrationObjectEntity,
        auth: RESTAuthContext,
        baseURL: string,
        headers: Record<string, string>,
        createResponse: RESTResponse,
    ): Promise<CRUDResult> {
        const activityID = this.ExtractIDFromResponse(createResponse, obj.CreateIDLocation);
        if (!activityID) {
            // No job handle on a 2xx is a FAILURE — BuildCreatedResult fails loudly on an empty id.
            return this.BuildCreatedResult(activityID, createResponse.Status, objectName);
        }
        const maxAttempts = this.readConfigNumber(obj, 'bulkPollMaxAttempts') ?? CC_BULK_POLL_MAX_ATTEMPTS;
        const intervalMs = this.readConfigNumber(obj, 'bulkPollIntervalMs') ?? CC_BULK_POLL_INTERVAL_MS;
        const pollURL = this.joinURL(baseURL, `/activities/${encodeURIComponent(activityID)}`);
        let state = CC_BULK_STATE_PROCESSING;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const pollResponse = await this.MakeHTTPRequest(auth, pollURL, 'GET', headers);
            state = this.readActivityState(pollResponse);
            if (state !== CC_BULK_STATE_PROCESSING) break;
            await this.sleep(intervalMs);
        }
        if (state === CC_BULK_STATE_COMPLETED) {
            return this.BuildCreatedResult(activityID, createResponse.Status, objectName);
        }
        return {
            Success: false,
            StatusCode: createResponse.Status,
            ExternalID: activityID,
            ErrorMessage: `Constant Contact bulk activity ${activityID} did not complete (final state: '${state}').`,
        };
    }

    /**
     * OVERRIDDEN so the generic Update/Delete/Get path can template Constant Contact's NAMED single-record
     * path vars (`{segment_id}`, `{event_id}`, `{campaign_activity_id}`, …) — the base only substitutes
     * `{id}`/`{ExternalID}`. A single-var path takes the whole ExternalID; a multi-var (nested) path takes the
     * composite `parent|child` ExternalID split in path order.
     */
    protected override SubstituteIDInPath(path: string, externalID: string, idLocation: string | null): string {
        if (idLocation && idLocation !== 'path') return path;
        const vars = path.match(/\{\w+\}/g);
        if (!vars || vars.length === 0) return path;
        if (vars.length === 1) return path.replace(vars[0], encodeURIComponent(externalID));
        const parts = externalID.split('|');
        let out = path;
        vars.forEach((v, i) => {
            const val = parts[i] ?? parts[parts.length - 1] ?? externalID;
            out = out.replace(v, encodeURIComponent(val));
        });
        return out;
    }

    // ── Connection test ────────────────────────────────────────────────────

    /**
     * Tests the connection by hitting the account-summary endpoint. A 2xx confirms the OAuth token is valid;
     * 401/403 → auth failure; anything else → error.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const baseURL = this.GetBaseURL(companyIntegration, auth);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${baseURL}/account/summary`, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: 'Constant Contact connection successful.', ServerVersion: 'Constant Contact V3' };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Constant Contact authentication failed (HTTP ${response.Status}). Check the OAuth client id/secret and refresh token.` };
            }
            return { Success: false, Message: `Constant Contact connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Constant Contact connection test error: ${msg}` };
        }
    }

    // ── Credential loading + rotating-refresh persistence ──────────────────

    /** Reads the credential from the linked Credential entity (preferred) or the Configuration JSON fallback. */
    private async loadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
    ): Promise<ConstantContactCredentials> {
        let creds: ConstantContactCredentials | null = null;
        if (companyIntegration.CredentialID) {
            creds = await this.loadFromCredentialEntity(companyIntegration.CredentialID, contextUser);
        }
        const configCreds = companyIntegration.Configuration ? this.parseCredentialJson(companyIntegration.Configuration) : null;
        const merged: ConstantContactCredentials = { ...(configCreds ?? {}), ...(creds ?? {}) };
        if (!creds && !configCreds) {
            throw new Error(
                'No Constant Contact credential found. Attach a credential carrying ClientId + ClientSecret + ' +
                'RefreshToken (OAuth2 Authorization-Code flow), or set Configuration JSON.',
            );
        }
        return merged;
    }

    /** Loads a credential row and parses its Values JSON. */
    private async loadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<ConstantContactCredentials | null> {
        try {
            const md = provider ?? new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (!loaded || !credential.Values) return null;
            return this.parseCredentialJson(credential.Values);
        } catch (err) {
            // Best-effort: a credential-store read failure falls back to the Configuration JSON (loadCredentials
            // still throws later if neither source supplies the client id/secret).
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[constant-contact] Credential load failed for ${credentialID}: ${msg}`);
            return null;
        }
    }

    /** Extracts Constant Contact OAuth2 credential fields from a credential/config JSON string. */
    private parseCredentialJson(json: string): ConstantContactCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            return {
                ClientId: this.firstString(parsed, ['ClientId', 'clientId', 'client_id', 'apiKey', 'ApiKey', 'api_key']),
                ClientSecret: this.firstString(parsed, ['ClientSecret', 'clientSecret', 'client_secret', 'appSecret', 'AppSecret', 'app_secret']),
                RefreshToken: this.firstString(parsed, ['RefreshToken', 'refreshToken', 'refresh_token']),
                AccessToken: this.firstString(parsed, ['AccessToken', 'accessToken', 'access_token']),
            };
        } catch {
            return null;
        }
    }

    /**
     * Persists the newly-rotated refresh token (and current access token) back to the linked Credential
     * record so the next cold-start refresh uses the correct single-use token. Best-effort: a persistence
     * failure is logged, never thrown (the in-memory token still works for the current run).
     */
    protected async persistRotatedRefreshToken(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        refreshToken: string,
        accessToken: string,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const credentialID = companyIntegration.CredentialID;
        if (!credentialID) return;
        try {
            const md = provider ?? new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (!loaded || !credential.Values) return;
            const parsed = JSON.parse(credential.Values) as Record<string, unknown>;
            const updated: Record<string, unknown> = { ...parsed, RefreshToken: refreshToken, AccessToken: accessToken };
            credential.Values = JSON.stringify(updated);
            const saved = await credential.Save();
            if (!saved) {
                const detail = credential.LatestResult?.CompleteMessage ?? 'unknown';
                console.warn(`[constant-contact] Failed to persist rotated refresh token: ${detail}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[constant-contact] Refresh-token persistence error: ${msg}`);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /** Reads the opaque `cursor` query-param value from a `_links.next.href` (relative or absolute). */
    private extractCursorFromHref(href: string): string | null {
        const qIndex = href.indexOf('?');
        if (qIndex < 0) return null;
        for (const pair of href.slice(qIndex + 1).split('&')) {
            const eq = pair.indexOf('=');
            if (eq < 0) continue;
            const key = decodeURIComponent(pair.slice(0, eq));
            if (key.toLowerCase() === 'cursor') {
                const val = decodeURIComponent(pair.slice(eq + 1));
                return val.length > 0 ? val : null;
            }
        }
        return null;
    }

    /** True when the object is an async Bulk-Activity job endpoint (poll-for-completion write shape). */
    private isAsyncBulkActivity(obj: MJIntegrationObjectEntity): boolean {
        return this.readConfigString(obj, 'resourceTag') === CC_BULK_ACTIVITY_TAG;
    }

    /** Reads the async-job `state` from a `GET /activities/{activity_id}` poll response (else 'unknown'). */
    private readActivityState(response: RESTResponse): string {
        const body = response.Body;
        if (body && typeof body === 'object' && !Array.isArray(body)) {
            const s = (body as Record<string, unknown>).state;
            if (typeof s === 'string' && s.trim().length > 0) return s.trim();
        }
        return CC_BULK_STATE_UNKNOWN;
    }

    /** Poll delay — overridable in tests (a Mocked subclass returns immediately so the suite never blocks). */
    protected async sleep(ms: number): Promise<void> {
        if (ms <= 0) return;
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    /** Substitutes CreateAPIPath parent template vars from the record's own attributes (nested creates). */
    private substitutePathVarsFromAttributes(path: string, attributes: Record<string, unknown>): string {
        return path.replace(/\{(\w+)\}/g, (match, name: string) => {
            const v = attributes[name];
            return v != null && String(v).length > 0 ? encodeURIComponent(String(v)) : match;
        });
    }

    /** Computes the new watermark = max IncrementalWatermarkField value seen (never below the current). */
    private computeNewWatermark(
        obj: MJIntegrationObjectEntity,
        records: ExternalRecord[],
        current: string | null,
    ): string | undefined {
        const wmField = obj.IncrementalWatermarkField;
        if (!wmField) return undefined;
        let max: string | undefined;
        for (const record of records) {
            const value = record.Fields[wmField];
            if (typeof value === 'string' && value.length > 0 && (!max || value > max)) max = value;
        }
        if (!max) return current ?? undefined;
        if (current && max <= current) return current;
        return max;
    }

    /** Reads an explicit full base-URL override from the connection Configuration (sandbox/test/mock only). */
    private resolveBaseURLOverride(companyIntegration: MJCompanyIntegrationEntity): string | null {
        if (!companyIntegration.Configuration) return null;
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(companyIntegration.Configuration) as Record<string, unknown>; } catch { return null; }
        const raw = this.firstString(parsed, ['BaseURL', 'BaseUrl', 'baseURL', 'baseUrl', 'APIBaseURL', 'ApiBaseURL', 'apiBaseUrl']);
        if (raw && /^https?:\/\//i.test(raw.trim())) return raw.trim();
        return null;
    }

    /**
     * Optional OAuth2 token-endpoint override from the connection Configuration. Constant Contact's
     * default authz host (`CC_TOKEN_URL`) differs from the API host, so this is read independently of
     * the base-URL override. Lets a deployment target a non-default authz host and makes the connector
     * testable against a mock token endpoint. Falls back to `CC_TOKEN_URL` when unset.
     */
    private resolveTokenURLOverride(companyIntegration: MJCompanyIntegrationEntity): string | null {
        if (!companyIntegration.Configuration) return null;
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(companyIntegration.Configuration) as Record<string, unknown>; } catch { return null; }
        const raw = this.firstString(parsed, ['TokenURL', 'TokenUrl', 'tokenURL', 'tokenUrl', 'TokenEndpoint', 'tokenEndpoint', 'token_url']);
        if (raw && /^https?:\/\//i.test(raw.trim())) return raw.trim();
        return null;
    }

    /** Joins a base URL and a path (mirrors the base's private BuildFullURL). */
    private joinURL(baseURL: string, apiPath: string): string {
        const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        return `${base}${path}`;
    }

    /** Gets an IO from the cache without throwing (used by StableOrderingKey, which may be called early). */
    private tryGetCachedObject(objectName: string): MJIntegrationObjectEntity | null {
        try {
            const integ = IntegrationEngineBase.Instance.GetIntegrationByName(this.IntegrationName);
            if (!integ) return null;
            return IntegrationEngineBase.Instance.GetIntegrationObject(integ.ID, objectName) ?? null;
        } catch {
            return null;
        }
    }

    /** Reads a trimmed string value from an IntegrationObject's Configuration JSON (tolerant of absent/invalid). */
    private readConfigString(obj: MJIntegrationObjectEntity, key: string): string | null {
        const raw = (obj as unknown as { Configuration?: string | null }).Configuration;
        if (!raw || typeof raw !== 'string') return null;
        try {
            const cfg = JSON.parse(raw) as Record<string, unknown>;
            const v = cfg[key];
            return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
        } catch {
            return null;
        }
    }

    /** Reads a finite number value from an IntegrationObject's Configuration JSON (tolerant of absent/invalid). */
    private readConfigNumber(obj: MJIntegrationObjectEntity, key: string): number | null {
        const raw = (obj as unknown as { Configuration?: string | null }).Configuration;
        if (!raw || typeof raw !== 'string') return null;
        try {
            const cfg = JSON.parse(raw) as Record<string, unknown>;
            const v = cfg[key];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim().length > 0) {
                const n = Number(v);
                return Number.isFinite(n) ? n : null;
            }
            return null;
        } catch {
            return null;
        }
    }

    /** Returns the first present, non-empty string value among the given keys. */
    private firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }
}

/** Tree-shaking prevention — import and call from the module entry point. */
export function LoadConstantContactConnector(): void { /* no-op */ }
