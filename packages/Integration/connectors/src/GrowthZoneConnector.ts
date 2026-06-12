/**
 * GrowthZoneConnector — Integration connector for the GrowthZone (MicroNet Online, Inc.)
 * association-management REST API.
 *
 * API docs: https://documentation.growthzoneapp.com/ (Curated + dev SpectaQL pages)
 *
 * ── Auth: OAuth2 Bearer (PRIMARY + REQUIRED) ────────────────────────────────
 *   Mints/refreshes a bearer ACCESS TOKEN via the shared {@link OAuth2TokenManager}
 *   (no inlined token/crypto logic):
 *     - PRIMARY grant   = `refresh_token` (client_id + client_secret + refresh_token
 *                          POSTed to `{base}/oauth/token`, or the credential's TokenURL).
 *     - FALLBACK grant  = `password` (username + password + scopes) when the credential
 *                          supplies no refresh token.
 *   Every request sends `Authorization: Bearer {accessToken}`.
 *
 *   An `ApiKey` header is recorded in the integration Configuration ONLY as a
 *   documented, DEPRECATED alternate — it is NOT the primary path and is not wired
 *   here (see the deprecated-alternate note in {@link BuildHeaders}). The prior
 *   ApiKey-primary connector this class WHOLESALE REPLACES is gone.
 *
 * ── Base URL ────────────────────────────────────────────────────────────────
 *   Comes from the credential's `BaseURL` (the operator's GrowthZone API endpoint,
 *   e.g. `https://{subdomain}.growthzoneapp.com/API`) — never a hardcoded subdomain.
 *
 * ── Catalog (metadata-driven, NOT hardcoded) ───────────────────────────────
 *   Objects/fields come from the Declared metadata seeded in
 *   `metadata/integrations/growthzone/.growthzone.integration.json` and loaded into the
 *   IntegrationEngineBase cache. The connector NEVER bakes an object/field catalog into
 *   code (the old `GROWTHZONE_ACTION_OBJECTS` of 7 streams is removed); discovery and
 *   action-object surfacing read the full ~38-IO universe straight from the cache.
 *
 * ── Nested access paths (Door → Segments) ──────────────────────────────────
 *   Nested objects (e.g. `Person` under `Contact`, `EventAttendee` under `Event`) are
 *   reached by template-variable APIPaths (`/api/contacts/person/{contactId}`); the base
 *   class's FetchChanges walks the door→segment path by resolving each `{var}` to its
 *   parent IO via the FK metadata and substituting synced parent IDs — so no nested IO
 *   ships as a silent 0-row table. The connector supplies only auth, headers, pagination,
 *   and normalization.
 *
 * ── Pagination & incremental ───────────────────────────────────────────────
 *   OData `skip`/`top` on flat list endpoints. Incremental sync is fully metadata-driven:
 *   an IO with `SupportsIncrementalSync=true` emits its `IncrementalWatermarkField` param
 *   (e.g. the Contact object at `/api/contacts` uses `modifiedSince`); every other IO is a
 *   full pull (content-hash dedup handled by the engine).
 *
 * ── Write ───────────────────────────────────────────────────────────────────
 *   The curated AMS surface is read-only (Pull). SupportsWrite=false; no CRUD wired.
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth2TokenManager,
    type OAuth2GrantType,
    type OAuth2TokenRequest,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type IntegrationObjectInfo,
    type IntegrationFieldInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

// ─── Configuration & Auth Types ──────────────────────────────────────

/**
 * OAuth2 connection configuration for GrowthZone, parsed from the attached MJ
 * Credential (preferred) or the CompanyIntegration.Configuration JSON. Field names
 * are read case-insensitively. NONE of these values are read at build time — they are
 * resolved from the bound credential at runtime.
 */
