import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
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
    type RateLimitPolicy,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    // NOTE: no auth-helper crypto/token-exchange imported. Eventbrite auth is a PRE-MINTED, long-lived
    // Bearer token (the account "Private Token" from the API Keys page, or the access token minted once by
    // the OAuth2 authorization-code exchange). The frozen contract documents NO refresh_token grant and NO
    // TTL (Configuration.TokenRefreshStrategy = null), so there is no in-connector token round-trip to run —
    // OAuth2TokenManager would fabricate an undocumented exchange. Every documented request sends the token
    // verbatim as `Authorization: Bearer <token>`, exactly like a static Bearer key. No signing, no crypto.
} from '@memberjunction/integration-engine';

// ─── Design note ────────────────────────────────────────────────────────
//
// The connector is PURE MECHANISM. The object/field catalog is NOT baked here — it lives in the Declared
// metadata (metadata/integrations/eventbrite/.eventbrite.integration.json), seeded from Eventbrite's
// credential-free API blueprint (case-1 discovery). Discovery is INHERITED from
// BaseRESTIntegrationConnector: DiscoverObjects / DiscoverFields / IntrospectSchema read the persisted
// Declared metadata from the IntegrationEngineBase cache. There is NO hardcoded object list, NO field
// catalog, NO baked PK/FK/required/readonly constants in this file.
//
// What this connector implements (the Eventbrite v3 protocol shape over REST/JSON):
//  - Auth: OAuth2 Bearer token (`Authorization: Bearer <token>`), a pre-minted long-lived token. No crypto.
//  - Pagination: Eventbrite's continuation-token scheme — read pagination.has_more_items +
//    pagination.continuation from the response envelope; request the next page via ?continuation=<token>.
//    NOT a page-number/offset loop.
//  - Incremental: the `changed_since` datetime query param on Attendee + Order (watermark field `changed`).
//  - Write: generic per-operation CRUD (metadata-driven) is the intent, but Eventbrite's write paths carry
//    VENDOR-NAMED template vars (`{organization_id}`, `{event_id}`, `{venue_id}`, `{ticket_class_id}`, …)
//    and several child-object paths need BOTH a parent id AND the record's own id
//    (e.g. /events/{event_id}/ticket_classes/{ticket_class_id}/). The base's SubstituteIDInPath only
//    templates {ID}/{id}/{ExternalID}, so it CANNOT build these URLs. CreateRecord/UpdateRecord/DeleteRecord
//    are therefore overridden to substitute EVERY path var (record id from ExternalID, parent ids from
//    Attributes/Relationships) while STILL routing create through BuildCreatedResult (the loud-on-empty-id
//    invariant). Body shaping (wrapped/{key}), ID extraction, and error handling reuse the base helpers.

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed Eventbrite credential — a pre-minted OAuth2 Bearer / Private Token. */
interface EventbriteCredentials {
    /** Access/Private token, sent verbatim as `Authorization: Bearer <token>`. */
    AccessToken: string;
}

/** Extended auth context carrying the resolved Eventbrite Bearer token. */
interface EventbriteAuthContext extends RESTAuthContext {
    Token: string;
}

/**
 * The Eventbrite paginated-list envelope. Every list endpoint nests records under a plural snake_case
 * resource key (`events`, `attendees`, `orders`, …) alongside a `pagination` block carrying the
 * continuation-token state. Records themselves are opaque vendor JSON.
 * Source: Configuration.PaginationDefaults.note (blueprint ## Paginated Responses, lines 173-230).
 */
