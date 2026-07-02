/**
 * NeonCRMConnector — Integration connector for the Neon CRM (Neon One) REST API v2.
 *
 * API docs / spec:
 *   - https://developer.neoncrm.com/api-v2/  (developer portal)
 *   - OAS3 spec v2.11 (credential-free — the catalog source-of-record; objects/fields
 *     are seeded as Declared metadata, NOT baked into this connector)
 *
 * ── Auth: HTTP Basic (org id + API key) ─────────────────────────────────────
 *   `Authorization: Basic base64(orgId:apiKey)` per RFC 7617. The header is built via
 *   the shared {@link buildBasicAuthHeaderValue} auth-helper — base64/crypto is NEVER
 *   inlined here (connector-code-conventions "no inline crypto" rule). Neon CRM's
 *   developer docs explicitly state OAuth2 is for constituent (end-user) auth only and
 *   is NOT supported for system-user API access, so Basic is the only wired path.
 *
 * ── API versioning ──────────────────────────────────────────────────────────
 *   Every request carries the `NEON-API-VERSION` header (default `2.11`, overridable via
 *   the credential / Configuration). Omitting it defaults to latest server-side; an
 *   invalid/deprecated version yields a 4XX.
 *
 * ── Base URL ────────────────────────────────────────────────────────────────
 *   `https://api.neoncrm.com/v2` (the integration's NavigationBaseURL), overridable via
 *   the credential's BaseURL for sandbox/trial pods.
 *
 * ── Catalog (metadata-driven, NOT hardcoded) ───────────────────────────────
 *   Objects/fields come from the Declared metadata in
 *   `metadata/integrations/neon-crm/.neon-crm.integration.json` (seeded from the
 *   credential-free OAS3 spec) and loaded into the IntegrationEngineBase cache. There is
 *   NO module-level object/field catalog in this connector — discovery reads the full
 *   universe straight from the cache (the base-class default).
 *
 * ── Pagination ──────────────────────────────────────────────────────────────
 *   Neon uses page-number pagination: `currentPage` (0-based) + `pageSize` (max 200) query
 *   params, with a `pagination` envelope ({ currentPage, pageSize, totalPages, totalResults })
 *   on list/search responses. {@link ExtractPaginationInfo} reads `pagination.totalPages`.
 *
 * ── Incremental ─────────────────────────────────────────────────────────────
 *   Metadata-driven. An IO with `SupportsIncrementalSync=true` carries
 *   `IncrementalWatermarkField='timestamps.lastModifiedDateTime'`; watermark advancement
 *   reads the latest lastModifiedDateTime from the fetched batch on the final batch only
 *   (partial-failure-safe).
 *
 *   SERVER-SIDE narrowing (matrix C1): for a POST-search door (Activity, Donation, Order, …)
 *   whose door has a documented last-modified SEARCH FIELD, the incremental pass appends a
 *   `{ field, operator:'GREATER_AND_EQUAL', value:<yyyy-MM-dd watermark> }` criterion to the
 *   SearchRequest.searchFields (the OAS3 SearchRequest shape) so the API returns ONLY changed
 *   records. The search-field name is resolved from `Configuration.WatermarkSearchField` (per-
 *   connection override) or the connector's DOOR_WATERMARK_SEARCH_FIELD map of Neon-documented
 *   standard fields; on first sync (no watermark) NO criterion is sent (full pull). Doors with no
 *   documented date search field — and ALL GET-list / nested-descent objects (a door-level date
 *   filter would narrow by the PARENT's date, not the leaf's, and is lossy) — keep content-hash
 *   narrowing, which is the correct, lossless fallback (just not server-narrowed).
 *
 * ── Write ───────────────────────────────────────────────────────────────────
 *   Full CRUD for the writable objects (Accounts, Donations, Events, EventRegistrations,
 *   Memberships, Activities, Grants, Campaigns, Pledges, Webhooks, …) is metadata-driven
 *   through the base BaseRESTIntegrationConnector generic per-operation CRUD path. The ONE
 *   override is CreateRecord for donation/payment-class objects: a 2xx-but-no-id response or
 *   a write timeout must NOT be blindly retried — reconcile-before-retry (see the override).
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    buildBasicAuthHeaderValue,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type RateLimitPolicy,
    type CreateRecordContext,
    type CRUDResult,
    type ExternalRecord,
    computeContentHash,
    serializeKeyValue,
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

// ─── Constants ───────────────────────────────────────────────────────

/** The canonical MJ: Integrations.Name — part of the three-way invariant. */
const INTEGRATION_NAME = 'Neon CRM';

/** The Account IntegrationObject name (its accountId PK is nested — see TransformRecord, DEFECT 1). */
const ACCOUNT_OBJECT_NAME = 'Account';

/** The scalar account-id field name (top-level PK; nested inside individual/companyAccount on the wire). */
const ACCOUNT_ID_FIELD = 'accountId';

/** Default API base URL (the integration NavigationBaseURL); overridable per-credential. */
const DEFAULT_BASE_URL = 'https://api.neoncrm.com/v2';

/** Default Neon API version sent in the NEON-API-VERSION header. */
const DEFAULT_API_VERSION = '2.11';

/** Header Neon uses for API versioning. */
const API_VERSION_HEADER = 'NEON-API-VERSION';

/** Neon page-number pagination params. currentPage is 0-based. */
const PAGE_PARAM = 'currentPage';
const PAGE_SIZE_PARAM = 'pageSize';
/** Neon caps a page at 200 rows regardless of a larger requested pageSize. */
const NEON_MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 200;

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Object-name patterns whose writes are financial / non-idempotent (donations, payments,
 * pledges, orders, recurring donations). A 2xx-without-id response or a timeout on these
 * MUST be reconciled before any retry — see {@link CreateRecord}.
 */
const FINANCIAL_WRITE_PATTERN = /donation|payment|pledge|order|installment|recurring/i;

// ─── Configuration & Auth Types ──────────────────────────────────────

/**
 * Neon CRM connection configuration, parsed from the attached MJ Credential (preferred)
 * or the CompanyIntegration.Configuration JSON. Field names are read case-insensitively.
 * NONE of these values are read at build time — resolved from the bound credential at runtime.
 */
export interface NeonCRMConnectionConfig {
    /** Neon organization id — the HTTP Basic userid. */
    OrgID: string;
    /** Neon API key — the HTTP Basic password. */
    APIKey: string;
    /** API base URL (defaults to https://api.neoncrm.com/v2). */
    BaseURL: string;
    /** NEON-API-VERSION header value (defaults to 2.11). */
    APIVersion: string;
    /** Maximum retries for transient (429/503/network) failures. Default 3. */
    MaxRetries: number;
    /** HTTP request timeout in ms. Default 30000. */
    RequestTimeoutMs: number;
}

