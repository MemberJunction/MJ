import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    buildBasicAuthHeaderValue,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type RateLimitPolicy,
    type CreateRecordContext,
    type CRUDResult,
    type SourceSchemaInfo,
} from '@memberjunction/integration-engine';
import { mergeDeclaredWithSampledFields } from '@memberjunction/connector-schema-merge';

// ─── Design note ────────────────────────────────────────────────────────
//
// The connector is PURE MECHANISM. The object/field catalog is NOT baked here — it lives in the
// Declared metadata (metadata/integrations/zendesk/.zendesk.integration.json), seeded from
// credential-free Zendesk OpenAPI specs (case-1 discovery). Discovery is INHERITED from
// BaseRESTIntegrationConnector: DiscoverObjects / DiscoverFields / IntrospectSchema read the persisted
// Declared metadata from the IntegrationEngineBase cache. There is NO hardcoded object list, NO field
// catalog, NO baked PK/FK/required/readonly constants in this file.
//
// What this connector implements (the Zendesk protocol shape over REST/JSON):
//  - Auth: HTTP Basic where the userid is `{email}/token` and the password is the agent's API token —
//    `Authorization: Basic base64("{email}/token:{api_token}")`. Encoded via the auth-helper
//    (buildBasicAuthHeaderValue); NO inline base64/crypto. A long-lived credential, no refresh step.
//  - Tenancy: every request targets `https://{subdomain}.zendesk.com/api/v2/…`; the per-tenant
//    {subdomain} is read from the connection Configuration (SubdomainConfigKey='Subdomain') / credential
//    — ZERO subdomain baked into this vendor-wide code.
//  - Pagination: JSON:API cursor pagination (`page[size]` + `page[after]`, continuation from
//    `meta.after_cursor` / `meta.has_more`), with the legacy integer-offset fallback (`page` + `per_page`,
//    continuation from `next_page`) for the offset-only endpoints. Metadata's PaginationType drives which.
//  - Incremental: the Incremental Export cursor endpoints (`/api/v2/incremental/<res>/cursor`) — first
//    request seeds from `start_time` (unix), thereafter follows the response `after_cursor` until
//    `end_of_stream`. The saved cursor IS the cross-run watermark.
//  - Write: generic per-operation CRUD (metadata-driven) for the write-capable IOs. Zendesk wraps
//    create/update bodies as `{ <resource>: {...} }` (CreateBodyShape='wrapped' + the resource BodyKey).
//    Two small, documented idiosyncrasies are overridden: named single-record path vars (`{ticket_id}`
//    etc. — the base only templates `{id}`) and the singular create-response envelope (`{ ticket: { id } }`).

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed Zendesk credential + tenant. The email+token compose the Basic userid `{email}/token`. */
interface ZendeskCredentials {
    /** Agent email address (userid left part becomes `{email}/token`). */
    Email?: string;
    /** Agent API token (Basic password). */
    ApiToken?: string;
    /** Pre-composed Basic userid (e.g. `agent@example.com/token`) when supplied verbatim. */
    Username?: string;
    /** Pre-supplied Basic password when the userid is supplied verbatim. */
    Password?: string;
    /** Per-tenant Zendesk subdomain (`<subdomain>.zendesk.com`). */
    Subdomain?: string;
}

/** Extended auth context carrying the resolved Basic header + the per-tenant subdomain. */
interface ZendeskAuthContext extends RESTAuthContext {
    /** Full `Authorization: Basic <base64>` header value. */
    AuthHeader: string;
    /** Per-tenant subdomain used to build every request URL. */
    Subdomain: string;
    /**
     * Optional explicit full base-URL override read from the connection Configuration
     * (`BaseURL` / `APIBaseURL`). Production instances never set this (the base is always
     * `https://<subdomain>.zendesk.com`); it exists so a sandbox / test / mock endpoint can
     * redirect the connector by DATA (no code branch on environment). When present it wins
     * over the subdomain-derived host in GetBaseURL.
     */
    BaseURLOverride?: string;
}

