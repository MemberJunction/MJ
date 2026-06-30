import { RegisterClass } from '@memberjunction/global';
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
    type ExternalRecord,
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';

// ─── Connection configuration ────────────────────────────────────────

/**
 * Connection configuration parsed from the CompanyIntegration's MJ Credential
 * (preferred) or its Configuration JSON. Dynamics 365 / Dataverse is reached
 * through the OData v4 Web API using a Microsoft Entra ID (Azure AD)
 * client-credentials (server-to-server / app-only) token.
 *
 * Field names are read case-insensitively so a credential authored as
 * `tenantId`/`TenantID`/`tenant_id` all resolve.
 */
export interface DynamicsConnectionConfig {
    /** Microsoft Entra ID tenant GUID (or `common`/`organizations`). */
    TenantId: string;
    /** Application (client) registration GUID. */
    ClientId: string;
    /** Application client secret. */
    ClientSecret: string;
    /**
     * The Dataverse environment URL, e.g. `https://contoso.crm.dynamics.com`.
     * Per-customer — NEVER hardcoded. The OAuth resource/audience scope is
     * `<EnvironmentUrl>/.default` and the Web API base is `<EnvironmentUrl>/api/data/v9.2`.
     */
    EnvironmentUrl: string;
    /** Override the Web API version segment. Default: `v9.2`. */
    ApiVersion?: string;
    /** Override the Entra ID token endpoint origin. Default: `https://login.microsoftonline.com`. */
    AuthorityHost?: string;
    /** Override the OAuth scope. Default: `<EnvironmentUrl>/.default`. */
    Scope?: string;

