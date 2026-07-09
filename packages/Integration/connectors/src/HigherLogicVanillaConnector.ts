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
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type CreateRecordContext,
    type CRUDResult,
    type RateLimitPolicy,
    type SourceSchemaInfo,
} from '@memberjunction/integration-engine';
import { mergeDeclaredWithSampledFields } from '@memberjunction/connector-schema-merge';

// ─── Design note ────────────────────────────────────────────────────────
//
// The connector is PURE MECHANISM. The object/field catalog is NOT baked here — it lives in the
// Declared metadata (metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json),
// seeded from Vanilla's credential-free OpenAPI/KB corpus (case-1 discovery). Discovery is INHERITED
// from BaseRESTIntegrationConnector: DiscoverObjects / DiscoverFields / IntrospectSchema read the
// persisted Declared metadata from the IntegrationEngineBase cache. There is NO hardcoded object list,
// NO field catalog, NO baked PK/FK/required/readonly/type constants in this file.
//
// What this connector implements (the Higher Logic Vanilla API v2 protocol shape over REST/JSON):
//  - Auth: a Personal Access Token as a Bearer token — `Authorization: Bearer <token>` (KB article 41).
//    A static, long-lived, manually-issued token — no OAuth handshake, no signing, no crypto. The SSO
//    flavours the same platform also offers (OAuth2 / SAML / OIDC / jsConnect / JWT-addon) are END-USER
//    web auth, NOT this server-to-server connector's path, and are deliberately NOT implemented.
//  - Tenancy: Vanilla is per-tenant hosted (no single global host). Every request targets
//    `{communityUrl}/api/v2/…`; the per-tenant {communityUrl} is read from the connection Configuration
//    (PerTenantConfig.communityUrlConfigKey='communityUrl') / credential — ZERO community URL baked here.
//  - Pagination: numbered pages (`page` + `limit`) whose authoritative "more data" signal is the RFC-5988
//    `Link` response header (`rel="next"`) — with the `x-app-page-next-url` header and a body-length
//    heuristic as fallbacks. NOT a body-embedded cursor.
//  - Incremental: a `dateUpdated` (or insert-only `dateInserted`) list-endpoint filter — the per-object
//    IncrementalWatermarkField from metadata. Sent as `<field>=>=<watermark>`; the new max is persisted
//    only on a fully-drained batch (partial-failure-safe).
//  - Write: generic per-operation CRUD (metadata-driven, flat bodies) for the write-capable IOs. Two
//    documented idiosyncrasies are overridden: (1) Vanilla's PK is `<object>ID` (discussionID / userID),
//    not a plain `id`, so create-ID extraction reads the metadata PK; (2) nested write paths carry named
//    parent vars (`/groups/{id}/members/{userID}`) the base's single-`{id}` templating can't fill.

// ─── Constants ────────────────────────────────────────────────────────

/** Vanilla's API version path segment — constant across every per-tenant community host. */
const VANILLA_API_VERSION_PATH = '/api/v2';
/** Fallback page size when the IO declares no DefaultPageSize. */
const VANILLA_DEFAULT_LIMIT = 30;
/**
 * Conservative universal cap on the requested `limit`. Endpoint maxima vary (100 for
 * discussions/comments/categories, 500 for users — Configuration.PaginationDefaults.maxLimitSamples), but
 * 100 is safe on every documented endpoint; a larger batch simply fetches more pages. This is a pagination
 * bound, NOT a catalog — no per-object limit is hardcoded (the real sizes live in metadata / are discovered).
 */
const VANILLA_MAX_LIMIT = 100;

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed Vanilla credential + tenant. The token is the Bearer value; communityUrl is the per-tenant host. */
interface VanillaCredentials {
    /** Personal Access Token (Bearer value). */
    Token?: string;
    /** Per-tenant community host (e.g. `https://community.example.com`). */
    CommunityUrl?: string;
}

