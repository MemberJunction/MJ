import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
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
    computeContentHash,
    serializeKeyValue,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type FetchWarning,
    type ExternalRecord,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type SourceSchemaInfo,
} from '@memberjunction/integration-engine';
import { mergeDeclaredWithSampledFields } from '@memberjunction/connector-schema-merge';

// ─── Design note ─────────────────────────────────────────────────────────────
//
// re:Members AMS (formerly Impexium) — Association Management Software REST/JSON API.
// The connector is PURE MECHANISM. The object/field catalog is NOT baked here — it lives in the
// Declared metadata (metadata/integrations/impexium/.impexium.integration.json), seeded from
// credential-free sources (case-1 discovery). DiscoverObjects / DiscoverFields / IntrospectSchema are
// INHERITED from BaseRESTIntegrationConnector and read the persisted Declared metadata from the
// IntegrationEngineBase cache. There is NO hardcoded object list, NO field catalog, NO baked
// PK/FK/required/readonly constants in this file. Custom fields flow through runtime discovery
// (the Setup/customfields catalog when the connector chooses to call it) + the framework's runtime
// custom-column capture — never a static baked catalog.
//
// What this connector implements (the Impexium protocol shape over REST/JSON):
//  - TARGET SURFACE: the RAW per-tenant host https://{tenant}.mpxapi.com — NOT the Microsoft-certified
//    Power Platform connector, which is a DIFFERENT (Azure APIM proxy) surface whose single x-api-key
//    authenticates the caller to Microsoft's proxy, not to the raw host. We never auth off that proxy.
//  - AUTH (candidate A — app + user handshake): the STRONGEST-EVIDENCE model per the frozen contract,
//    but recorded UNVERIFIED at plan time (a keyless probe structurally cannot verify an auth handshake).
//    Authenticate performs the app-init (AppId + AppKey + AppName + a user email/password) to obtain an
//    Access-Token + App-Token pair, caches them with an expiry, re-mints on expiry, and BuildHeaders sends
//    BOTH tokens as request headers. Candidate B (single x-api-key) is a config-selectable, cheaply
//    swappable fallback (AuthModel='apikey') — never silently assumed correct. The exact auth path, header
//    names and response field names are all Configuration-overridable so a live/sandbox probe can settle
//    them WITHOUT a code change. There is NO crypto to inline here — the handshake is a plain credential
//    POST that returns tokens; token caching is done via a small in-connector cache (OAuth2TokenManager-
//    style), never inline signing/HMAC/JWT-minting.
//  - TENANCY: GetBaseURL templates the per-tenant https://{tenant}.mpxapi.com host from the connection
//    Configuration / credential (TenantHostConfigKey='HostUrl') — ZERO tenant host baked in code.
//  - PAGINATION: PageNumber IN THE PATH (a {Page Number}/{pageNumber} segment), NEVER a ?page= query.
//    BuildPaginatedURL substitutes the page into the path segment; the loop increments the page and stops
//    on an empty dataList (the documented advance protocol — no hasMore/totalCount field exists).
//  - ENVELOPE: the list envelope is { pageNumber, dataList: T[] } (ResponseDataKey='dataList').
//  - INCREMENTAL: metadata-driven — an IO with SupportsIncrementalSync=true emits its
//    IncrementalWatermarkField (changedSince / purchasedSince / registeredSince / cancelledSince) as a
//    query param; the watermark advances (partial-failure-safe) only on a fully-drained final batch.
//  - NESTED READS: many objects are nested under a parent door (Events/{Code}/Registrations, …). The base
//    template-var machinery expects single-word {var} placeholders + Configuration.parentObjectName, but
//    Impexium's frozen paths use space-containing placeholders ({Event Code}, {ID or Record Number}) with
//    the parent expressed by the preceding RESOURCE segment. FetchChanges is overridden to WALK that
//    access path: resolve the parent sibling IO from the path segment, iterate synced parent records
//    (bounded + keyset-resumable), substitute, then page the leaf — surfacing a FetchWarning (never a
//    silent empty) when a parent can't be resolved (e.g. Courses / tasks Users, which are not emitted IOs).
//  - WRITE: generic per-operation CRUD, but the create/update/delete PATHS carry parent template vars
//    ({code}/{id}/{Record Number}) the base generic path does not substitute — CreateRecord / UpdateRecord
//    / DeleteRecord are overridden to fill those from the record attributes (create/update) or the composite
//    ExternalID (path id). CreateRecord still routes through BuildCreatedResult (fail loudly on empty id).
//    Full-record pass-through throughout (Fields = raw source record).
//
// DO NOT import anything from apidocs.impexdocs.com (ImpexDocs) — an unrelated export/shipping-logistics
// documentation vendor with a name collision. Never fetched, never referenced.

// ─── Types ────────────────────────────────────────────────────────────────────

/** Which auth model to run against the raw tenant host. */
type ImpexiumAuthModel = 'app-user' | 'apikey';

/**
 * Parsed Impexium connection config — read case-insensitively from the linked Credential entity
 * (preferred) or the CompanyIntegration.Configuration JSON. NONE of these values are read at build
 * time; they are resolved from the bound connection at runtime.
 */
interface ImpexiumConnectionConfig {
    /** Per-tenant host, e.g. `https://abc.mpxapi.com` (TenantHostConfigKey='HostUrl'). Required. */
    HostUrl: string;
    /** Auth model. Default 'app-user' (candidate A). 'apikey' selects the candidate-B fallback. */
    AuthModel: ImpexiumAuthModel;

