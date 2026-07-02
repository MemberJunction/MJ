/**
 * RhythmConnector — Integration connector for the Rhythm Software (Rhythm AMS) REST API.
 *
 * API docs: https://docs.api.rhythmsoftware.com/ (15 per-module OpenAPI v1 specs,
 *           info.version "v1-2025-04-18"). Catalog is credential-free Declared metadata in
 *           `metadata/integrations/rhythm/.rhythm.integration.json` (377 IOs across 14 modules).
 *
 * ── Auth: OAuth 2.0 Client Credentials (M2M) via Auth0 ───────────────────────
 *   Mints a Bearer JWT through the shared {@link OAuth2TokenManager} (no inlined token logic):
 *     POST https://{auth0Domain}/oauth/token
 *       grant_type=client_credentials & client_id & client_secret & audience
 *   `audience` (Auth0-specific, default https://api.rhythmsoftware.com) flows through the
 *   manager's additive `ExtraParams`. The JWT is valid ~24h; the manager re-mints on expiry.
 *   Every request sends `Authorization: Bearer {accessToken}`.
 *
 * ── Routing: per-module subdomains + {tenantId} path param (idiosyncratic) ───
 *   Rhythm has NO single base URL — each module is its own subdomain
 *   (rolodex.api.rhythmsoftware.com, membership.api…, events.api…, …). Each IO carries its
 *   `Configuration.Subdomain`; the connector routes per-object. EVERY endpoint embeds {tenantId}
 *   as a path param (distinct from the OAuth credentials), substituted from the connection's
 *   TenantId at request time. This is why FetchChanges + GetBaseURL + MakeHTTPRequest are
 *   overridden — the generic single-base-URL/template-var model does not fit.
 *
 * ── Pagination: DynamoDB-style keyset cursor ────────────────────────────────
 *   List endpoints return `{ Count, Items, LastEvaluatedKey }`. The next page is requested with
 *   `?exclusiveStartKey=<LastEvaluatedKey>`; an absent/null LastEvaluatedKey marks the final page.
 *   No page-size param (server-controlled). Search endpoints (POST …/search) are out of scope here.
 *
 * ── Incremental: none server-side → full pull + content-hash dedup ──────────
 *   No list endpoint exposes a date filter in any of the 15 specs. Records carry the vendor-managed
 *   `sys_last_modified_at` timestamp but it is NOT a server-side filter param, so every IO is a full
 *   pull (SupportsIncrementalSync=false) and the engine's content-hash skip de-dupes unchanged rows.
 *
 * ── Write: full CRUD (metadata-driven generic path) ─────────────────────────
 *   356/377 IOs are create-capable, 361 update, 352 delete — the per-operation CRUD columns are
 *   populated on every writable IO, so the base BaseRESTIntegrationConnector generic
 *   CreateRecord/UpdateRecord/DeleteRecord path executes them as-is (no per-verb override). POST
 *   creates (ID auto-generated, returned in the body); PATCH updates (RFC 6902); DELETE is a hard
 *   delete. Subdomain + {tenantId} routing is layered in via GetBaseURL/MakeHTTPRequest.
 */
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth2TokenManager,
    computeContentHash,
    serializeKeyValue,
    type OAuth2TokenRequest,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
    type RateLimitPolicy,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type CRUDResult,
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

// ─── Configuration & Auth Types ──────────────────────────────────────

/**
 * Rhythm connection configuration, parsed from the attached MJ Credential (preferred) or the
 * CompanyIntegration.Configuration JSON. Field names are read case-insensitively. NONE of these
 * values are read at build time — they are resolved from the bound credential at runtime.
 */
export interface RhythmConnectionConfig {
    /** OAuth2 (Auth0 M2M) client identifier. */
    ClientId: string;
    /** OAuth2 (Auth0 M2M) client secret. */
    ClientSecret: string;
    /** Tenant-specific Auth0 domain (e.g. `your-tenant.us.auth0.com`) the token is minted from. */
    Auth0Domain: string;
    /** Auth0 API audience. Default `https://api.rhythmsoftware.com`. */
    Audience?: string;
    /** Rhythm tenant identifier — substituted into every endpoint's {tenantId} path param. */
    TenantId: string;
    /** Optional absolute token-endpoint override; defaults to `https://{Auth0Domain}/oauth/token`. */
    TokenURL?: string;
    /**
     * Optional single base-URL override. Rhythm normally routes each object to its own module
     * subdomain (`Configuration.Subdomain`); when this is set, EVERY request is routed through this
     * one origin instead (path preserved). Real multi-subdomain tenants leave it unset — it exists
     * for a proxying API gateway or the credential-free e2e mock that fronts all modules on one host.
     */
    BaseURL?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited / transient failures. Default 3. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default 30000. */
    RequestTimeoutMs?: number;
}

