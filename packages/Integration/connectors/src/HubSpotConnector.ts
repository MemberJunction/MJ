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
    type CreateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    // NOTE: no auth-helper crypto imported — HubSpot private-app auth is a static Bearer token (no signing).
} from '@memberjunction/integration-engine';

// ─── Design note ────────────────────────────────────────────────────────
//
// The connector is PURE MECHANISM. The object/field catalog is NOT baked here — it lives in the
// Declared metadata (metadata/integrations/hubspot/.hubspot.integration.json), seeded from
// credential-free HubSpot docs + OpenAPI specs (case-1 discovery). Discovery is INHERITED from
// BaseRESTIntegrationConnector: DiscoverObjects / DiscoverFields / IntrospectSchema read the persisted
// Declared metadata from the IntegrationEngineBase cache. There is NO hardcoded object list, NO field
// catalog, NO baked PK/FK/required/readonly constants in this file.
//
// What this connector implements (the HubSpot protocol shape over REST/JSON):
//  - Auth: Private-App static Bearer token (`Authorization: Bearer <token>`). No refresh, no crypto.
//  - Pagination: cursor via the `after` query param; continuation read from `paging.next.after`.
//  - Incremental: the CRM Search API (`POST <path>/search`) filtered on `hs_lastmodifieddate GTE <wm>`.
//  - Write: generic per-operation CRUD (metadata-driven) for single-`{id}` CRM objects; the ONE genuinely
//    idiosyncratic write shape — the v4 pairwise association edge, whose Create/Delete path carries TWO
//    named vars `/{fromObjectId}/associations/<to>/{toObjectId}` (a composite `fromObjectId|toObjectId`
//    key the base's single-`{id}` SubstituteIDInPath cannot template) — is overridden below.
//
// Association READS need NO override: the edge IO's `fromObjectId` IOF carries a RelatedIntegrationObjectID
// (@lookup on its `fromObjectType` sibling) whose name equals the `{fromObjectId}` path var, so the base's
// template-var traversal (Strategy B) resolves the parent, walks synced parents, and reads the v4 edges.

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed HubSpot Private-App credential. HubSpot private-app tokens are static Bearer tokens. */
interface HubSpotCredentials {
    /** Private-App access token, sent verbatim as `Authorization: Bearer <token>`. */
    AccessToken: string;
}

/** Extended auth context carrying the resolved HubSpot Bearer token. */
interface HubSpotAuthContext extends RESTAuthContext {
    Token: string;
}

/**
 * The HubSpot SimplePublicObject list/search envelope. Every CRM object endpoint — list
 * (`GET /crm/objects/…`) and search (`POST /crm/objects/…/search`) — returns records under `results`
 * with cursor continuation under `paging.next.after`. Records themselves are opaque vendor JSON.
 */
interface HubSpotListEnvelope {
    results?: unknown[];
    paging?: { next?: { after?: string } | null } | null;
    total?: number;
}

// ─── Constants ────────────────────────────────────────────────────────

/** HubSpot API host. Fixed base — the version segment lives in each object's APIPath (metadata-driven). */
const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * HubSpot CRM Search API hard cap: the opaque `after` cursor cannot page beyond 10,000 results within a
 * single search query window. Wider incremental windows re-anchor by a `hs_lastmodifieddate` keyset.
 * Source: Configuration.IncrementalSyncCapability.searchWindowCap in the frozen contract.
 */
const HUBSPOT_SEARCH_WINDOW_CAP = 10_000;

/** HubSpot Search API max page size (list endpoints cap at 100; search caps at 200). */
const HUBSPOT_SEARCH_MAX_PAGE = 200;
const HUBSPOT_LIST_MAX_PAGE = 100;

/**
 * Within-scan resume state for the search-based incremental fetch. Serialized into
 * FetchBatchResult.NextCursor and threaded back via FetchContext.CurrentCursor on the next call.
 *
 * - `after`   paginates WITHIN a single ≤10k HubSpot search window (the API's own opaque cursor).
 * - `anchorMs` re-anchors the NEXT window by watermark once the 10k cap is hit, so a window wider than
 *   10k (including a >10k same-modified-date cluster from a bulk import) is paged completely instead of
 *   stalling on a watermark that cannot advance.
 */