/** Zendesk JSON:API cursor-pagination envelope (`meta` + `links`). Records live under the resource key. */
interface ZendeskCursorEnvelope {
    meta?: { has_more?: boolean; after_cursor?: string | null; before_cursor?: string | null } | null;
    links?: { next?: string | null; prev?: string | null } | null;
    /** Legacy offset envelope continuation (a FULL URL to the next page, or null). */
    next_page?: string | null;
    /** Incremental Export cursor envelope. */
    after_cursor?: string | null;
    end_of_stream?: boolean;
    count?: number;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Zendesk cursor-incremental max page size (`per_page` caps at 1000 on the Incremental Export endpoints). */
const ZENDESK_INCREMENTAL_MAX_PAGE = 1000;
/** Zendesk list-endpoint cursor page size cap (`page[size]` caps at 100). */
const ZENDESK_LIST_MAX_PAGE = 100;

// ─── ZendeskConnector ──────────────────────────────────────────────────

/**
 * Zendesk connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 *
 * Discovery, template-var read traversal (second-layer objects resolve their parent via
 * Configuration.parentObjectName), and the paginated GET loop are inherited. This class supplies only the
 * Zendesk-specific protocol surface: Basic auth, per-tenant base URL, cursor/offset pagination, the
 * Incremental Export fetch, connection testing, generic per-operation CRUD with named-var path templating,
 * and the §7/§10 sync-efficiency hooks the frozen contract evidences.
 */
@RegisterClass(BaseIntegrationConnector, 'ZendeskConnector')
export class ZendeskConnector extends BaseRESTIntegrationConnector {

    /** Cached auth for the lifetime of a single sync run (Zendesk API tokens don't expire). */
    private cachedAuth: ZendeskAuthContext | null = null;

    // ── Identity (T1 three-way invariant) ────────────────────────────

    /** Verbatim `MJ: Integrations.Name`. Load-bearing: the T1 three-way name check compares this === metadata Name. */
    public override get IntegrationName(): string {
        return 'zendesk';
    }

    /**
     * Sample-union enrichment (MJ connector standard): the Declared metadata is docs/spec-derived and can
     * miss vendor customs (custom ticket/user/organization fields, custom-object attributes). After the
     * base cache-driven introspection, we sample each object's live read shape via `DiscoverFieldsViaFetch`
     * and UNION it into the declared field set with `mergeDeclaredWithSampledFields` — never-shrink,
     * declared-wins, capacities widened. Best-effort + parallel; a sample failure leaves the declared set
     * untouched. NOTE: we override `IntrospectSchema` (NOT `DiscoverFields` — that would recurse into
     * `DiscoverFieldsViaFetch`'s own fallback). Connector-agnostic: no Zendesk-specific field logic.
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

    // ── Capability getters (kept in lockstep with the per-op metadata columns) ──

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Zendesk exposes no complete
     * describe endpoint; custom ticket/user/organization fields and custom objects flow through runtime
     * discovery + the framework's custom-column capture. Absence in a refresh proves nothing → never
     * deactivate. Matches Configuration.DiscoveryIsAuthoritative=false in the frozen contract.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ── Sync-efficiency hooks (§7/§10 — populated from frozen-contract Configuration facts) ──

    /**
     * From Configuration.RateLimitPolicy: the lowest current Support-plan tier (Team) is 200 requests/min
     * per account (≈3.3/s), BatchMaxRequestCount=200 / BatchRequestWaitTime=60. The engine's AIMD bucket
     * reads the vendor's response rate-limit headers and adapts upward for higher plans; this is the safe,
     * provable floor. The Incremental Export endpoints are separately limited (10/min), governed by the
     * same bucket backing off on 429.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 3, Burst: 20 };
    }

    /**
     * The Incremental Export cursor endpoints stream records in ascending watermark order, so the cursor
     * we persist (`after_cursor`) is a reliable, monotonically-advancing resume position. Non-incremental
     * objects never return a watermark, so this only affects the incremental-export streams — which ARE
     * monotonic. Lets the engine narrow the next incremental instead of re-scanning to wall-clock now.
     */
    public override get MonotonicWatermark(): boolean { return true; }