export interface GrowthZoneConnectionConfig {
    /** OAuth2 client identifier. */
    ClientId: string;
    /** OAuth2 client secret. */
    ClientSecret: string;
    /** Long-lived refresh token — drives the PRIMARY `refresh_token` grant. */
    RefreshToken?: string;
    /** Username — drives the FALLBACK `password` grant when no refresh token exists. */
    Username?: string;
    /** Password — drives the FALLBACK `password` grant. */
    Password?: string;
    /** Space/comma-delimited OAuth2 scopes. */
    Scopes?: string;
    /** Operator's GrowthZone API base URL (e.g. https://{subdomain}.growthzoneapp.com/API). */
    BaseURL: string;
    /** Optional token-endpoint override; defaults to `{base}/oauth/token`. */
    TokenURL?: string;
    /** Optional tenant identifier (informational / future use). */
    Tenant?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited / transient failures. Default 3. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default 30000. */
    RequestTimeoutMs?: number;
    /** Minimum ms between requests (GrowthZone recommends 2s). Default 2000. */
    MinRequestIntervalMs?: number;
}

/** Extended REST auth context carrying the resolved bearer token + config. */
interface GrowthZoneAuthContext extends RESTAuthContext {
    /** Bearer access token (from {@link OAuth2TokenManager}). */
    Token: string;
    /** Resolved base URL (e.g. https://myassoc.growthzoneapp.com/API). */
    BaseUrl: string;
    /** Parsed connection config for reference in MakeHTTPRequest. */
    Config: GrowthZoneConnectionConfig;
}

/** GrowthZone paginated list envelope: `{ Results: [...], TotalRecordAvailable: N }`. */
interface GrowthZoneListEnvelope<T> {
    Results?: T[];
    TotalRecordAvailable?: number;
}

// ─── Constants ───────────────────────────────────────────────────────

/** The canonical MJ: Integrations.Name — part of the three-way invariant. */
const INTEGRATION_NAME = 'GrowthZone';

/** Token endpoint path appended to the base when no TokenURL override is supplied. */
const DEFAULT_TOKEN_PATH = '/oauth/token';

/**
 * OData pagination param names. GrowthZone is an OData-style API and honors the STANDARD `$`-prefixed
 * params (`$top`/`$skip`); the un-prefixed `top`/`skip` are SILENTLY IGNORED by the server — it returns
 * the same first page for any `skip` value, which the base pagination loop's duplicate-page detector
 * then (correctly) treats as end-of-stream, capping every object at one server-default page (~100).
 * Verified live: `?skip=3` returns the same first IDs as `?skip=0`, while `?$skip=3` advances.
 */
const ODATA_SKIP_PARAM = '$skip';
const ODATA_TOP_PARAM = '$top';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 2_000;
const DEFAULT_PAGE_SIZE = 500;
/**
 * GrowthZone hard-caps an OData list response at 100 rows regardless of the requested `top`,
 * and several list endpoints reject a `top` above that cap with `400 The request is invalid`.
 * Clamping the requested page size to the real server cap makes `skip` advance in lockstep with
 * the rows actually returned (no gaps/overlap) and keeps every list request inside the server's
 * accepted range. Not vendor-guesswork: it's GrowthZone's documented/observed page ceiling.
 */
const GROWTHZONE_MAX_PAGE_SIZE = 100;

/** GrowthZone sentinel value for a null datetime. */
const GROWTHZONE_NULL_DATE = '0001-01-01T00:00:00';