interface HubSpotSearchCursor {
    after?: string;
    anchorMs?: string;
}

// ─── HubSpotConnector ──────────────────────────────────────────────────

/**
 * HubSpot CRM connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 *
 * Discovery, generic CRUD, template-var traversal, and the paginated GET loop are inherited. This class
 * supplies only the HubSpot-specific protocol surface: Bearer auth, the `after` cursor, the search-based
 * incremental fetch, connection testing, and the §7/§10 sync-efficiency hooks the frozen contract evidences.
 */
@RegisterClass(BaseIntegrationConnector, 'HubSpotConnector')
export class HubSpotConnector extends BaseRESTIntegrationConnector {

    /** Cached auth for the lifetime of a single sync run (HubSpot private-app tokens don't expire). */
    private cachedAuth: HubSpotAuthContext | null = null;

    // ── Identity (T1 three-way invariant) ────────────────────────────

    /** Verbatim `MJ: Integrations.Name`. Load-bearing: the T1 three-way name check compares this === metadata Name. */
    public override get IntegrationName(): string {
        return 'hubspot';
    }

    // ── Capability getters (kept in lockstep with the per-op metadata columns) ──

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Absence in a refresh proves
     * nothing → never deactivate. Matches Configuration.DiscoveryIsAuthoritative=false in the frozen contract.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ── Sync-efficiency hooks (§7/§10 — populated from frozen-contract Configuration facts) ──

    /**
     * From Configuration.RateLimitPolicy: main API 100 req / 10s (Free/Starter private apps) → ~10 tokens/sec
     * sustained, burst 100. The CRM Search API is separately limited to 5 req/s per account; the engine's
     * single bucket paces at the main rate (search is a subset of overall traffic).
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 10, Burst: 100 };
    }

    /**
     * HubSpot returns `Retry-After` (seconds) on a 429, alongside X-HubSpot-RateLimit-* headers. Parse it to
     * ms so the engine's AIMD bucket backs off by the vendor's actual instruction rather than a guess.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const headers = this.ExtractHeadersFromError(error);
        if (!headers) return undefined;
        const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
        if (retryAfter != null) {
            const secs = Number(retryAfter);
            if (!isNaN(secs) && secs >= 0) return Math.ceil(secs * 1000);
        }
        const interval = headers['x-hubspot-ratelimit-interval-milliseconds'];
        if (interval != null) {
            const ms = Number(interval);
            if (!isNaN(ms) && ms >= 0) return Math.ceil(ms);
        }
        return undefined;
    }

    /** Conservative in-flight cap. HubSpot tolerates parallelism but the 100/10s burst is the real ceiling. */
    public override get MaxConcurrencyHint(): number | null {
        return 4;
    }