    // ── Performance / resilience overrides ──────────────────────────
    /** Maximum retries for rate-limited / transient failures. Default: 5. */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 60000. */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 0 (governed by the engine's adaptive bucket). */
    MinRequestIntervalMs?: number;
    /** Requested OData max page size (capped at 5000 by the service). Default: 5000. */
    MaxPageSize?: number;
}

/** Auth context carrying the minted bearer token plus the resolved Web API base URL + config. */
interface DynamicsAuthContext extends RESTAuthContext {
    Config: DynamicsConnectionConfig;
    /**
     * Org ROOT URL (`<EnvironmentUrl>`) used by the base class's BuildFullURL(baseURL, APIPath).
     * The frozen IO `APIPath`s are ABSOLUTE-from-root (they already include `/api/data/v9.2/...`), so
     * the base must be the org root to avoid doubling the version segment.
     */
    BaseUrl: string;
    /** Versioned Web API base (`<EnvironmentUrl>/api/data/v9.2`) for the connector's OWN calls (WhoAmI, EntityDefinitions, delta). */
    ApiBaseUrl: string;
}

// ─── OData metadata shapes (EntityDefinitions describe response) ──────

/** A single attribute (column) entry from `EntityDefinitions(...)/Attributes`. */
interface DataverseAttributeMetadata {
    LogicalName?: string;
    SchemaName?: string;
    DisplayName?: { UserLocalizedLabel?: { Label?: string } | null } | null;
    Description?: { UserLocalizedLabel?: { Label?: string } | null } | null;
    AttributeType?: string;
    MaxLength?: number | null;
    Precision?: number | null;
    IsValidForCreate?: boolean | null;
    IsValidForUpdate?: boolean | null;
    IsPrimaryId?: boolean | null;
    RequiredLevel?: { Value?: string } | null;
    /** Present on Lookup attributes — the logical names of the table(s) this column references. */
    Targets?: string[] | null;
    [key: string]: unknown;
}

/** A single table (entity) entry from `EntityDefinitions`. */
interface DataverseEntityMetadata {
    LogicalName?: string;
    EntitySetName?: string | null;
    DisplayName?: { UserLocalizedLabel?: { Label?: string } | null } | null;
    Description?: { UserLocalizedLabel?: { Label?: string } | null } | null;
    PrimaryIdAttribute?: string | null;
    PrimaryNameAttribute?: string | null;
    ChangeTrackingEnabled?: boolean | null;
    CanCreateAttributes?: { Value?: boolean } | null;
    IsCustomEntity?: boolean | null;
    Attributes?: DataverseAttributeMetadata[];
    [key: string]: unknown;
}

/** OData collection envelope (`{ "@odata.context": ..., value: [...] }`). */
interface ODataCollectionResponse<T> {
    '@odata.context'?: string;
    '@odata.nextLink'?: string;
    '@odata.deltaLink'?: string;
    value?: T[];
    [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Default Web API version segment. */
const DEFAULT_API_VERSION = 'v9.2';

/** Default Entra ID authority host. */
const DEFAULT_AUTHORITY_HOST = 'https://login.microsoftonline.com';

/** Default HTTP request timeout (Dataverse can be slow under load). */
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

/** Default retry count for retryable (429 / 503 / 504) responses. */
const DEFAULT_MAX_RETRIES = 5;

/** OData service hard cap on page size; the service silently ignores requests above this. */
const MAX_ODATA_PAGE_SIZE = 5_000;

/**
 * Connector for Microsoft Dynamics 365 / Dataverse (Common Data Service) via the
 * OData v4 Web API.
 *
 * - **Auth**: Microsoft Entra ID OAuth 2.0 client-credentials (app-only). Token is
 *   minted/cached by the shared {@link OAuth2TokenManager}; the credential bytes are
 *   resolved at runtime from the connection's MJ Credential / Configuration — never baked.
 * - **Base URL**: `<EnvironmentUrl>/api/data/v9.2`, per-connection (every customer
 *   environment differs — nothing is hardcoded).
 * - **Discovery**: `DiscoverObjects` / `DiscoverFields` parse the credentialed
 *   `EntityDefinitions` describe endpoint at runtime (case-2 auth-gated discovery) so
 *   BOTH standard and custom/solution-installed tables surface. The documented standard
 *   catalog lives in the Declared metadata file, not in this class.
 * - **Pagination**: OData `@odata.nextLink` cursor, followed verbatim.
 * - **Write**: generic per-operation CRUD from {@link BaseRESTIntegrationConnector}
 *   (flat body; create ID read from the `OData-EntityId` response header; update PATCH
 *   `/<entityset>(id)`; delete DELETE `/<entityset>(id)`; alternate-key upsert path form).
 * - **Incremental**: change-tracking delta (`Prefer: odata.track-changes` →
 *   `@odata.deltaLink`) when a table declares it; `modifiedon`-polling fallback otherwise.
 */
@RegisterClass(BaseIntegrationConnector, 'DynamicsDataverseConnector')
export class DynamicsDataverseConnector extends BaseRESTIntegrationConnector {

    // ── State ────────────────────────────────────────────────────────

    private readonly tokenManager = new OAuth2TokenManager();
    private cachedAuth: DynamicsAuthContext | null = null;

    // ── Identity + capabilities ──────────────────────────────────────

    /** Verbatim from the upstream identity handoff. Drives the three-way name invariant.
     *  Returned as a string literal (not the INTEGRATION_NAME const ref) so the T1
     *  ThreeWayName static parser can extract it from source. */
    public override get IntegrationName(): string { return 'Microsoft Dynamics 365 (Dataverse)'; }

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * §7 — `EntityDefinitions` enumerates the COMPLETE credentialed gamut (standard + custom +
     * solution-installed tables / attributes), not a filtered subset, so a comprehensive refresh
     * may safely + reversibly deactivate objects no longer in the response.
     */
    public override get DiscoveryIsAuthoritative(): boolean { return true; }

    /**
     * §7 — the watermark this connector advances (delta-link / modifiedon high-water) IS monotonic:
     * change-tracking yields a forward-only delta token, and the modifiedon fallback fetches in
     * ascending `modifiedon` order so the last batch carries the true maximum. Lets the engine narrow
     * the next incremental instead of advancing to wall-clock now.
     */
    public override get MonotonicWatermark(): boolean { return true; }

    /**
     * §7 — keyset/seek resume key for watermark-less objects: the table's GUID primary key
     * (`<logicalName>id`), read from the IO's Configuration. Stable + monotonic-enough for
     * resume-from-last-seen; `null` when no PK is known.
     */
    public override StableOrderingKey(objectName: string): string | null {
        const obj = this.tryGetCachedObject(objectName);
        if (!obj) return null;
        return this.readObjectConfigString(obj, 'primaryIdAttribute')
            ?? this.readObjectConfigString(obj, 'stableOrderingKey');
    }

    /**
     * §7 — Dataverse enforces a per-environment Web API service-protection limit (≈ 6000 requests /
     * 300s sliding window, plus an execution-time budget). Conservative sustained rate keeps the
     * connector under the request-count limit; the engine's AIMD bucket adapts on 429s via
     * {@link ExtractRetryAfterMs}. (≈6000/300 ≈ 20 req/s; we stay below to leave headroom.)
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 15, Burst: 30, ThrottleBackoffFactor: 0.5 };
    }

    public override get MaxConcurrencyHint(): number | null { return 4; }

    /**
     * Parse Dataverse's throttle signal. The service returns HTTP 429 with a `Retry-After` header
     * (seconds) on a service-protection limit; honor it precisely.
     */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const headers = this.extractHeadersFromError(error);
        if (!headers) return undefined;
        const retryAfter = headers['retry-after'];
        if (retryAfter) {
            const asSeconds = Number(retryAfter);
            if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
            const asDate = new Date(retryAfter).getTime();
            if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
        }
        return undefined;
    }

    // ── TestConnection ───────────────────────────────────────────────

    /**
     * Validates the service principal can reach the environment by issuing a fresh token and a
     * lightweight `WhoAmI` call (an unbound function returning the calling user/org GUIDs).
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser, true);
            const url = `${auth.ApiBaseUrl}/WhoAmI`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    Message: `Dataverse WhoAmI failed: HTTP ${response.Status} — ${this.previewBody(response.Body)}`,
                };
            }
            const body = response.Body as { OrganizationId?: string; UserId?: string };
            return {
                Success: true,
                Message: `Connected to Dataverse (org ${body.OrganizationId ?? 'unknown'})`,
                ServerVersion: `Web API ${auth.Config.ApiVersion ?? DEFAULT_API_VERSION}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ── DiscoverObjects / DiscoverFields (runtime $metadata discovery) ──

    /**
     * Case-2 (auth-gated) runtime discovery: enumerates EVERY table the credential can see via the
     * `EntityDefinitions` describe endpoint (standard + custom + solution-installed) — NOT a baked
     * catalog. The documented standard catalog seeded in the Declared metadata file is the floor;
     * this returns what the live environment actually exposes (the ceiling), which is strictly a
     * superset for custom-bearing tenants.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        try {
            const entities = await this.FetchEntityDefinitions(companyIntegration, contextUser);
            return entities
                .filter(e => typeof e.LogicalName === 'string' && typeof e.EntitySetName === 'string' && e.EntitySetName.length > 0)
                .map(e => this.EntityMetadataToObjectSchema(e));
        } catch (err) {
            // Case-2 (auth-gated) discovery: the live EntityDefinitions endpoint requires credentials.
            // When the config/credential is absent, re-throw with an EXPLICIT credential-absence signal
            // so a credential-free run is classified as "discovery requires credentials" (cross-pass
            // consistency is proven at the live tier) rather than a hard discovery failure. A genuine
            // live API error (credentials present) keeps its original message and propagates.
            const msg = err instanceof Error ? err.message : String(err);
            if (/CredentialID or Configuration JSON|missing required field|could not be loaded|not a valid object/i.test(msg)) {
                throw new Error(`DynamicsDataverseConnector requires credentials to discover (auth-gated EntityDefinitions endpoint): ${msg}`);
            }
            throw err;
        }
    }

    /**
     * Case-2 runtime discovery for a single object's columns: describes the table's `Attributes`
     * collection and maps each Property → {@link ExternalFieldSchema}, surfacing Type/MaxLength,
     * the GUID PK (`IsPrimaryId` / `PrimaryIdAttribute` → `IsPrimaryKey`), and scalar Lookup
     * columns → FK (with `ForeignKeyTarget` = the referenced table's logical name).
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const entity = await this.FetchEntityDefinition(companyIntegration, objectName, contextUser);
        if (!entity) {
            // Fall back to the Declared metadata cache if the live describe returned nothing
            // (object not visible to these credentials) — degrade gracefully rather than drop it.
            return super.DiscoverFields(companyIntegration, objectName, contextUser);
        }
        const primaryId = entity.PrimaryIdAttribute ?? `${entity.LogicalName}id`;
        const attributes = entity.Attributes ?? [];
        return attributes
            .filter(a => typeof a.LogicalName === 'string' && a.LogicalName.length > 0)
            .map(a => this.AttributeMetadataToFieldSchema(a, primaryId));
    }

    // ── FetchChanges (change-tracking delta override) ────────────────

    /**
     * Routes to the change-tracking delta path when the table declares it AND a watermark exists;
     * otherwise delegates to the base metadata-driven fetch (which applies the `modifiedon` watermark
     * fallback + standard `@odata.nextLink` pagination). The base path already handles
     * `TransformRecord` (annotation stripping) + full-record pass-through, so the delta path mirrors it.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.lastIntegrationID = ctx.CompanyIntegration.IntegrationID;
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (obj.SupportsIncrementalSync && this.ObjectUsesChangeTracking(obj) && ctx.WatermarkValue) {
            return this.FetchChangesViaDelta(ctx, obj);
        }
        return super.FetchChanges(ctx);
    }

    // ── TransformRecord — strip OData annotations (auditable removal) ──

    /**
     * Removes the OData control annotations (`@odata.etag`, `@odata.context`, `@odata.id`,
     * `<lookup>@odata.bind`, `<lookup>@OData.Community.Display.V1.FormattedValue`, etc.) Dataverse
     * sprinkles onto every record — they are response transport metadata, not columns. Every other
     * source key is preserved (full-record pass-through); the removed keys are declared in
     * {@link ExcludedSourceKeys} so the base re-add doesn't restore them and change-detection ignores them.
     */
    protected override TransformRecord(
        raw: Record<string, unknown>,
        _obj: MJIntegrationObjectEntity,
        _fields: MJIntegrationObjectFieldEntity[]
    ): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (this.IsODataAnnotationKey(key)) continue;
            out[key] = value;
        }
        return out;
    }