/** Per-object Configuration JSON shape (subset the connector reads from the IO's Configuration). */
interface RhythmObjectConfig {
    /** Module subdomain this object is hosted on (e.g. https://rolodex.api.rhythmsoftware.com). */
    Subdomain?: string;
    /** Response envelope key carrying the record array. Default "Items". */
    ResponseItemsKey?: string;
    /** Response envelope key carrying the next-page cursor. Default "LastEvaluatedKey". */
    ResponseCursorKey?: string;
    /** Query param name for the keyset cursor. Default "exclusiveStartKey". */
    PaginationCursorParam?: string;
    /**
     * How this object is LISTED, derived from the OpenAPI spec (Rhythm has no universal GET list-all):
     *  - 'list'     → GET the resource base `/{resource}/{tenantId}` (the base supports GET).
     *  - 'search'   → POST `/{resource}/{tenantId}/search` (no GET list-all; cursor rides in the body).
     *  - 'fk-child' → reachable only via a parent FK path `/{resource}/{tenantId}/{fk}/{fkid}` (GET) —
     *                 fetched through parent traversal, not bulk-listed standalone.
     *  - 'by-id'    → only `/{resource}/{tenantId}/{id}` GET exists (singleton/statistic) — fetched on
     *                 demand by id, not bulk-listed.
     * Default (unset) = 'list'.
     */
    ReadStyle?: 'list' | 'search' | 'fk-child' | 'by-id';
    /** The spec-valid list/read path template for this object (per ReadStyle). */
    ReadPath?: string;
    /** The HTTP method for the list/read path (GET for list/fk-child/by-id; POST for search). */
    ReadMethod?: string;
}

/** Extended REST auth context carrying the resolved bearer token + config. */
interface RhythmAuthContext extends RESTAuthContext {
    /** Bearer access token (from {@link OAuth2TokenManager}). */
    Token: string;
    /** Parsed connection config for reference across the request lifecycle. */
    Config: RhythmConnectionConfig;
}

// ─── Constants ───────────────────────────────────────────────────────

/** The canonical MJ: Integrations.Name — part of the three-way invariant. */
const INTEGRATION_NAME = 'Rhythm Software';

/** Auth0 token endpoint path appended to `https://{Auth0Domain}` when no TokenURL override is given. */
const DEFAULT_TOKEN_PATH = '/oauth/token';

/** Default Auth0 API audience for Rhythm M2M tokens (per integration Configuration). */
const DEFAULT_AUDIENCE = 'https://api.rhythmsoftware.com';

/** DynamoDB-style keyset cursor query param (uniform across all 15 modules per the OpenAPI specs). */
const DEFAULT_CURSOR_PARAM = 'exclusiveStartKey';
/** Response envelope key carrying the record array. */
const DEFAULT_ITEMS_KEY = 'Items';
/** Response envelope key carrying the next-page cursor (absent/null ⇒ final page). */
const DEFAULT_CURSOR_KEY = 'LastEvaluatedKey';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Safety cap on pages per FetchChanges call so a runaway/looping cursor can never spin forever. */
const MAX_PAGES_PER_FETCH = 10_000;