interface EventbritePaginationBlock {
    object_count?: number;
    continuation?: string;
    page_count?: number;
    page_size?: number;
    has_more_items?: boolean;
    page_number?: number;
}
interface EventbriteListEnvelope {
    pagination?: EventbritePaginationBlock | null;
    [resourceKey: string]: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────

/**
 * Eventbrite API host with the v3 version segment embedded in the path (Configuration.APIVersioningNote —
 * HOST directive `https://www.eventbriteapi.com/v3/`). Every IO's APIPath is relative to this v3 host.
 */
const EVENTBRITE_API_BASE = 'https://www.eventbriteapi.com/v3';

/** Query param carrying the continuation cursor (Configuration.PaginationDefaults.continuationParam). */
const CONTINUATION_PARAM = 'continuation';

/** Query param carrying the incremental datetime cursor for Attendee + Order. */
const CHANGED_SINCE_PARAM = 'changed_since';

// ─── EventbriteConnector ───────────────────────────────────────────────

/**
 * Eventbrite events/ticketing connector — extends BaseRESTIntegrationConnector (REST/JSON over HTTP).
 *
 * Discovery, template-var parent traversal, and the paginated GET loop are inherited. This class supplies
 * only the Eventbrite-specific protocol surface: Bearer auth, the continuation-token cursor, the
 * `changed_since` incremental pull, connection testing, the write path (vendor-named path vars), and the
 * §7/§10 sync-efficiency hooks the frozen contract evidences.
 */
@RegisterClass(BaseIntegrationConnector, 'EventbriteConnector')
export class EventbriteConnector extends BaseRESTIntegrationConnector {

    /** Cached auth for the lifetime of a single sync run (Eventbrite tokens are long-lived, no refresh). */
    private cachedAuth: EventbriteAuthContext | null = null;

    /**
     * The active incremental watermark for the object currently being fetched, stashed by the FetchChanges
     * override so the (ctx-less) BuildPaginatedURL can append `changed_since`. Set at the top of an
     * incremental FetchChanges, cleared in its finally. Safe because the engine drives one FetchChanges per
     * object at a time (single-threaded async; no concurrent BuildPaginatedURL for a different watermark).
     */
    private activeChangedSince: string | null = null;

    // ── Identity (T1 three-way invariant) ────────────────────────────

    /** Verbatim `MJ: Integrations.Name`. Load-bearing: the T1 three-way name check compares this === metadata Name. */
    public override get IntegrationName(): string {
        return 'eventbrite';
    }

    // ── Capability getters (kept in lockstep with the per-op metadata columns) ──
    // Write surface is a MIXED subset (Configuration.WriteCapability): create on 15/33 objects, update on a
    // subset, delete on a smaller subset. The connector-level getters report the UNION (the connector CAN do
    // each verb); per-object null-column honesty is enforced by the overrides below (an object with no
    // Create/Update/Delete path fails loudly rather than sending a broken URL).

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Discovery is NON-authoritative: DiscoverObjects / IntrospectSchema are cache-driven (they re-read
     * persisted ACTIVE Declared metadata, NOT a live full-gamut enumeration). Eventbrite publishes no
     * schema/describe/introspection endpoint enumerating everything a credential can access, so absence in a
     * refresh proves nothing → never deactivate. Matches Configuration.DiscoveryIsAuthoritative=false.
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ── Sync-efficiency hooks (§7/§10 — populated from frozen-contract Configuration facts) ──

    /**
     * From Configuration.RateLimitPolicy: 2,000 calls/hour per token (blueprint ## Errors, 429
     * HIT_RATE_LIMIT). 2000/3600 ≈ 0.556 tokens/sec sustained. Burst kept small (the hourly ceiling is the
     * real constraint; there is no documented per-second burst allowance).
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 0.5556, Burst: 5 };
    }

    /**
     * The frozen contract records NO Retry-After header shape for Eventbrite's 429 (HIT_RATE_LIMIT)
     * (Configuration.RateLimitPolicy.retryAfterHeaderDocumented=false), so there is nothing to parse
     * reliably. Left as the base default (undefined) rather than guessing a header name — the engine's AIMD
     * bucket backs off on the 429 regardless. Documented as a soft gap for live-probe confirmation.
     */
    // ExtractRetryAfterMs: inherited default (undefined). See note above.

    /** Conservative in-flight cap. The 2,000/hour ceiling is the real limiter; a low cap avoids bursts. */
    public override get MaxConcurrencyHint(): number | null {
        return 2;
    }