    /**
     * The well-known static OData control annotation keys {@link TransformRecord} drops. The base
     * `applyTransformPreservingKeys` uses this to avoid re-adding them. Dataverse ALSO emits dynamic,
     * per-lookup annotation suffixes (`<col>@odata.bind`, `<col>@OData.Community.Display.V1.FormattedValue`,
     * `<col>@Microsoft.Dynamics.CRM.lookuplogicalname`) whose exact names vary by record and cannot be
     * enumerated statically — those are handled by the {@link applyTransformPreservingKeys} override
     * below (predicate exclusion), so they never re-appear. This static list covers the always-present
     * envelope keys for completeness / auditability.
     */
    protected override ExcludedSourceKeys(_objectName: string): string[] {
        return ['@odata.etag', '@odata.context', '@odata.id', '@odata.editLink', '@odata.type'];
    }

    /**
     * Overrides the base re-add so the DYNAMIC OData annotation keys (`<col>@odata.bind`, FormattedValue,
     * lookuplogicalname, etc.) {@link TransformRecord} strips are NOT restored. The base loop re-adds any
     * `raw` key absent from the transform output unless it is in the static {@link ExcludedSourceKeys}
     * set — which can't enumerate the per-record annotation suffixes. Here we re-add a dropped key only
     * when it is neither statically excluded NOR an annotation key (by predicate). This keeps full-record
     * pass-through for genuine columns while making the annotation removal stick (auditable, by rule).
     */
    protected override applyTransformPreservingKeys(
        raw: Record<string, unknown>,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[]
    ): Record<string, unknown> {
        const transformed = this.TransformRecord(raw, obj, fields);
        if (transformed === raw) return raw;
        const excluded = new Set(this.ExcludedSourceKeys(obj.Name));
        const out: Record<string, unknown> = { ...transformed };
        for (const key of Object.keys(raw)) {
            if (key in out || excluded.has(key) || this.IsODataAnnotationKey(key)) continue;
            out[key] = raw[key];
        }
        return out;
    }