// ─── Connector Implementation ────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'RhythmConnector')
export class RhythmConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run. */
    private authCache: RhythmAuthContext | null = null;

    /** Shared OAuth2 token manager — owns the client-credentials round-trip + token cache. */
    private readonly tokenManager = new OAuth2TokenManager();

    /**
     * Subdomain the CURRENT operation routes to (set per-call before the generic CRUD path reads
     * GetBaseURL). Rhythm has no single base URL — each IO lives on its own module subdomain.
     */
    private currentSubdomain: string | null = null;

    // Returns the EXACT MJ: Integrations.Name string LITERAL (not the INTEGRATION_NAME const) so the
    // T1 ThreeWayName invariant can statically parse the getter's returned value from connector source.
    public override get IntegrationName(): string { return 'Rhythm Software'; }

    // ── Capability getters: METADATA-DRIVEN (no hardcoded answer) ─────
    //
    // Write capability FOLLOWS the per-operation CRUD columns on the cached IntegrationObjects
    // (Declared metadata). An object is create-capable when it declares both CreateAPIPath +
    // CreateMethod; same for update/delete. The Rhythm catalog populates these on every writable
    // IO, so the base generic CRUD path executes them — these getters never bake a hardcoded answer.

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

    // ── Sync-efficiency hooks (provable from the frozen contract) ─────

    /**
     * No-watermark keyset resume hint. Rhythm exposes no server-side incremental filter, but every
     * record carries the universal `id` PK (StableOrderingKey="id" on every IO). Returning it lets
     * the engine resume a full scan by id. Provable: 377/377 IOs declare id as PK.
     */
    public override StableOrderingKey(_objectName: string): string | null {
        return 'id';
    }

    /**
     * Conservative AIMD rate policy. The Rhythm M2M token carries a tenant-configured monthly request
     * budget (no fixed per-second limit is documented in the specs); 429 means the tenant limit was
     * exceeded. We declare a gentle sustained rate + multiplicative back-off so a sync never bursts
     * the budget, and parse Retry-After from the 429 (see ExtractRetryAfterMs).
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 5, Burst: 5, ThrottleBackoffFactor: 0.5 };
    }

    /** Parses a Retry-After header (seconds or HTTP-date) on a 429 into ms for the engine's AIMD bucket. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const headers = (error as { Headers?: Record<string, string> }).Headers;
        const raw = headers?.['retry-after'];
        if (!raw) return undefined;
        const asSeconds = Number(raw);
        if (!isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
        const asDate = new Date(raw).getTime();
        if (!isNaN(asDate)) return Math.max(0, asDate - Date.now());
        return undefined;
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    /**
     * OAuth 2.0 Client Credentials (Auth0 M2M) authentication. Mints/refreshes the Bearer JWT via the
     * shared {@link OAuth2TokenManager} — the Auth0-required `audience` rides the additive ExtraParams.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const token = await this.MintToken(config);

        const auth: RhythmAuthContext = { Token: token, Config: config };
        this.authCache = auth;
        return auth;
    }

    /** Runs the Auth0 client_credentials token round-trip through OAuth2TokenManager. */
    private async MintToken(config: RhythmConnectionConfig): Promise<string> {
        const req: OAuth2TokenRequest = {
            TokenURL: this.ResolveTokenURL(config),
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
            // Auth0 client_credentials requires `audience`; flows through the manager's ExtraParams.
            ExtraParams: { audience: config.Audience ?? DEFAULT_AUDIENCE },
            TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
        const token = await this.tokenManager.GetAccessToken(req, 'client_credentials');
        return token.AccessToken;
    }

    /** Sends the OAuth2 bearer token on every request. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as RhythmAuthContext).Token ?? auth.Token ?? '';
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    /**
     * Returns the base URL for the CURRENT operation = the module subdomain set by FetchChanges/CRUD
     * before delegating. Rhythm has no single base URL, so this is per-object (the subdomain is
     * resolved from the IO's Configuration.Subdomain). Falls back to the auth-derived host only if a
     * subdomain was somehow not set (defensive; never expected in the normal path).
     */
    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        // Connection-level base-URL override (a proxying gateway, or the credential-free e2e mock that
        // fronts every module on one host): route EVERY module-subdomain request through this single
        // origin, preserving the resource path. Real multi-subdomain tenants leave it unset.
        const override = (auth as RhythmAuthContext)?.Config?.BaseURL;
        if (override && override.length > 0) {
            try { return new URL(override).origin; } catch { return override.replace(/\/+$/, ''); }
        }
        if (this.currentSubdomain) return this.currentSubdomain;
        throw new Error(
            'RhythmConnector: no module subdomain set for the current operation — ' +
            'every Rhythm IO must carry Configuration.Subdomain.'
        );
    }

    /**
     * Strips the Rhythm list envelope `{ Count, Items, LastEvaluatedKey }` down to the record array.
     * Handles three shapes:
     *   1. `{ Items: [...] }` — the standard list envelope (responseDataKey defaults to "Items").
     *   2. raw array — defensive (an endpoint returning a bare array).
     *   3. single object — a get-one detail record.
     * The FULL source record passes through (no field filtering) so the framework's custom-column
     * capture sees everything the source returned.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        if (Array.isArray(rawBody)) {
            return rawBody as Record<string, unknown>[];
        }

        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;
            const itemsKey = responseDataKey ?? DEFAULT_ITEMS_KEY;
            if (Array.isArray(body[itemsKey])) {
                return body[itemsKey] as Record<string, unknown>[];
            }
            // A single detail record (get-one) — not a list envelope.
            return [body];
        }

        return [];
    }

    /**
     * Derives Rhythm's DynamoDB-style keyset cursor state. The next page is fetched with
     * `?exclusiveStartKey=<LastEvaluatedKey>`; an absent/null/empty LastEvaluatedKey marks the final
     * page (Items also empty ⇒ done). The cursor may be a string or an object key — it is serialized
     * to a string when present.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (!rawBody || typeof rawBody !== 'object') {
            return { HasMore: false };
        }
        const body = rawBody as Record<string, unknown>;
        const cursorRaw = body[DEFAULT_CURSOR_KEY];
        if (cursorRaw == null) return { HasMore: false };
        const cursor = typeof cursorRaw === 'string' ? cursorRaw : JSON.stringify(cursorRaw);
        if (cursor.length === 0) return { HasMore: false };
        const total = typeof body.Count === 'number' ? body.Count : undefined;
        return { HasMore: true, NextCursor: cursor, TotalRecords: total };
    }

    // ─── FetchChanges (idiosyncratic: subdomain + {tenantId} routing) ───
    //
    // OVERRIDE rationale: Rhythm's per-module subdomain routing + the {tenantId} path param on every
    // endpoint do NOT fit the base's single-base-URL/template-var FetchChanges (which would treat
    // {tenantId} as a parent-record iteration var). We resolve the subdomain + substitute {tenantId},
    // then run the uniform DynamoDB cursor loop ourselves. All Rhythm IOs are top-level flat resources
    // (no genuine parent-iteration), so the loop stays simple. Records are assembled exactly like the
    // base (full-record pass-through + §4 synthetic-PK fallback) via buildExternalRecord.

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = (await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser)) as RhythmAuthContext;
        const objCfg = this.ParseObjectConfig(obj);

        this.currentSubdomain = this.ResolveSubdomain(objCfg);

        const pkFieldNames = this.PrimaryKeyFieldNames(fields);
        const itemsKey = objCfg.ResponseItemsKey ?? DEFAULT_ITEMS_KEY;
        const cursorParam = objCfg.PaginationCursorParam ?? DEFAULT_CURSOR_PARAM;
        const readStyle = objCfg.ReadStyle ?? 'list';

        // Rhythm exposes no universal GET list-all. Objects that can only be reached on-demand by id
        // ('by-id' — singletons/statistics) or via a parent FK path ('fk-child') have NO bulk-list
        // endpoint: issuing a GET on their resource base would 405. Surface a structural FetchWarning
        // (the engine reports it in the run artifact) instead of a swallowed error or a doomed request.
        if (readStyle === 'by-id') {
            // Genuinely non-enumerable: Rhythm exposes ONLY GET /{resource}/{tenantId}/{id} for these
            // (no list, no /search, no by-FK path) — there is no endpoint to bulk-list them. Fetched
            // on demand by a known id; surfaced honestly rather than issuing a doomed request.
            return {
                Records: [], HasMore: false,
                Warnings: [{ Code: 'NO_ENUMERATION_ENDPOINT', Message: `"${obj.Name}" has no list/search/by-FK endpoint in the Rhythm spec (get-one by id only) — not bulk-syncable.`, Data: { ReadStyle: readStyle } }],
            };
        }
        if (readStyle === 'fk-child') {
            // Reached only via a parent-FK path /{resource}/{tenantId}/{parent}/{fkId}. Traverse it in
            // the connector (no framework change): resolve the parent, page its ids, fetch children per
            // parent. See FetchFkChild.
            return await this.FetchFkChild(obj, fields, auth as RhythmAuthContext, objCfg, ctx, pkFieldNames, itemsKey);
        }

        // 'search' → Rhythm lists via POST `/{resource}/{tenantId}/search` (no GET list-all); the
        // keyset cursor rides in the request BODY. 'list' (default) → GET the resource base with the
        // cursor as a query param. ReadPath is the spec-valid path for the chosen style.
        const isSearch = readStyle === 'search';
        const readPath = (isSearch && objCfg.ReadPath) ? objCfg.ReadPath : obj.APIPath;
        // Route through GetBaseURL (returns currentSubdomain) rather than reading currentSubdomain
        // directly, so the per-object subdomain stays overridable by the test harness's GetBaseURL
        // hook — identical behaviour at runtime, but mock-routable for the offline tiers.
        const url = this.JoinURL(this.GetBaseURL(ctx.CompanyIntegration, auth), this.SubstituteTenant(readPath, auth.Config.TenantId));

        const records: ExternalRecord[] = [];
        const batchLimit = ctx.BatchSize ?? Number.MAX_SAFE_INTEGER;
        let cursor: string | undefined = ctx.CurrentCursor;
        let hasMore = true;
        let pages = 0;

        while (hasMore && records.length < batchLimit && pages < MAX_PAGES_PER_FETCH) {
            pages++;
            let response: RESTResponse;
            if (isSearch) {
                // POST /search — the cursor (exclusiveStartKey) is a body field, not a query param.
                const body = cursor ? { [cursorParam]: cursor } : {};
                response = await this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), body);
            } else {
                const pageURL = this.AppendCursor(url, cursorParam, cursor);
                response = await this.MakeHTTPRequest(auth, pageURL, 'GET', this.BuildHeaders(auth));
            }

            if (response.Status === 403) {
                // Object requires additional API permissions/scopes — skip cleanly for this run.
                console.warn(
                    `[${this.IntegrationName}] HTTP 403 for "${obj.Name}" — missing permission/scope; skipping. URL: ${url}`
                );
                return { Records: records, HasMore: false };
            }
            this.ValidateResponse(response, url);

            const raw = this.NormalizeResponse(response.Body, itemsKey);
            for (const r of raw) {
                const transformed = this.applyTransformPreservingKeys(r, obj, fields);
                records.push(this.buildExternalRecord(transformed, ctx.ObjectName, pkFieldNames));
            }

            const page = this.ExtractPaginationInfo(response.Body, obj.PaginationType, 1, 0, raw.length);
            hasMore = page.HasMore;
            cursor = page.NextCursor;
        }

        return { Records: records, HasMore: hasMore, NextCursor: hasMore ? cursor : undefined };
    }

    /**
     * fk-child traversal — CONNECTOR-SIDE, no framework change. For an object whose only list route is
     * a parent-FK path `/{resource}/{tenantId}/{parent}/{fkId}`, resolve the parent object, page a
     * BOUNDED set of parent ids, and fetch children per parent (the engine's private template-var
     * traversal can't be reused, and it treats {tenantId} as a parent — so we do it here). Parent
     * resolution: the FK field's RelatedIntegrationObjectID when present (deployed), else the parent
     * resource segment in ReadPath (works on the seeded/test cache where @lookup refs are scrubbed).
     */
    private async FetchFkChild(
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        auth: RhythmAuthContext,
        objCfg: RhythmObjectConfig,
        ctx: FetchContext,
        pkFieldNames: string[],
        itemsKey: string
    ): Promise<FetchBatchResult> {
        const MAX_FK_PARENTS = 200; // Goldilocks: bound parent fan-out per call
        const readPath = objCfg.ReadPath;
        if (!readPath) return { Records: [], HasMore: false, Warnings: [{ Code: 'FK_NO_READPATH', Message: `"${obj.Name}" is fk-child but has no Configuration.ReadPath` }] };
        const allVars = (readPath.match(/\{(\w+)\}/g) ?? []).map(s => s.slice(1, -1));
        const fkVar = [...allVars].reverse().find(v => v.toLowerCase() !== 'tenantid');
        if (!fkVar) return { Records: [], HasMore: false, Warnings: [{ Code: 'FK_NO_VAR', Message: `"${obj.Name}" ReadPath has no parent FK variable: ${readPath}` }] };

        const parent = this.ResolveFkParent(fields, readPath, fkVar);
        if (!parent) return { Records: [], HasMore: false, Warnings: [{ Code: 'FK_NO_PARENT', Message: `"${obj.Name}" fk-child: could not resolve a parent object for {${fkVar}} (path ${readPath})` }] };

        const parentIds = await this.FetchParentIds(parent, auth, ctx, MAX_FK_PARENTS);
        if (parentIds.length === 0) {
            return { Records: [], HasMore: false, Warnings: [{ Code: 'FK_NO_PARENTS', Message: `"${obj.Name}" fk-child: parent "${parent.Name}" yielded 0 records to traverse {${fkVar}} over`, Data: { parent: parent.Name } }] };
        }

        const records: ExternalRecord[] = [];
        const batchLimit = ctx.BatchSize ?? Number.MAX_SAFE_INTEGER;
        const base = this.GetBaseURL(ctx.CompanyIntegration, auth);
        let parentsTraversed = 0;
        for (const pid of parentIds) {
            if (records.length >= batchLimit) break;
            parentsTraversed++;
            const path = this.SubstituteTenant(readPath, auth.Config.TenantId).split(`{${fkVar}}`).join(encodeURIComponent(pid));
            const url = this.JoinURL(base, path);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status === 403 || response.Status === 404) continue; // inaccessible/empty parent edge — skip
            this.ValidateResponse(response, url);
            const raw = this.NormalizeResponse(response.Body, itemsKey);
            for (const r of raw) records.push(this.buildExternalRecord(this.applyTransformPreservingKeys(r, obj, fields), ctx.ObjectName, pkFieldNames));
        }
        return {
            Records: records, HasMore: false,
            Warnings: records.length ? [] : [{ Code: 'FK_CHILD_EMPTY', Message: `"${obj.Name}" fk-child traversed ${parentsTraversed} "${parent.Name}" parent(s); 0 children`, Data: { parent: parent.Name, parentsTraversed } }],
        };
    }

    /** Resolve the parent IntegrationObject for an fk-child's FK variable: FK metadata first, else the parent-resource path segment. */
    private ResolveFkParent(fields: MJIntegrationObjectFieldEntity[], readPath: string, fkVar: string): MJIntegrationObjectEntity | null {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName(INTEGRATION_NAME);
        if (!integration) return null;
        const siblings = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID);
        const fkField = fields.find(f => f.Name?.toLowerCase() === fkVar.toLowerCase() && f.RelatedIntegrationObjectID);
        if (fkField?.RelatedIntegrationObjectID) {
            const byId = siblings.find(s => UUIDsEqual(s.ID, fkField.RelatedIntegrationObjectID));
            if (byId) return byId;
        }
        const segs = readPath.split('/').filter(Boolean);
        const idx = segs.indexOf(`{${fkVar}}`);
        const parentSeg = idx > 0 ? segs[idx - 1] : null;
        if (parentSeg) {
            const norm = (s: string) => s.toLowerCase().replace(/s$/, '');
            const byPath = siblings.find(s => norm((s.APIPath ?? '').split('/').filter(Boolean)[0] ?? '') === norm(parentSeg));
            if (byPath) return byPath;
        }
        return null;
    }

    /** Fetch a bounded page of a parent object's PK ids (its own list/search read) for fk-child traversal. */
    private async FetchParentIds(parent: MJIntegrationObjectEntity, auth: RhythmAuthContext, ctx: FetchContext, max: number): Promise<string[]> {
        const cfg = this.ParseObjectConfig(parent);
        const pStyle = cfg.ReadStyle ?? 'list';
        if (pStyle === 'fk-child' || pStyle === 'by-id') return []; // don't recurse into a non-bulk parent
        const pk = this.PrimaryKeyFieldNames(this.GetCachedFields(parent.ID))[0] ?? 'id';
        const prevSub = this.currentSubdomain;
        try {
            this.currentSubdomain = this.ResolveSubdomain(cfg);
            const itemsKey = cfg.ResponseItemsKey ?? DEFAULT_ITEMS_KEY;
            const base = this.GetBaseURL(ctx.CompanyIntegration, auth);
            const isSearch = pStyle === 'search';
            const readPath = (isSearch && cfg.ReadPath) ? cfg.ReadPath : parent.APIPath;
            const url = this.JoinURL(base, this.SubstituteTenant(readPath, auth.Config.TenantId));
            const response = isSearch
                ? await this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), {})
                : await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status < 200 || response.Status >= 300) return [];
            const ids: string[] = [];
            for (const r of this.NormalizeResponse(response.Body, itemsKey)) {
                const v = (r as Record<string, unknown>)[pk];
                if (v != null && String(v).length > 0) ids.push(String(v));
                if (ids.length >= max) break;
            }
            return ids;
        } finally {
            this.currentSubdomain = prevSub;
        }
    }

    // ─── CRUD: subdomain + {tenantId} routing over the generic base path ──
    //
    // The base's generic CreateRecord/UpdateRecord/DeleteRecord/GetRecord already read the
    // per-operation columns (CreateAPIPath/Method/BodyShape/IDLocation, Update*, Delete*) and route
    // through GetBaseURL + MakeHTTPRequest. We do NOT re-implement the write logic — we only set the
    // current module subdomain before delegating (MakeHTTPRequest then substitutes {tenantId}). This
    // keeps the metadata-driven generic path intact while layering Rhythm's two routing facts on top.

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        await this.RouteSubdomain(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.CreateRecord(ctx);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        await this.RouteSubdomain(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.UpdateRecord(ctx);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        await this.RouteSubdomain(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.DeleteRecord(ctx);
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        await this.RouteSubdomain(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ObjectName);
        return super.GetRecord(ctx);
    }

    /** Resolves + sets the current module subdomain for an object before a generic CRUD delegate. */
    private async RouteSubdomain(ci: MJCompanyIntegrationEntity, objectName: string): Promise<void> {
        const obj = this.GetCachedObject(ci.IntegrationID, objectName);
        this.currentSubdomain = this.ResolveSubdomain(this.ParseObjectConfig(obj));
    }

    /**
     * HTTP transport with retry/back-off for 429/503 and substitution of the connection-level
     * {tenantId} into the URL (the single chokepoint every request flows through, so tenant routing
     * is uniform across fetch + CRUD). On a 429 the response carries the Retry-After the engine's AIMD
     * bucket consumes via ExtractRetryAfterMs.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const config = (auth as RhythmAuthContext).Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        // Defensive: substitute any residual {tenantId} the path still carries (fetch pre-substitutes,
        // the generic CRUD path does not — this covers both uniformly).
        const finalURL = this.SubstituteTenant(url, config.TenantId);

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
                response = await fetch(finalURL, fetchOptions);
            } catch (err) {
                if (attempt < maxRetries && this.IsTransientNetworkError(err)) {
                    await this.Sleep(this.BackoffDelay(attempt));
                    continue;
                }
                throw err;
            }

            if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
                console.warn(`[${this.IntegrationName}] HTTP ${response.status} from ${finalURL} — backing off`);
                await this.Sleep(this.RetryAfterMs(response) ?? this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`Rhythm request failed after ${maxRetries + 1} attempts: ${finalURL}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by minting an Auth0 M2M token and listing one page of the first cached IO
     * (subdomain + {tenantId} routed). A 2xx confirms the OAuth2 credentials + tenant are valid.
     * Falls back to asserting the token mint alone when no catalog is loaded.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as RhythmAuthContext;
            const probe = this.FirstProbeObject(companyIntegration.IntegrationID);
            if (!probe) {
                // Token minted but no catalog cached (e.g. credential-free self-check) — the mint
                // succeeding is itself a valid auth confirmation.
                return {
                    Success: true,
                    Message: 'Rhythm OAuth2 token minted (no object catalog loaded to probe a read).',
                    ServerVersion: 'Rhythm REST API v1',
                };
            }
            const objCfg = this.ParseObjectConfig(probe);
            this.currentSubdomain = this.ResolveSubdomain(objCfg);
            const path = this.SubstituteTenant(probe.APIPath, auth.Config.TenantId);
            const url = this.JoinURL(this.GetBaseURL(companyIntegration, auth), path);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));

            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `Rhythm returned HTTP ${response.Status} from ${url}` };
            }
            return {
                Success: true,
                Message: `Connected to Rhythm (tenant ${auth.Config.TenantId}) via ${probe.Name}`,
                ServerVersion: 'Rhythm REST API v1',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (metadata-driven, no hardcoded catalog) ───────────

    /**
     * Discovers the full object universe from the IntegrationEngineBase cache (the Declared metadata
     * in `.rhythm.integration.json`). Rhythm publishes its catalog credential-free (15 OpenAPI v1
     * specs), so the baseline is Declared metadata — never hardcoded here, never sampled at build.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const seeded = await super.DiscoverObjects(companyIntegration, contextUser);
        if (seeded.length > 0) return seeded;
        // No seeded Declared metadata loaded (a credential-free context with no DB-backed engine).
        // The catalog is runtime-seeded Declared metadata (loaded from the DB) — NOT a code constant
        // (per the no-hardcoded-catalog rule), so it cannot be reproduced from source credential-free.
        throw new Error(
            'Rhythm DiscoverObjects requires a loaded object catalog — the 377-object universe is ' +
            'runtime-seeded Declared metadata (from the 15 public OpenAPI specs), not a code constant.'
        );
    }

    /** Discovers fields for an object from the cached Declared metadata. */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        return super.DiscoverFields(companyIntegration, objectName, contextUser);
    }

    // ─── Config parsing ──────────────────────────────────────────────

    /**
     * Parses the connection config, preferring the attached MJ Credential over the raw Configuration
     * JSON. Credential bytes are resolved at runtime — never at build.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<RhythmConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('Rhythm connector requires either CredentialID or Configuration JSON');
    }

    /** Loads the connection config from the MJ: Credentials entity Values JSON. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<RhythmConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('Rhythm credential could not be loaded or has no Values JSON');
        }
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are read case-insensitively. */
    private ValidateConfig(raw: unknown): RhythmConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Rhythm configuration is not a valid object');
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

        const clientId = getStr('clientid', 'client_id');
        const clientSecret = getStr('clientsecret', 'client_secret');
        if (!clientId || !clientSecret) {
            throw new Error('Rhythm OAuth2 configuration missing required field: ClientId / ClientSecret');
        }
        const auth0Domain = getStr('auth0domain', 'auth0_domain', 'authdomain', 'domain');
        if (!auth0Domain) {
            throw new Error('Rhythm OAuth2 configuration missing required field: Auth0Domain');
        }
        const tenantId = getStr('tenantid', 'tenant_id', 'tenant');
        if (!tenantId) {
            throw new Error('Rhythm configuration missing required field: TenantId');
        }

        return {
            ClientId: clientId,
            ClientSecret: clientSecret,
            Auth0Domain: auth0Domain,
            Audience: getStr('audience') ?? DEFAULT_AUDIENCE,
            TenantId: tenantId,
            TokenURL: getStr('tokenurl', 'token_url'),
            BaseURL: getStr('baseurl', 'base_url'),
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
    }

    /** Resolves the Auth0 token endpoint: credential TokenURL override, else `https://{domain}/oauth/token`. */
    private ResolveTokenURL(config: RhythmConnectionConfig): string {
        if (config.TokenURL && config.TokenURL.length > 0) return config.TokenURL;
        // Single-origin override: when a base URL fronts every Rhythm host (a proxying gateway, or the
        // credential-free e2e mock), the OAuth2 token endpoint is fronted there too. Real tenants leave
        // BaseURL unset and mint directly from the Auth0 domain.
        if (config.BaseURL && config.BaseURL.length > 0) {
            try { return `${new URL(config.BaseURL).origin}${DEFAULT_TOKEN_PATH}`; } catch { /* fall through to Auth0 */ }
        }
        const host = config.Auth0Domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        return `https://${host}${DEFAULT_TOKEN_PATH}`;
    }

    // ─── Object-config + routing helpers ──────────────────────────────

    /** Parses an IO's Configuration JSON (tolerant of absent/malformed). */
    private ParseObjectConfig(obj: MJIntegrationObjectEntity): RhythmObjectConfig {
        const raw = obj.Configuration;
        if (!raw || typeof raw !== 'string') return {};
        try {
            return JSON.parse(raw) as RhythmObjectConfig;
        } catch {
            console.warn(`[${this.IntegrationName}] Invalid Configuration JSON for object "${obj.Name}"`);
            return {};
        }
    }

    /** Resolves the module subdomain for an object (required — every Rhythm IO declares one). */
    private ResolveSubdomain(cfg: RhythmObjectConfig): string {
        if (cfg.Subdomain && cfg.Subdomain.length > 0) return cfg.Subdomain.replace(/\/+$/, '');
        throw new Error('Rhythm object Configuration missing required field: Subdomain');
    }

    /** Substitutes the connection-level {tenantId} into a path/URL. */
    private SubstituteTenant(pathOrURL: string, tenantId: string): string {
        return pathOrURL.replace(/\{tenantId\}/g, encodeURIComponent(tenantId));
    }

    /** Joins a base subdomain and a path into a full URL (single slash). */
    private JoinURL(base: string, path: string): string {
        const b = base.endsWith('/') ? base.slice(0, -1) : base;
        const p = path.startsWith('/') ? path : `/${path}`;
        return `${b}${p}`;
    }

    /** Appends the keyset cursor query param to a URL when a cursor is present. */
    private AppendCursor(url: string, cursorParam: string, cursor?: string): string {
        if (!cursor) return url;
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}${encodeURIComponent(cursorParam)}=${encodeURIComponent(cursor)}`;
    }

    /** Returns PK field names (sorted by Sequence), falling back to ['id'] (Rhythm's universal PK). */
    private PrimaryKeyFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence);
        return pk.length > 0 ? pk.map(f => f.Name) : ['id'];
    }

    /** First cached IO for the integration, used as the TestConnection read probe. */
    private FirstProbeObject(integrationID: string): MJIntegrationObjectEntity | undefined {
        const objs = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID);
        return objs.length > 0 ? objs[0] : undefined;
    }

    /**
     * Builds an ExternalRecord from a raw source record, mirroring the base's §4 identity logic:
     * use the declared PK when every component is present + non-empty, else a deterministic
     * content-hash (so PK-less/partial-key rows stay syncable + dedupable). The FULL source record is
     * preserved in Fields (full-record pass-through); a single-PK whose value is empty is stamped with
     * the synthetic identity so the codegen reload finds the row.
     */
    private buildExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        const allPkPresent = pkFieldNames.length > 0
            && pkFieldNames.every(name => raw[name] != null && serializeKeyValue(raw[name]).length > 0);
        const externalID = pkFieldNames.map(name => serializeKeyValue(raw[name])).join('|');
        const resolvedID = allPkPresent ? externalID : computeContentHash(raw);

        let fields = raw;
        if (!allPkPresent && pkFieldNames.length === 1
            && (raw[pkFieldNames[0]] == null || serializeKeyValue(raw[pkFieldNames[0]]).length === 0)) {
            fields = { ...raw, [pkFieldNames[0]]: resolvedID };
        }
        return { ExternalID: resolvedID, ObjectType: objectType, Fields: fields };
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /** Validates an HTTP response and throws (with header context) on non-2xx. */
    private ValidateResponse(response: RESTResponse, url: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            const preview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            const err = new Error(`HTTP ${response.Status} from ${url}: ${preview}`) as Error & {
                Headers?: Record<string, string>;
                Status?: number;
            };
            // Attach headers/status so ExtractRetryAfterMs can read Retry-After off a thrown 429.
            err.Headers = response.Headers;
            err.Status = response.Status;
            throw err;
        }
    }

    /** Parses a Retry-After header (seconds or HTTP-date) into ms, if present. */
    private RetryAfterMs(response: Response): number | undefined {
        const header = response.headers.get('retry-after');
        if (!header) return undefined;
        const asSeconds = Number(header);
        if (!isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
        const asDate = new Date(header).getTime();
        if (!isNaN(asDate)) return Math.max(0, asDate - Date.now());
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
export function LoadRhythmConnector(): void { /* no-op */ }