/** Extended REST auth context carrying the resolved Basic header + config. */
interface NeonCRMAuthContext extends RESTAuthContext {
    /** Pre-built `Basic <base64>` Authorization header value. */
    AuthorizationHeader: string;
    /** Resolved base URL. */
    BaseUrl: string;
    /** Parsed connection config for reference in MakeHTTPRequest. */
    Config: NeonCRMConnectionConfig;
}

/** Neon list/search envelope: `{ <dataKey>: [...], pagination: {...} }`. */
interface NeonPagination {
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    totalResults?: number;
}

// ─── Enumeration Configuration (metadata-driven) ─────────────────────
//
// The corrected Declared metadata carries, per active IntegrationObject, a `Configuration` JSON
// describing HOW to ENUMERATE that object. This connector READS it (never bakes it). Three modes:
//   1. Direct collection, GET   — ListMethod="GET", nesting="(direct collection)".
//   2. Direct collection, POST  — ListMethod="POST" + ListBody (a search request body).
//   3. Access-path descent       — nesting is a chain (e.g. "Account -> pledges[] -> pledgePayments[]"):
//                                  list the DOOR (its listMethod), then descend the chain IN MEMORY.

/** Sentinel `nesting` value meaning "the door collection IS this object's records" (no descent). */
const DIRECT_COLLECTION = '(direct collection)';

/** The Neon search pagination envelope key that page-number is injected into for POST listing. */
const SEARCH_PAGINATION_KEY = 'pagination';

/** The Neon SearchRequest array key carrying the filter criteria (OAS3 SearchRequest.searchFields). */
const SEARCH_FIELDS_KEY = 'searchFields';

/**
 * Neon's documented "greater-than-or-equal" search operator (OAS3 SearchCriteria.operator enum).
 * A `>=` criterion on the door's last-modified search field is how we server-narrow an incremental
 * pull to records changed at/after the watermark.
 */
const SEARCH_OP_GREATER_AND_EQUAL = 'GREATER_AND_EQUAL';

/**
 * Documented standard last-modified SEARCH FIELD name per POST-search door, used to build the
 * incremental `GREATER_AND_EQUAL` criterion. These are the Neon-documented standard search-field
 * DISPLAY names (the value the OAS3 `SearchCriteria.field` expects) for each door's
 * `/search/searchFields` catalog — NOT the response field (`timestamps.lastModifiedDateTime`).
 * Provable-only: a door appears here ONLY when Neon documents a last-modified standard search field
 * for it. Doors absent from this map (and GET-list objects) get NO server-side filter — content-hash
 * narrowing remains the correct, lossless fallback. A per-connection metadata override
 * (`Configuration.WatermarkSearchField`) takes precedence over this map.
 */
const DOOR_WATERMARK_SEARCH_FIELD: Readonly<Record<string, string>> = {
    '/accounts/search': 'Account Last Modified Date/Time',
};

/** Access-path block emitted per IO: how to reach this object's records from a queryable door. */
interface NeonAccessPath {
    /** The queryable entry path (e.g. `/accounts`, `/donations/search`). */
    door?: string;
    /** Descent chain from the door's record type to this object's records, or `(direct collection)`. */
    nesting?: string;
    /** Door list verb (`GET` | `POST`). */
    listMethod?: string;
    /** Door-level args (reserved; not currently emitted with values). */
    args?: unknown[];
}

/** Parsed per-IO enumeration configuration read from MJIntegrationObjectEntity.Configuration. */
interface NeonObjectConfig {
    /** Verb used to LIST this object's door (`GET` | `POST`). Defaults to GET. */
    ListMethod: string;
    /** Search request body to POST when ListMethod=POST. */
    ListBody?: Record<string, unknown>;
    /** Access path block (door + nesting chain). */
    AccessPath?: NeonAccessPath;
    /** By-id detail path, if declared. */
    DetailAPIPath?: string;
    /**
     * Per-connection override for the POST-search door's last-modified SEARCH FIELD display name
     * (the value the OAS3 `SearchCriteria.field` expects). When set, the incremental
     * `GREATER_AND_EQUAL` criterion uses this; otherwise the connector falls back to
     * {@link DOOR_WATERMARK_SEARCH_FIELD} keyed by the door path. Absent both ⇒ no server-side filter.
     */
    WatermarkSearchField?: string;
}

/** One parsed segment of a nesting chain. `IsList` ⇒ the field is array-valued (`name[]`). */
interface NestingSegment {
    /** Field name on the parent record (chain segment after the first). */
    Name: string;
    /** Whether this segment was declared array-valued (`name[]`). */
    IsList: boolean;
}