    // ── candidate A (app + user handshake) ──
    /** App credential — application identifier issued by Impexium. */
    AppId?: string;
    /** App credential — application key/secret. */
    AppKey?: string;
    /** App credential — application name. */
    AppName?: string;
    /** End-user login email for the handshake. */
    Email?: string;
    /** End-user login password for the handshake. */
    Password?: string;
    /** Auth endpoint path override (UNVERIFIED default below). */
    AuthPath?: string;
    /** Request header name carrying the access token (UNVERIFIED default below). */
    AccessTokenHeader?: string;
    /** Request header name carrying the app token (UNVERIFIED default below). */
    AppTokenHeader?: string;

    // ── candidate B (single x-api-key) fallback ──
    /** API key for the candidate-B fallback (AuthModel='apikey'). */
    ApiKey?: string;
    /** API-key header name. Default 'x-api-key'. */
    ApiKeyHeader?: string;

    // ── optional performance overrides ──
    /** HTTP request timeout in ms. Default 60000. */
    RequestTimeoutMs?: number;
    /** Access-token lifetime in ms when the handshake response omits an expiry. Default 20 min. */
    TokenTTLMs?: number;
}

/** Extended REST auth context carrying the resolved host + the tokens/headers to attach per request. */
interface ImpexiumAuthContext extends RESTAuthContext {
    /** Per-tenant host with no trailing slash. */
    HostUrl: string;
    /** Which auth model produced this context. */
    AuthModel: ImpexiumAuthModel;
    /** Access token (candidate A). */
    AccessToken?: string;
    /** App token (candidate A). */
    AppToken?: string;
    /** API key (candidate B). */
    ApiKey?: string;
    /** Header name for the access token (candidate A). */
    AccessTokenHeader: string;
    /** Header name for the app token (candidate A). */
    AppTokenHeader: string;
    /** Header name for the API key (candidate B). */
    ApiKeyHeader: string;
    /** Absolute epoch-ms at which the cached tokens should be re-minted. */
    ExpiresAtMs: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Verbatim MJ: Integrations.Name — part of the T1 three-way name invariant. */
const INTEGRATION_NAME = 're:Members AMS';

/**
 * Auth handshake defaults (candidate A). UNVERIFIED at plan time — every one is Configuration-overridable
 * so a live/sandbox probe can correct the exact path / header / field names WITHOUT touching this code.
 */
const DEFAULT_AUTH_PATH = '/api/v1/authenticate';
const DEFAULT_ACCESS_TOKEN_HEADER = 'Access-Token';
const DEFAULT_APP_TOKEN_HEADER = 'App-Token';
const DEFAULT_API_KEY_HEADER = 'x-api-key';

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
/** Fallback token lifetime when the handshake response carries no explicit expiry (conservative). */
const DEFAULT_TOKEN_TTL_MS = 20 * 60 * 1_000;
/** Re-mint skew window: re-mint when within this many ms of expiry. */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

/** The universal list envelope key. Consistent across all 55 list-shaped responses per the frozen contract. */
const DATA_LIST_KEY = 'dataList';

/** Per-call cap on how many PARENTS a nested object iterates before yielding a keyset-resumable batch. */
const PARENT_BATCH_SIZE = 10;
/** Hard safety cap on page-loop iterations (termination is normally empty-page). */
const MAX_LEAF_PAGES = 10_000;

// ─── ImpexiumConnector ────────────────────────────────────────────────────────

/**
 * re:Members AMS (Impexium) connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 * See the design note above for the full protocol surface. Registered under the TS class symbol so the
 * sandbox verification ladder / T1 three-way check stay green; the OpenAppPublish step rewrites the key.
 */
@RegisterClass(BaseIntegrationConnector, 'ImpexiumConnector')
export class ImpexiumConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context (with token expiry) for the lifetime of a sync run; re-minted on expiry. */
    private cachedAuth: ImpexiumAuthContext | null = null;

    /** Watermark value in effect for the current FetchChanges call — emitted as the incremental param. */
    private currentWatermark: string | undefined;

    // ── Identity (T1 three-way invariant) ────────────────────────────────────

    /** Verbatim MJ: Integrations.Name. The T1 three-way name check statically parses this literal. */
    public override get IntegrationName(): string {
        return 're:Members AMS';
    }

    // ── Capability getters (kept in lockstep with the per-operation metadata columns) ──
    //
    // Write capability FOLLOWS the per-operation CRUD columns on the cached IntegrationObjects (Declared
    // metadata): an object is create-capable iff it declares both CreateAPIPath + CreateMethod, etc. No
    // hardcoded `true`; no 501 stubs. With no write metadata the surface is read-only.