    /**
     * No-watermark objects resume by their StableOrderingKey — read from the IO metadata when the extractor
     * emitted one, else the object's PK (Eventbrite's universal `id`). Returns null when the object has no
     * stable key or the cache is unavailable (unit-test context).
     */
    public override StableOrderingKey(objectName: string): string | null {
        const obj = this.TryGetActiveObject(objectName);
        if (!obj) return null;
        const declared = (obj as unknown as { StableOrderingKey?: string | null }).StableOrderingKey;
        if (declared && declared.trim().length > 0) return declared.trim();
        const pk = this.GetCachedFields(obj.ID).find(f => f.IsPrimaryKey);
        return pk?.Name ?? null;
    }

    // ── Abstract REST hooks ──────────────────────────────────────────

    /**
     * Resolves the pre-minted Bearer token from the linked Credential entity (preferred) or the
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

    /** Eventbrite OAuth2 auth: a pre-minted Bearer token. No signing, no crypto. */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as EventbriteAuthContext).Token;
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
     * Strips the Eventbrite list envelope. Each list endpoint nests records under a plural snake_case
     * resource key (`events`, `attendees`, `orders`, …), stored per-IO as ResponseDataKey. When
     * ResponseDataKey is unset (the extractor left it null), the key is DERIVED from the last non-templated
     * path segment of the APIPath — but NormalizeResponse doesn't have the IO here, so the fallback scans the
     * envelope for the sole array-valued key alongside `pagination`. A bare-array or single-object body (the
     * get-one / non-paginated shape) is handled directly.
     */
    protected override NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody !== 'object') return [];

        const body = rawBody as EventbriteListEnvelope;

        // Preferred: the metadata-declared data key.
        if (responseDataKey) {
            const arr = body[responseDataKey];
            if (Array.isArray(arr)) return arr as Record<string, unknown>[];
        }

        // Fallback: an Eventbrite list body has exactly one array-valued key besides `pagination`.
        if (body.pagination !== undefined) {
            for (const [key, val] of Object.entries(body)) {
                if (key === 'pagination') continue;
                if (Array.isArray(val)) return val as Record<string, unknown>[];
            }
            return [];
        }

        // get-one / non-list shape: the body IS the record.
        return [body as Record<string, unknown>];
    }

    /**
     * Eventbrite pagination is the CONTINUATION-TOKEN scheme (NOT page-number/offset). Read
     * `pagination.has_more_items` and `pagination.continuation` from the envelope. When has_more_items is
     * true AND a continuation token is present, the next page is requested with that token; otherwise the set
     * is exhausted. Source: Configuration.PaginationDefaults.advanceProtocol.
     * currentPage/offset/pageSize are unused for continuation pagination.
     */
    protected override ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (rawBody && typeof rawBody === 'object') {
            const env = rawBody as EventbriteListEnvelope;
            const pag = env.pagination;
            if (pag && pag.has_more_items === true && typeof pag.continuation === 'string' && pag.continuation.length > 0) {
                return { HasMore: true, NextCursor: pag.continuation, TotalRecords: pag.object_count };
            }
            return { HasMore: false, TotalRecords: pag?.object_count };
        }
        return { HasMore: false };
    }

    /**
     * Eventbrite v3 host. Defaults to the fixed `https://www.eventbriteapi.com/v3` host (the version
     * segment is part of the base URL; metadata APIPaths are relative). Honors a
     * `CompanyIntegration.Configuration.BaseURL` override when present — used for region redirects and
     * for pointing the connector at a mock ORIGIN server in credential-free e2e testing without touching
     * the vendor's real endpoint. Falls back to the fixed host on absence or malformed Configuration.
     */
    protected override GetBaseURL(companyIntegration?: MJCompanyIntegrationEntity): string {
        const cfgRaw: unknown = companyIntegration?.Configuration;
        if (cfgRaw) {
            try {
                const cfg = (typeof cfgRaw === 'string' ? JSON.parse(cfgRaw) : cfgRaw) as Record<string, unknown>;
                const override = cfg?.BaseURL ?? cfg?.baseUrl ?? cfg?.apiBaseUrl;
                if (typeof override === 'string' && override.trim().length > 0) {
                    return override.replace(/\/+$/, '');
                }
            } catch {
                /* malformed Configuration JSON → fall back to the fixed host */
            }
        }
        return EVENTBRITE_API_BASE;
    }

    /**
     * Eventbrite pages via the `continuation` query param (NOT the base default `cursor=`). The first page
     * sends no continuation token; subsequent pages send `continuation=<token>`. When an incremental
     * watermark is active (Attendee/Order this run), `changed_since=<watermark>` is appended so the API
     * returns only records changed after the watermark. Eventbrite has no client-controlled page-size param
     * on these list endpoints (page_size is server-fixed and reported in the envelope), so no limit is sent.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        _obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        _effectivePageSize?: number
    ): string {
        const parts: string[] = [];
        if (cursor) parts.push(`${CONTINUATION_PARAM}=${encodeURIComponent(cursor)}`);
        if (this.activeChangedSince) parts.push(`${CHANGED_SINCE_PARAM}=${encodeURIComponent(this.activeChangedSince)}`);
        if (parts.length === 0) return basePath;
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}${parts.join('&')}`;
    }

    // ── FetchChanges override (incremental changed_since + new-watermark emission) ──

    /**
     * OVERRIDDEN to (1) inject the `changed_since` param for the two incremental objects (Attendee, Order —
     * SupportsIncrementalSync + a watermark this run) and (2) EMIT the new watermark. The base flat/template
     * fetch path threads no watermark into the URL and returns no NewWatermarkValue, so the connector owns
     * both. All fetching (continuation pagination, template-var parent traversal) is delegated to the base;
     * this override only sets activeChangedSince around the super call and computes the watermark on a fully
     * drained batch.
     *
     * Partial-failure safety: NewWatermarkValue is emitted ONLY when the whole object is drained
     * (HasMore=false). A mid-stream batch (HasMore=true — more parents to iterate) advances no watermark, so a
     * failure between batches resumes from the unchanged prior watermark. When the final batch's max `changed`
     * is below an earlier batch's, the watermark under-advances (worst case re-fetches already-seen records
     * next run — idempotent, safe) rather than skipping records (data loss).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const incremental = obj.SupportsIncrementalSync && ctx.WatermarkValue != null && ctx.WatermarkValue.length > 0;

        if (!incremental) {
            return super.FetchChanges(ctx);
        }

        this.activeChangedSince = this.FormatChangedSince(ctx.WatermarkValue as string);
        try {
            const result = await super.FetchChanges(ctx);
            if (!result.HasMore) {
                const wmField = obj.IncrementalWatermarkField ?? 'changed';
                result.NewWatermarkValue = this.MaxWatermark(result, wmField, ctx.WatermarkValue as string);
            }
            return result;
        } finally {
            this.activeChangedSince = null;
        }
    }

    // ── CRUD ──────────────────────────────────────────────────────────
    //
    // OVERRIDDEN (all three verbs) because Eventbrite's write paths carry VENDOR-NAMED template vars the
    // base's single-{id} SubstituteIDInPath cannot build: create paths carry a parent var
    // (`{organization_id}`/`{event_id}`); update/delete paths carry the record's own id under a vendor name
    // (`{event_id}`, `{venue_id}`, `{discount_id}`, …) and several also carry a parent var
    // (`/events/{event_id}/ticket_classes/{ticket_class_id}/`). Body shaping, ID extraction, and error
    // handling all reuse the base helpers; create STILL routes through BuildCreatedResult (loud-on-empty-id).

    /**
     * Create: substitutes the create path's parent vars from Attributes/Relationships (create paths carry
     * only parent vars — the record has no id yet), POSTs the body shaped per CreateBodyShape/CreateBodyKey,
     * and routes the result through BuildCreatedResult so a 2xx with no usable id FAILS LOUDLY.
     */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) {
            return { Success: false, StatusCode: 0, ErrorMessage:
                `[eventbrite] CreateRecord not supported for "${ctx.ObjectName}": CreateAPIPath / CreateMethod not configured.` };
        }
        const resolved = this.SubstituteAllPathVars(obj.CreateAPIPath, undefined, ctx.Attributes, ctx.Relationships);
        if (resolved.unresolved.length > 0) {
            return this.UnresolvedVarError(ctx.ObjectName, 'create', obj.CreateAPIPath, resolved.unresolved);
        }
        const auth = await this.Authenticate(ci, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${this.GetBaseURL(ci)}${resolved.path}`;
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            const externalID = this.ExtractIDFromResponse(response, obj.CreateIDLocation);
            return this.BuildCreatedResult(externalID, response.Status, ctx.ObjectName);
        }
        return { Success: false, StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on create` };
    }

    /**
     * Update: substitutes the record's own id (ExternalID) into the LAST path var and any parent vars from
     * Attributes/Relationships, then POSTs the wrapped body (Eventbrite uses POST, not PATCH/PUT, for update).
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.UpdateAPIPath || !obj.UpdateMethod) {
            return { Success: false, StatusCode: 0, ErrorMessage:
                `[eventbrite] UpdateRecord not supported for "${ctx.ObjectName}": UpdateAPIPath / UpdateMethod not configured.` };
        }
        const resolved = this.SubstituteAllPathVars(obj.UpdateAPIPath, ctx.ExternalID, ctx.Attributes, ctx.Relationships);
        if (resolved.unresolved.length > 0) {
            return this.UnresolvedVarError(ctx.ObjectName, 'update', obj.UpdateAPIPath, resolved.unresolved);
        }
        const auth = await this.Authenticate(ci, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${this.GetBaseURL(ci)}${resolved.path}`;
        const body = this.BuildOperationBody(ctx.Attributes, obj.UpdateBodyShape, obj.UpdateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.UpdateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return { Success: false, StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on update` };
    }

    /**
     * Delete: substitutes the record's own id (ExternalID) into the last path var and any parent vars, then
     * issues DeleteMethod (metadata-driven — Eventbrite uses hard DELETE, but the verb is read from metadata,
     * not assumed).
     */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.DeleteAPIPath || !obj.DeleteMethod) {
            return { Success: false, StatusCode: 0, ErrorMessage:
                `[eventbrite] DeleteRecord not supported for "${ctx.ObjectName}": DeleteAPIPath / DeleteMethod not configured.` };
        }
        // Delete carries no Attributes; parent vars (if any) must ride the composite ExternalID as
        // "parentId|recordId" (mirrors the base composite-PK ExternalID form) or be absent (single-var path).
        const { parentTags, recordID } = this.SplitCompositeExternalID(ctx.ExternalID, obj.DeleteAPIPath);
        const resolved = this.SubstituteAllPathVars(obj.DeleteAPIPath, recordID, parentTags, undefined);
        if (resolved.unresolved.length > 0) {
            return this.UnresolvedVarError(ctx.ObjectName, 'delete', obj.DeleteAPIPath, resolved.unresolved);
        }
        const auth = await this.Authenticate(ci, contextUser);
        const headers = this.BuildHeaders(auth);
        const url = `${this.GetBaseURL(ci)}${resolved.path}`;
        const response = await this.MakeHTTPRequest(auth, url, obj.DeleteMethod, headers);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return { Success: false, StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on delete` };
    }

    // ── Connection test ──────────────────────────────────────────────

    /**
     * Tests the connection by hitting the current-user endpoint (`/users/me/`). A 2xx confirms the Bearer
     * token is valid; 401/403 → auth failure; anything else → error.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const url = `${EVENTBRITE_API_BASE}/users/me/`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: 'Eventbrite connection successful.' };
            }
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Eventbrite authentication failed (HTTP ${response.Status}). Check the OAuth2 Bearer / Private Token.` };
            }
            return { Success: false, Message: `Eventbrite connection test returned HTTP ${response.Status}.` };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Eventbrite connection test error: ${msg}` };
        }
    }

    // ── Credential loading ───────────────────────────────────────────

    /** Reads the Bearer token from the linked Credential entity, or the Configuration JSON fallback. */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<EventbriteCredentials> {
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
            'No Eventbrite credential found. Attach a credential carrying an OAuth2 Bearer / Private Token ' +
            '(accessToken / apiKey / Token), or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /** Loads a credential row and parses its Values JSON. */
    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<EventbriteCredentials | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /** Extracts an Eventbrite token from a credential/config JSON string. Returns null when no token is present. */
    private ParseCredentialJson(json: string): EventbriteCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            const token = this.FirstString(parsed, ['accessToken', 'AccessToken', 'apiKey', 'ApiKey', 'Token', 'token', 'privateToken', 'PrivateToken']);
            return token ? { AccessToken: token } : null;
        } catch {
            return null;
        }
    }

    // ── Path-var substitution helpers ────────────────────────────────

    /**
     * Substitutes EVERY `{var}` in a write path. The record's own id (recordID, when provided) fills the
     * generic `{ID}`/`{id}`/`{ExternalID}` placeholders AND the LAST vendor-named var in the path (the
     * record's own id segment for update/delete, e.g. `{ticket_class_id}` in
     * `/events/{event_id}/ticket_classes/{ticket_class_id}/`). Every OTHER var is a parent id resolved from
     * the resolution map (Attributes ∪ Relationships), matched case-insensitively. Returns the resolved path
     * plus the list of vars that could NOT be resolved (caller fails loudly on a non-empty list).
     */
    private SubstituteAllPathVars(
        path: string,
        recordID: string | undefined,
        attributes?: Record<string, unknown>,
        relationships?: Record<string, unknown>
    ): { path: string; unresolved: string[] } {
        const vars = this.DetectPathVars(path);
        if (vars.length === 0) return { path, unresolved: [] };

        const genericIDNames = new Set(['id', 'ID', 'ExternalID']);
        // The record's own id var is the LAST non-generic var, when a recordID is supplied (update/delete).
        const nonGeneric = vars.filter(v => !genericIDNames.has(v));
        const ownIDVar = recordID != null && nonGeneric.length > 0 ? nonGeneric[nonGeneric.length - 1] : null;

        const resolutionMap = this.BuildResolutionMap(attributes, relationships);
        const unresolved: string[] = [];
        let resolvedPath = path;

        for (const v of vars) {
            let value: string | undefined;
            if (genericIDNames.has(v) || v === ownIDVar) {
                value = recordID;
            } else {
                value = resolutionMap.get(v.toLowerCase());
            }
            if (value == null || value.length === 0) {
                unresolved.push(v);
                continue;
            }
            resolvedPath = resolvedPath.replace(`{${v}}`, encodeURIComponent(value));
        }
        return { path: resolvedPath, unresolved };
    }

    /**
     * A delete carries no Attributes, so a child-object delete path with a parent var (e.g.
     * `/events/{event_id}/ticket_classes/{...}`) has no place to source the parent id — EXCEPT the composite
     * ExternalID. When the path has >1 var, the ExternalID is expected as `parentId|...|recordId` (the base's
     * composite-PK ExternalID form): the trailing segment is the record id, the leading segments fill the
     * parent vars in path order. When the path has ≤1 var, the whole ExternalID is the record id.
     */
    private SplitCompositeExternalID(
        externalID: string,
        path: string
    ): { parentTags: Record<string, unknown>; recordID: string } {
        const vars = this.DetectPathVars(path).filter(v => !['id', 'ID', 'ExternalID'].includes(v));
        if (vars.length <= 1) {
            return { parentTags: {}, recordID: externalID };
        }
        const parts = externalID.split('|');
        const recordID = parts[parts.length - 1];
        const parentTags: Record<string, unknown> = {};
        // Leading parts map to the leading (parent) vars in path order.
        const parentVars = vars.slice(0, vars.length - 1);
        for (let i = 0; i < parentVars.length && i < parts.length - 1; i++) {
            parentTags[parentVars[i]] = parts[i];
        }
        return { parentTags, recordID };
    }

    /** Detects `{var}` placeholders in a path. */
    private DetectPathVars(path: string): string[] {
        const matches = path.match(/\{(\w+)\}/g);
        return matches ? matches.map(m => m.slice(1, -1)) : [];
    }

    /** Builds a case-insensitive lookup map of parent-id candidates from Attributes ∪ Relationships. */
    private BuildResolutionMap(
        attributes?: Record<string, unknown>,
        relationships?: Record<string, unknown>
    ): Map<string, string> {
        const map = new Map<string, string>();
        const add = (src?: Record<string, unknown>): void => {
            if (!src) return;
            for (const [k, v] of Object.entries(src)) {
                if (v == null) continue;
                const s = String(v);
                if (s.length > 0) map.set(k.toLowerCase(), s);
            }
        };
        add(relationships);
        add(attributes); // attributes win over relationships on a key collision
        return map;
    }

    /** Builds a consistent unresolved-var CRUD failure result (never a broken URL to the wire). */
    private UnresolvedVarError(objectName: string, verb: string, path: string, unresolved: string[]): CRUDResult {
        return {
            Success: false,
            StatusCode: 0,
            ErrorMessage:
                `[eventbrite] ${verb} for "${objectName}" could not resolve path variable(s) ` +
                `[${unresolved.join(', ')}] in "${path}" — supply them in Attributes/Relationships ` +
                `(parent ids) or as the record ExternalID.`,
        };
    }

    // ── Watermark helpers ────────────────────────────────────────────

    /**
     * Formats a watermark value into the `changed_since` datetime the API expects (UTC ISO-8601). Accepts an
     * ISO string (passed through) or an epoch-ms string (converted). Eventbrite documents `changed_since` as
     * a UTC datetime; passing an unparseable value through unchanged lets the API reject it loudly rather than
     * silently widening the window.
     */
    private FormatChangedSince(watermark: string): string {
        if (/^\d+$/.test(watermark)) {
            return new Date(Number(watermark)).toISOString();
        }
        return watermark;
    }

    /**
     * Computes the new watermark = the max `changed` timestamp across the fetched records, floored at the
     * incoming watermark so it never regresses. Records that don't carry the field are skipped. Returns the
     * incoming watermark unchanged when no record advances it (idempotent no-op next run).
     */
    private MaxWatermark(result: FetchBatchResult, watermarkField: string, incoming: string): string {
        let maxMs = this.ToMs(incoming);
        let maxStr = incoming;
        for (const rec of result.Records) {
            const raw = rec.Fields?.[watermarkField];
            if (raw == null) continue;
            const s = String(raw);
            const ms = this.ToMs(s);
            if (ms > maxMs) { maxMs = ms; maxStr = s; }
        }
        return maxStr;
    }

    /** Parses a watermark (ISO datetime or epoch-ms string) to epoch ms; 0 when unparseable/empty. */
    private ToMs(value: string): number {
        if (!value || value.length === 0) return 0;
        if (/^\d+$/.test(value)) return Number(value);
        const t = Date.parse(value);
        return isNaN(t) ? 0 : t;
    }

    // ── Misc helpers ─────────────────────────────────────────────────

    /** Returns the first present, non-empty string value among the given keys. */
    private FirstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
        for (const k of keys) {
            const v = obj[k];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return undefined;
    }

    /**
     * Resolves an IO by name from the engine cache (via this integration's id) without throwing. Returns null
     * when the cache is unavailable (unit-test context) or the object isn't found — StableOrderingKey then
     * degrades to null, a safe default (the engine simply doesn't use keyset resume for that object).
     */
    private TryGetActiveObject(objectName: string): MJIntegrationObjectEntity | null {
        try {
            const integ = IntegrationEngineBase.Instance.GetIntegrationByName(this.IntegrationName);
            if (!integ) return null;
            return IntegrationEngineBase.Instance.GetIntegrationObject(integ.ID, objectName) ?? null;
        } catch {
            return null;
        }
    }
}