// ─── Connector Implementation ────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'NeonCRMConnector')
export class NeonCRMConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run. */
    private authCache: NeonCRMAuthContext | null = null;

    /** Current watermark value, available to FetchChanges-driven filtering. */
    private currentWatermark: string | undefined;

    // Returns the EXACT MJ: Integrations.Name string LITERAL so the T1 ThreeWayName
    // invariant can statically parse the getter's returned value from connector source.
    public override get IntegrationName(): string { return 'Neon CRM'; }

    // ── Capability getters: METADATA-DRIVEN (no hardcoded answer) ─────
    //
    // Write capability FOLLOWS the per-operation CRUD columns on the cached IntegrationObjects
    // (Declared metadata). An object is create-capable when it declares both CreateAPIPath +
    // CreateMethod; same for update/delete. With no write metadata authored the surface is
    // read-only (false). The base generic CRUD path executes the populated columns.

    public override get SupportsCreate(): boolean {
        return this.anyObjectDeclares(o => !!o.CreateAPIPath && !!o.CreateMethod);
    }
    public override get SupportsUpdate(): boolean {
        return this.anyObjectDeclares(o => !!o.UpdateAPIPath && !!o.UpdateMethod);
    }
    public override get SupportsDelete(): boolean {
        return this.anyObjectDeclares(o => !!o.DeleteAPIPath && !!o.DeleteMethod);
    }

    /** True when any cached IntegrationObject satisfies the predicate. []→false when the
     *  engine cache is unavailable (capability probed before configuration) — fail-safe read-only. */
    private anyObjectDeclares(pred: (o: MJIntegrationObjectEntity) => boolean): boolean {
        const integration = IntegrationEngineBase.Instance.GetIntegrationByName(INTEGRATION_NAME);
        if (!integration) return false;
        return IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integration.ID).some(pred);
    }

    // ── Sync-efficiency hooks (evidence-backed) ──────────────────────
    //
    // Neon's documented per-app rate limit is conservative; the integration BatchMaxRequestCount=5
    // reflects the documented per-window request budget. A modest token bucket keeps a large
    // 119-object sync inside the vendor's window. Retry-After is parsed in MakeHTTPRequest.
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 5, Burst: 5, ThrottleBackoffFactor: 0.5 };
    }

    /** Parse Neon's Retry-After (seconds or http-date) into ms for the engine's AIMD bucket. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const e = error as { RetryAfterMs?: number; retryAfterMs?: number };
        if (typeof e.RetryAfterMs === 'number') return e.RetryAfterMs;
        if (typeof e.retryAfterMs === 'number') return e.retryAfterMs;
        return undefined;
    }

    // ── Per-record transform: nested-account-id flattening (DEFECT 1) ─
    //
    // Neon's GET /accounts returns each account as `{ individualAccount: { accountId, ... } }`
    // OR `{ companyAccount: { accountId, ... } }` — the scalar `accountId` that is the Account PK
    // lives ONE LEVEL DOWN. Without lifting it to the top level the connector's PK detection finds
    // nothing → content-hash identity → drift / duplicate rows on re-sync. We lift the nested id to
    // a TOP-LEVEL `accountId` for the Account object (and the per-id detail GET which is also an
    // Account record). FULL-RECORD PASS-THROUGH is preserved: we ONLY ADD `accountId`; the nested
    // `individualAccount` / `companyAccount` blobs are never dropped. The metadata declares
    // Account.accountId as the PK separately — this hook just makes the field exist at top level.
    protected override TransformRecord(
        raw: Record<string, unknown>,
        obj: MJIntegrationObjectEntity,
        _fields: MJIntegrationObjectFieldEntity[]
    ): Record<string, unknown> {
        if (obj.Name === ACCOUNT_OBJECT_NAME) {
            return this.liftNestedAccountId(raw);
        }
        return raw;
    }

    /**
     * Lifts a nested `individualAccount.accountId` / `companyAccount.accountId` to a top-level
     * `accountId` WITHOUT overwriting an existing top-level value and WITHOUT dropping the nested
     * blobs (full-record pass-through). Returns the input unchanged when there is nothing to lift.
     * Reused by {@link TransformRecord} (Account direct sync) and by the access-path descent's
     * door-PK resolution (so a Consent leaf can be stamped with its account's id — DEFECT 2).
     */
    private liftNestedAccountId(raw: Record<string, unknown>): Record<string, unknown> {
        const existing = raw[ACCOUNT_ID_FIELD];
        if (existing != null && serializeKeyValue(existing).length > 0) {
            return raw; // already top-level — nothing to lift
        }
        const nested =
            this.readNestedAccountId(raw.individualAccount) ??
            this.readNestedAccountId(raw.companyAccount);
        if (nested == null) return raw;
        return { ...raw, [ACCOUNT_ID_FIELD]: nested };
    }

    /** Reads a scalar `accountId` from a nested individual/company account blob, if present. */
    private readNestedAccountId(blob: unknown): string | number | undefined {
        if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return undefined;
        const v = (blob as Record<string, unknown>)[ACCOUNT_ID_FIELD];
        return typeof v === 'string' || typeof v === 'number' ? v : undefined;
    }

    // ── Write override: reconcile-before-retry for financial objects ──
    //
    // GENUINELY IDIOSYNCRATIC. Neon donation/payment/pledge/order/recurring writes are
    // FINANCIAL and non-idempotent: a network timeout or a 2xx-without-id response after a
    // POST may mean the charge/record was actually created server-side. Blindly retrying
    // (the generic path's caller might) risks a DOUBLE donation/charge. So for these objects
    // we mark the result so the engine does NOT auto-retry on timeout — the operator must
    // reconcile by external id / account / amount / timestamp first (per the source test plan's
    // critical warning). Non-financial creates ride the base generic path unchanged.
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const isFinancial = FINANCIAL_WRITE_PATTERN.test(ctx.ObjectName);
        try {
            // Delegate the actual request construction to the base generic per-operation CRUD path
            // (reads CreateAPIPath/Method/BodyShape/BodyKey/IDLocation; routes through BuildCreatedResult,
            // which already fails LOUDLY on a 2xx-without-id — exactly the no-silent-duplicate guard
            // a financial write needs).
            return await super.CreateRecord(ctx);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (isFinancial && this.isTimeoutError(err)) {
                // Do NOT signal a transient/retryable error to the engine — a financial write whose
                // response we never saw may have SUCCEEDED server-side. Surface a non-retryable failure
                // instructing reconcile-before-retry.
                return {
                    Success: false,
                    StatusCode: 0,
                    ErrorMessage:
                        `Neon CRM ${ctx.ObjectName} create did not return a confirmed response (timeout). ` +
                        `RECONCILE BEFORE RETRY — the record may already exist server-side. ` +
                        `Reconcile by external id / account / amount / timestamp / returned transaction id ` +
                        `before re-issuing this write. Underlying: ${message}`,
                };
            }
            throw err;
        }
    }

    /** Whether an error is a request timeout / aborted fetch (distinct from a clean non-2xx response). */
    private isTimeoutError(err: unknown): boolean {
        if (!(err instanceof Error)) return false;
        const msg = err.message.toLowerCase();
        return msg.includes('timeout') || msg.includes('abort') || msg.includes('timed out');
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    /**
     * HTTP Basic authentication. Builds the `Basic base64(orgId:apiKey)` header via the
     * shared auth-helper (no inline base64). Credential bytes are resolved at runtime.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const authorizationHeader = buildBasicAuthHeaderValue({
            Username: config.OrgID,
            Password: config.APIKey,
        });

        const auth: NeonCRMAuthContext = {
            AuthorizationHeader: authorizationHeader,
            BaseUrl: config.BaseURL,
            Config: config,
        };
        this.authCache = auth;
        return auth;
    }

    /** Sends the Basic auth header + NEON-API-VERSION + JSON content negotiation on every request. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const neon = auth as NeonCRMAuthContext;
        return {
            'Authorization': neon.AuthorizationHeader,
            [API_VERSION_HEADER]: neon.Config?.APIVersion ?? DEFAULT_API_VERSION,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as NeonCRMAuthContext).BaseUrl;
    }

    /**
     * Normalizes Neon CRM responses. Handles the real shapes:
     *   1. List/search envelope `{ <dataKey>: [...], pagination: {...} }` — the dataKey is the
     *      resource collection (e.g. `accounts`, `searchResults`, `donations`, `memberships`).
     *      When ResponseDataKey is set on the IO we read it; otherwise we auto-detect the first
     *      array-valued property that is NOT the `pagination` envelope.
     *   2. Raw array at the root.
     *   3. Single object — per-id GET endpoints return ONE record (often itself wrapped, e.g.
     *      `{ accountId, individualAccount: {...} }`); kept as a single-element list.
     *
     * The FULL source record passes through (no field filtering) so the framework's custom-column
     * capture sees everything Neon returned.
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

            // Explicit data key wins when authored.
            if (responseDataKey && Array.isArray(body[responseDataKey])) {
                return body[responseDataKey] as Record<string, unknown>[];
            }

            // Auto-detect the collection array in a Neon list/search envelope.
            const collection = this.findCollectionArray(body);
            if (collection) return collection;

            // Single-object detail record (per-id GET). Keep it.
            return [body];
        }

        return [];
    }

    /**
     * Finds the records array inside a Neon list/search envelope. Neon names the collection
     * after the resource (`accounts`, `donations`, `memberships`, `searchResults`, …) and always
     * carries a sibling `pagination` object. We pick the first array-valued property that is not
     * `pagination`. Returns null when no collection array is present (a single-object response).
     */
    private findCollectionArray(body: Record<string, unknown>): Record<string, unknown>[] | null {
        for (const [key, value] of Object.entries(body)) {
            if (key === 'pagination') continue;
            if (Array.isArray(value)) return value as Record<string, unknown>[];
        }
        return null;
    }

    /**
     * Derives Neon page-number pagination state. Neon returns a `pagination` envelope with
     * `currentPage` (0-based), `totalPages`, `totalResults`. More pages remain while
     * currentPage + 1 < totalPages. Falls back to an empty-page terminator when no envelope.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (!rawBody || typeof rawBody !== 'object') {
            return { HasMore: false };
        }
        const body = rawBody as Record<string, unknown>;
        const pagination = body.pagination as NeonPagination | undefined;

        if (pagination && typeof pagination.totalPages === 'number') {
            // Neon's currentPage is 0-based. Prefer the envelope's value over our request counter.
            const serverPage = typeof pagination.currentPage === 'number' ? pagination.currentPage : currentPage;
            const total = typeof pagination.totalResults === 'number' ? pagination.totalResults : undefined;
            const hasMore = serverPage + 1 < pagination.totalPages;
            return hasMore
                ? { HasMore: true, NextPage: serverPage + 1, TotalRecords: total }
                : { HasMore: false, TotalRecords: total };
        }

        // No pagination envelope: terminate on an empty collection (avoids infinite loops).
        const collection = this.findCollectionArray(body);
        if (!collection || collection.length === 0) {
            return { HasMore: false };
        }
        return { HasMore: true, NextPage: currentPage + 1, NextOffset: currentOffset + collection.length };
    }

    /**
     * Emits Neon page-number pagination params: `currentPage` (0-based) + `pageSize` (capped at
     * the vendor's 200 ceiling). currentPage is page-1 because the base loop counts from 1.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        _offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const requested = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const pageSize = Math.min(requested, NEON_MAX_PAGE_SIZE);
        const separator = basePath.includes('?') ? '&' : '?';
        // Base loop's `page` is 1-based; Neon is 0-based.
        const neonPage = Math.max(0, page - 1);
        return `${basePath}${separator}${PAGE_PARAM}=${neonPage}&${PAGE_SIZE_PARAM}=${pageSize}`;
    }

    /**
     * Executes an HTTP request with retry/backoff for 429/503 and transient network errors.
     * Parses Neon's Retry-After header into the error so ExtractRetryAfterMs can surface it.
     * NOTE: retry is applied to GET/idempotent reads and to non-financial writes only — the
     * CreateRecord override above handles the financial reconcile-before-retry contract.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const neon = auth as NeonCRMAuthContext;
        const maxRetries = neon.Config?.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = neon.Config?.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const isWrite = method !== 'GET' && method !== 'HEAD';

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const fetchOptions: RequestInit = {
                method,
                headers,
                signal: AbortSignal.timeout(timeoutMs),
            };
            if (body !== undefined && isWrite) {
                fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            }

            let response: Response;
            try {
                response = await fetch(url, fetchOptions);
            } catch (err) {
                // Never auto-retry a WRITE on a network/timeout error — the request may have landed
                // server-side (financial double-write risk). Surface to the caller (CreateRecord
                // override) for reconcile-before-retry.
                if (!isWrite && attempt < maxRetries && this.isTransientNetworkError(err)) {
                    await this.sleep(this.backoffDelay(attempt));
                    continue;
                }
                throw err;
            }

            if ((response.status === 429 || response.status === 503) && !isWrite && attempt < maxRetries) {
                await this.sleep(this.retryAfterMs(response) ?? this.backoffDelay(attempt));
                continue;
            }

            return this.buildRESTResponse(response);
        }

        throw new Error(`Neon CRM request failed after ${maxRetries + 1} attempts: ${url}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by listing one account via GET /accounts?currentPage=0&pageSize=1.
     * A 2xx confirms the Basic credentials (org id + API key) + base URL are valid. 401/403 are
     * surfaced with clear messages (auth failure path); a network error is surfaced too.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as NeonCRMAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.BaseUrl.replace(/\/+$/, '')}/accounts?${PAGE_PARAM}=0&${PAGE_SIZE_PARAM}=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status === 401) {
                return { Success: false, Message: 'Neon CRM authentication failed (HTTP 401) — check org id + API key.' };
            }
            if (response.Status === 403) {
                return { Success: false, Message: 'Neon CRM authorization failed (HTTP 403) — the API key user lacks permission.' };
            }
            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `Neon CRM returned HTTP ${response.Status} from ${url}` };
            }
            return {
                Success: true,
                Message: `Connected to Neon CRM at ${auth.BaseUrl}`,
                ServerVersion: `Neon CRM API v${auth.Config.APIVersion}`,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery (metadata-driven, no hardcoded catalog) ───────────

    /**
     * Discovers the full object universe from the IntegrationEngineBase cache (the Declared
     * metadata seeded from Neon's credential-free OAS3 spec). NEVER a hardcoded catalog; never
     * sampled at build. When no Declared metadata is loaded (a credential-free static self-check
     * with no DB-backed engine), this throws explicitly so credential-free tiers SKIP honestly
     * rather than misread an empty result as catalog drift.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const seeded = await super.DiscoverObjects(companyIntegration, contextUser);
        if (seeded.length > 0) return seeded;
        throw new Error(
            'Neon CRM DiscoverObjects requires the Declared metadata to be loaded into the ' +
            'IntegrationEngine cache (via `mj sync push`). The object catalog is runtime-seeded ' +
            'Declared metadata (from the credential-free OAS3 spec), not a statically reproducible ' +
            'code constant.'
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

    // ─── FetchChanges override (enumeration + watermark advancement) ─

    /**
     * Enumerates an object's records per the THREE metadata-driven enumeration modes (read from the
     * IO's Configuration), then advances the watermark from the returned records on the FINAL batch
     * only (partial-failure-safe — a mid-batch failure leaves the watermark unchanged so the next sync
     * resumes from the same point). Watermark advancement reads the latest
     * `timestamps.lastModifiedDateTime` (Neon's documented incremental cursor).
     *
     *   Mode 1 — Direct collection, GET   → delegate to the base GET pagination path (super.FetchChanges).
     *   Mode 2 — Direct collection, POST  → POST the Configuration.ListBody to APIPath, paginate via body.
     *   Mode 3 — Access-path descent       → list the DOOR, then descend the nesting chain in memory.
     *
     * Mode is inferred from the IO's parsed Configuration; a missing/GET-direct Configuration keeps the
     * exact prior behavior (the 34 direct-GET objects ride the base path unchanged).
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue ?? undefined;

        const result = await this.dispatchEnumeration(ctx);

        const isFinal = !result.HasMore;
        const newWatermark = isFinal
            ? (this.extractLatestModifiedDate(result.Records) ?? ctx.WatermarkValue ?? undefined)
            : undefined;

        return { ...result, NewWatermarkValue: newWatermark };
    }

    /** Routes the fetch to the GET-direct base path, POST-search listing, or access-path descent. */
    private async dispatchEnumeration(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const cfg = this.parseObjectConfig(obj);

        // Access-path descent: nesting is a real chain (not the direct-collection sentinel).
        const nesting = cfg.AccessPath?.nesting;
        if (nesting && nesting !== DIRECT_COLLECTION) {
            return this.fetchViaAccessPath(ctx, obj, cfg);
        }

        // Direct collection via POST search.
        if (this.isPostList(cfg)) {
            return this.fetchViaPostSearch(ctx, obj, cfg);
        }

        // Direct collection via GET — the base GET pagination path already handles this correctly.
        return super.FetchChanges(ctx);
    }

    // ─── Enumeration: parsing the per-IO Configuration ───────────────

    /** Parses the IO's Configuration JSON into a typed NeonObjectConfig (GET-direct default on absence). */
    private parseObjectConfig(obj: MJIntegrationObjectEntity): NeonObjectConfig {
        const raw = (obj as unknown as { Configuration?: string | null }).Configuration;
        if (!raw || typeof raw !== 'string') return { ListMethod: 'GET' };
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return { ListMethod: 'GET' };
        }
        const accessPath = this.coerceAccessPath(parsed.AccessPath);
        const listMethod = this.coerceString(parsed.ListMethod) ?? accessPath?.listMethod ?? 'GET';
        return {
            ListMethod: listMethod.toUpperCase(),
            ListBody: this.coerceRecord(parsed.ListBody),
            AccessPath: accessPath,
            DetailAPIPath: this.coerceString(parsed.DetailAPIPath),
            WatermarkSearchField: this.coerceString(parsed.WatermarkSearchField),
        };
    }

    /** Narrows an unknown AccessPath blob to the typed shape (provable-only — undefined when absent). */
    private coerceAccessPath(raw: unknown): NeonAccessPath | undefined {
        if (!raw || typeof raw !== 'object') return undefined;
        const ap = raw as Record<string, unknown>;
        return {
            door: this.coerceString(ap.door),
            nesting: this.coerceString(ap.nesting),
            listMethod: this.coerceString(ap.listMethod),
            args: Array.isArray(ap.args) ? ap.args : undefined,
        };
    }

    /** True when this object's door must be LISTED via POST (search). */
    private isPostList(cfg: NeonObjectConfig): boolean {
        const verb = (cfg.AccessPath?.listMethod ?? cfg.ListMethod).toUpperCase();
        return verb === 'POST';
    }

    private coerceString(v: unknown): string | undefined {
        return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
    }
    private coerceRecord(v: unknown): Record<string, unknown> | undefined {
        return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
    }

    // ─── Mode 2: direct collection via POST search ───────────────────

    /**
     * Lists a direct-collection object whose door is a POST `/…/search` endpoint. POSTs the
     * Configuration.ListBody (parsed JSON) to APIPath, parses the same Neon envelope as GET, and
     * paginates by injecting the page into the POST body's `pagination` object
     * (`{"pagination":{"currentPage":N,"pageSize":M}}`). Returns a single full batch.
     */
    private async fetchViaPostSearch(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity,
        cfg: NeonObjectConfig
    ): Promise<FetchBatchResult> {
        const auth = (await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser)) as NeonCRMAuthContext;
        const fields = this.GetCachedFields(obj.ID);
        const door = cfg.AccessPath?.door ?? obj.APIPath;
        // Server-side incremental narrowing: inject the GREATER_AND_EQUAL date criterion into the
        // search body when a watermark is present AND this door has a resolvable last-modified search
        // field (matrix C1 fix). On first sync (no watermark) this returns the body unchanged → full pull.
        const listBody = this.buildIncrementalListBody(cfg, door, this.currentWatermark);
        const raw = await this.listAllViaPost(auth, door, listBody, obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE);
        const pkFieldNames = this.findPKFieldNames(fields);
        return {
            Records: raw.map(r => this.buildExternalRecord(this.applyTransformPreservingKeys(r, obj, fields), ctx.ObjectName, pkFieldNames)),
            HasMore: false,
        };
    }

    // ─── Mode 3: access-path descent ─────────────────────────────────

    /**
     * Lists the DOOR (via GET or POST per the access path), then descends the in-memory nesting chain
     * to collect the LEAF records of `obj`. Each leaf carries the FULL leaf object in `Fields`
     * (full-record pass-through), is tagged with the resolved ancestor FK id(s), and uses its own
     * declared PK for identity (the synthetic content-hash fallback covers PK-less leaves).
     */
    private async fetchViaAccessPath(
        ctx: FetchContext,
        obj: MJIntegrationObjectEntity,
        cfg: NeonObjectConfig
    ): Promise<FetchBatchResult> {
        const door = cfg.AccessPath?.door;
        const nesting = cfg.AccessPath?.nesting;
        if (!door || !nesting) {
            return this.zeroWithWarning(ctx.ObjectName, 'ACCESS_PATH_INCOMPLETE',
                `"${ctx.ObjectName}": access-path Configuration missing door or nesting chain — cannot enumerate.`);
        }

        const auth = (await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser)) as NeonCRMAuthContext;
        const fields = this.GetCachedFields(obj.ID);
        const segments = this.parseNestingChain(nesting);
        // The first chain segment names the door's record type, NOT a field to descend.
        const descentSegments = segments.slice(1);

        const doorRecords = await this.listDoor(auth, door, cfg, obj);
        // Leaf IOFs whose RelatedIntegrationObjectID points at an ANCESTOR object — these get stamped
        // with the originating ancestor's id (e.g. Consent.accountId ← the door Account's accountId).
        const fkTagFields = this.resolveAncestorFKFields(fields);

        const leaves: ExternalRecord[] = [];
        const pkFieldNames = this.findPKFieldNames(fields);
        for (const parent of doorRecords) {
            // Resolve the DOOR (root ancestor) record's PK value(s) FIRST — for the Account door this
            // requires the nested-id lift (DEFECT 1), so collectParentTags reads accountId reliably.
            // The door's tags seed the accumulator that descends the whole chain (DEFECT 2).
            const doorTags = this.collectParentTags(parent, fkTagFields);
            for (const leaf of this.descendNesting(parent, descentSegments, fkTagFields, doorTags)) {
                leaves.push(this.buildExternalRecord(
                    this.applyTransformPreservingKeys(leaf, obj, fields), ctx.ObjectName, pkFieldNames
                ));
            }
        }

        if (leaves.length === 0) {
            return this.zeroWithWarning(ctx.ObjectName, 'ACCESS_PATH_EMPTY',
                `"${ctx.ObjectName}": door "${door}" returned ${doorRecords.length} record(s) but the nesting chain "${nesting}" yielded no leaf records.`);
        }
        return { Records: leaves, HasMore: false };
    }

    /**
     * Lists the access-path door, choosing GET or POST-search per the access path's listMethod.
     * NOTE: NO server-side watermark filter is applied here. A date filter on the DOOR would narrow
     * by the PARENT's last-modified date, which is NOT the LEAF object's watermark — filtering doors
     * could drop leaf records whose owning parent wasn't modified recently (lossy). For nested/descent
     * objects, content-hash narrowing remains the correct, lossless incremental strategy.
     */
    private async listDoor(
        auth: NeonCRMAuthContext,
        door: string,
        cfg: NeonObjectConfig,
        obj: MJIntegrationObjectEntity
    ): Promise<Record<string, unknown>[]> {
        const pageSize = obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        if (this.isPostList(cfg)) {
            return this.listAllViaPost(auth, door, cfg.ListBody ?? {}, pageSize);
        }
        return this.listAllViaGet(auth, door, pageSize);
    }

    /** Splits a nesting chain string ("A -> b[] -> c") into typed segments (IsList for `[]`). */
    private parseNestingChain(nesting: string): NestingSegment[] {
        return nesting.split('->').map(part => {
            const token = part.trim();
            const isList = token.endsWith('[]');
            return { Name: isList ? token.slice(0, -2).trim() : token, IsList: isList };
        }).filter(s => s.Name.length > 0);
    }

    /**
     * Descends the nesting segments from a single door record IN MEMORY, collecting the leaf records,
     * CARRYING the ancestor FK tags down the WHOLE chain (DEFECT 2). A `[]` segment expands an
     * array-valued field (iterate each element); a plain segment dives into an object-valued field
     * (single child). Records and primitives are skipped gracefully. Recurses so ≥2-level chains
     * (e.g. pledges[] -> pledgePayments[]) are supported.
     *
     * `fkTagFields` is the leaf's set of ancestor-FK field names; `inheritedTags` is the accumulator
     * seeded with the DOOR (root ancestor) record's resolved PK value(s). At EACH descended node we
     * re-collect FK values present on that node (so a nearer ancestor — e.g. an intermediate Pledge —
     * overrides a farther one), then at the leaf we stamp every accumulated tag the leaf does NOT
     * already carry (the leaf's own value always wins). This makes the door's `accountId` reach a
     * Consent leaf in `Account -> individualAccount -> consent`, while preserving the existing
     * immediate-parent / 1-level behavior.
     */
    private descendNesting(
        node: unknown,
        segments: NestingSegment[],
        fkTagFields: string[],
        inheritedTags: Record<string, string>
    ): Record<string, unknown>[] {
        if (segments.length === 0) {
            if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
            return [this.stampInheritedTags(node as Record<string, unknown>, inheritedTags)];
        }
        if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
        const [head, ...rest] = segments;
        const child = (node as Record<string, unknown>)[head.Name];
        if (child == null) return [];

        const children = head.IsList
            ? (Array.isArray(child) ? child : [])
            : [child];
        const out: Record<string, unknown>[] = [];
        for (const c of children) {
            // Merge any ancestor-FK values THIS node carries (nearer ancestor wins) before recursing.
            const nextTags = this.mergeNodeTags(inheritedTags, c, fkTagFields);
            for (const leaf of this.descendNesting(c, rest, fkTagFields, nextTags)) out.push(leaf);
        }
        return out;
    }

    /** Merges an intermediate node's own ancestor-FK values into the accumulator (node value wins). */
    private mergeNodeTags(
        inherited: Record<string, string>,
        node: unknown,
        fkTagFields: string[]
    ): Record<string, string> {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return inherited;
        const nodeTags = this.collectParentTags(node as Record<string, unknown>, fkTagFields);
        return Object.keys(nodeTags).length === 0 ? inherited : { ...inherited, ...nodeTags };
    }

    /** Stamps accumulated ancestor FK id(s) onto a leaf, never overwriting an id the leaf already carries. */
    private stampInheritedTags(leaf: Record<string, unknown>, tags: Record<string, string>): Record<string, unknown> {
        if (Object.keys(tags).length === 0) return leaf;
        const out = { ...leaf };
        for (const [k, v] of Object.entries(tags)) {
            if (out[k] == null || serializeKeyValue(out[k]).length === 0) out[k] = v;
        }
        return out;
    }

    /**
     * Resolves, from the leaf object's own IOFs, the FK field names that point at an ancestor object
     * (RelatedIntegrationObjectID set). These are the columns to populate from an ancestor record so the
     * leaf links back to its owner.
     */
    private resolveAncestorFKFields(fields: MJIntegrationObjectFieldEntity[]): string[] {
        return fields.filter(f => f.RelatedIntegrationObjectID).map(f => f.Name);
    }

    /**
     * Reads each ancestor-FK value from an ancestor record so it can be stamped onto the leaf. Applies
     * the nested-account-id lift first so the DOOR Account record's nested `accountId` (DEFECT 1) is
     * found — then reads the matching FK key (e.g. `accountId`, `pledgeId`). Neon ancestor records carry
     * their own id under a key whose name matches the leaf's FK field name.
     */
    private collectParentTags(parent: Record<string, unknown>, fkFields: string[]): Record<string, string> {
        if (fkFields.length === 0) return {};
        const lifted = this.liftNestedAccountId(parent);
        const tags: Record<string, string> = {};
        for (const fk of fkFields) {
            const v = lifted[fk];
            if (v != null && (typeof v === 'string' || typeof v === 'number')) {
                tags[fk] = String(v);
            }
        }
        return tags;
    }

    // ─── Door listing primitives (GET + POST, full pagination) ───────

    /** Lists a door via GET, paginating to exhaustion (Neon 0-based currentPage). Returns all records. */
    private async listAllViaGet(
        auth: NeonCRMAuthContext,
        door: string,
        pageSize: number
    ): Promise<Record<string, unknown>[]> {
        const headers = this.BuildHeaders(auth);
        const baseURL = auth.BaseUrl.replace(/\/+$/, '');
        const size = Math.min(pageSize, NEON_MAX_PAGE_SIZE);
        const all: Record<string, unknown>[] = [];
        let page = 0;
        for (;;) {
            const sep = door.includes('?') ? '&' : '?';
            const url = `${baseURL}${door.startsWith('/') ? door : `/${door}`}${sep}${PAGE_PARAM}=${page}&${PAGE_SIZE_PARAM}=${size}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 403) break;
            const records = this.NormalizeResponse(response.Body, null);
            all.push(...records);
            if (!this.hasMorePages(response.Body, page) || records.length === 0) break;
            page += 1;
        }
        return all;
    }

    /**
     * Lists a door via POST search, paginating to exhaustion by injecting `{pagination:{currentPage,pageSize}}`
     * into the POST body (Neon search pagination). Returns all records.
     */
    private async listAllViaPost(
        auth: NeonCRMAuthContext,
        door: string,
        listBody: Record<string, unknown>,
        pageSize: number
    ): Promise<Record<string, unknown>[]> {
        const headers = this.BuildHeaders(auth);
        const baseURL = auth.BaseUrl.replace(/\/+$/, '');
        const url = `${baseURL}${door.startsWith('/') ? door : `/${door}`}`;
        const size = Math.min(pageSize, NEON_MAX_PAGE_SIZE);
        const all: Record<string, unknown>[] = [];
        let page = 0;
        for (;;) {
            const body = this.buildSearchBody(listBody, page, size);
            const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, body);
            if (response.Status === 403) break;
            const records = this.NormalizeResponse(response.Body, null);
            all.push(...records);
            if (!this.hasMorePages(response.Body, page) || records.length === 0) break;
            page += 1;
        }
        return all;
    }

    /** Builds the POST search body with the page injected into the `pagination` envelope. */
    private buildSearchBody(listBody: Record<string, unknown>, page: number, pageSize: number): Record<string, unknown> {
        const existing = this.coerceRecord(listBody[SEARCH_PAGINATION_KEY]) ?? {};
        return {
            ...listBody,
            [SEARCH_PAGINATION_KEY]: { ...existing, currentPage: page, pageSize },
        };
    }

    // ─── Server-side incremental narrowing (POST-search doors) ───────────

    /**
     * Builds the effective POST-search `ListBody` for the incremental pass: when a watermark is
     * present AND the door has a resolvable last-modified SEARCH FIELD, appends a
     * `{ field, operator: GREATER_AND_EQUAL, value }` criterion to `searchFields` (the OAS3
     * SearchRequest shape) so the API returns ONLY records changed at/after the watermark. On first
     * sync (no watermark) — or for a door with no documented search field — returns the configured
     * ListBody unchanged (full pull; content-hash narrowing remains the lossless fallback).
     *
     * Provable-only: a criterion is emitted ONLY when the search-field name is known — from the
     * per-connection `Configuration.WatermarkSearchField` override or the documented
     * {@link DOOR_WATERMARK_SEARCH_FIELD} map. A criterion is NEVER appended to a `searchFields` the
     * connector already carries one for (idempotent), and the existing authored searchFields are
     * preserved.
     */
    private buildIncrementalListBody(
        cfg: NeonObjectConfig,
        door: string,
        watermark: string | undefined
    ): Record<string, unknown> {
        const base = cfg.ListBody ?? {};
        if (!watermark) return base; // first sync → no filter → full pull

        const searchField = this.resolveWatermarkSearchField(cfg, door);
        if (!searchField) return base; // no documented server-side filter → content-hash fallback

        const value = this.formatNeonSearchDate(watermark);
        if (!value) return base; // unparseable watermark → don't fabricate a criterion

        const existing = Array.isArray(base[SEARCH_FIELDS_KEY])
            ? (base[SEARCH_FIELDS_KEY] as Record<string, unknown>[])
            : [];
        // Idempotency: don't double-append if a criterion for this field is already present.
        if (existing.some(c => c && typeof c === 'object' && c.field === searchField)) return base;

        const criterion = { field: searchField, operator: SEARCH_OP_GREATER_AND_EQUAL, value };
        return { ...base, [SEARCH_FIELDS_KEY]: [...existing, criterion] };
    }

    /**
     * Resolves the door's last-modified SEARCH FIELD display name (the OAS3 SearchCriteria.field
     * value), preferring the per-connection `Configuration.WatermarkSearchField` override, then the
     * documented {@link DOOR_WATERMARK_SEARCH_FIELD} map keyed by the door path. Returns undefined
     * when neither knows the door (⇒ no server-side filter).
     */
    private resolveWatermarkSearchField(cfg: NeonObjectConfig, door: string): string | undefined {
        if (cfg.WatermarkSearchField) return cfg.WatermarkSearchField;
        const normalized = door.startsWith('/') ? door : `/${door}`;
        return DOOR_WATERMARK_SEARCH_FIELD[normalized];
    }

    /**
     * Formats an ISO watermark timestamp to Neon's documented date-search value (`yyyy-MM-dd`).
     * Neon date search fields filter at day granularity; a date-only `>=` is a safe, slightly
     * conservative bound that never drops a same-day record (the engine still re-narrows via
     * content hash). Returns undefined for an unparseable watermark.
     */
    private formatNeonSearchDate(watermark: string): string | undefined {
        const d = new Date(watermark);
        if (isNaN(d.getTime())) return undefined;
        return d.toISOString().slice(0, 10);
    }

    /** Reads the Neon pagination envelope to decide whether another door page remains (0-based). */
    private hasMorePages(rawBody: unknown, currentPage: number): boolean {
        if (!rawBody || typeof rawBody !== 'object') return false;
        const pagination = (rawBody as Record<string, unknown>).pagination as NeonPagination | undefined;
        if (pagination && typeof pagination.totalPages === 'number') {
            const serverPage = typeof pagination.currentPage === 'number' ? pagination.currentPage : currentPage;
            return serverPage + 1 < pagination.totalPages;
        }
        return false;
    }

    // ─── ExternalRecord assembly (mirrors the base's identity logic) ─

    /** Returns the declared PK field names (by Sequence) or ['ID'] fallback — mirrors the base helper. */
    private findPKFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pk = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence);
        return pk.length > 0 ? pk.map(f => f.Name) : ['ID'];
    }

    /**
     * Builds an ExternalRecord with the SAME identity semantics the base uses: declared PK when every
     * component is present + non-empty, else a deterministic content hash (the synthetic-PK fallback for
     * PK-less / partial-key leaves). The FULL record passes through in `Fields` (full-record pass-through).
     */
    private buildExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        const allPkPresent = pkFieldNames.length > 0
            && pkFieldNames.every(name => raw[name] != null && serializeKeyValue(raw[name]).length > 0);
        const joined = pkFieldNames.map(name => serializeKeyValue(raw[name])).join('|');
        const resolvedID = allPkPresent ? joined : computeContentHash(raw);

        // Stamp the synthetic identity into a single empty PK so the codegen reload-by-PK finds the row
        // (matches the base's §4 single-PK fallback). Full record otherwise preserved.
        let fields = raw;
        if (!allPkPresent && pkFieldNames.length === 1
            && (raw[pkFieldNames[0]] == null || serializeKeyValue(raw[pkFieldNames[0]]).length === 0)) {
            fields = { ...raw, [pkFieldNames[0]]: resolvedID };
        }
        return { ExternalID: resolvedID, ObjectType: objectType, Fields: fields };
    }

    /** A zero-record batch carrying a structured FetchWarning so the silent-empty is surfaced. */
    private zeroWithWarning(objectName: string, code: string, message: string): FetchBatchResult {
        return { Records: [], HasMore: false, Warnings: [{ Code: code, Message: message, Data: { object: objectName } }] };
    }

    // ─── Config parsing ──────────────────────────────────────────────

    /**
     * Parses the connection config, preferring the attached MJ Credential over the raw
     * Configuration JSON. Credential bytes are resolved at runtime — never at build.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<NeonCRMConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.parseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.validateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('Neon CRM connector requires either CredentialID or Configuration JSON');
    }

    /** Loads the config from the MJ: Credentials entity Values JSON. */
    private async parseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<NeonCRMConnectionConfig> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) {
            throw new Error('Neon CRM credential could not be loaded or has no Values JSON');
        }
        return this.validateConfig(JSON.parse(cred.Values));
    }

    /** Validates the parsed config + applies defaults. Field names are case-insensitive. */
    private validateConfig(raw: unknown): NeonCRMConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Neon CRM configuration is not a valid object');
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

        const orgID = getStr('orgid', 'org_id', 'organizationid', 'organization_id', 'username');
        if (!orgID) {
            throw new Error('Neon CRM configuration missing required field: OrgID');
        }
        const apiKey = getStr('apikey', 'api_key', 'key', 'password');
        if (!apiKey) {
            throw new Error('Neon CRM configuration missing required field: APIKey');
        }

        return {
            OrgID: orgID,
            APIKey: apiKey,
            BaseURL: (getStr('baseurl', 'base_url') ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
            APIVersion: getStr('apiversion', 'api_version', 'neonapiversion') ?? DEFAULT_API_VERSION,
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
        };
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    /** Extracts the latest timestamps.lastModifiedDateTime across a batch for watermark advancement. */
    private extractLatestModifiedDate(records: { Fields: Record<string, unknown> }[]): string | null {
        let latest: Date | null = null;
        for (const rec of records) {
            const raw = this.readLastModified(rec.Fields);
            if (typeof raw !== 'string' || raw.length === 0) continue;
            const d = new Date(raw);
            if (!isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
        }
        return latest ? latest.toISOString() : null;
    }

    /** Reads timestamps.lastModifiedDateTime (Neon's nested cursor) or a flat top-level fallback. */
    private readLastModified(fields: Record<string, unknown>): string | undefined {
        const ts = fields.timestamps;
        if (ts && typeof ts === 'object') {
            const v = (ts as Record<string, unknown>).lastModifiedDateTime;
            if (typeof v === 'string') return v;
        }
        // Grants expose top-level lastModifiedDate per the Configuration notes.
        for (const k of ['lastModifiedDateTime', 'lastModifiedDate', 'modifiedDate']) {
            const v = fields[k];
            if (typeof v === 'string') return v;
        }
        return undefined;
    }

    /** Parses a Retry-After header (seconds or http-date) into ms, if present. */
    private retryAfterMs(response: Response): number | undefined {
        const header = response.headers.get('retry-after');
        if (!header) return undefined;
        const asSeconds = Number(header);
        if (!isNaN(asSeconds)) return Math.max(0, asSeconds * 1_000);
        const asDate = new Date(header).getTime();
        if (!isNaN(asDate)) return Math.max(0, asDate - Date.now());
        return undefined;
    }

    /** Exponential backoff delay for retry attempts (capped at 30s). */
    private backoffDelay(attempt: number): number {
        return Math.min(1_000 * Math.pow(2, attempt), 30_000);
    }

    /** Checks whether an error is transient (network/timeout). */
    private isTransientNetworkError(err: unknown): boolean {
        if (!(err instanceof Error)) return false;
        const msg = err.message.toLowerCase();
        return msg.includes('timeout') || msg.includes('abort') ||
               msg.includes('econnreset') || msg.includes('econnrefused') ||
               msg.includes('fetch failed');
    }

    /** Builds the normalized RESTResponse from a fetch Response. */
    private async buildRESTResponse(response: Response): Promise<RESTResponse> {
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
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/** Tree-shaking prevention — import and call from the package entry point. */
export function LoadNeonCRMConnector(): void { /* no-op */ }