    /**
     * Zendesk returns `Retry-After` (seconds) on every 429, alongside X-Rate-Limit / ratelimit-* headers.
     * Parse it to ms so the engine's AIMD bucket backs off by the vendor's actual instruction.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const headers = this.extractHeadersFromError(error);
        if (!headers) return undefined;
        const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
        if (retryAfter != null) {
            const secs = Number(retryAfter);
            if (!isNaN(secs) && secs >= 0) return Math.ceil(secs * 1000);
        }
        return undefined;
    }

    /** Conservative in-flight cap — Zendesk tolerates parallelism but the per-minute budget is the ceiling. */
    public override get MaxConcurrencyHint(): number | null { return 4; }

    /**
     * No-watermark objects resume by the object's StableOrderingKey — read from the IO metadata (the
     * extractor emits `StableOrderingKey`, the universal `id`). Returns null when the object declares no
     * stable key or the cache is unavailable (unit-test context).
     */
    public override StableOrderingKey(objectName: string): string | null {
        const obj = this.tryGetCachedObject(objectName);
        if (!obj) return null;
        const declared = (obj as unknown as { StableOrderingKey?: string | null }).StableOrderingKey;
        if (declared && declared.trim().length > 0) return declared.trim();
        const pk = this.GetCachedFields(obj.ID).find(f => f.IsPrimaryKey);
        return pk?.Name ?? null;
    }

    // ── Abstract REST hooks ──────────────────────────────────────────

    /**
     * Resolves the Basic auth header + per-tenant subdomain from the linked Credential entity (preferred)
     * or the CompanyIntegration Configuration JSON (fallback). Cached for the run. The Basic header is built
     * via the auth-helper — no inline base64/crypto.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.cachedAuth) return this.cachedAuth;
        const creds = await this.loadCredentials(companyIntegration, contextUser);
        const baseURLOverride = this.resolveBaseURLOverride(companyIntegration);
        // When an explicit base-URL override is present, the subdomain is not needed to build URLs.
        // Fall back to a benign placeholder so a sandbox/mock connection that supplies only BaseURL
        // (and no Subdomain) still authenticates. Production supplies Subdomain and no override.
        const subdomain = baseURLOverride
            ? (this.tryResolveSubdomain(companyIntegration, creds) ?? 'override')
            : this.resolveSubdomain(companyIntegration, creds);
        const authHeader = this.buildAuthHeader(creds);
        this.cachedAuth = { AuthHeader: authHeader, Subdomain: subdomain, BaseURLOverride: baseURLOverride ?? undefined };
        return this.cachedAuth;
    }

    /** Zendesk Basic auth: the header value is built once in Authenticate; other headers are static. */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': (auth as ZendeskAuthContext).AuthHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
    }