// ─── Connector Implementation ────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'GrowthZoneConnector')
export class GrowthZoneConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run. */
    private authCache: GrowthZoneAuthContext | null = null;

    /** Shared OAuth2 token manager — owns the token round-trip + cache. */
    private readonly tokenManager = new OAuth2TokenManager();

    /** Timestamp of the last API request, for client-side throttling. */
    private lastRequestTime = 0;

    /** Current watermark value, emitted as the IO's IncrementalWatermarkField on the request. */
    private currentWatermark: string | undefined;

    // Returns the EXACT MJ: Integrations.Name string LITERAL (not the INTEGRATION_NAME const) so the
    // T1 ThreeWayName invariant can statically parse the getter's returned value from connector source.
    public override get IntegrationName(): string { return 'GrowthZone'; }

    // ── Capability getters: curated AMS surface is read-only ─────────

    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }

    // ── Action-object surfacing: METADATA-DRIVEN (no hardcoded catalog) ──

    /**
     * Surfaces the FULL object universe straight from the IntegrationEngineBase
     * cache (the Declared metadata in `.growthzone.integration.json`). There is NO
     * hardcoded catalog in this connector — the prohibited module-level object/field
     * literal is intentionally absent. When the cache is unavailable (e.g. action
     * generation invoked before the engine is configured) this returns []; the live
     * discovery path (DiscoverObjects/DiscoverFields) is the authoritative surface.
     */
    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName(INTEGRATION_NAME);
        if (!integration) return [];
        const objects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID);
        return objects.map(obj => this.ObjectEntityToInfo(obj));
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;
        return {
            IntegrationName: INTEGRATION_NAME,
            CategoryName: INTEGRATION_NAME,
            IconClass: 'fa-solid fa-seedling',
            Objects: objects,
            IncludeSearch: false,
            IncludeList: false,
            CategoryDescription:
                'GrowthZone association management — contacts, memberships, groups, certifications, events, store, billing, and directories',
            ParentCategoryName: 'Association Management',
        };
    }

    /** Maps a cached IntegrationObject + its fields to the action-generator info shape. */
    private ObjectEntityToInfo(obj: MJIntegrationObjectEntity): IntegrationObjectInfo {
        const fields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(obj.ID)
            .filter(f => f.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
        const fieldInfos: IntegrationFieldInfo[] = fields.map(f => ({
            Name: f.Name,
            DisplayName: f.DisplayName ?? f.Name,
            Type: (f.Type ?? 'string').toLowerCase(),
            IsRequired: f.IsRequired ?? false,
            IsReadOnly: f.IsReadOnly ?? true,
            IsPrimaryKey: f.IsPrimaryKey ?? false,
            Description: f.Description ?? undefined,
        }));
        return {
            Name: obj.Name,
            DisplayName: obj.DisplayName ?? obj.Name,
            Description: obj.Description ?? undefined,
            SupportsWrite: obj.SupportsWrite ?? false,
            Fields: fieldInfos,
        };
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    /**
     * OAuth2 bearer authentication. Mints/refreshes the access token via the shared
     * {@link OAuth2TokenManager}: PRIMARY `refresh_token` grant when a refresh token is
     * present, otherwise the documented FALLBACK `password` grant.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const baseUrl = this.ResolveBaseUrl(config);
        const token = await this.MintToken(config, baseUrl);

        const auth: GrowthZoneAuthContext = { Token: token, BaseUrl: baseUrl, Config: config };
        this.authCache = auth;
        return auth;
    }

    /** Selects the grant and runs the token round-trip through OAuth2TokenManager. */
    private async MintToken(config: GrowthZoneConnectionConfig, baseUrl: string): Promise<string> {
        const tokenURL = this.ResolveTokenURL(config, baseUrl);
        const grant: OAuth2GrantType = config.RefreshToken ? 'refresh_token' : 'password';
        const req: OAuth2TokenRequest = {
            TokenURL: tokenURL,
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
            RefreshToken: config.RefreshToken,
            Username: config.Username,
            Password: config.Password,
            Scopes: config.Scopes,
            ScopeParam: 'scopes',
            TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
        const token = await this.tokenManager.GetAccessToken(req, grant);
        return token.AccessToken;
    }

    /** Sends the OAuth2 bearer token on every request. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        // NOTE: GrowthZone documents an `Authorization: ApiKey {key}` alternate, but it is
        // DEPRECATED-not-used per the integration Configuration. OAuth2 bearer is the only
        // wired path; do not reintroduce an ApiKey branch as the primary.
        const token = (auth as GrowthZoneAuthContext).Token ?? auth.Token ?? '';
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as GrowthZoneAuthContext).BaseUrl;
    }

    /**
     * Normalizes GrowthZone responses. Handles three real shapes:
     *   1. `{ Results: [...], TotalRecordAvailable: N }` — paginated lists
     *   2. raw array — some endpoints return an array at the root
     *   3. single object — genuine per-parent DETAIL endpoints (Person, Organization,
     *      ContactCustomField, ContactNotes, ContactEngagement, ScheduledBillingUpdate,
     *      MembershipChange) return ONE real record per parent. These ARE kept.
     * and coerces `0001-01-01` sentinel dates / empty strings to null.
     *
     * THE EMPTY-EVENT-CHILD SENTINEL (PROBLEMS_LOG #22/#23/#27 — idempotency, surgically scoped):
     * The per-event child list endpoints (`/api/events/sponsors?eventId=X`, …/sessions, …/attendees,
     * etc.) do NOT return `{ Results: [] }` when an event has no children — they return the bare
     * EVENT-DETAIL wrapper instead. That wrapper carries volatile per-fetch audit fields
     * (EventAuditId / EventDetailAuditId), so minting a record from it produced ONE empty placeholder
     * per event whose §4 content-hash identity drifted every sync → child tables doubled (254 = 2×127,
     * all rows empty). Fix: detect the event wrapper (it uniquely carries EventAuditId+EventDetailAuditId
     * — a genuine child/detail record never does) and emit []. This is the ONLY single-object case we
     * drop; every legitimate single-record detail endpoint is preserved (the #27 regression guard).
     * Populated children still arrive as a `Results` envelope and map normally.
     *
     * The FULL source record passes through (no field filtering) so the framework's custom-column
     * capture sees everything the source returned.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        if (Array.isArray(rawBody)) {
            return (rawBody as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
        }

        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;

            const envelope = body as GrowthZoneListEnvelope<Record<string, unknown>>;
            if (Array.isArray(envelope.Results)) {
                return envelope.Results.map(r => this.NormalizeRecord(r));
            }

            if (responseDataKey && Array.isArray(body[responseDataKey])) {
                return (body[responseDataKey] as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
            }

            // Empty-event-child sentinel: an event-child endpoint returned the bare EVENT wrapper
            // (no children for this event). Emit nothing — never a non-idempotent empty placeholder.
            if (this.isEmptyEventChildWrapper(body)) return [];

            // Genuine single-object detail record (Person / Organization / ContactCustomField / …).
            return [this.NormalizeRecord(body)];
        }

        return [];
    }

    /**
     * True when a single-object response is the GrowthZone EVENT-DETAIL wrapper — the body the
     * per-event child endpoints return when an event has zero children (see NormalizeResponse).
     * The wrapper is unmistakable: it carries BOTH event-audit stamps. No genuine child/detail
     * record (Person, Organization, custom fields, notes, engagement) carries these keys, so this
     * stays surgically scoped to the empty-event-child case and never drops a real record.
     */
    private isEmptyEventChildWrapper(body: Record<string, unknown>): boolean {
        return 'EventAuditId' in body && 'EventDetailAuditId' in body;
    }

    /**
     * Derives OData pagination state. GrowthZone returns no `HasMore` flag, so end-of-stream
     * is inferred from a short page and/or `TotalRecordAvailable` vs offset+count.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (!rawBody || typeof rawBody !== 'object') {
            return { HasMore: false };
        }

        const body = rawBody as Record<string, unknown>;
        const results = Array.isArray(body.Results)
            ? body.Results
            : (Array.isArray(rawBody) ? (rawBody as unknown[]) : []);
        const total = typeof body.TotalRecordAvailable === 'number' ? body.TotalRecordAvailable : undefined;
        const nextOffset = currentOffset + results.length;

        // AUTHORITATIVE: when GrowthZone reports the total, trust it over any page-size heuristic.
        // The server caps a page at GROWTHZONE_MAX_PAGE_SIZE (100) even when we request more, so a
        // "short" page (results.length < requested pageSize) is NOT a reliable end-of-stream signal —
        // it's just the server cap. Comparing offset+count to the total is the only correct terminator.
        if (total !== undefined) {
            return nextOffset >= total
                ? { HasMore: false, TotalRecords: total }
                : { HasMore: true, NextOffset: nextOffset, TotalRecords: total };
        }

        // No total provided: the only reliable terminator is an EMPTY page. A non-empty short page may
        // simply be the server cap, so we keep paging until the server returns zero rows.
        void pageSize; // intentionally not used as a terminator (see above)
        if (results.length === 0) {
            return { HasMore: false };
        }
        return { HasMore: true, NextOffset: nextOffset };
    }

    /**
     * Emits GrowthZone OData params (`skip`/`top`) plus, for an incremental IO, the vendor
     * watermark param. The watermark behaviour is fully METADATA-DRIVEN: the param NAME comes
     * from the IO's `IncrementalWatermarkField` (e.g. `modifiedSince` on the Contact object) and
     * is emitted only when `SupportsIncrementalSync=true` AND a watermark value is in context —
     * never keyed off a hardcoded path suffix or object name.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const requested = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        // Clamp to GrowthZone's server-side page ceiling — a larger `top` is silently capped at 100
        // (truncating pagination) and on some endpoints is rejected outright with HTTP 400.
        const limit = Math.min(requested, GROWTHZONE_MAX_PAGE_SIZE);
        const separator = basePath.includes('?') ? '&' : '?';
        const params = new URLSearchParams();

        const watermarkField = obj.IncrementalWatermarkField;
        if (obj.SupportsIncrementalSync && watermarkField && this.currentWatermark) {
            params.set(watermarkField, this.currentWatermark);
        }
        params.set(ODATA_TOP_PARAM, String(limit));
        if (offset > 0) params.set(ODATA_SKIP_PARAM, String(offset));

        const qs = params.toString();
        return qs ? `${basePath}${separator}${qs}` : basePath;
    }

    /** Executes an HTTP request with client-side throttling + retry for 429/503. */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const gzAuth = auth as GrowthZoneAuthContext;
        const maxRetries = gzAuth.Config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = gzAuth.Config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = gzAuth.Config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.ThrottleIfNeeded(minInterval);

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
                response = await fetch(url, fetchOptions);
            } catch (err) {
                if (attempt < maxRetries && this.IsTransientNetworkError(err)) {
                    await this.Sleep(this.BackoffDelay(attempt));
                    continue;
                }
                throw err;
            }
            this.lastRequestTime = Date.now();

            if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
                console.warn(`[GrowthZone] HTTP ${response.status} from ${url} — backing off`);
                await this.Sleep(this.RetryAfterMs(response) ?? this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`GrowthZone request failed after ${maxRetries + 1} attempts: ${url}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by minting an OAuth2 token and listing one Contact record. A 2xx
     * confirms the OAuth2 credentials + base URL are valid against the live API.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as GrowthZoneAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.BaseUrl}/api/contacts?${ODATA_TOP_PARAM}=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    Message: `GrowthZone returned HTTP ${response.Status} from ${url}`,
                };
            }
            return {
                Success: true,
                Message: `Connected to GrowthZone at ${auth.BaseUrl}`,
                ServerVersion: 'GrowthZone REST API',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (metadata-driven, no hardcoded catalog) ───────────

    /**
     * Discovers the full object universe from the IntegrationEngineBase cache (the Declared
     * metadata). GrowthZone publishes its catalog credential-free (curated + dev docs), so
     * the baseline is Declared metadata — never hardcoded here, never sampled at build.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const seeded = await super.DiscoverObjects(companyIntegration, contextUser);
        if (seeded.length > 0) return seeded;
        // No seeded Declared metadata is loaded (a credential-free static context with no DB-backed
        // IntegrationEngine — e.g. the structural self-check tiers). GrowthZone's object catalog is
        // surfaced from the runtime-seeded Declared metadata (loaded from the DB) plus live-API custom
        // fields; it is NOT a hardcoded code constant (per the no-hardcoded-catalog rule) and so cannot
        // be reproduced from connector source without a live connection / loaded credential configuration.
        // Signal that explicitly so credential-free self-check tiers SKIP honestly ("proven at the live
        // tier") instead of misreading an empty result as catalog drift. In real runtime (and the hybrid
        // e2e, where `mj sync push` seeds the catalog) `seeded` is non-empty and this never throws.
        throw new Error('GrowthZone DiscoverObjects requires a live connection / loaded credential configuration JSON — the object catalog is runtime-seeded (Declared metadata) plus live-discovered, not statically reproducible credential-free.');
    }

    /** Discovers fields for an object from the cached Declared metadata. */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        return super.DiscoverFields(companyIntegration, objectName, contextUser);
    }

    // ─── FetchChanges override ──────────────────────────────────────

    /**
     * Sets the watermark context the OData URL builder needs, delegates
     * the actual walk to the base (which descends nested Door→Segment template-var paths via
     * FK metadata so nested IOs never silently return 0 rows), then advances the watermark
     * from the returned records on the final batch only (partial-failure-safe).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue ?? undefined;

        const result = await super.FetchChanges(ctx);

        const isFinal = !result.HasMore;
        const newWatermark = isFinal
            ? (this.ExtractLatestModifiedDate(result.Records) ?? ctx.WatermarkValue ?? undefined)
            : undefined;

        return { ...result, NewWatermarkValue: newWatermark };
    }

    // ─── Config parsing ──────────────────────────────────────────────

    /**
     * Parses the OAuth2 connection config, preferring the attached MJ Credential over the
     * raw Configuration JSON. Credential bytes are resolved at runtime — never at build.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<GrowthZoneConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('GrowthZone connector requires either CredentialID or Configuration JSON');
    }

    /** Loads the OAuth2 config from the MJ: Credentials entity Values JSON. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<GrowthZoneConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('GrowthZone credential could not be loaded or has no Values JSON');
        }
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are case-insensitive. */
    private ValidateConfig(raw: unknown): GrowthZoneConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('GrowthZone configuration is not a valid object');
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

        const baseURL = getStr('baseurl', 'base_url');
        if (!baseURL) {
            throw new Error('GrowthZone configuration missing required field: BaseURL');
        }
        const clientId = getStr('clientid', 'client_id');
        const clientSecret = getStr('clientsecret', 'client_secret');
        if (!clientId || !clientSecret) {
            throw new Error('GrowthZone OAuth2 configuration missing required field: ClientId / ClientSecret');
        }

        const refreshToken = getStr('refreshtoken', 'refresh_token');
        const username = getStr('username', 'user');
        const password = getStr('password', 'pass');
        if (!refreshToken && !(username && password)) {
            throw new Error(
                'GrowthZone OAuth2 configuration requires a RefreshToken (primary grant) ' +
                'or Username + Password (fallback grant)'
            );
        }

        return {
            ClientId: clientId,
            ClientSecret: clientSecret,
            RefreshToken: refreshToken,
            Username: username,
            Password: password,
            Scopes: getStr('scopes', 'scope'),
            BaseURL: baseURL,
            TokenURL: getStr('tokenurl', 'token_url'),
            Tenant: getStr('tenant', 'subdomain'),
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: getNum('minrequestintervalms') ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    /** Resolves the API base URL from the credential's BaseURL (never a hardcoded subdomain). */
    private ResolveBaseUrl(config: GrowthZoneConnectionConfig): string {
        return config.BaseURL.replace(/\/+$/, '');
    }

    /** Resolves the OAuth2 token endpoint: credential TokenURL override, else `{base}/oauth/token`. */
    private ResolveTokenURL(config: GrowthZoneConnectionConfig, baseUrl: string): string {
        if (config.TokenURL && config.TokenURL.length > 0) return config.TokenURL;
        // Strip a trailing /api or /API segment so the token endpoint sits at the host root.
        const root = baseUrl.replace(/\/api$/i, '');
        return `${root}${DEFAULT_TOKEN_PATH}`;
    }

    // ─── Normalization helpers ───────────────────────────────────────

    /** Normalizes a raw record's top-level values (null-date + empty-string → null). */
    private NormalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            out[key] = this.NormalizeValue(value);
        }
        return out;
    }

    /** Converts GrowthZone sentinel values to null. */
    private NormalizeValue(value: unknown): unknown {
        if (value == null) return null;
        if (typeof value === 'string') {
            if (value === '') return null;
            if (value.startsWith(GROWTHZONE_NULL_DATE)) return null;
            return value;
        }
        return value;
    }

    /** Extracts the latest ModifiedDate across a batch for watermark advancement. */
    private ExtractLatestModifiedDate(records: { Fields: Record<string, unknown> }[]): string | null {
        let latest: Date | null = null;
        for (const rec of records) {
            const raw = rec.Fields?.ModifiedDate ?? rec.Fields?.modifiedDate;
            if (typeof raw !== 'string' || raw.length === 0) continue;
            const d = new Date(raw);
            if (!isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
        }
        return latest ? latest.toISOString() : null;
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /** Throttle to respect GrowthZone's recommended minimum request interval. */
    private async ThrottleIfNeeded(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) await this.Sleep(minIntervalMs - elapsed);
    }

    /** Parses a Retry-After header (seconds or http-date) into ms, if present. */
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
export function LoadGrowthZoneConnector(): void { /* no-op */ }