    // ─── BaseRESTIntegrationConnector abstract hooks ────────────────

    /**
     * Mints/caches a Microsoft Entra ID access token via client-credentials. The scope is the
     * environment's `.default` (`<EnvironmentUrl>/.default`) so the token's audience matches the
     * Dataverse resource. Token is cached by {@link OAuth2TokenManager} until near expiry.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<DynamicsAuthContext> {
        if (forceRefresh) {
            this.cachedAuth = null;
            this.tokenManager.Reset();
        } else if (this.cachedAuth) {
            // Re-mint through the manager (cheap when cached) so an expired token refreshes.
            const refreshed = await this.MintToken(this.cachedAuth.Config);
            return { ...this.cachedAuth, Token: refreshed };
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const token = await this.MintToken(config);
        const auth: DynamicsAuthContext = {
            Token: token,
            Config: config,
            BaseUrl: config.EnvironmentUrl.replace(/\/+$/, ''), // org root — IO APIPaths are absolute-from-root
            ApiBaseUrl: this.ResolveBaseUrl(config),            // versioned base for the connector's own calls
        };
        this.cachedAuth = auth;
        return auth;
    }

    /** Runs the client_credentials token round-trip through {@link OAuth2TokenManager}. */
    private async MintToken(config: DynamicsConnectionConfig): Promise<string> {
        const authorityHost = (config.AuthorityHost ?? DEFAULT_AUTHORITY_HOST).replace(/\/+$/, '');
        const tokenURL = `${authorityHost}/${encodeURIComponent(config.TenantId)}/oauth2/v2.0/token`;
        const scope = config.Scope ?? `${config.EnvironmentUrl.replace(/\/+$/, '')}/.default`;
        const req: OAuth2TokenRequest = {
            TokenURL: tokenURL,
            ClientId: config.ClientId,
            ClientSecret: config.ClientSecret,
            // Entra ID v2.0 accepts client_id/client_secret in the form body for confidential clients.
            Scopes: scope,
            ScopeParam: 'scope',
            TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
        const token = await this.tokenManager.GetAccessToken(req, 'client_credentials');
        return token.AccessToken;
    }

    /** Standard OData/Dataverse headers — bearer token + JSON + OData version + return-representation. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = auth.Token ?? '';
        return {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            // Ask Dataverse to return the created/updated record so create can read OData-EntityId / body.
            'Prefer': 'return=representation',
        };
    }

    /**
     * HTTP transport with retry/backoff on 429/503/504 (Dataverse service-protection limits). The
     * thrown error on a retryable status carries the response headers so {@link ExtractRetryAfterMs}
     * can read `Retry-After` for the engine's adaptive bucket.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const config = (auth as DynamicsAuthContext).Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const response = await this.ExecuteOneRequest(url, method, headers, body, timeoutMs);
            if (this.IsRetryable(response) && attempt < maxRetries) {
                const delay = this.ComputeBackoffDelay(attempt, response.Headers['retry-after']);
                await this.Sleep(delay);
                continue;
            }
            return response;
        }
        throw new Error(`DynamicsDataverseConnector: exhausted ${maxRetries + 1} attempts for ${method} ${url}`);
    }

    /**
     * Unwraps the OData collection envelope's `value` array. A single-record GET (`/<set>(id)`) is
     * returned as a one-element array. Honors a metadata-declared `ResponseDataKey` if set, defaulting
     * to the OData `value` convention.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null || typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        const key = responseDataKey ?? 'value';
        const data = body[key];
        if (Array.isArray(data)) return data as Record<string, unknown>[];
        // Single-record detail response (has at least one non-annotation key) → wrap.
        const hasRecordShape = Object.keys(body).some(k => !this.IsODataAnnotationKey(k));
        return hasRecordShape ? [body] : [];
    }

    /**
     * Cursor pagination via `@odata.nextLink`. The nextLink is an ABSOLUTE continuation URL that
     * encodes the exact next request (including the opaque `$skiptoken`); it is followed VERBATIM and
     * never hand-built. A present nextLink means another page exists.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        _currentOffset: number,
        _pageSize: number
    ): PaginationState {
        const body = rawBody as ODataCollectionResponse<unknown>;
        const nextLink = body?.['@odata.nextLink'];
        return {
            HasMore: typeof nextLink === 'string' && nextLink.length > 0,
            NextCursor: typeof nextLink === 'string' ? nextLink : undefined,
        };
    }

    /**
     * Per-connection base the engine joins the IO `APIPath` onto. The frozen Dataverse IO APIPaths are
     * ABSOLUTE-from-root (they already include `/api/data/v9.2/...`), so this returns the org ROOT
     * (`<EnvironmentUrl>`) and the resolved request URL is `<EnvironmentUrl>/api/data/v9.2/<entityset>`.
     * The versioned Web API base (`<EnvironmentUrl>/api/data/v9.2`) is `ApiBaseUrl`, used by the
     * connector's OWN calls (WhoAmI / EntityDefinitions / delta). Never a hardcoded org URL.
     */
    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as DynamicsAuthContext).BaseUrl;
    }

    /**
     * Honors the OData `@odata.nextLink` cursor (used verbatim) and otherwise injects the page-size
     * request as a `$top`-free first page — Dataverse caps page size via the `Prefer: odata.maxpagesize`
     * header (added in {@link MakeFirstPageHeaders}), NOT a query param, and does NOT support `$skip`.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        _obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        _effectivePageSize?: number
    ): string {
        // A cursor is the full nextLink continuation URL — issue it exactly as Dataverse returned it.
        if (cursor && cursor.length > 0) return cursor;
        return basePath;
    }

    // ─── Create-response ID extraction (OData-EntityId header) ───────

    /**
     * Dataverse returns the created record's URI in the `OData-EntityId` response header
     * (e.g. `https://org.crm.dynamics.com/api/data/v9.2/accounts(00000000-...)`); the GUID is the
     * trailing `(...)` segment. Falls back to the `Location` header, then the body PK, so a tenant
     * configured to return-representation still resolves. An empty ID makes the create FAIL LOUDLY
     * via the base's BuildCreatedResult (never a silent duplicate-create).
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        if (!idLocation || idLocation === 'header') {
            const headers = response.Headers ?? {};
            const entityId = headers['odata-entityid'] ?? headers['OData-EntityId'] ?? headers['location'] ?? headers['Location'];
            if (typeof entityId === 'string' && entityId.length > 0) {
                const m = entityId.match(/\(([^)]+)\)\s*$/); // GUID inside the trailing (...)
                if (m) return m[1];
                const seg = entityId.match(/[/=]([^/?&#]+)$/);
                return seg ? seg[1] : entityId;
            }
        }
        // Body fallback — return=representation echoes the record; the PK is `<set-singular>id` but the
        // generic id-field scan also covers `id`.
        if (response.Body && typeof response.Body === 'object') {
            const b = response.Body as Record<string, unknown>;
            for (const k of Object.keys(b)) {
                if (/id$/i.test(k) && (typeof b[k] === 'string' || typeof b[k] === 'number')) {
                    const v = String(b[k]);
                    if (v.length > 0) return v;
                }
            }
        }
        return super.ExtractIDFromResponse(response, idLocation);
    }

    /**
     * Substitutes the target ID into a Dataverse single-record path. Supports the standard GUID form
     * `/<entityset>(id)` AND the alternate-key upsert form `/<entityset>(<altkey>='<value>')` — when
     * the ExternalID already contains an `=` it is an alternate-key expression and is inserted as-is
     * (only the value is escaped); otherwise it is treated as a GUID. Handles both `({id})` template
     * placeholders and a bare `(id)` suffix.
     */
    protected override SubstituteIDInPath(
        path: string,
        externalID: string,
        idLocation: string | null
    ): string {
        if (idLocation && idLocation !== 'path') return path;
        const keyExpr = this.BuildKeyExpression(externalID);
        // Replace an explicit {id}/{ID}/{ExternalID} placeholder if present...
        if (/\{(?:id|ID|ExternalID)\}/.test(path)) {
            return path
                .replace(/\{ID\}/g, keyExpr)
                .replace(/\{id\}/g, keyExpr)
                .replace(/\{ExternalID\}/g, keyExpr);
        }
        // ...otherwise inject into the `(...)` segment the metadata path declares (`/accounts({id})`
        // came pre-substituted above; a literal `/accounts()` or `/accounts` gets the key appended).
        if (/\(\s*\)\s*$/.test(path)) {
            return path.replace(/\(\s*\)\s*$/, `(${keyExpr})`);
        }
        return `${path.replace(/\/+$/, '')}(${keyExpr})`;
    }

    /**
     * Builds the OData key expression for a single-record path. A plain GUID → `00000000-...`. An
     * alternate-key expression (`key='value'` or `k1='v1',k2='v2'`) is passed through with each value
     * single-quote-escaped. This realizes the alternate-key upsert path form the metadata may declare.
     */
    private BuildKeyExpression(externalID: string): string {
        if (externalID.includes('=')) {
            // Alternate-key form: keep `key='...'` pairs, escape embedded single quotes in values.
            return externalID.replace(/'([^']*)'/g, (_full, v: string) => `'${v.replace(/'/g, "''")}'`);
        }
        return externalID; // GUID — Dataverse accepts the bare GUID inside the parentheses.
    }

    // ─── Change-tracking delta sync ──────────────────────────────────

    /** Whether a table is configured for change tracking (Configuration.changeTrackingHeader present). */
    private ObjectUsesChangeTracking(obj: MJIntegrationObjectEntity): boolean {
        const header = this.readObjectConfigString(obj, 'changeTrackingHeader');
        return header != null && /track-changes/i.test(header);
    }

    /**
     * Fetches changed records via Dataverse change tracking. The watermark holds the previous poll's
     * `@odata.deltaLink` (a full URL carrying `$deltatoken`) — followed VERBATIM. Deleted records
     * arrive as `$deletedEntity` references; they are surfaced with `IsDeleted=true`. The last page's
     * `@odata.deltaLink` becomes the new watermark for the next poll.
     */
    private async FetchChangesViaDelta(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);

        // The watermark is the prior deltaLink (a full URL); if it's not a URL, build the initial
        // delta request off the object's read path with the track-changes Prefer header.
        const deltaUrl = ctx.WatermarkValue && /^https?:\/\//.test(ctx.WatermarkValue)
            ? ctx.WatermarkValue
            : this.buildDataverseURL(auth.BaseUrl, obj.APIPath);

        const headers = { ...this.BuildHeaders(auth), Prefer: 'odata.track-changes,return=representation' };
        const response = await this.MakeHTTPRequest(auth, deltaUrl, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Dataverse delta fetch failed for "${obj.Name}": HTTP ${response.Status} — ${this.previewBody(response.Body)}`);
        }

        const body = response.Body as ODataCollectionResponse<Record<string, unknown>>;
        const rows = body.value ?? [];
        const nextLink = body['@odata.nextLink'];
        const deltaLink = body['@odata.deltaLink'];

        const records: ExternalRecord[] = rows.map(r => this.DeltaRowToExternalRecord(r, obj, fields, pkFieldNames));

        return {
            Records: records,
            HasMore: typeof nextLink === 'string' && nextLink.length > 0,
            NextCursor: typeof nextLink === 'string' ? nextLink : undefined,
            // Only persist the new high-water deltaLink once the full delta set has drained (last page).
            NewWatermarkValue: typeof deltaLink === 'string' ? deltaLink : undefined,
        };
    }

    /** Maps one change-tracking row (live record OR `$deletedEntity` tombstone) to an ExternalRecord. */
    private DeltaRowToExternalRecord(
        raw: Record<string, unknown>,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        pkFieldNames: string[]
    ): ExternalRecord {
        const isDeleted = typeof raw['@odata.context'] === 'string' && /\$deletedEntity/i.test(raw['@odata.context'] as string);
        const transformed = this.applyTransformPreservingKeys(raw, obj, fields);
        const idFieldName = pkFieldNames[0];
        const externalID = idFieldName && transformed[idFieldName] != null
            ? String(transformed[idFieldName])
            : (typeof raw['id'] === 'string' ? raw['id'] : '');
        return {
            ExternalID: externalID,
            ObjectType: obj.Name,
            Fields: transformed, // full source record (minus annotations) — custom-column pass-through
            IsDeleted: isDeleted,
        };
    }

    // ─── EntityDefinitions describe helpers ──────────────────────────

    /** Fetches the full table list via `EntityDefinitions` (paged, following @odata.nextLink). */
    private async FetchEntityDefinitions(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<DataverseEntityMetadata[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const select = '$select=LogicalName,EntitySetName,DisplayName,Description,PrimaryIdAttribute,PrimaryNameAttribute,ChangeTrackingEnabled,IsCustomEntity';
        let url: string | undefined = `${auth.ApiBaseUrl}/EntityDefinitions?${select}`;
        const out: DataverseEntityMetadata[] = [];
        while (url) {
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status < 200 || response.Status >= 300) {
                throw new Error(`EntityDefinitions describe failed: HTTP ${response.Status} — ${this.previewBody(response.Body)}`);
            }
            const body = response.Body as ODataCollectionResponse<DataverseEntityMetadata>;
            for (const e of body.value ?? []) out.push(e);
            url = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : undefined;
        }
        return out;
    }

    /** Describes one table + its Attributes by logical name. Returns null if not visible to the credential. */
    private async FetchEntityDefinition(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<DataverseEntityMetadata | null> {
        const auth = await this.Authenticate(companyIntegration, contextUser);
        const logicalName = this.ResolveLogicalName(companyIntegration, objectName);
        const expand = '$expand=Attributes($select=LogicalName,SchemaName,DisplayName,Description,AttributeType,MaxLength,Precision,IsValidForCreate,IsValidForUpdate,IsPrimaryId,RequiredLevel,Targets)';
        const select = '$select=LogicalName,EntitySetName,DisplayName,Description,PrimaryIdAttribute,PrimaryNameAttribute,ChangeTrackingEnabled,IsCustomEntity';
        const url = `${auth.ApiBaseUrl}/EntityDefinitions(LogicalName='${encodeURIComponent(logicalName)}')?${select}&${expand}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status === 404) return null;
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`EntityDefinition describe failed for "${objectName}": HTTP ${response.Status} — ${this.previewBody(response.Body)}`);
        }
        return response.Body as DataverseEntityMetadata;
    }

    /** Resolves the Dataverse logical name for an IO (Configuration.logicalName, else the IO name). */
    private ResolveLogicalName(companyIntegration: MJCompanyIntegrationEntity, objectName: string): string {
        const obj = this.tryGetCachedObjectFor(companyIntegration.IntegrationID, objectName);
        if (obj) {
            const logical = this.readObjectConfigString(obj, 'logicalName');
            if (logical) return logical;
        }
        return objectName;
    }

    /** Maps a Dataverse table describe entry → ExternalObjectSchema. */
    private EntityMetadataToObjectSchema(e: DataverseEntityMetadata): ExternalObjectSchema {
        const name = e.LogicalName as string;
        return {
            Name: name,
            Label: this.LocalizedLabel(e.DisplayName) ?? name,
            Description: this.LocalizedLabel(e.Description) ?? undefined,
            SupportsIncrementalSync: e.ChangeTrackingEnabled === true || true, // modifiedon fallback always available
            SupportsWrite: true, // Dataverse tables are generally CRUD-capable; per-table messages refine downstream
        };
    }

    /** Maps a Dataverse attribute describe entry → ExternalFieldSchema. */
    private AttributeMetadataToFieldSchema(a: DataverseAttributeMetadata, primaryId: string): ExternalFieldSchema {
        const name = a.LogicalName as string;
        const isPk = a.IsPrimaryId === true || name === primaryId;
        const requiredLevel = a.RequiredLevel?.Value;
        const isRequired = requiredLevel === 'SystemRequired' || requiredLevel === 'ApplicationRequired';
        // A scalar Lookup attribute that names a single target table is a FK. A polymorphic lookup
        // (multiple Targets) or non-Lookup attribute is NOT emitted as an FK (provable-only).
        const isLookup = a.AttributeType === 'Lookup' || a.AttributeType === 'Customer' || a.AttributeType === 'Owner';
        const singleTarget = isLookup && Array.isArray(a.Targets) && a.Targets.length === 1 ? a.Targets[0] : null;
        return {
            Name: name,
            Label: this.LocalizedLabel(a.DisplayName) ?? name,
            Description: this.LocalizedLabel(a.Description) ?? undefined,
            DataType: a.AttributeType ?? 'String',
            IsRequired: isRequired,
            IsUniqueKey: isPk,
            IsPrimaryKey: isPk,
            IsReadOnly: a.IsValidForCreate === false && a.IsValidForUpdate === false,
            IsForeignKey: singleTarget != null,
            ForeignKeyTarget: singleTarget,
            MaxLength: typeof a.MaxLength === 'number' ? a.MaxLength : null,
            Precision: typeof a.Precision === 'number' ? a.Precision : null,
        };
    }

    /** Reads a Dataverse localized label, falling back to undefined. */
    private LocalizedLabel(label: { UserLocalizedLabel?: { Label?: string } | null } | null | undefined): string | undefined {
        const text = label?.UserLocalizedLabel?.Label;
        return typeof text === 'string' && text.length > 0 ? text : undefined;
    }

    // ─── Config parsing ──────────────────────────────────────────────

    /** Parses the connection config, preferring the attached MJ Credential over Configuration JSON. */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<DynamicsConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('DynamicsDataverseConnector requires either CredentialID or Configuration JSON on the CompanyIntegration');
    }

    /** Loads the OAuth2 config from the MJ: Credentials entity Values JSON. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<DynamicsConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('Dynamics credential could not be loaded or has no Values JSON');
        }
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are read case-insensitively. */
    private ValidateConfig(raw: unknown): DynamicsConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Dynamics configuration is not a valid object');
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

        const tenantId = getStr('tenantid', 'tenant_id', 'tenant');
        const clientId = getStr('clientid', 'client_id', 'applicationid', 'appid');
        const clientSecret = getStr('clientsecret', 'client_secret', 'secret');
        const environmentUrl = getStr('environmenturl', 'environment_url', 'resource', 'orgurl', 'org_url', 'baseurl', 'base_url');

        if (!tenantId) throw new Error('Dynamics configuration missing required field: TenantId');
        if (!clientId) throw new Error('Dynamics configuration missing required field: ClientId');
        if (!clientSecret) throw new Error('Dynamics configuration missing required field: ClientSecret');
        if (!environmentUrl) throw new Error('Dynamics configuration missing required field: EnvironmentUrl');

        return {
            TenantId: tenantId,
            ClientId: clientId,
            ClientSecret: clientSecret,
            EnvironmentUrl: environmentUrl.replace(/\/+$/, ''),
            ApiVersion: getStr('apiversion', 'api_version') ?? DEFAULT_API_VERSION,
            AuthorityHost: getStr('authorityhost', 'authority_host', 'authority'),
            Scope: getStr('scope', 'scopes'),
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: getNum('minrequestintervalms') ?? 0,
            MaxPageSize: Math.min(getNum('maxpagesize') ?? MAX_ODATA_PAGE_SIZE, MAX_ODATA_PAGE_SIZE),
        };
    }

    /** Resolves the Web API base URL: `<EnvironmentUrl>/api/data/v9.2`. */
    private ResolveBaseUrl(config: DynamicsConnectionConfig): string {
        const version = config.ApiVersion ?? DEFAULT_API_VERSION;
        return `${config.EnvironmentUrl.replace(/\/+$/, '')}/api/data/${version}`;
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    private async ExecuteOneRequest(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body !== undefined && method !== 'GET' && method !== 'DELETE'
                    ? JSON.stringify(body)
                    : undefined,
                signal: controller.signal,
            });
            const responseHeaders = this.ExtractHeaders(response.headers);
            const parsedBody = await this.ParseResponseBody(response);
            return { Status: response.status, Body: parsedBody, Headers: responseHeaders };
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    private async ParseResponseBody(response: Response): Promise<unknown> {
        const text = await response.text();
        if (!text) return null;
        try {
            return JSON.parse(text) as unknown;
        } catch {
            return text;
        }
    }

    private ExtractHeaders(headers: Headers): Record<string, string> {
        const map: Record<string, string> = {};
        headers.forEach((value, key) => {
            map[key.toLowerCase()] = value;
        });
        return map;
    }

    private IsRetryable(response: RESTResponse): boolean {
        return response.Status === 429 || response.Status === 503 || response.Status === 504;
    }

    private ComputeBackoffDelay(attempt: number, retryAfterHeader?: string): number {
        if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                return Math.min(parsed * 1000, 120_000);
            }
        }
        return Math.min(Math.pow(2, attempt) * 1000, 30_000);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Small utilities ─────────────────────────────────────────────

    /**
     * True for any OData/Dataverse annotation key. Genuine columns never contain `@`; every annotation
     * does — the response-level controls (`@odata.etag`, `@odata.context`, …) and the per-column
     * suffixes (`<col>@odata.bind`, `<col>@OData.Community.Display.V1.FormattedValue`,
     * `<col>@Microsoft.Dynamics.CRM.lookuplogicalname`). So an `@`-containing key is an annotation.
     */
    private IsODataAnnotationKey(key: string): boolean {
        return key.includes('@');
    }

    private buildDataverseURL(baseURL: string, apiPath: string): string {
        const base = baseURL.replace(/\/+$/, '');
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        return `${base}${path}`;
    }

    private previewBody(body: unknown): string {
        const s = typeof body === 'string' ? body : JSON.stringify(body);
        return (s ?? '').slice(0, 500);
    }

    /** Integration ID of the most recent fetch — lets the no-arg StableOrderingKey hook locate the IO. */
    private lastIntegrationID: string | null = null;

    /**
     * Best-effort cached-object lookup by NAME using the last-seen integration ID. Used by
     * {@link StableOrderingKey}, which the engine calls without a CompanyIntegration; returns null
     * (keyset resume simply unavailable) before any fetch has run.
     */
    private tryGetCachedObject(objectName: string): MJIntegrationObjectEntity | null {
        if (!this.lastIntegrationID) return null;
        return this.tryGetCachedObjectFor(this.lastIntegrationID, objectName);
    }

    private tryGetCachedObjectFor(integrationID: string, objectName: string): MJIntegrationObjectEntity | null {
        if (!integrationID) return null;
        try {
            return this.GetCachedObject(integrationID, objectName);
        } catch {
            return null;
        }
    }

    /** Reads a trimmed string from an IO's Configuration JSON, tolerant of absent/invalid. */
    private readObjectConfigString(obj: MJIntegrationObjectEntity, key: string): string | null {
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

    /** Extracts response headers from a thrown error, when the connector throws an error carrying them. */
    private extractHeadersFromError(error: unknown): Record<string, string> | undefined {
        if (error && typeof error === 'object') {
            const e = error as { Headers?: Record<string, string>; headers?: Record<string, string> };
            return e.Headers ?? e.headers;
        }
        return undefined;
    }
}

/** Tree-shaking prevention function — import and call from the package entry point. */
export function LoadDynamicsDataverseConnector(): void { /* no-op */ }