    /** HTTP transport (fetch). Owns the wire boundary; test subclasses override this to capture requests. */
    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
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
     * Strips the Zendesk list envelope to the per-object resource array (`{ tickets: [...] }` →
     * ResponseDataKey='tickets'). Handles the get-one singular envelope (`{ ticket: {...} }`) by falling
     * back to the singular of the resource key, and a bare-array/record body for non-standard shapes.
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        if (responseDataKey) {
            const arr = body[responseDataKey];
            if (Array.isArray(arr)) return arr as Record<string, unknown>[];
            // get-one singular envelope: strip a trailing 's' from the (plural) list key.
            const singular = responseDataKey.replace(/s$/, '');
            const one = body[singular];
            if (one && typeof one === 'object' && !Array.isArray(one)) return [one as Record<string, unknown>];
        }
        // Non-list / already-unwrapped record.
        return [body];
    }

    /**
     * Zendesk pagination:
     *  - Cursor (JSON:API CBP): continuation via `meta.after_cursor` gated by `meta.has_more`.
     *  - Offset (legacy): continuation while `next_page` (a full URL) is present; the base loop advances
     *    the integer page number, which BuildPaginatedURL renders as `page`/`per_page`.
     *  currentPage/offset/pageSize are unused for cursor pagination.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (!rawBody || typeof rawBody !== 'object') return { HasMore: false };
        const env = rawBody as ZendeskCursorEnvelope;
        if (paginationType === 'Cursor') {
            const after = env.meta?.after_cursor;
            if (env.meta?.has_more === true && typeof after === 'string' && after.length > 0) {
                return { HasMore: true, NextCursor: after, TotalRecords: env.count };
            }
            return { HasMore: false };
        }
        if (paginationType === 'Offset') {
            const hasMore = typeof env.next_page === 'string' && env.next_page.length > 0;
            return { HasMore: hasMore, TotalRecords: env.count };
        }
        return { HasMore: false };
    }

    /**
     * Per-tenant base host. The `/api/v2` version segment lives in each object's APIPath (metadata-driven).
     * An explicit Configuration base-URL override (sandbox / test / mock) wins over the subdomain host so
     * the connector can be redirected by data alone — production sets no override and uses the subdomain.
     */
    protected override GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const ctx = auth as ZendeskAuthContext;
        if (ctx.BaseURLOverride) return ctx.BaseURLOverride.replace(/\/+$/, '');
        return `https://${ctx.Subdomain}.zendesk.com`;
    }

    /**
     * Reads an explicit full base-URL override from the connection Configuration. Recognized keys:
     * `BaseURL` / `BaseUrl` / `baseURL` / `APIBaseURL` / `ApiBaseURL`. Only an http(s) absolute URL is
     * honored; anything else is ignored so a stray value can't misroute a production tenant. Returns null
     * when no valid override is present (the normal production case → subdomain host is used).
     */
    private resolveBaseURLOverride(companyIntegration: MJCompanyIntegrationEntity): string | null {
        if (!companyIntegration.Configuration) return null;
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(companyIntegration.Configuration) as Record<string, unknown>; } catch { return null; }
        const raw = this.firstString(parsed, ['BaseURL', 'BaseUrl', 'baseURL', 'baseUrl', 'APIBaseURL', 'ApiBaseURL', 'apiBaseUrl']);
        if (raw && /^https?:\/\//i.test(raw.trim())) return raw.trim();
        return null;
    }

    /** Subdomain resolution that returns null instead of throwing (used when a base-URL override is present). */
    private tryResolveSubdomain(companyIntegration: MJCompanyIntegrationEntity, creds: ZendeskCredentials): string | null {
        const fromConfig = companyIntegration.Configuration ? this.readSubdomainFromConfig(companyIntegration.Configuration) : null;
        const subdomain = (fromConfig ?? creds.Subdomain ?? '').trim();
        return subdomain || null;
    }

    /**
     * Zendesk pagination params (NOT the base default `cursor=`/`offset=`):
     *  - Cursor: `page[size]=<n>` (first page) + `page[after]=<cursor>` (subsequent).
     *  - Offset: `page=<n>&per_page=<size>` (legacy integer pagination).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';
        if (obj.PaginationType === 'Offset') {
            const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? ZENDESK_LIST_MAX_PAGE;
            return `${basePath}${separator}page=${page}&per_page=${pageSize}`;
        }
        // Cursor (default for Zendesk list endpoints).
        const pageSize = Math.min(effectivePageSize ?? obj.DefaultPageSize ?? ZENDESK_LIST_MAX_PAGE, ZENDESK_LIST_MAX_PAGE);
        const parts = [`page[size]=${pageSize}`];
        if (cursor) parts.push(`page[after]=${encodeURIComponent(cursor)}`);
        return `${basePath}${separator}${parts.join('&')}`;
    }

    // ── FetchChanges override (idiosyncratic: Incremental Export cursor endpoints) ──

    /**
     * OVERRIDDEN only to route the 6 objects declaring an Incremental Export door through the cursor
     * endpoint. Everything else (regular cursor/offset list objects, template-var second-layer objects)
     * delegates to the inherited base GET path, which uses the BuildPaginatedURL / ExtractPaginationInfo
     * overrides above.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (this.usesIncrementalExport(obj)) {
            return this.fetchViaIncrementalExport(obj, ctx);
        }
        return super.FetchChanges(ctx);
    }

    /** True when the IO declares an Incremental Export door (Configuration.incrementalEndpoint) + supports it. */
    private usesIncrementalExport(obj: MJIntegrationObjectEntity): boolean {
        return obj.SupportsIncrementalSync && this.readConfigString(obj, 'incrementalEndpoint') != null;
    }

    /**
     * Incremental fetch via `GET <incrementalEndpoint>?start_time=<unix>` (first request) then
     * `?cursor=<after_cursor>` (thereafter), paging until the engine's BatchSize or `end_of_stream`.
     *
     * Resume model: WITHIN a run, pagination continues via ctx.CurrentCursor. ACROSS runs, the persisted
     * watermark IS the last `after_cursor` — so ctx.WatermarkValue (when present) is a cursor to resume
     * from; only the very first ever run (no cursor) seeds from `start_time=0` (a complete backfill). The
     * new watermark (the final `after_cursor`) is returned ONLY when the stream is fully drained
     * (`end_of_stream`) — a partial batch never advances it, so a mid-sync failure resumes cleanly.
     */
    private async fetchViaIncrementalExport(obj: MJIntegrationObjectEntity, ctx: FetchContext): Promise<FetchBatchResult> {
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = this.pkFieldNames(fields);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration, auth);
        const headers = this.BuildHeaders(auth);
        const endpoint = this.readConfigString(obj, 'incrementalEndpoint')!;
        const pageSize = Math.min(obj.DefaultPageSize ?? ZENDESK_INCREMENTAL_MAX_PAGE, ZENDESK_INCREMENTAL_MAX_PAGE);
        const batchLimit = ctx.BatchSize && ctx.BatchSize > 0 ? ctx.BatchSize : Number.MAX_SAFE_INTEGER;

        // Within-run cursor wins; else the cross-run saved cursor (the watermark); else a full backfill.
        let cursor: string | undefined = ctx.CurrentCursor ?? ctx.WatermarkValue ?? undefined;
        const records: ExternalRecord[] = [];
        let endOfStream = false;
        let lastCursor: string | undefined = cursor;

        while (records.length < batchLimit) {
            const perPage = Math.max(1, Math.min(pageSize, batchLimit - records.length));
            const url = cursor
                ? `${baseURL}${endpoint}?cursor=${encodeURIComponent(cursor)}&per_page=${perPage}`
                : `${baseURL}${endpoint}?start_time=0&per_page=${perPage}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) {
                throw new Error(`[zendesk] Incremental export failed for "${obj.Name}": HTTP ${response.Status}`);
            }
            const raw = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
            for (const r of raw) {
                records.push(this.buildExternalRecord(this.applyTransformPreservingKeys(r, obj, fields), obj.Name, pkFieldNames));
            }
            const env = (response.Body ?? {}) as ZendeskCursorEnvelope;
            endOfStream = env.end_of_stream === true;
            const nextCursor = typeof env.after_cursor === 'string' && env.after_cursor.length > 0 ? env.after_cursor : undefined;
            if (nextCursor) lastCursor = nextCursor;
            if (endOfStream || !nextCursor || raw.length === 0) {
                endOfStream = endOfStream || !nextCursor;
                break;
            }
            cursor = nextCursor;
        }

        if (endOfStream) {
            // Fully drained → safe to advance the watermark to the resume cursor for the next run.
            return { Records: records, HasMore: false, NewWatermarkValue: lastCursor ?? ctx.WatermarkValue ?? undefined };
        }
        // Batch limit hit mid-stream → continue via cursor next call; do NOT advance the watermark.
        return { Records: records, HasMore: true, NextCursor: lastCursor };
    }

    // ── CRUD ──────────────────────────────────────────────────────────
    //
    // Single-`{id}` top-level objects (tickets, users, organizations, groups, macros, views, triggers,
    // ticket_fields, automations, …) use the INHERITED generic UpdateRecord / DeleteRecord / GetRecord,
    // which read the per-operation IO columns and route through the SubstituteIDInPath override below (the
    // base only templates `{id}`; Zendesk uses named vars like `{ticket_id}`). CreateRecord is overridden
    // for the two Zendesk create idiosyncrasies — see below.

    /**
     * OVERRIDDEN for two Zendesk create idiosyncrasies the generic path can't express:
     *  1. Nested-resource create paths carry PARENT template vars (e.g.
     *     `/api/v2/custom_objects/{custom_object_key}/records`, `/api/v2/help_center/articles/{article_id}/comments`)
     *     — filled here from the record's own Attributes.
     *  2. The create RESPONSE wraps the new record in the singular resource key (`{ ticket: { id } }`),
     *     so the id is not at the body root — handled by the ExtractIDFromResponse override.
     * The wrapped request body and the loud-on-empty-id BuildCreatedResult are preserved. Top-level creates
     * (no parent vars) behave exactly as the generic path would.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) {
            // Delegate to the base so the "not configured" error is raised consistently.
            return super.CreateRecord(ctx);
        }
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const path = this.substitutePathVarsFromAttributes(obj.CreateAPIPath, ctx.Attributes);
        const url = this.joinURL(baseURL, path);
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            const externalID = this.ExtractIDFromResponse(response, obj.CreateIDLocation);
            return this.BuildCreatedResult(externalID, response.Status, ctx.ObjectName);
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on create`,
        };
    }

    /**
     * OVERRIDDEN so the generic Update/Delete/Get path can template Zendesk's NAMED single-record path vars
     * (`{ticket_id}`, `{user_id}`, `{organization_id}`, …) — the base only substitutes `{id}`/`{ExternalID}`.
     * A single-var path takes the whole ExternalID; a multi-var (nested) path takes the composite
     * `parent|child` ExternalID split in path order.
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

    /**
     * OVERRIDDEN to read the new record's id out of Zendesk's SINGULAR create envelope (`{ ticket: { id } }`),
     * which the base (which only inspects the body root) would miss — silently failing every create via
     * BuildCreatedResult. Checks a root-level id first, then the single wrapped resource object.
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        if (idLocation === 'header') return super.ExtractIDFromResponse(response, idLocation);
        const body = response.Body;
        if (!body || typeof body !== 'object') return undefined;
        const b = body as Record<string, unknown>;
        const rootId = this.readId(b);
        if (rootId) return rootId;
        for (const v of Object.values(b)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                const id = this.readId(v as Record<string, unknown>);
                if (id) return id;
            }
        }
        return undefined;
    }

    // ── Connection test ──────────────────────────────────────────────

    /**
     * Tests the connection by hitting the current-user endpoint. A 2xx confirms the Basic credential +
     * subdomain are valid; 401/403 → auth failure; anything else → error.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const baseURL = this.GetBaseURL(companyIntegration, auth);
            const headers = this.BuildHeaders(auth);
            const url = `${baseURL}/api/v2/users/me`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: 'Zendesk connection successful.' };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Zendesk authentication failed (HTTP ${response.Status}). Check the email + API token and subdomain.` };
            }
            return { Success: false, Message: `Zendesk connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Zendesk connection test error: ${msg}` };
        }
    }

    // ── Credential + tenant loading ──────────────────────────────────

    /** Reads the Zendesk credential from the linked Credential entity, or the Configuration JSON fallback. */
    private async loadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ZendeskCredentials> {
        const credentialID = companyIntegration.CredentialID;
        let creds: ZendeskCredentials | null = null;
        if (credentialID) {
            creds = await this.loadFromCredentialEntity(credentialID, contextUser);
        }
        // Merge Configuration JSON (carries the Subdomain, and can carry credential fields as a fallback).
        const configCreds = companyIntegration.Configuration ? this.parseCredentialJson(companyIntegration.Configuration) : null;
        const merged: ZendeskCredentials = { ...(configCreds ?? {}), ...(creds ?? {}) };
        // Subdomain most often lives in Configuration, not the secret store — prefer it if the credential lacked one.
        if (!merged.Subdomain && configCreds?.Subdomain) merged.Subdomain = configCreds.Subdomain;
        if (!creds && !configCreds) {
            throw new Error(
                'No Zendesk credential found. Attach a credential carrying the agent email + API token ' +
                '(email/apiToken, or a pre-composed Username `{email}/token` + Password), or set Configuration JSON.'
            );
        }
        return merged;
    }

    /** Loads a credential row and parses its Values JSON. */
    private async loadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<ZendeskCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.parseCredentialJson(credential.Values);
    }

    /** Extracts Zendesk credential + subdomain fields from a credential/config JSON string. */
    private parseCredentialJson(json: string): ZendeskCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            const out: ZendeskCredentials = {
                Email: this.firstString(parsed, ['email', 'Email', 'emailAddress', 'EmailAddress']),
                ApiToken: this.firstString(parsed, ['apiToken', 'ApiToken', 'apiKey', 'ApiKey', 'token', 'Token']),
                Username: this.firstString(parsed, ['username', 'Username']),
                Password: this.firstString(parsed, ['password', 'Password']),
                Subdomain: this.firstString(parsed, ['subdomain', 'Subdomain']),
            };
            return out;
        } catch {
            return null;
        }
    }

    /**
     * Builds the `Authorization: Basic …` header via the auth-helper (no inline base64). Zendesk's API-token
     * pattern is userid=`{email}/token`, password=`{api_token}`. When a caller supplies a pre-composed
     * Username/Password verbatim (e.g. Username already ends in `/token`), use them as-is.
     */
    private buildAuthHeader(creds: ZendeskCredentials): string {
        if (creds.Email && creds.ApiToken) {
            return buildBasicAuthHeaderValue({ Username: `${creds.Email}/token`, Password: creds.ApiToken });
        }
        if (creds.Username && creds.Password != null) {
            return buildBasicAuthHeaderValue({ Username: creds.Username, Password: creds.Password });
        }
        throw new Error(
            'Zendesk credential incomplete: provide email + apiToken (preferred), or a pre-composed ' +
            'Username (`{email}/token`) + Password (the API token).'
        );
    }

    /** Resolves the per-tenant subdomain from Configuration (SubdomainConfigKey='Subdomain') or the credential. */
    private resolveSubdomain(companyIntegration: MJCompanyIntegrationEntity, creds: ZendeskCredentials): string {
        const fromConfig = companyIntegration.Configuration ? this.readSubdomainFromConfig(companyIntegration.Configuration) : null;
        const subdomain = (fromConfig ?? creds.Subdomain ?? '').trim();
        if (!subdomain) {
            throw new Error(
                'No Zendesk subdomain configured. Set the per-connection Configuration key "Subdomain" ' +
                '(the `<subdomain>.zendesk.com` tenant identifier) — it is never baked into the connector.'
            );
        }
        return subdomain;
    }

    /** Reads the `Subdomain` key from a Configuration JSON string (tolerant of absent/invalid). */
    private readSubdomainFromConfig(configJson: string): string | null {
        try {
            const cfg = JSON.parse(configJson) as Record<string, unknown>;
            const v = cfg['Subdomain'] ?? cfg['subdomain'];
            return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
        } catch {
            return null;
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /** Substitutes CreateAPIPath parent template vars from the record's own attributes (nested creates). */
    private substitutePathVarsFromAttributes(path: string, attributes: Record<string, unknown>): string {
        return path.replace(/\{(\w+)\}/g, (match, name: string) => {
            const v = attributes[name];
            return v != null && String(v).length > 0 ? encodeURIComponent(String(v)) : match;
        });
    }

    /** Joins a base URL and a path (mirrors the base's private BuildFullURL). */
    private joinURL(baseURL: string, apiPath: string): string {
        const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        return `${base}${path}`;
    }

    /** Reads an `id`-like value as a string (number or string); undefined when absent. */
    private readId(o: Record<string, unknown>): string | undefined {
        for (const k of ['id', 'ID', 'Id']) {
            const v = o[k];
            if (typeof v === 'string' && v.length > 0) return v;
            if (typeof v === 'number') return String(v);
        }
        return undefined;
    }

    /** PK field names in Sequence order (falls back to ['id'] — Zendesk's universal PK — when unmarked). */
    private pkFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
        return pk.length > 0 ? pk : ['id'];
    }

    /**
     * Builds an ExternalRecord with the FULL source record in Fields (full-record pass-through — the
     * framework's custom-column capture diffs keys(Fields) against the field maps). ExternalID is the
     * composite PK (when every component is present + non-empty) or the raw Zendesk `id`.
     */
    private buildExternalRecord(raw: Record<string, unknown>, objectType: string, pkFieldNames: string[]): ExternalRecord {
        const allPresent = pkFieldNames.length > 0 && pkFieldNames.every(n => raw[n] != null && String(raw[n]).length > 0);
        const externalID = allPresent
            ? pkFieldNames.map(n => String(raw[n])).join('|')
            : (raw.id != null ? String(raw.id) : '');
        return { ExternalID: externalID, ObjectType: objectType, Fields: raw };
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

    /** Returns the first present, non-empty string value among the given keys. */
    private firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }

    /** Best-effort extraction of response headers from an error object (for ExtractRetryAfterMs). */
    private extractHeadersFromError(error: unknown): Record<string, string> | undefined {
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