    /**
     * No-watermark objects (associations, settings, etc.) resume by the object's StableOrderingKey — read
     * from the IO metadata (the extractor emits `StableOrderingKey`, typically the universal `id`). Returns
     * null when the object has no stable key or the cache is unavailable (unit-test context).
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
     * Resolves the Private-App Bearer token from the linked Credential entity (preferred) or the
     * CompanyIntegration Configuration JSON (fallback). Cached for the run.
     */
    protected override async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.cachedAuth) return this.cachedAuth;
        const creds = await this.LoadCredentials(companyIntegration, contextUser);
        this.cachedAuth = { Token: creds.AccessToken };
        return this.cachedAuth;
    }

    /** HubSpot private-app auth: a static Bearer token. No signing, no crypto. */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as HubSpotAuthContext).Token;
        return {
            'Authorization': `Bearer ${token}`,
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
     * Strips the HubSpot list/search envelope. Every CRM endpoint nests records under `results` (the
     * metadata sets ResponseDataKey='results'); a bare-array or single-object body is handled for the
     * get-one and non-list shapes.
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;
            const key = responseDataKey ?? 'results';
            const arr = body[key];
            if (Array.isArray(arr)) return arr as Record<string, unknown>[];
            // get-one / non-list shape: the body IS the record.
            return [body];
        }
        return [];
    }

    /**
     * HubSpot pagination is ALWAYS cursor-based via `paging.next.after` (probe verdict: `skip`/`offset` are
     * silently ignored on CRM objects). When `paging.next` is absent/null the set is exhausted. The one
     * Offset object (webhooks_journal) also surfaces its continuation via a paging cursor, so the cursor
     * path covers both. currentPage/offset/pageSize are unused for cursor pagination.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (rawBody && typeof rawBody === 'object') {
            const env = rawBody as HubSpotListEnvelope;
            const nextAfter = env.paging?.next?.after;
            if (typeof nextAfter === 'string' && nextAfter.length > 0) {
                return { HasMore: true, NextCursor: nextAfter, TotalRecords: env.total };
            }
        }
        return { HasMore: false };
    }

    /** Fixed HubSpot host; the version path segment is metadata-driven (per-object APIPath). */
    protected override GetBaseURL(): string {
        return HUBSPOT_API_BASE;
    }

    /**
     * HubSpot uses the `after` cursor query param (NOT the base default `cursor=`). On the first page no
     * cursor is sent; subsequent pages send `after=<paging.next.after>`. `limit` caps the page size.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = Math.min(effectivePageSize ?? obj.DefaultPageSize ?? HUBSPOT_LIST_MAX_PAGE, HUBSPOT_LIST_MAX_PAGE);
        const separator = basePath.includes('?') ? '&' : '?';
        const parts = [`limit=${pageSize}`];
        if (cursor) parts.push(`after=${encodeURIComponent(cursor)}`);
        return `${basePath}${separator}${parts.join('&')}`;
    }

    // ── FetchChanges override (idiosyncratic: HubSpot Search API for incremental) ──

    /**
     * OVERRIDDEN because HubSpot's incremental mechanism is genuinely idiosyncratic: it is NOT a GET with an
     * `updatedAfter` query param — it is a POST to the CRM Search API with a `hs_lastmodifieddate GTE <wm>`
     * filter and a body-carried `after` cursor, capped at 10k results per window (needing keyset
     * re-anchoring past the cap).
     *
     * Routing:
     *  - CRM object WITH a watermark this run (SupportsIncrementalSync + a WatermarkValue) → Search API.
     *  - Everything else (first full pull of a CRM object, associations, settings, non-CRM lists) → the
     *    inherited base GET path (flat or template-var), which uses the `after` cursor via the
     *    BuildPaginatedURL / ExtractPaginationInfo overrides above. Association edges resolve their
     *    `{fromObjectId}` var against synced parents through the base template-var traversal.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (this.UseSearchApi(obj, ctx)) {
            return this.FetchChangesViaSearch(obj, ctx);
        }
        return super.FetchChanges(ctx);
    }

    /**
     * Search API is used only for a CRM object doing an INCREMENTAL pull (watermark present). The first
     * full pull uses the plain list endpoint (search's 10k cap makes it a poor fit for a full backfill;
     * the list endpoint has no such cap). A search-based object is one whose incrementalMechanism is
     * 'search-api-filter' and that carries a watermark this run.
     */
    private UseSearchApi(obj: MJIntegrationObjectEntity, ctx: FetchContext): boolean {
        if (!obj.SupportsIncrementalSync) return false;
        if (ctx.WatermarkValue == null || ctx.WatermarkValue.length === 0) return false;
        return this.ReadConfigString(obj, 'incrementalMechanism') === 'search-api-filter';
    }

    /**
     * Incremental fetch via `POST <APIPath>/search`. Filters on the object's IncrementalWatermarkField
     * (hs_lastmodifieddate) GTE the watermark, sorts ascending so the last record's timestamp is the new
     * max, and pages via the body `after` cursor. Returns the new watermark (NewWatermarkValue) ONLY on a
     * fully-drained window (HasMore=false) so a partial batch never advances the watermark (partial-failure
     * safety — the engine persists it only on full-batch success). Re-anchors past the 10k cap by watermark.
     */
    private async FetchChangesViaSearch(obj: MJIntegrationObjectEntity, ctx: FetchContext): Promise<FetchBatchResult> {
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const watermarkField = obj.IncrementalWatermarkField ?? 'hs_lastmodifieddate';
        const searchURL = `${HUBSPOT_API_BASE}${obj.APIPath.replace(/\/+$/, '')}/search`;
        const pkFieldNames = this.FindPrimaryKeyFieldNamesLocal(fields);

        const resume = this.ParseSearchCursor(ctx.CurrentCursor);
        const anchorMs = resume.anchorMs ?? this.WatermarkToMs(ctx.WatermarkValue);
        const pageSize = Math.min(obj.DefaultPageSize ?? HUBSPOT_LIST_MAX_PAGE, HUBSPOT_SEARCH_MAX_PAGE);

        const body: Record<string, unknown> = {
            filterGroups: [{ filters: [{ propertyName: watermarkField, operator: 'GTE', value: anchorMs }] }],
            sorts: [{ propertyName: watermarkField, direction: 'ASCENDING' }],
            limit: pageSize,
        };
        if (resume.after) body.after = resume.after;

        const response = await this.MakeHTTPRequest(auth, searchURL, 'POST', headers, body);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`[hubspot] Search failed for "${obj.Name}": HTTP ${response.Status}`);
        }

        const env = response.Body as HubSpotListEnvelope;
        const rawRecords = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        const records: ExternalRecord[] = rawRecords.map(r =>
            this.RawToExternalRecord(this.applyTransformPreservingKeys(r, obj, fields), obj.Name, pkFieldNames)
        );

        const maxSeenMs = this.MaxWatermarkMs(rawRecords, watermarkField, anchorMs);
        const nextAfter = env.paging?.next?.after;
        const nextAfterNum = nextAfter ? Number(nextAfter) : 0;

        // 10k cap: if the API is about to page past the window cap, re-anchor the NEXT window by the max
        // modified-date seen (keyset) and restart `after` from 0 in the next window.
        if (nextAfter && nextAfterNum >= HUBSPOT_SEARCH_WINDOW_CAP) {
            return {
                Records: records,
                HasMore: true,
                NextCursor: this.SerializeSearchCursor({ anchorMs: String(maxSeenMs) }),
            };
        }

        if (nextAfter) {
            return {
                Records: records,
                HasMore: true,
                NextCursor: this.SerializeSearchCursor({ after: nextAfter, anchorMs }),
            };
        }

        // Window fully drained → safe to advance the watermark to the max seen.
        return { Records: records, HasMore: false, NewWatermarkValue: String(maxSeenMs) };
    }

    // ── CRUD ──────────────────────────────────────────────────────────
    //
    // Single-`{id}` CRM objects (contacts, companies, deals, …) use the INHERITED generic
    // CreateRecord / UpdateRecord / DeleteRecord / GetRecord from BaseRESTIntegrationConnector, which read
    // the per-operation IO columns (CreateAPIPath / CreateMethod / CreateBodyShape='wrapped' /
    // CreateBodyKey='properties' / CreateIDLocation='body', Update*, Delete*) and handle the flat/wrapped
    // body, path-substituted id, and the loud-on-empty-id BuildCreatedResult correctly. No override there.
    //
    // The SOLE exception is the v4 pairwise association edge — see CreateRecord / DeleteRecord below.

    /**
     * OVERRIDDEN only for the idiosyncratic v4 pairwise-association write. A pairwise-edge object's
     * CreateAPIPath is `/crm/v4/objects/<from>/{fromObjectId}/associations/<to>/{toObjectId}` (PUT, flat
     * body): TWO named template vars keyed by the composite `fromObjectId|toObjectId`, which the base's
     * single-`{id}` SubstituteIDInPath cannot template. Every non-association object delegates verbatim to
     * the base generic per-operation path.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const obj = this.GetCachedObject((ctx.CompanyIntegration as MJCompanyIntegrationEntity).IntegrationID, ctx.ObjectName);
        if (!this.IsPairwiseAssociation(obj) || !obj.CreateAPIPath || !obj.CreateMethod) {
            return super.CreateRecord(ctx);
        }
        // The edge's identity is the (fromObjectId, toObjectId) pair — carried in Attributes for a create.
        const fromID = this.AttrString(ctx.Attributes, 'fromObjectId');
        const toID = this.AttrString(ctx.Attributes, 'toObjectId');
        if (!fromID || !toID) {
            return { Success: false, StatusCode: 0, ErrorMessage:
                `[hubspot] association create for "${ctx.ObjectName}" requires both fromObjectId and toObjectId in Attributes.` };
        }
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const url = `${this.GetBaseURL()}${this.SubstituteAssociationVars(obj.CreateAPIPath, fromID, toID)}`;
        // Flat body (association labels/types); empty {} for a default association.
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, ctx.Attributes ?? {});
        if (response.Status >= 200 && response.Status < 300) {
            // Loud-on-empty-id invariant: the edge id IS the composite key.
            return this.BuildCreatedResult(`${fromID}|${toID}`, response.Status, ctx.ObjectName);
        }
        return { Success: false, StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on association create` };
    }

    /**
     * OVERRIDDEN only for the idiosyncratic v4 pairwise-association delete: the DeleteAPIPath carries the
     * same two named vars, and the ExternalID is the composite `fromObjectId|toObjectId`. Every
     * non-association object delegates verbatim to the base generic delete.
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const obj = this.GetCachedObject((ctx.CompanyIntegration as MJCompanyIntegrationEntity).IntegrationID, ctx.ObjectName);
        if (!this.IsPairwiseAssociation(obj) || !obj.DeleteAPIPath || !obj.DeleteMethod) {
            return super.DeleteRecord(ctx);
        }
        const [fromID, toID] = ctx.ExternalID.split('|');
        if (!fromID || !toID) {
            return { Success: false, StatusCode: 0, ErrorMessage:
                `[hubspot] association delete for "${ctx.ObjectName}" expects a composite "fromObjectId|toObjectId" ExternalID (got "${ctx.ExternalID}").` };
        }
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const url = `${this.GetBaseURL()}${this.SubstituteAssociationVars(obj.DeleteAPIPath, fromID, toID)}`;
        const response = await this.MakeHTTPRequest(auth, url, obj.DeleteMethod, headers);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return { Success: false, StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on association delete` };
    }

    // ── Connection test ──────────────────────────────────────────────

    /**
     * Tests the connection by hitting the account-info endpoint. A 2xx confirms the Bearer token is valid;
     * 401/403 → auth failure; anything else → error.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const url = `${HUBSPOT_API_BASE}/account-info/v3/details`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: 'HubSpot connection successful.' };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `HubSpot authentication failed (HTTP ${response.Status}). Check the Private-App access token.` };
            }
            return { Success: false, Message: `HubSpot connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `HubSpot connection test error: ${msg}` };
        }
    }

    // ── Credential loading ───────────────────────────────────────────

    /** Reads the Private-App token from the linked Credential entity, or the Configuration JSON fallback. */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<HubSpotCredentials> {
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
            'No HubSpot credential found. Attach a credential carrying a Private-App access token ' +
            '(accessToken / apiKey / Token), or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /** Loads a credential row and parses its Values JSON. */
    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<HubSpotCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /** Extracts a HubSpot token from a credential/config JSON string. Returns null when no token is present. */
    private ParseCredentialJson(json: string): HubSpotCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            const token = this.FirstString(parsed, ['accessToken', 'AccessToken', 'apiKey', 'ApiKey', 'Token', 'token']);
            return token ? { AccessToken: token } : null;
        } catch {
            return null;
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * True when the IO is a HubSpot v4 pairwise-association edge (Configuration.associationKind ===
     * 'pairwise-edge'). These carry the two-named-var write path the generic single-`{id}` CRUD can't build.
     */
    private IsPairwiseAssociation(obj: MJIntegrationObjectEntity): boolean {
        return this.ReadConfigString(obj, 'associationKind') === 'pairwise-edge';
    }

    /** Substitutes the two named association path vars `{fromObjectId}` / `{toObjectId}` (URL-encoded). */
    private SubstituteAssociationVars(path: string, fromID: string, toID: string): string {
        return path
            .replace(/\{fromObjectId\}/g, encodeURIComponent(fromID))
            .replace(/\{toObjectId\}/g, encodeURIComponent(toID));
    }

    /** Reads a present, non-empty attribute value as a string; undefined otherwise. */
    private AttrString(attrs: Record<string, unknown> | undefined, key: string): string | undefined {
        const v = attrs?.[key];
        if (v == null) return undefined;
        const s = String(v);
        return s.length > 0 ? s : undefined;
    }

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

    /** Reads a trimmed string value from an IntegrationObject's Configuration JSON (tolerant of absent/invalid). */
    private ReadConfigString(obj: MJIntegrationObjectEntity, key: string): string | null {
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
    private FirstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }

    /** PK field names in Sequence order (falls back to ['id'] — HubSpot's universal PK — when unmarked). */
    private FindPrimaryKeyFieldNamesLocal(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
        return pk.length > 0 ? pk : ['id'];
    }

    /**
     * Builds an ExternalRecord with the FULL source record in Fields (full-record pass-through — the
     * framework's custom-column capture diffs keys(Fields) against the field maps). ExternalID is the
     * composite PK (when every component is present + non-empty) or the raw HubSpot id / hs_object_id.
     */
    private RawToExternalRecord(raw: Record<string, unknown>, objectType: string, pkFieldNames: string[]): ExternalRecord {
        const allPresent = pkFieldNames.length > 0 && pkFieldNames.every(n => raw[n] != null && String(raw[n]).length > 0);
        const externalID = allPresent
            ? pkFieldNames.map(n => String(raw[n])).join('|')
            : this.ExtractHubSpotID(raw);
        return { ExternalID: externalID, ObjectType: objectType, Fields: raw };
    }

    /** HubSpot's system id lives at the envelope root as `id`, mirrored as `hs_object_id` in properties. */
    private ExtractHubSpotID(raw: Record<string, unknown>): string {
        if (raw.id != null) return String(raw.id);
        const props = raw.properties;
        if (props && typeof props === 'object') {
            const hsId = (props as Record<string, unknown>).hs_object_id;
            if (hsId != null) return String(hsId);
        }
        return '';
    }

    /** Parses the serialized within-scan search cursor (JSON). Returns an empty cursor on absence/parse error. */
    private ParseSearchCursor(cursor: string | undefined): HubSpotSearchCursor {
        if (!cursor) return {};
        try {
            const parsed = JSON.parse(cursor) as HubSpotSearchCursor;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    /** Serializes the within-scan search cursor to a JSON string for FetchBatchResult.NextCursor. */
    private SerializeSearchCursor(cursor: HubSpotSearchCursor): string {
        return JSON.stringify(cursor);
    }

    /**
     * Converts a watermark value to a HubSpot epoch-millis string (HubSpot's search filters compare
     * hs_lastmodifieddate as epoch ms). Accepts an ISO date, an epoch-ms string, or null (→ '0' full pull).
     */
    private WatermarkToMs(watermark: string | null): string {
        if (!watermark || watermark.length === 0) return '0';
        if (/^\d+$/.test(watermark)) return watermark;
        const t = Date.parse(watermark);
        return isNaN(t) ? '0' : String(t);
    }

    /** Max modified-date (epoch ms) across a batch, floored at the current anchor so it never regresses. */
    private MaxWatermarkMs(records: Record<string, unknown>[], watermarkField: string, anchorMs: string): number {
        let max = Number(anchorMs) || 0;
        for (const r of records) {
            const props = (r.properties && typeof r.properties === 'object') ? r.properties as Record<string, unknown> : r;
            const rawVal = props[watermarkField] ?? r[watermarkField];
            if (rawVal == null) continue;
            const ms = /^\d+$/.test(String(rawVal)) ? Number(rawVal) : Date.parse(String(rawVal));
            if (!isNaN(ms) && ms > max) max = ms;
        }
        return max;
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