/** Auth context carrying the resolved Bearer token + the fully-composed per-tenant base URL. */
interface VanillaAuthContext extends RESTAuthContext {
    /** Bearer token value. */
    Token: string;
    /** Fully-composed base URL: `{communityUrl}/api/v2` (or a Configuration BaseURL override for testing). */
    CommunityBaseURL: string;
}

// ─── HigherLogicVanillaConnector ─────────────────────────────────────────

/**
 * Higher Logic Vanilla connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 *
 * Discovery, the paginated GET loop, template-var read traversal (second-layer objects resolve their
 * parent via metadata), and generic per-operation CRUD are inherited. This class supplies only the
 * Vanilla-specific protocol surface: Bearer auth, the per-tenant base URL, numbered + Link-header
 * pagination, the `dateUpdated`/`dateInserted` incremental filter, connection testing, PK-aware create
 * ID extraction, named/composite path-var substitution, and the §7/§10 sync-efficiency hooks the frozen
 * contract evidences.
 */
@RegisterClass(BaseIntegrationConnector, 'HigherLogicVanillaConnector')
export class HigherLogicVanillaConnector extends BaseRESTIntegrationConnector {

    /** Cached auth for the lifetime of a single sync run (Personal Access Tokens are long-lived, no refresh). */
    private cachedAuth: VanillaAuthContext | null = null;

    /**
     * Response headers from the MOST RECENT MakeHTTPRequest, stashed so the (ctx-less) ExtractPaginationInfo
     * can read the RFC-5988 `Link` header. Safe: the base pagination loop calls MakeHTTPRequest and
     * ExtractPaginationInfo back-to-back with NO intervening await, so on a single-threaded event loop the
     * stashed headers always correspond to the page just parsed.
     */
    private lastResponseHeaders: Record<string, string> = {};

    /**
     * The active incremental filter fragment (e.g. `dateUpdated=%3E%3D<iso>`) for the object currently being
     * fetched, stashed by the FetchChanges override so the (ctx-less) BuildPaginatedURL can append it. Set at
     * the top of an incremental FetchChanges, cleared in its finally. Safe because the engine drives one
     * FetchChanges per object at a time (single-threaded async; no concurrent BuildPaginatedURL for a
     * different watermark).
     */
    private activeWatermarkFilter: string | null = null;

    // ── Identity (T1 three-way invariant) ────────────────────────────

    /** Verbatim `MJ: Integrations.Name`. Load-bearing: the T1 three-way name check compares this === metadata Name. */
    public override get IntegrationName(): string {
        return 'higherlogic-vanilla';
    }

    /**
     * Sample-union enrichment (MJ connector standard): the Declared metadata is docs/spec-derived and misses
     * a tenant's custom profile fields (Vanilla ProfileField extensions surface as extra keys on user/record
     * reads) and addon-specific attributes. After the base cache-driven introspection, we sample each
     * object's live read shape via `DiscoverFieldsViaFetch` and UNION it into the declared field set with
     * `mergeDeclaredWithSampledFields` — never-shrink, declared-wins, capacities widened. Best-effort +
     * parallel; a sample failure (no credential, addon disabled) leaves that object's declared fields intact.
     * NOTE: we override `IntrospectSchema` (NOT `DiscoverFields` — that would recurse into
     * `DiscoverFieldsViaFetch`'s own fallback). Connector-agnostic: no Vanilla-specific field logic.
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
    // Write is a MIXED subset (Configuration.WriteCapability): many objects support create/update/delete,
    // several are read-only, and a few support only a subset (e.g. BadgeRequest = create + delete, no
    // update). The connector-level getters report the UNION (the connector CAN perform each verb); per-object
    // null-column honesty is enforced by the base generic CRUD path, which THROWS for a verb whose
    // Create/Update/Delete path+method columns are null (never silently sends a broken URL).

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Vanilla exposes no
     * describe/introspection endpoint enumerating everything a credential can access, and a tenant's custom
     * ProfileFields are knowable only from data — they flow through the sample-union above + the framework's
     * runtime custom-column capture. So absence in a refresh proves nothing → never deactivate. Matches
     * Configuration.DiscoveryIsAuthoritative=false in the frozen contract.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ── Sync-efficiency hooks (§7/§10 — populated from frozen-contract Configuration facts) ──

    /**
     * From Configuration.RateLimitPolicy (KB article 44): GET is 300 req/min per IP (=5/s), writes 120/min
     * (=2/s). A separate HARD limit — 250 requests / 10s — triggers a MANUAL-intervention IP block (not an
     * auto-lifting 429), so we stay well under it: 5/s sustained (the GET ceiling) with a small burst. The
     * engine's AIMD bucket backs off further on any 429.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 5, Burst: 10 };
    }

    // ExtractRetryAfterMs: inherited default (undefined). Configuration.RateLimitPolicy.retryAfterHeaderDocumented
    // is FALSE — Vanilla documents no Retry-After / X-RateLimit-* header on its 429 (confirmed by a direct scan
    // of the merged OpenAPI spec's response headers). Nothing to parse reliably; the AIMD bucket backs off on
    // the 429 regardless. Left as a soft gap for live-probe confirmation rather than guessing a header name.

    /** Conservative in-flight cap. The per-minute + hard-block ceilings are the real limiters. */
    public override get MaxConcurrencyHint(): number | null { return 3; }