    public override get SupportsCreate(): boolean {
        return this.anyObjectDeclares(o => !!o.CreateAPIPath && !!o.CreateMethod);
    }
    public override get SupportsUpdate(): boolean {
        return this.anyObjectDeclares(o => !!o.UpdateAPIPath && !!o.UpdateMethod);
    }
    public override get SupportsDelete(): boolean {
        return this.anyObjectDeclares(o => !!o.DeleteAPIPath && !!o.DeleteMethod);
    }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Impexium exposes no
     * describe-all / complete-gamut endpoint (GET Setup/customfields only enumerates the tenant's custom
     * FIELD catalog, not a whole object/field gamut). Absence in a refresh proves nothing → never
     * deactivate. Matches Configuration.DiscoveryIsAuthoritative=false in the frozen contract.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    /**
     * Sample-union field enrichment (the connector standard). Declared metadata is authoritative but
     * incomplete — it misses a tenant's CUSTOM / undeclared columns (Impexium's per-tenant custom fields).
     * Wire the required enrichment: take the base cache-driven schema, then per object UNION the declared
     * field set with what a live read actually returns (`mergeDeclaredWithSampledFields` — never-shrink,
     * declared-wins, capacities widened). Best-effort + parallel: a per-object sample failure leaves that
     * object's declared fields untouched. Overrides IntrospectSchema (NEVER DiscoverFields — that would
     * recurse into DiscoverFieldsViaFetch's fallback).
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

    /** True when any cached IntegrationObject satisfies the predicate. Fail-safe read-only ([]→false). */
    private anyObjectDeclares(pred: (o: MJIntegrationObjectEntity) => boolean): boolean {
        try {
            const integration = IntegrationEngineBase.Instance.GetIntegrationByName(INTEGRATION_NAME);
            if (!integration) return false;
            return IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID).some(pred);
        } catch {
            return false;
        }
    }

    // ── Abstract REST hooks ──────────────────────────────────────────────────

    /**
     * Authenticate against the RAW tenant host. Candidate A (default) runs the app + user handshake and
     * caches the Access-Token + App-Token; candidate B ('apikey') resolves a single x-api-key. The cached
     * context is re-minted when its tokens near expiry. NEVER inline crypto — the handshake is a plain
     * credential POST returning tokens.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.cachedAuth && this.cachedAuth.ExpiresAtMs > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return this.cachedAuth;
        }
        const config = await this.parseConfig(companyIntegration, contextUser);
        const host = this.resolveHost(config);

        if (config.AuthModel === 'apikey') {
            // Candidate B — single x-api-key. No handshake round-trip. Recorded as the cheaply swappable
            // fallback; NOT silently assumed correct for the raw host (see design note).
            this.cachedAuth = {
                HostUrl: host,
                AuthModel: 'apikey',
                ApiKey: config.ApiKey,
                AccessTokenHeader: config.AccessTokenHeader ?? DEFAULT_ACCESS_TOKEN_HEADER,
                AppTokenHeader: config.AppTokenHeader ?? DEFAULT_APP_TOKEN_HEADER,
                ApiKeyHeader: config.ApiKeyHeader ?? DEFAULT_API_KEY_HEADER,
                ExpiresAtMs: Number.MAX_SAFE_INTEGER,
            };
            return this.cachedAuth;
        }

        // Candidate A — app + user handshake (UNVERIFIED; see design note). Tokens cached with expiry.
        const tokens = await this.mintTokens(config, host);
        this.cachedAuth = {
            HostUrl: host,
            AuthModel: 'app-user',
            AccessToken: tokens.accessToken,
            AppToken: tokens.appToken,
            AccessTokenHeader: config.AccessTokenHeader ?? DEFAULT_ACCESS_TOKEN_HEADER,
            AppTokenHeader: config.AppTokenHeader ?? DEFAULT_APP_TOKEN_HEADER,
            ApiKeyHeader: config.ApiKeyHeader ?? DEFAULT_API_KEY_HEADER,
            ExpiresAtMs: tokens.expiresAtMs,
        };
        return this.cachedAuth;
    }

    /**
     * Attaches the auth headers per model: candidate A sends BOTH tokens (Access-Token + App-Token,
     * header names Configuration-overridable); candidate B sends the single x-api-key.
     */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const ctx = auth as ImpexiumAuthContext;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (ctx.AuthModel === 'apikey') {
            if (ctx.ApiKey) headers[ctx.ApiKeyHeader] = ctx.ApiKey;
            return headers;
        }
        if (ctx.AccessToken) headers[ctx.AccessTokenHeader] = ctx.AccessToken;
        if (ctx.AppToken) headers[ctx.AppTokenHeader] = ctx.AppToken;
        return headers;
    }

    /** Per-tenant host resolved in Authenticate — ZERO host baked in code. */
    protected override GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as ImpexiumAuthContext).HostUrl;
    }

    /** HTTP transport (fetch). Owns the wire boundary; test subclasses override this to capture requests. */
    protected override async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const timeoutMs = (auth as ImpexiumAuthContext)?.TimeoutMs as number | undefined;
        const init: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS),
        };
        if (body !== undefined && method !== 'GET') {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        const response = await fetch(url, init);
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
     * Strips Impexium's list envelope `{ pageNumber, dataList: T[] }` to the dataList array
     * (ResponseDataKey='dataList'). Falls back to a bare array, the universal dataList key, or a single
     * detail object. The FULL source record passes through (no field filtering).
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        const key = responseDataKey ?? DATA_LIST_KEY;
        const arr = body[key];
        if (Array.isArray(arr)) return arr as Record<string, unknown>[];
        // Universal-envelope fallback (some IOs declare a null ResponseDataKey but still list under dataList).
        if (Array.isArray(body[DATA_LIST_KEY])) return body[DATA_LIST_KEY] as Record<string, unknown>[];
        // Single-object detail response (get-one).
        return [body];
    }

    /**
     * Page-in-path pagination: the envelope carries NO hasMore/totalCount field, so termination is
     * empty-dataList. HasMore is true iff the current page returned records; the loop advances the page
     * number (rendered into the path by BuildPaginatedURL) and stops when a page comes back empty.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (paginationType !== 'PageNumber') return { HasMore: false };
        const records = this.NormalizeResponse(rawBody, DATA_LIST_KEY);
        return { HasMore: records.length > 0, NextPage: currentPage + 1 };
    }

    /**
     * Impexium puts the page number IN THE PATH (a {Page Number}/{pageNumber}/{Page} segment), NEVER as a
     * `?page=` query param. Substitute the page into that path segment and return — no query pagination.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        _offset: number,
        _cursor?: string,
        _effectivePageSize?: number
    ): string {
        if (obj.PaginationType !== 'PageNumber') return basePath;
        return this.substitutePagePlaceholder(basePath, page);
    }

    /**
     * Injects the incremental watermark filter when a sync is active. The param NAME is fully
     * METADATA-DRIVEN: it comes from the IO's IncrementalWatermarkField (changedSince / purchasedSince /
     * registeredSince / cancelledSince) and is emitted only when SupportsIncrementalSync=true AND a
     * watermark value is in context. Runs on top of the base's DefaultQueryParams handling.
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        return this.appendIncrementalParam(super.AppendDefaultQueryParams(url, obj), obj);
    }

    // ── FetchChanges override (page-in-path + nested parent access-path walk + watermark) ──

    /**
     * Fetch a batch. Flat top-level objects delegate to the base GET loop (which uses the BuildPaginatedURL
     * / ExtractPaginationInfo / AppendDefaultQueryParams overrides above for page-in-path + incremental).
     * Nested objects (whose frozen paths carry space-containing parent placeholders the base's `\w+`
     * template detector can't resolve) are walked here: resolve the parent sibling IO from the preceding
     * path RESOURCE segment, iterate synced parent records (bounded + keyset-resumable), substitute, then
     * page the leaf. The watermark advances (partial-failure-safe) only on a fully-drained final batch.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        // NOTE: Impexium sub-resources (/Individuals/{id}/Addresses, /Emails, /Notes, /CustomFields, an
        // Organization's /Services, /tasks, …) are RESTful read+write collections — GET lists them, POST
        // creates. Their deployed CreateAPIPath legitimately EQUALS the read APIPath (same URL, different
        // verb), so an "APIPath == write-path" test does NOT identify a write-only object and must NOT be
        // used to skip the read. These objects sync via the normal (parent-chained) read path below.
        this.currentWatermark = ctx.WatermarkValue ?? undefined;
        // Capture the sync-start time BEFORE any fetch — a changed-since watermark advances to this on a
        // clean full drain, so the next incremental picks up everything modified since this run began.
        const watermarkStart = this.formatWatermark(new Date());
        try {
            const parentTokens = this.parentTokens(obj.APIPath);
            const result = parentTokens.length === 0
                ? await super.FetchChanges(ctx)
                : await this.fetchWithParents(obj, parentTokens, ctx);

            if (obj.SupportsIncrementalSync && obj.IncrementalWatermarkField && !result.HasMore) {
                result.NewWatermarkValue = this.computeNewWatermark(ctx.WatermarkValue, watermarkStart);
            }
            return result;
        } finally {
            this.currentWatermark = undefined;
        }
    }

    /**
     * Walks a nested object's access path: resolve the PRIMARY parent token → sibling IO (by the path
     * segment preceding it), load the synced parent record IDs, process a bounded, keyset-resumable batch
     * of parents, substitute + page each leaf. Surfaces a FetchWarning (never a silent empty) when the
     * parent can't be resolved (Courses / tasks Users are not emitted IOs), when no parents are synced yet,
     * or when a secondary parent token remains unresolved.
     */
    private async fetchWithParents(
        obj: MJIntegrationObjectEntity,
        parentTokens: string[],
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = this.pkFieldNames(fields);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration, auth);
        const integrationID = ctx.CompanyIntegration.IntegrationID;

        const primaryToken = parentTokens[0];
        const parentObjectName = this.resolveParentObjectName(obj.APIPath, primaryToken, integrationID);
        if (!parentObjectName) {
            return this.warnResult(obj, 'PARENT_UNRESOLVED',
                `"${obj.Name}": the parent for {${primaryToken}} resolves to no emitted IntegrationObject ` +
                `(the preceding path resource segment is not a synced object) — cannot walk this access path.`);
        }

        const allParentIDs = this.sortIdsStable(
            await this.loadParentRecordIDs(parentObjectName, integrationID, ctx.ContextUser)
        );
        if (allParentIDs.length === 0) {
            return this.warnResult(obj, 'ZERO_PARENTS',
                `"${obj.Name}": no "${parentObjectName}" parent records available to iterate {${primaryToken}} ` +
                `over — sync the parent first (check DAG order/priority).`);
        }

        const after = ctx.AfterKeyValue ?? null;
        const remaining = after != null ? allParentIDs.filter(id => this.compareIds(id, after) > 0) : allParentIDs;
        const batch = remaining.slice(0, PARENT_BATCH_SIZE);

        const out: ExternalRecord[] = [];
        const warnings: FetchWarning[] = [];
        for (const parentID of batch) {
            const resolvedPath = obj.APIPath.replace(`{${primaryToken}}`, encodeURIComponent(parentID));
            const leftover = this.parentTokens(resolvedPath);
            if (leftover.length > 0) {
                warnings.push({
                    Code: 'PARENT_UNRESOLVED',
                    Message: `"${obj.Name}": secondary parent token {${leftover[0]}} could not be resolved — skipping this parent.`,
                    Data: { object: obj.Name, templateVar: leftover[0] },
                });
                continue;
            }
            const leafRecords = await this.fetchLeafPages(auth, baseURL, obj, resolvedPath);
            for (const raw of leafRecords) {
                // Emit the PURE source record — do NOT inject the parent id. `ExternalRecord.Fields` is the
                // full-record pass-through of what the VENDOR returned; a connector-synthesized provenance tag
                // is not source content. Critically, that tag flows into the content-hash basis (it is an
                // unmapped key → overflow → change-detection), so tagging the same leaf record with the parent
                // it was fetched under makes its hash depend on the TRAVERSAL PATH, not its content. When a
                // leaf is reachable from multiple parents (a many-to-many child, or any source that returns
                // the same child under several parents), the record is written once per parent with a
                // different hash each time and re-writes every sync — breaking idempotency (content-hash skip
                // never engages). Change-detection must be over the record's own content; the parent
                // association, if needed, belongs in a mapped FK from real source data, not this tag.
                out.push(this.buildExternalRecord(
                    this.applyTransformPreservingKeys(raw, obj, fields),
                    obj.Name,
                    pkFieldNames
                ));
            }
        }

        const hasMore = remaining.length > batch.length;
        return {
            Records: out,
            HasMore: hasMore,
            NextAfterKeyValue: hasMore ? batch[batch.length - 1] : undefined,
            Warnings: warnings.length > 0 ? warnings : undefined,
        };
    }

    /**
     * Drains ALL pages of a single resolved (parent-substituted) leaf path via page-in-path pagination,
     * or a single request when the object is non-paginated. Stops on an empty dataList; skips gracefully
     * on 403/404 (permission-gated / absent sub-resource). Injects the incremental watermark param.
     */
    private async fetchLeafPages(
        auth: RESTAuthContext,
        baseURL: string,
        obj: MJIntegrationObjectEntity,
        resolvedPath: string
    ): Promise<Record<string, unknown>[]> {
        const headers = this.BuildHeaders(auth);
        const paginated = obj.SupportsPagination && obj.PaginationType !== 'None' && this.hasPageToken(resolvedPath);

        if (!paginated) {
            const url = this.appendIncrementalParam(this.joinURL(baseURL, resolvedPath), obj);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (this.isSkippableStatus(response.Status)) return [];
            this.ensureOk(response, url);
            return this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        }

        const out: Record<string, unknown>[] = [];
        let page = 1;
        for (let i = 0; i < MAX_LEAF_PAGES; i++) {
            const pathWithPage = this.substitutePagePlaceholder(resolvedPath, page);
            const url = this.appendIncrementalParam(this.joinURL(baseURL, pathWithPage), obj);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (this.isSkippableStatus(response.Status)) break;
            this.ensureOk(response, url);
            const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
            if (records.length === 0) break;
            out.push(...records);
            page++;
        }
        return out;
    }

    // ── CRUD (parent-scoped write paths — the base generic path can't substitute create-path parents) ──

    /**
     * Create. OVERRIDDEN because Impexium's create paths carry PARENT template vars ({code}/{id}/
     * {Record Number}) filled from the record's own attributes — the generic base path leaves them literal.
     * The body shape + loud-on-empty-id BuildCreatedResult are preserved. Top-level creates with no path
     * vars (Individuals, Organizations, Tasks, Requests) behave exactly as the generic path would.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) return super.CreateRecord(ctx);

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
     * Update. OVERRIDDEN so parent path vars are filled from attributes and the path id ({id}/{Task Number}/
     * {memberRecordNumber}/…) is filled from the ExternalID when UpdateIDLocation='path'. When
     * UpdateIDLocation='body', the id is not path-substituted (the record body carries it).
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.UpdateAPIPath || !obj.UpdateMethod) return super.UpdateRecord(ctx);

        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const path = this.substituteWritePath(obj.UpdateAPIPath, ctx.Attributes, ctx.ExternalID, obj.UpdateIDLocation);
        const url = this.joinURL(baseURL, path);
        const body = this.BuildOperationBody(ctx.Attributes, obj.UpdateBodyShape, obj.UpdateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.UpdateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on update`,
        };
    }

    /**
     * Delete. OVERRIDDEN so the path id ({Category Code}) is filled from the ExternalID when
     * DeleteIDLocation='path'. NOTE (documented limitation, flagged for T10 live verification): the only
     * two delete-capable IOs (Categories, Links) are narrow sub-resources whose path ALSO carries a parent
     * segment ({Record Number}) that the framework's DeleteRecordContext does not surface — a single-part
     * ExternalID fills only the target id, so a live delete of these sub-resources needs the parent encoded
     * in a composite ExternalID. Links additionally identifies the target via the request BODY
     * (DeleteIDLocation='body'), which the delete context does not carry.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.DeleteAPIPath || !obj.DeleteMethod) return super.DeleteRecord(ctx);

        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const path = this.substituteWritePath(obj.DeleteAPIPath, {}, ctx.ExternalID, obj.DeleteIDLocation);
        const url = this.joinURL(baseURL, path);
        const response = await this.MakeHTTPRequest(auth, url, obj.DeleteMethod, headers);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on delete`,
        };
    }

    /**
     * Reads the created record's id from the Impexium create response. The universal envelope returns the
     * new record under `id`; some sub-resource creates return the record with no server id
     * (CreateIDLocation='n/a') — those route to BuildCreatedResult, which fails loudly on an empty id.
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        if (idLocation === 'header') return super.ExtractIDFromResponse(response, idLocation);
        const body = response.Body;
        if (!body || typeof body !== 'object') return undefined;
        const b = body as Record<string, unknown>;
        const rootId = this.readId(b);
        if (rootId) return rootId;
        // Some responses wrap the created record under the universal envelope or a single resource object.
        const wrapped = b[DATA_LIST_KEY] ?? b['data'] ?? b['result'];
        if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
            const id = this.readId(wrapped as Record<string, unknown>);
            if (id) return id;
        }
        return undefined;
    }

    // ── Connection test ──────────────────────────────────────────────────────

    /**
     * Tests connectivity by authenticating and reading one page of Individuals. A 2xx confirms the auth
     * flow + tenant host are valid; 401/403 → auth failure; anything else → error. Never mutates.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const baseURL = this.GetBaseURL(companyIntegration, auth);
            const headers = this.BuildHeaders(auth);
            const url = this.joinURL(baseURL, '/api/v1/Individuals/1');
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: `Connected to re:Members AMS at ${baseURL}` };
            }
            if (response.Status === 401 || response.Status === 403) {
                return {
                    Success: false,
                    Message: `re:Members AMS authentication failed (HTTP ${response.Status}). ` +
                        `Verify the AppId/AppKey/AppName + user login (or the auth model) and the tenant HostUrl.`,
                };
            }
            return { Success: false, Message: `re:Members AMS connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `re:Members AMS connection test error: ${msg}` };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //                              Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    // ── Auth handshake ───────────────────────────────────────────────────────

    /**
     * Runs the candidate-A app + user handshake: POST {AppId, AppKey, AppName, Email, Password} to the auth
     * path and read the Access-Token + App-Token (+ optional expiry) from the response. UNVERIFIED at plan
     * time — the endpoint path, request field names, response field names and TTL are all overridable, so a
     * live/sandbox probe can settle them without a code change. Plain credential POST; no crypto.
     */
    private async mintTokens(
        config: ImpexiumConnectionConfig,
        host: string
    ): Promise<{ accessToken: string; appToken?: string; expiresAtMs: number }> {
        const authPath = config.AuthPath ?? DEFAULT_AUTH_PATH;
        const url = this.joinURL(host, authPath);
        const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        const requestBody = {
            AppId: config.AppId,
            AppKey: config.AppKey,
            AppName: config.AppName,
            Email: config.Email,
            Password: config.Password,
        };
        // A bare auth context (no tokens) — the mint sends credentials in the body, not headers.
        const bareAuth = { HostUrl: host, AuthModel: 'app-user' } as unknown as RESTAuthContext;
        const response = await this.MakeHTTPRequest(bareAuth, url, 'POST', requestHeaders, requestBody);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(
                `re:Members AMS app+user handshake failed at ${url}: HTTP ${response.Status}. ` +
                `(Auth flow is UNVERIFIED — confirm the endpoint/field names against a live tenant.)`
            );
        }
        const body = (response.Body && typeof response.Body === 'object' ? response.Body : {}) as Record<string, unknown>;
        const accessToken = this.firstString(body, ['AccessToken', 'accessToken', 'access_token', 'Token', 'token']);
        if (!accessToken) {
            throw new Error(
                `re:Members AMS handshake returned HTTP ${response.Status} but no access token was found in the response. ` +
                `(Auth flow is UNVERIFIED — confirm the token field name.)`
            );
        }
        const appToken = this.firstString(body, ['AppToken', 'appToken', 'app_token', 'ApplicationToken', 'applicationToken']);
        const expiresAtMs = this.resolveTokenExpiry(body, config);
        return { accessToken, appToken, expiresAtMs };
    }

    /** Derives the token expiry from the handshake response, falling back to the configured/default TTL. */
    private resolveTokenExpiry(body: Record<string, unknown>, config: ImpexiumConnectionConfig): number {
        const ttl = config.TokenTTLMs ?? DEFAULT_TOKEN_TTL_MS;
        // Absolute expiry (ISO string) — common vendor field names.
        const absolute = this.firstString(body, ['AccessTokenExpiration', 'accessTokenExpiration', 'expiresAt', 'ExpiresAt']);
        if (absolute) {
            const t = Date.parse(absolute);
            if (Number.isFinite(t) && t > Date.now()) return t;
        }
        // Relative expiry (seconds).
        for (const key of ['ExpiresIn', 'expiresIn', 'expires_in']) {
            const v = body[key];
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Date.now() + v * 1_000;
        }
        return Date.now() + ttl;
    }

    // ── Config parsing ───────────────────────────────────────────────────────

    /** Parses the connection config, preferring the linked Credential entity over the Configuration JSON. */
    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<ImpexiumConnectionConfig> {
        let fromCredential: Record<string, unknown> | null = null;
        if (companyIntegration.CredentialID) {
            fromCredential = await this.loadCredentialValues(companyIntegration.CredentialID, contextUser);
        }
        let fromConfiguration: Record<string, unknown> | null = null;
        if (companyIntegration.Configuration) {
            try { fromConfiguration = JSON.parse(companyIntegration.Configuration) as Record<string, unknown>; } catch { fromConfiguration = null; }
        }
        if (!fromCredential && !fromConfiguration) {
            throw new Error('re:Members AMS connector requires either a linked Credential or Configuration JSON.');
        }
        // Merge: Configuration provides non-secret keys (HostUrl, AuthModel, header overrides); the
        // Credential provides secrets (AppId/AppKey/Email/Password/ApiKey). Credential wins on overlap.
        const merged: Record<string, unknown> = { ...(fromConfiguration ?? {}), ...(fromCredential ?? {}) };
        return this.buildConfig(merged);
    }

    /** Loads a credential row and parses its Values JSON to a plain map. */
    private async loadCredentialValues(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Record<string, unknown> | null> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) return null;
        try { return JSON.parse(cred.Values) as Record<string, unknown>; } catch { return null; }
    }

    /** Builds the typed config from a raw case-insensitive map, applying defaults + validating HostUrl. */
    private buildConfig(raw: Record<string, unknown>): ImpexiumConnectionConfig {
        const hostUrl = this.firstString(raw, ['HostUrl', 'hostUrl', 'hosturl', 'BaseURL', 'baseURL', 'host']);
        if (!hostUrl) {
            throw new Error('re:Members AMS configuration missing required "HostUrl" (the per-tenant https://{tenant}.mpxapi.com host).');
        }
        const authModelRaw = (this.firstString(raw, ['AuthModel', 'authModel']) ?? 'app-user').toLowerCase();
        const authModel: ImpexiumAuthModel = authModelRaw === 'apikey' || authModelRaw === 'api-key' ? 'apikey' : 'app-user';
        const timeout = this.firstNumber(raw, ['RequestTimeoutMs', 'requestTimeoutMs']);
        const ttl = this.firstNumber(raw, ['TokenTTLMs', 'tokenTTLMs']);
        return {
            HostUrl: hostUrl,
            AuthModel: authModel,
            AppId: this.firstString(raw, ['AppId', 'appId', 'appid']),
            AppKey: this.firstString(raw, ['AppKey', 'appKey', 'appkey']),
            AppName: this.firstString(raw, ['AppName', 'appName', 'appname']),
            Email: this.firstString(raw, ['Email', 'email', 'Username', 'username', 'UserEmail', 'userEmail']),
            Password: this.firstString(raw, ['Password', 'password']),
            AuthPath: this.firstString(raw, ['AuthPath', 'authPath']),
            AccessTokenHeader: this.firstString(raw, ['AccessTokenHeader', 'accessTokenHeader']),
            AppTokenHeader: this.firstString(raw, ['AppTokenHeader', 'appTokenHeader']),
            ApiKey: this.firstString(raw, ['ApiKey', 'apiKey', 'apikey', 'x-api-key']),
            ApiKeyHeader: this.firstString(raw, ['ApiKeyHeader', 'apiKeyHeader']),
            RequestTimeoutMs: timeout,
            TokenTTLMs: ttl,
        };
    }

    /** Resolves the per-tenant host (no trailing slash) — never a hardcoded host. */
    private resolveHost(config: ImpexiumConnectionConfig): string {
        return config.HostUrl.trim().replace(/\/+$/, '');
    }

    // ── Path / token helpers ─────────────────────────────────────────────────

    /** All `{...}` placeholders in a path (space-tolerant), unwrapped. */
    private allTokens(path: string): string[] {
        return (path.match(/\{[^}]+\}/g) ?? []).map(s => s.slice(1, -1));
    }

    /** True for the page placeholder (`{Page Number}` / `{pageNumber}` / `{Page}`) — space/case tolerant. */
    private isPageToken(name: string): boolean {
        const n = name.toLowerCase().replace(/\s+/g, '');
        return n === 'pagenumber' || n === 'page';
    }

    /** Parent (non-page) placeholders in a path. */
    private parentTokens(path: string): string[] {
        return this.allTokens(path).filter(t => !this.isPageToken(t));
    }

    /** True when the path still carries a page placeholder. */
    private hasPageToken(path: string): boolean {
        return this.allTokens(path).some(t => this.isPageToken(t));
    }

    /** Substitutes the page placeholder (space/case-tolerant) with the page number. */
    private substitutePagePlaceholder(path: string, page: number): string {
        return path.replace(/\{[^}]+\}/g, (m) => this.isPageToken(m.slice(1, -1)) ? String(page) : m);
    }

    /**
     * Resolves the parent object name for a template var from the path segment IMMEDIATELY preceding the
     * `{token}` (Impexium's REST convention: the parent resource name precedes its id), matched against a
     * sibling IntegrationObject by name. Returns null when no emitted sibling matches (e.g. Courses, Users).
     * Protected so tests can resolve a parent without a populated engine cache.
     */
    protected resolveParentObjectName(apiPath: string, token: string, integrationID: string): string | null {
        const idx = apiPath.indexOf(`{${token}}`);
        if (idx < 0) return null;
        const segment = apiPath.slice(0, idx).replace(/\/+$/, '').split('/').pop() ?? '';
        if (!segment) return null;
        const siblings = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID);
        const match = siblings.find(s => s.Name.toLowerCase() === segment.toLowerCase());
        return match ? match.Name : null;
    }

    /**
     * Loads the synced parent record IDs from the local MJ database (via the object's EntityMap → the target
     * entity's PK column). Protected so tests can inject fixed parent IDs without a live RunView.
     */
    protected async loadParentRecordIDs(
        parentObjectName: string,
        integrationID: string,
        contextUser: UserInfo
    ): Promise<string[]> {
        const parentObj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, parentObjectName);
        if (!parentObj) return [];
        const pkField = this.GetCachedFields(parentObj.ID).find(f => f.IsPrimaryKey);
        const pkFieldName = pkField ? pkField.Name : 'id';

        const rv = new RunView();
        const mapResult = await rv.RunView<{ Entity: string }>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: `ExternalObjectName='${parentObjectName.replace(/'/g, "''")}' AND SyncEnabled=1`,
            Fields: ['Entity'],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);
        if (!mapResult.Success || mapResult.Results.length === 0) return [];

        const idResult = await rv.RunView<Record<string, unknown>>({
            EntityName: mapResult.Results[0].Entity,
            Fields: [pkFieldName],
            ResultType: 'simple',
        }, contextUser);
        if (!idResult.Success) return [];
        return idResult.Results.map(r => String(r[pkFieldName]));
    }

    /** Fills a CreateAPIPath's parent template vars from the record's own attributes (case/space-insensitive). */
    private substitutePathVarsFromAttributes(path: string, attributes: Record<string, unknown>): string {
        return path.replace(/\{([^}]+)\}/g, (match, name: string) => {
            const v = this.lookupAttr(attributes, name);
            return v != null && String(v).length > 0 ? encodeURIComponent(String(v)) : match;
        });
    }

    /**
     * Fills a write (update/delete) path: parent vars from attributes first, then the remaining path id from
     * the (possibly composite) ExternalID when idLocation is 'path'. When idLocation is 'body'/'header', the
     * id is NOT path-substituted (the record body / a header carries it).
     */
    private substituteWritePath(
        path: string,
        attributes: Record<string, unknown>,
        externalID: string,
        idLocation: string | null
    ): string {
        let out = this.substitutePathVarsFromAttributes(path, attributes);
        if (externalID && (idLocation == null || idLocation === 'path')) {
            const remaining = this.allTokens(out);
            if (remaining.length > 0) {
                const parts = externalID.split('|');
                remaining.forEach((t, i) => {
                    const value = parts[i] ?? parts[parts.length - 1] ?? externalID;
                    out = out.replace(`{${t}}`, encodeURIComponent(value));
                });
            }
        }
        return out;
    }

    /** Looks up an attribute by name, matching case- and space-insensitively (`{Record Number}` → recordNumber). */
    private lookupAttr(attributes: Record<string, unknown>, name: string): unknown {
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        const target = norm(name);
        for (const [k, v] of Object.entries(attributes)) {
            if (norm(k) === target) return v;
        }
        return undefined;
    }

    // ── URL + response helpers ───────────────────────────────────────────────

    /** Joins a base URL and a path (mirrors the base's private BuildFullURL). */
    private joinURL(baseURL: string, apiPath: string): string {
        const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        return `${base}${path}`;
    }

    /** Appends the metadata-driven incremental watermark query param when active. */
    private appendIncrementalParam(url: string, obj: MJIntegrationObjectEntity): string {
        const field = obj.IncrementalWatermarkField;
        if (obj.SupportsIncrementalSync && field && this.currentWatermark) {
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}${encodeURIComponent(field)}=${encodeURIComponent(this.currentWatermark)}`;
        }
        return url;
    }

    /** 403/404 are skippable (permission-gated object / absent sub-resource) — degrade to zero rows. */
    private isSkippableStatus(status: number): boolean {
        return status === 403 || status === 404;
    }

    /** Throws a descriptive error on a non-2xx (non-skippable) status. */
    private ensureOk(response: RESTResponse, url: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            const preview = typeof response.Body === 'string'
                ? response.Body.slice(0, 300)
                : JSON.stringify(response.Body ?? '').slice(0, 300);
            throw new Error(`[re:Members AMS] HTTP ${response.Status} from ${url}: ${preview}`);
        }
    }

    // ── Record + identity helpers ────────────────────────────────────────────

    /** PK field names in Sequence order; empty when the object declares no PK (→ content-hash identity). */
    private pkFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        return fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
    }

    /**
     * Builds an ExternalRecord with the FULL source record in Fields (full-record pass-through — the
     * framework's custom-column capture diffs keys(Fields) against the field maps). ExternalID is the
     * composite PK when every component is present + non-empty, else a deterministic content hash (which is
     * also stamped into a single empty PK column so PK-less rows remain storable + idempotent). Mirrors the
     * base's ToExternalRecord (which is private) for the parent-iterated path.
     */
    private buildExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        const allPkPresent = pkFieldNames.length > 0
            && pkFieldNames.every(n => raw[n] != null && serializeKeyValue(raw[n]).length > 0);
        const externalID = pkFieldNames.map(n => serializeKeyValue(raw[n])).join('|');
        const resolvedID = allPkPresent ? externalID : computeContentHash(raw);
        let fields = raw;
        if (!allPkPresent && pkFieldNames.length === 1
            && (raw[pkFieldNames[0]] == null || serializeKeyValue(raw[pkFieldNames[0]]).length === 0)) {
            fields = { ...raw, [pkFieldNames[0]]: resolvedID };
        }
        return { ExternalID: resolvedID, ObjectType: objectType, Fields: fields };
    }

    /** Builds a warning-only fetch result (surfaces a silent-empty as a structured SyncWarning). */
    private warnResult(obj: MJIntegrationObjectEntity, code: string, message: string): FetchBatchResult {
        return { Records: [], HasMore: false, Warnings: [{ Code: code, Message: message, Data: { object: obj.Name } }] };
    }

    // ── Watermark helpers ────────────────────────────────────────────────────

    /**
     * The next watermark for a changed-since object is the time this sync STARTED (captured before any
     * fetch), so the next incremental picks up everything modified since — a slight overlap is idempotent.
     * Impexium's list responses carry no reliable single modified-date field to derive it from, so wall-clock
     * start is the safe, monotonic choice. Only ever advances forward.
     */
    private computeNewWatermark(current: string | null | undefined, startTs: string): string {
        if (current && startTs <= current) return current;
        return startTs;
    }

    /** Formats a date as the Impexium changed-since format `yyyy-MM-ddTHH:mm:ss` (UTC). */
    private formatWatermark(date: Date): string {
        return date.toISOString().replace(/\.\d+Z$/, '');
    }

    // ── Small utilities ──────────────────────────────────────────────────────

    /** Returns the first present, non-empty string value among the given keys. */
    private firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }

    /** Returns the first present finite number among the given keys. */
    private firstNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'number' && Number.isFinite(v)) return v;
        }
        return undefined;
    }

    /** Reads an `id`-like value as a string; undefined when absent/empty. */
    private readId(o: Record<string, unknown>): string | undefined {
        for (const k of ['id', 'ID', 'Id']) {
            const v = o[k];
            if (typeof v === 'string' && v.length > 0) return v;
            if (typeof v === 'number') return String(v);
        }
        return undefined;
    }

    /** Stable total order over ID strings — numeric when ALL are integer-like, else lexical. */
    private sortIdsStable(ids: string[]): string[] {
        return [...ids].sort((a, b) => this.compareIds(a, b));
    }

    /** Total-order comparator matching sortIdsStable, used for keyset resume (id > AfterKeyValue). */
    private compareIds(a: string, b: string): number {
        if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
            const na = Number(a), nb = Number(b);
            return na === nb ? 0 : (na < nb ? -1 : 1);
        }
        return a < b ? -1 : (a > b ? 1 : 0);
    }
}

/** Tree-shaking prevention — import and call from the package entry point. */
export function LoadImpexiumConnector(): void { /* no-op */ }