    /**
     * No-watermark objects resume by their StableOrderingKey — read from the IO metadata when the extractor
     * emitted one, else the object's declared PK (Vanilla's `<object>ID`). Returns null when the object
     * declares no stable key or the cache is unavailable (unit-test context).
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
     * Resolves the Bearer token + the per-tenant community base URL from the linked Credential entity
     * (preferred) or the CompanyIntegration Configuration JSON (fallback). Cached for the run.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.cachedAuth) return this.cachedAuth;
        const creds = await this.loadCredentials(companyIntegration, contextUser);
        if (!creds.Token) {
            throw new Error(
                '[higherlogic-vanilla] No Personal Access Token found. Attach a credential carrying the token ' +
                '(token / apiKey / personalAccessToken), or set it in the connection Configuration JSON.'
            );
        }
        const baseURL = this.resolveCommunityBaseURL(companyIntegration, creds);
        this.cachedAuth = { Token: creds.Token, CommunityBaseURL: baseURL };
        return this.cachedAuth;
    }

    /** Vanilla auth: the Personal Access Token as a Bearer header. A static string — no signing, no crypto. */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${(auth as VanillaAuthContext).Token}`,
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
        this.lastResponseHeaders = respHeaders;
        const text = await response.text();
        let parsed: unknown = null;
        if (text.length > 0) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        return { Status: response.status, Body: parsed, Headers: respHeaders };
    }

    /**
     * Vanilla list endpoints return a BARE JSON ARRAY of records at the response root (ResponseDataKey=null
     * for almost every object). A few wrap under a key (e.g. ProductMessage → ResponseDataKey='data'). The
     * get-one shape is a single bare object. Handles all three.
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        if (responseDataKey) {
            const arr = body[responseDataKey];
            if (Array.isArray(arr)) return arr as Record<string, unknown>[];
        }
        // get-one / non-list shape: the body IS the record.
        return [body];
    }

    /**
     * Vanilla pagination (Configuration.PaginationDefaults): numbered pages whose authoritative "more data"
     * signal is the RFC-5988 `Link` response header (`<url>; rel="next"`), NOT a body field. We read the Link
     * header from the stashed headers (with the `x-app-page-next-url` header as a secondary signal, and a
     * body-length heuristic as the last-resort fallback). For PageNumber the next page is page+1 (Vanilla's
     * next URL is deterministic); for the one Cursor-typed object we surface the next-page URL verbatim as the
     * cursor so BuildPaginatedURL follows it directly.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        _currentOffset: number,
        pageSize: number
    ): PaginationState {
        const nextURL = this.parseNextLink(this.lastResponseHeaders);
        if (paginationType === 'Cursor') {
            return nextURL ? { HasMore: true, NextCursor: nextURL } : { HasMore: false };
        }
        // PageNumber (the overwhelmingly common case).
        if (nextURL) {
            return { HasMore: true, NextPage: currentPage + 1 };
        }
        // Fallback when no Link/next header is present: a full page suggests more data. The KB warns a page
        // CAN be short mid-stream (permission stripping), so the header is preferred; this only fires when the
        // header is absent, and it stops on the first short/empty page (safe: worst case re-reads one page).
        if (Array.isArray(rawBody) && pageSize > 0 && rawBody.length >= pageSize) {
            return { HasMore: true, NextPage: currentPage + 1 };
        }
        return { HasMore: false };
    }

    /**
     * Per-tenant base host + version path: `{communityUrl}/api/v2`. Composed in Authenticate (honoring a
     * Configuration BaseURL override for sandbox/mock redirection) and stashed on the auth context. The
     * object APIPaths (`/discussions`, …) are appended by the base BuildFullURL.
     */
    protected override GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as VanillaAuthContext).CommunityBaseURL;
    }

    /**
     * Vanilla pagination params: `page=<n>&limit=<size>` (NOT the base default `page`/`pageSize`). When the
     * incremental watermark filter is active this run, it is appended (`dateUpdated=>=<iso>`). For the
     * Cursor-typed object the base hands back a FULL next-page URL as the cursor — return it verbatim.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        // Cursor style (Link-header full-URL follow): the cursor IS the next page's absolute URL.
        if (cursor && /^https?:\/\//i.test(cursor)) return cursor;
        const requested = effectivePageSize ?? obj.DefaultPageSize ?? VANILLA_DEFAULT_LIMIT;
        const limit = Math.max(1, Math.min(requested, VANILLA_MAX_LIMIT));
        const parts = [`page=${page}`, `limit=${limit}`];
        if (this.activeWatermarkFilter) parts.push(this.activeWatermarkFilter);
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}${parts.join('&')}`;
    }

    // ── FetchChanges override (incremental dateUpdated/dateInserted filter + new-watermark emission) ──

    /**
     * OVERRIDDEN to (1) inject the `<IncrementalWatermarkField>=>=<watermark>` list filter for objects that
     * declare SupportsIncrementalSync + carry a watermark this run, and (2) EMIT the new watermark. The base
     * flat/template fetch threads no watermark into the URL and returns no NewWatermarkValue, so the connector
     * owns both. All fetching (numbered pagination, template-var parent traversal) is delegated to the base;
     * this override only sets activeWatermarkFilter around the super call and computes the max on a drained batch.
     *
     * Partial-failure safety: NewWatermarkValue is emitted ONLY when the whole object is drained
     * (HasMore=false). A mid-stream batch advances no watermark, so a failure between batches resumes from the
     * unchanged prior watermark. The `>=` operator (not `>`) means the boundary record re-syncs each run —
     * idempotent (content-hash dedup) and never loses a record that shares the boundary timestamp.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const wmField = obj.IncrementalWatermarkField;
        const incremental = obj.SupportsIncrementalSync
            && !!wmField
            && ctx.WatermarkValue != null
            && ctx.WatermarkValue.length > 0;

        if (!incremental) {
            return super.FetchChanges(ctx);
        }

        this.activeWatermarkFilter = `${encodeURIComponent(wmField!)}=${encodeURIComponent(`>=${ctx.WatermarkValue}`)}`;
        try {
            const result = await super.FetchChanges(ctx);
            if (!result.HasMore) {
                result.NewWatermarkValue = this.maxWatermark(result, wmField!, ctx.WatermarkValue as string);
            }
            return result;
        } finally {
            this.activeWatermarkFilter = null;
        }
    }

    // ── CRUD ──────────────────────────────────────────────────────────
    //
    // Top-level single-`{id}` objects (Discussion, Comment, User, Category, Article, …) use the INHERITED
    // generic UpdateRecord / DeleteRecord / GetRecord unchanged — they read the per-operation IO columns and
    // route the single `{id}` through the SubstituteIDInPath override below. CreateRecord is overridden for two
    // Vanilla idiosyncrasies (PK-aware id extraction + nested-create parent vars); SubstituteIDInPath is
    // overridden so the nested objects' named/composite path vars (`/groups/{id}/members/{userID}`) resolve.

    /**
     * OVERRIDDEN for two Vanilla create idiosyncrasies the generic path can't express:
     *  1. Vanilla's created-record ID field is `<object>ID` (discussionID / commentID / userID), NOT a plain
     *     `id`, so the base's ExtractIDFromResponse (which scans for id/ID/externalID) would return undefined
     *     and BuildCreatedResult would FAIL every create. We read the created object's PK from the metadata PK
     *     field(s) instead.
     *  2. Nested create paths carry PARENT template vars (`/groups/{id}/members`, `/badges/{id}/requests`) —
     *     filled here from the record's own Attributes.
     * The flat request body (Vanilla wraps nothing) and the loud-on-empty-id BuildCreatedResult are preserved.
     * Top-level creates (no parent vars) behave exactly as the generic path would.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) {
            // Delegate so the "not configured" error is raised consistently by the base.
            return super.CreateRecord(ctx);
        }
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const path = this.substitutePathVarsFromAttributes(obj.CreateAPIPath, ctx.Attributes);
        const url = this.joinURL(baseURL, path);
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            const externalID = this.extractCreatedID(obj, fields, response);
            return this.BuildCreatedResult(externalID, response.Status, ctx.ObjectName);
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on create`,
        };
    }

    /**
     * OVERRIDDEN so the generic Update/Delete/Get path can template Vanilla's NAMED and NESTED path vars —
     * `/discussions/{id}`, `/groups/{id}/members/{userID}`, `/badges/{id}/requests/{userID}` — which the base
     * (which only replaces `{id}`/`{ExternalID}`) cannot. A single-var path takes the whole ExternalID; a
     * multi-var (nested) path splits the composite `parent|child` ExternalID in path order.
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

    // ── Connection test ──────────────────────────────────────────────

    /**
     * Tests the connection by hitting the current-user endpoint (`/api/v2/users/me`). A 2xx confirms the token
     * + community URL are valid; 401/403 → auth failure; anything else → error.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const baseURL = this.GetBaseURL(companyIntegration, auth);
            const headers = this.BuildHeaders(auth);
            const url = this.joinURL(baseURL, '/users/me');
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: 'Higher Logic Vanilla connection successful.' };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Higher Logic Vanilla authentication failed (HTTP ${response.Status}). Check the Personal Access Token and community URL.` };
            }
            return { Success: false, Message: `Higher Logic Vanilla connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Higher Logic Vanilla connection test error: ${msg}` };
        }
    }

    // ── Credential + tenant loading ──────────────────────────────────

    /** Reads the Vanilla credential (token + community URL) from the linked Credential entity or Configuration. */
    private async loadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<VanillaCredentials> {
        const credentialID = companyIntegration.CredentialID;
        let creds: VanillaCredentials | null = null;
        if (credentialID) {
            creds = await this.loadFromCredentialEntity(credentialID, contextUser);
        }
        const configCreds = companyIntegration.Configuration ? this.parseCredentialJson(companyIntegration.Configuration) : null;
        // Credential store wins for the secret token; Configuration usually carries the (non-secret) community URL.
        const merged: VanillaCredentials = {
            Token: creds?.Token ?? configCreds?.Token,
            CommunityUrl: creds?.CommunityUrl ?? configCreds?.CommunityUrl,
        };
        if (!creds && !configCreds) {
            throw new Error(
                '[higherlogic-vanilla] No credential found. Attach a credential carrying the Personal Access Token ' +
                '(+ the community URL), or set Configuration JSON.'
            );
        }
        return merged;
    }

    /** Loads a credential row and parses its Values JSON. */
    private async loadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<VanillaCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.parseCredentialJson(credential.Values);
    }

    /** Extracts Vanilla credential fields from a credential/config JSON string (tolerant of absent/invalid). */
    private parseCredentialJson(json: string): VanillaCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            return {
                Token: this.firstString(parsed, ['token', 'Token', 'apiKey', 'ApiKey', 'personalAccessToken', 'PersonalAccessToken', 'accessToken', 'AccessToken']),
                CommunityUrl: this.firstString(parsed, ['communityUrl', 'communityURL', 'CommunityUrl', 'CommunityURL', 'endpoint', 'Endpoint', 'baseUrl', 'baseURL', 'BaseUrl', 'BaseURL']),
            };
        } catch {
            return null;
        }
    }

    /**
     * Composes the per-tenant base URL `{communityUrl}/api/v2`. Honors an explicit absolute-URL override
     * (endpoint/baseUrl already carrying `/api/v2`, or a sandbox/mock origin) verbatim; otherwise appends the
     * constant version path. ZERO community URL is baked into this connector — it always comes from data.
     */
    private resolveCommunityBaseURL(_companyIntegration: MJCompanyIntegrationEntity, creds: VanillaCredentials): string {
        const raw = (creds.CommunityUrl ?? '').trim();
        if (!raw) {
            throw new Error(
                '[higherlogic-vanilla] No community URL configured. Set the per-connection "communityUrl" ' +
                '(the `https://<community-host>` tenant identifier) — it is never baked into the connector.'
            );
        }
        const trimmed = raw.replace(/\/+$/, '');
        // If the supplied value already carries the /api/v2 version path, use it as-is (override / already-composed).
        if (/\/api\/v2$/i.test(trimmed)) return trimmed;
        return `${trimmed}${VANILLA_API_VERSION_PATH}`;
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Extracts the created record's ExternalID from the response using the object's METADATA PK field(s)
     * (Vanilla's PK is `<object>ID`, not a plain `id`). Falls back to the base ExtractIDFromResponse for
     * header/body-`id` locations. Returns undefined when no PK value is present → BuildCreatedResult fails loudly.
     */
    private extractCreatedID(
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        response: RESTResponse
    ): string | undefined {
        const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        const created = records[0];
        if (created) {
            const pkNames = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
            if (pkNames.length > 0 && pkNames.every(n => created[n] != null && String(created[n]).length > 0)) {
                return pkNames.map(n => String(created[n])).join('|');
            }
        }
        return this.ExtractIDFromResponse(response, obj.CreateIDLocation);
    }

    /** Substitutes CreateAPIPath parent template vars from the record's own attributes (nested creates). */
    private substitutePathVarsFromAttributes(path: string, attributes: Record<string, unknown>): string {
        return path.replace(/\{(\w+)\}/g, (match, name: string) => {
            const v = attributes[name];
            return v != null && String(v).length > 0 ? encodeURIComponent(String(v)) : match;
        });
    }

    /** Parses the RFC-5988 `Link` header (or `x-app-page-next-url`) for the `rel="next"` URL. */
    private parseNextLink(headers: Record<string, string>): string | null {
        const direct = headers['x-app-page-next-url'];
        if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
        const link = headers['link'];
        if (typeof link !== 'string' || link.length === 0) return null;
        // `<url1>; rel="first", <url2>; rel="next", <url3>; rel="last"`
        for (const part of link.split(',')) {
            const m = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
            if (m) return m[1].trim();
        }
        return null;
    }

    /**
     * Max watermark across the batch's records for the given field, vs the prior watermark. ISO-8601
     * timestamps compared by Date.parse (tolerant of differing offsets); the prior value is retained when no
     * record carries a later timestamp (never regresses).
     */
    private maxWatermark(result: FetchBatchResult, wmField: string, prior: string): string {
        let bestStr = prior;
        let bestMs = Date.parse(prior);
        if (isNaN(bestMs)) bestMs = -Infinity;
        for (const rec of result.Records) {
            const raw = rec.Fields?.[wmField];
            if (raw == null) continue;
            const s = String(raw);
            const ms = Date.parse(s);
            if (!isNaN(ms) && ms > bestMs) {
                bestMs = ms;
                bestStr = s;
            }
        }
        return bestStr;
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

    /** Returns the first present, non-empty string value among the given keys. */
    private firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }
}
