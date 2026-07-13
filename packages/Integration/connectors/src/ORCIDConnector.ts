import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
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
    type FetchWarning,
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';

// ─── Connection configuration ─────────────────────────────────────────

/**
 * Per-connection configuration for the ORCID connector.
 *
 * The ORCID Public API has NO list-all-records endpoint — the iD universe is
 * not enumerable. Instead the universe is SCOPED PER CONNECTION via
 * CompanyIntegration.Configuration. At least one of `searchQuery` / `orcidIds`
 * must be provided.
 */
export interface ORCIDConnectionConfig {
    /** OAuth2 client_credentials grant — client identifier. From the credential store. */
    ClientID?: string;
    /** OAuth2 client_credentials grant — client secret. From the credential store. */
    ClientSecret?: string;
    /** OAuth2 token endpoint. Defaults to the production/sandbox host based on UseSandbox. */
    TokenURL?: string;
    /** OAuth2 scope. Defaults to '/read-public'. */
    Scope?: string;
    /** When true, use the ORCID sandbox hosts (sandbox.orcid.org / pub.sandbox.orcid.org). */
    UseSandbox?: boolean;
    /**
     * Lucene query string for GET /search or /expanded-search resolving the iD universe at runtime.
     * Examples: 'affiliation-org-name:"Harvard University"', 'given-names:Albert family-name:Einstein'.
     */
    SearchQuery?: string;
    /** Whether to use /expanded-search instead of /search. Default: false (plain /search). */
    UseExpandedSearch?: boolean;
    /** Explicit list of ORCID iDs to sync directly (in addition to / instead of searchQuery). */
    OrcidIds?: string[];
    /**
     * Upper bound on the number of iDs resolved from a search per sync ("Goldilocks" — do NOT drain
     * the ~10k ORCID cap). Default: 1000. Explicit OrcidIds are always synced and are not bounded.
     */
    MaxSearchResults?: number;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Maximum retries for rate-limited / transient failures. Default: 4. */
    MaxRetries?: number;
    /** Minimum interval between outbound requests (ms). Default: 100 (~10 req/s, well under the 40/s burst cap). */
    MinRequestIntervalMs?: number;
    /**
     * Non-secret API host override (e.g. a local mock for replay testing). When unset, the
     * production/sandbox host is selected by UseSandbox. Same pattern as Path LMS / GrowthZone —
     * required for mock-floor e2e testability.
     */
    ApiBaseUrl?: string;
}

/** Authenticated context carried through one FetchChanges cycle. */
interface ORCIDAuthContext extends RESTAuthContext {
    Token: string;
    ExpiresAt: Date;
    BaseUrl: string;
    Config: ORCIDConnectionConfig;
}

/** Token response from the ORCID OAuth token endpoint. */
interface ORCIDTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string;
}

/** A single result row from GET /search (orcid-identifier.path is the iD). */
interface ORCIDSearchResult {
    'orcid-identifier'?: { path?: string; uri?: string };
}

/** Envelope from GET /search. */
interface ORCIDSearchResponse {
    result?: ORCIDSearchResult[] | null;
    'num-found'?: number;
}

// ─── Constants ────────────────────────────────────────────────────────

const PROD_TOKEN_URL = 'https://orcid.org/oauth/token';
const SANDBOX_TOKEN_URL = 'https://sandbox.orcid.org/oauth/token';
const PROD_API_HOST = 'https://pub.orcid.org/v3.0';
const SANDBOX_API_HOST = 'https://pub.sandbox.orcid.org/v3.0';
const DEFAULT_SCOPE = '/read-public';

/** Refresh the access token 60s before hard expiry. */
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 100;
const DEFAULT_MAX_SEARCH_RESULTS = 1000;
/** ORCID search caps a single page at 1000 rows. */
const SEARCH_PAGE_ROWS = 1000;
/** ORCID documented burst limit is 40 req/s; stay comfortably under it. */
const RATE_LIMIT_TOKENS_PER_SEC = 10;

/** The root IO whose template var {iD} is satisfied directly from the Configuration-scoped universe. */
const ROOT_OBJECT_NAME = 'record';

// ─── Connector implementation ─────────────────────────────────────────

/**
 * Connector for the ORCID Public API v3.0 (read-only).
 *
 * Authenticates via OAuth2 2-legged client_credentials (scope `/read-public`)
 * to obtain a bearer token. ORCID is NOT enumerable — there is no
 * "list all records" endpoint — so every sync is SCOPED per connection via
 * `CompanyIntegration.Configuration` (`searchQuery` Lucene query and/or an
 * explicit `orcidIds` array). FetchChanges resolves the in-scope iD set, then
 * fetches `GET /{iD}/record` (root IO) or `GET /{iD}/<section>` (child IOs)
 * per resolved iD.
 *
 * Pull-only: SupportsCreate/Update/Delete are false (the Public API is
 * read-only; writes require the Member API which is out of scope). Incremental
 * sync narrows client-side on each section's `last-modified-date`; the
 * search-scoped universe has no cursor so it re-resolves each run and dedup
 * rides content-hash idempotency in the base ToExternalRecord path.
 *
 * Rides BaseRESTIntegrationConnector (JSON over HTTP via Accept:
 * application/json). The standard FetchChanges template-var mechanism resolves
 * child sections off ALREADY-SYNCED parent iDs; we override FetchChanges so the
 * ROOT (record) iD set is sourced from the Configuration universe rather than a
 * parent table, then delegate child sections to the same per-iD fan-out.
 */
@RegisterClass(BaseIntegrationConnector, 'ORCIDConnector')
export class ORCIDConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context (token + resolved host). Invalidated on token expiry or 401. */
    private authState: ORCIDAuthContext | null = null;
    /** Timestamp of the last outbound request, used for throttling. */
    private lastRequestTime = 0;

    // ── Capability getters (PULL-ONLY) ──────────────────────────────────

    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }

    public override get IntegrationName(): string { return 'ORCID'; }

    // ── Sync-efficiency hooks ───────────────────────────────────────────

    /**
     * ORCID documents a 40 req/s burst ceiling (HTTP 503 over it) and a daily quota
     * (HTTP 429 with X-Rate-Limit-* + Retry-After). Run conservatively under the burst cap.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: RATE_LIMIT_TOKENS_PER_SEC, Burst: 40, ThrottleBackoffFactor: 0.5 };
    }

    /** Parse ORCID's Retry-After (delta-seconds or HTTP-date) into milliseconds. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        const headers = (error as { Headers?: Record<string, string> })?.Headers;
        if (!headers) return undefined;
        const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
        if (typeof retryAfter !== 'string' || retryAfter.length === 0) return undefined;
        const asSeconds = Number(retryAfter);
        if (!isNaN(asSeconds) && asSeconds >= 0) return Math.round(asSeconds * 1000);
        const asDate = Date.parse(retryAfter);
        if (!isNaN(asDate)) {
            const delta = asDate - Date.now();
            if (delta > 0) return delta;
        }
        return undefined;
    }

    /**
     * The search-scoped iD universe has no stable, monotonic ordering key — it is
     * re-resolved from the Lucene query each run (insert/delete-volatile), so keyset
     * resume is N/A. Dedup rides content-hash idempotency. Returns null for every object.
     */
    public override StableOrderingKey(_objectName: string): string | null { return null; }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Verifies connectivity by obtaining a client_credentials token, then issuing a
     * lightweight authenticated probe against a well-known public iD's /record.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as ORCIDAuthContext;
            // ORCID's canonical sample public record (Sofia Garcia / Josiah Carberry-style); a 200 or 404
            // both prove the token + host are valid (the probe iD may differ between prod and sandbox).
            const probeUrl = `${auth.BaseUrl}/0000-0002-1825-0097/record`;
            const headers = this.BuildHeaders(auth);
            const resp = await this.MakeHTTPRequest(auth, probeUrl, 'GET', headers);
            if (resp.Status === 401 || resp.Status === 403) {
                return { Success: false, Message: `ORCID TestConnection failed: HTTP ${resp.Status} (auth rejected)` };
            }
            if (resp.Status >= 500) {
                return { Success: false, Message: `ORCID TestConnection failed: HTTP ${resp.Status} (server error)` };
            }
            return {
                Success: true,
                Message: `Successfully authenticated against ORCID Public API (${auth.Config.UseSandbox ? 'sandbox' : 'production'}).`,
                ServerVersion: 'ORCID Public API v3.0',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── FetchChanges (Configuration-scoped iD universe) ──────────────

    /**
     * Fetches records for the given object, sourcing the iD universe from
     * CompanyIntegration.Configuration (search query and/or explicit list).
     *
     * - ROOT IO ('record'): fetch GET /{iD}/record for each resolved iD.
     * - CHILD section IOs ('works', 'employments', ...): fetch GET /{iD}/<section>
     *   for each resolved iD and expand the group envelope into individual items.
     *
     * Incremental: for sections that carry `last-modified-date`, narrow client-side
     * to records strictly newer than ctx.WatermarkValue, and return the max-seen
     * watermark as NewWatermarkValue (persisted by the engine on full-batch success
     * only). The iD universe itself has no cursor (search is re-resolved each run);
     * dedup rides content-hash idempotency in ToExternalRecord.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as ORCIDAuthContext;

        const orcidIds = await this.ResolveOrcidIdUniverse(auth, ctx);
        const warnings: FetchWarning[] = [];
        if (orcidIds.length === 0) {
            warnings.push({
                Code: 'ZERO_SCOPE',
                Message:
                    `ORCID "${ctx.ObjectName}": no iDs resolved from CompanyIntegration.Configuration. ` +
                    `Set "searchQuery" (Lucene) and/or "orcidIds" to scope the sync.`,
            });
            return { Records: [], HasMore: false, Warnings: warnings };
        }

        const section = ctx.ObjectName === ROOT_OBJECT_NAME ? null : ctx.ObjectName;
        const watermark = this.parseWatermark(ctx.WatermarkValue);
        const pkFieldNames = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);

        const out: ExternalRecord[] = [];
        let maxSeen = watermark;

        for (const iD of orcidIds) {
            const items = await this.FetchForId(auth, obj, iD, section);
            for (const raw of items) {
                const lmd = this.extractLastModifiedMs(raw);
                // Incremental narrowing: skip records not newer than the watermark.
                if (watermark != null && lmd != null && lmd <= watermark) continue;
                if (lmd != null && (maxSeen == null || lmd > maxSeen)) maxSeen = lmd;
                out.push(this.toRecord(raw, obj, fields, pkFieldNames));
            }
        }

        const result: FetchBatchResult = { Records: out, HasMore: false };
        if (maxSeen != null && maxSeen !== watermark) {
            result.NewWatermarkValue = String(maxSeen);
        }
        if (warnings.length > 0) result.Warnings = warnings;
        return result;
    }

    /**
     * Fetches the raw item array for a single iD + object. For the root record IO this is
     * a single-element array (the record itself); for a section it is the expanded group items.
     */
    private async FetchForId(
        auth: ORCIDAuthContext,
        obj: MJIntegrationObjectEntity,
        iD: string,
        section: string | null
    ): Promise<Record<string, unknown>[]> {
        const path = section == null ? `/${encodeURIComponent(iD)}/record` : `/${encodeURIComponent(iD)}/${section}`;
        const url = `${auth.BaseUrl}${path}`;
        const headers = this.BuildHeaders(auth);
        const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (resp.Status === 404) return [];
        if (resp.Status === 403) {
            console.warn(`[ORCID] HTTP 403 for "${obj.Name}" iD ${iD} — skipping (insufficient scope/visibility).`);
            return [];
        }
        if (resp.Status < 200 || resp.Status >= 300) {
            throw Object.assign(
                new Error(`ORCID fetch failed for "${obj.Name}" iD ${iD}: HTTP ${resp.Status}`),
                { Status: resp.Status, Headers: resp.Headers }
            );
        }
        const body = resp.Body as Record<string, unknown> | null;
        if (!body) return [];
        if (section == null) {
            // The full record — tag with the iD so the PK (orcid-id) is always present.
            body['orcid-id'] = iD;
            return [body];
        }
        return this.expandSection(body, section, iD);
    }

    /**
     * Expands an ORCID activity-section group envelope into individual item objects.
     *
     * ORCID groups items under section-specific wrappers (e.g. works →
     * `group[].work-summary[]`, employments → `affiliation-group[].summaries[]`).
     * We walk the generic shape: any array whose elements carry a `put-code` is a
     * leaf item; we flatten all such arrays found anywhere in the envelope. Each
     * item is tagged with the parent `orcid-id` (the FK to record).
     */
    private expandSection(body: Record<string, unknown>, _section: string, iD: string): Record<string, unknown>[] {
        const items: Record<string, unknown>[] = [];
        const visit = (node: unknown): void => {
            if (Array.isArray(node)) {
                for (const el of node) visit(el);
                return;
            }
            if (node && typeof node === 'object') {
                const obj = node as Record<string, unknown>;
                if ('put-code' in obj && obj['put-code'] != null) {
                    items.push({ ...obj, 'orcid-id': iD });
                    return; // a leaf item — do not descend further into its own children
                }
                for (const v of Object.values(obj)) visit(v);
            }
        };
        visit(body);
        return items;
    }

    // ─── iD universe resolution ──────────────────────────────────────

    /**
     * Resolves the in-scope ORCID iD universe from CompanyIntegration.Configuration:
     * the explicit `orcidIds` list (always included) plus the result of running the
     * Lucene `searchQuery` against /search (or /expanded-search), bounded by
     * MaxSearchResults to avoid draining the ~10k cap. Returns a de-duplicated set.
     */
    private async ResolveOrcidIdUniverse(auth: ORCIDAuthContext, ctx: FetchContext): Promise<string[]> {
        const cfg = auth.Config;
        const ids = new Set<string>();

        for (const explicit of cfg.OrcidIds ?? []) {
            const normalized = this.normalizeOrcidId(explicit);
            if (normalized) ids.add(normalized);
        }

        if (cfg.SearchQuery && cfg.SearchQuery.trim().length > 0) {
            const fromSearch = await this.RunSearch(auth, cfg.SearchQuery, cfg.MaxSearchResults ?? DEFAULT_MAX_SEARCH_RESULTS);
            for (const id of fromSearch) ids.add(id);
        }

        // Honor the engine's per-batch ceiling so a huge universe streams across calls (defensive —
        // typical scoped universes are well under BatchSize).
        const all = Array.from(ids);
        const limit = ctx.BatchSize && ctx.BatchSize > 0 ? ctx.BatchSize : all.length;
        return all.slice(0, limit);
    }

    /**
     * Runs the Lucene query against ORCID /search (or /expanded-search) with offset
     * pagination (start/rows), accumulating iDs up to maxResults ("Goldilocks" bound).
     * Search is unordered and may return duplicates across pages — de-duplicated by the caller.
     */
    private async RunSearch(auth: ORCIDAuthContext, query: string, maxResults: number): Promise<string[]> {
        const path = auth.Config.UseExpandedSearch ? '/expanded-search' : '/search';
        const headers = this.BuildHeaders(auth);
        const collected: string[] = [];
        let start = 0;

        while (collected.length < maxResults) {
            const rows = Math.min(SEARCH_PAGE_ROWS, maxResults - collected.length);
            const url = `${auth.BaseUrl}${path}?q=${encodeURIComponent(query)}&start=${start}&rows=${rows}`;
            const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (resp.Status < 200 || resp.Status >= 300) {
                throw Object.assign(
                    new Error(`ORCID search failed (HTTP ${resp.Status}) for query "${query}"`),
                    { Status: resp.Status, Headers: resp.Headers }
                );
            }
            const body = resp.Body as ORCIDSearchResponse | null;
            const results = body?.result ?? [];
            if (results.length === 0) break;
            for (const r of results) {
                const id = this.normalizeOrcidId(r['orcid-identifier']?.path);
                if (id) collected.push(id);
            }
            start += rows;
            // Stop when the API has returned fewer than a full page (exhausted).
            if (results.length < rows) break;
        }
        return collected;
    }

    /** Normalizes a raw iD string to the canonical 0000-0000-0000-0000 form, or null if unusable. */
    private normalizeOrcidId(raw: string | undefined | null): string | null {
        if (typeof raw !== 'string') return null;
        const trimmed = raw.trim();
        if (trimmed.length === 0) return null;
        // Accept a bare iD or a full URI; take the trailing path segment.
        const seg = trimmed.replace(/\/+$/, '').split('/').pop() ?? trimmed;
        return /^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/i.test(seg) ? seg.toUpperCase() : null;
    }

    // ─── Record transformation ────────────────────────────────────────

    /**
     * Builds the ExternalRecord, preserving the FULL raw source record in Fields
     * (full-record pass-through) while flattening the declared scalar fields out of
     * ORCID's nested JSON via TransformRecord/applyTransformPreservingKeys. PK identity
     * (orcid-id for record, put-code for sections) drives the ExternalID; partial keys
     * fall back to the base content-hash identity.
     */
    private toRecord(
        raw: Record<string, unknown>,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        pkFieldNames: string[]
    ): ExternalRecord {
        const flattened = this.applyTransformPreservingKeys(raw, obj, fields);
        const usablePk = pkFieldNames.length > 0
            && pkFieldNames.every(name => flattened[name] != null && String(flattened[name]).length > 0);
        const externalID = usablePk
            ? pkFieldNames.map(name => String(flattened[name])).join('|')
            : '';
        return {
            ExternalID: externalID, // empty → engine treats as content-hash identity downstream
            ObjectType: obj.Name,
            Fields: flattened,
        };
    }

    /**
     * Per-record reshaping: ORCID returns deeply-nested JSON; pull the declared scalar
     * convenience fields up to the top level so the generated columns are populated, while
     * the full raw record (every nested blob) is preserved by applyTransformPreservingKeys.
     */
    protected override TransformRecord(
        raw: Record<string, unknown>,
        obj: MJIntegrationObjectEntity,
        _fields: MJIntegrationObjectFieldEntity[]
    ): Record<string, unknown> {
        const out: Record<string, unknown> = { ...raw };

        // Common to record + sections: ORCID wraps a millis timestamp as { value: <ms> }.
        out['last-modified-date'] = this.coerceDate(raw['last-modified-date']);
        if ('created-date' in raw) out['created-date'] = this.coerceDate(raw['created-date']);

        if (obj.Name === ROOT_OBJECT_NAME) {
            this.flattenRecordScalars(raw, out);
        }
        return out;
    }

    /** Flattens the record IO's person/history-derived convenience scalars. */
    private flattenRecordScalars(raw: Record<string, unknown>, out: Record<string, unknown>): void {
        const person = this.asObject(raw['person']);
        const name = person ? this.asObject(person['name']) : undefined;
        if (name) {
            out['given-names'] = this.valueOf(name['given-names']);
            out['family-name'] = this.valueOf(name['family-name']);
            out['credit-name'] = this.valueOf(name['credit-name']);
        }
        const biography = person ? this.asObject(person['biography']) : undefined;
        if (biography) out['biography'] = this.valueOf(biography['content']) ?? biography['content'];

        const history = this.asObject(raw['history']);
        if (history) {
            out['submission-date'] = this.coerceDate(history['submission-date']);
            if (typeof history['claimed'] === 'boolean') out['claimed'] = history['claimed'];
            if (typeof history['verified-email'] === 'boolean') out['verified-email'] = history['verified-email'];
        }
        // Convenience JSON sections (kept as-is; full blobs preserved via pass-through).
        const p = person ?? {};
        if (person) {
            out['emails'] = p['emails'];
            out['researcher-urls'] = p['researcher-urls'];
            out['keywords'] = p['keywords'];
            out['other-names'] = p['other-names'];
            out['addresses'] = p['addresses'];
            out['external-identifiers'] = p['external-identifiers'];
        }
    }

    // ── Value coercion helpers ──────────────────────────────────────────

    /** ORCID scalar wrapper: { value: <x> } → <x>; otherwise returns the value as-is. */
    private valueOf(node: unknown): unknown {
        const obj = this.asObject(node);
        if (obj && 'value' in obj) return obj['value'];
        return node;
    }

    /** ORCID date wrapper: { value: <millis> } → ISO string; passthrough on already-scalar/empty. */
    private coerceDate(node: unknown): string | null {
        const ms = this.extractMs(node);
        if (ms == null) return null;
        return new Date(ms).toISOString();
    }

    /** Extracts the last-modified-date millis from a record (for watermark comparison). */
    private extractLastModifiedMs(raw: Record<string, unknown>): number | null {
        return this.extractMs(raw['last-modified-date']);
    }

    /** Pulls a millisecond epoch out of an ORCID timestamp wrapper or a scalar number/ISO string. */
    private extractMs(node: unknown): number | null {
        const obj = this.asObject(node);
        const value = obj && 'value' in obj ? obj['value'] : node;
        if (value == null) return null;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const asNum = Number(value);
            if (Number.isFinite(asNum) && value.trim() !== '') return asNum;
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    private asObject(node: unknown): Record<string, unknown> | undefined {
        return node && typeof node === 'object' && !Array.isArray(node) ? node as Record<string, unknown> : undefined;
    }

    private parseWatermark(value: string | null): number | null {
        if (value == null) return null;
        const ms = this.extractMs(value);
        return ms;
    }

    // ─── Auth + transport (abstract base requirements) ────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authState && this.isTokenValid(this.authState)) {
            return this.authState;
        }
        const config = await this.parseConfig(companyIntegration, contextUser);
        const token = await this.obtainAccessToken(config);
        const state: ORCIDAuthContext = {
            Token: token.access_token,
            ExpiresAt: new Date(Date.now() + (token.expires_in * 1000)),
            BaseUrl: config.ApiBaseUrl ?? (config.UseSandbox ? SANDBOX_API_HOST : PROD_API_HOST),
            Config: config,
        };
        this.authState = state;
        return state;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const orcidAuth = auth as ORCIDAuthContext;
        return {
            'Authorization': `Bearer ${orcidAuth.Token}`,
            'Accept': 'application/json',
        };
    }

    /** Not used by the overridden FetchChanges; retained for any base-pipeline callers (GetRecord). */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (responseDataKey) {
            const obj = this.asObject(rawBody);
            const inner = obj ? obj[responseDataKey] : undefined;
            if (Array.isArray(inner)) return inner as Record<string, unknown>[];
            if (inner && typeof inner === 'object') return [inner as Record<string, unknown>];
            return [];
        }
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody === 'object') return [rawBody as Record<string, unknown>];
        return [];
    }

    /** ORCID per-iD endpoints are not paginated — every object declares PaginationType=None. */
    protected ExtractPaginationInfo(
        _rawBody: unknown,
        _paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        _pageSize: number
    ): PaginationState {
        return { HasMore: false, NextPage: currentPage, NextOffset: currentOffset };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as ORCIDAuthContext).BaseUrl;
    }

    // ─── Token lifecycle ──────────────────────────────────────────────

    private isTokenValid(state: ORCIDAuthContext): boolean {
        return state.ExpiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS;
    }

    /**
     * Exchanges the client_credentials grant for a bearer token at the ORCID token
     * endpoint. POST form: grant_type=client_credentials, client_id, client_secret,
     * scope=/read-public.
     */
    private async obtainAccessToken(config: ORCIDConnectionConfig): Promise<ORCIDTokenResponse> {
        if (!config.ClientID || !config.ClientSecret) {
            throw new Error('ORCIDConnector: ClientID and ClientSecret are required for the client_credentials grant.');
        }
        const tokenUrl = config.TokenURL ?? (config.UseSandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL);
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.ClientID,
            client_secret: config.ClientSecret,
            scope: config.Scope ?? DEFAULT_SCOPE,
        });
        const resp = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: params.toString(),
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`ORCID OAuth token request failed (HTTP ${resp.status}): ${text.slice(0, 500)}`);
        }
        const payload = await resp.json() as ORCIDTokenResponse;
        if (!payload.access_token || typeof payload.access_token !== 'string') {
            throw new Error('ORCID OAuth token response missing access_token');
        }
        return payload;
    }

    // ─── HTTP transport with retry + throttling ───────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const orcidAuth = auth as ORCIDAuthContext;
        const cfg = orcidAuth.Config;
        const maxRetries = cfg.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = cfg.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = cfg.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
        let currentHeaders = headers;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.throttle(minInterval);
            try {
                const resp = await this.doFetch(url, method, currentHeaders, body, timeoutMs);
                this.lastRequestTime = Date.now();

                if (resp.Status === 401 && attempt < maxRetries) {
                    // Token expired/revoked — drop the cache, refresh against the held credentials, retry.
                    this.authState = null;
                    const refreshed = await this.obtainAccessToken(cfg);
                    const refreshedState: ORCIDAuthContext = {
                        Token: refreshed.access_token,
                        ExpiresAt: new Date(Date.now() + (refreshed.expires_in * 1000)),
                        BaseUrl: cfg.ApiBaseUrl ?? (cfg.UseSandbox ? SANDBOX_API_HOST : PROD_API_HOST),
                        Config: cfg,
                    };
                    this.authState = refreshedState;
                    currentHeaders = this.BuildHeaders(refreshedState);
                    continue;
                }
                if ((resp.Status === 429 || resp.Status === 503) && attempt < maxRetries) {
                    await this.sleep(this.backoffFromResponse(resp, attempt));
                    continue;
                }
                return resp;
            } catch (err: unknown) {
                if (attempt === maxRetries) throw err;
                if (!this.isRetryableError(err)) throw err;
                await this.sleep(this.backoffMs(attempt));
            }
        }
        throw new Error(`ORCID request to ${url} exhausted ${maxRetries + 1} attempts`);
    }

    /** Single fetch() with an AbortController-backed timeout. */
    private async doFetch(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const handle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            const respHeaders: Record<string, string> = {};
            resp.headers.forEach((value, key) => { respHeaders[key.toLowerCase()] = value; });
            const text = await resp.text();
            const parsed = text.length > 0 ? this.safeParseJSON(text) : null;
            return { Status: resp.status, Body: parsed, Headers: respHeaders };
        } finally {
            clearTimeout(handle);
        }
    }

    private safeParseJSON(text: string): unknown {
        try { return JSON.parse(text) as unknown; } catch { return text; }
    }

    private isRetryableError(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return /abort|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(msg);
    }

    private backoffMs(attempt: number): number {
        const base = Math.min(1000 * Math.pow(2, attempt), 20000);
        const jitter = Math.floor(Math.random() * 500);
        return base + jitter;
    }

    private backoffFromResponse(resp: RESTResponse, attempt: number): number {
        const fromHeader = this.ExtractRetryAfterMs({ Headers: resp.Headers });
        if (fromHeader != null) return Math.min(fromHeader, 30000);
        return this.backoffMs(attempt);
    }

    private async throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) await this.sleep(minIntervalMs - elapsed);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Config parsing ───────────────────────────────────────────────

    /**
     * Resolves the connection config: OAuth2 secrets (ClientID/ClientSecret/TokenURL/Scope) from the
     * credential store; the iD-universe scope (searchQuery/orcidIds) + host selection (useSandbox)
     * from CompanyIntegration.Configuration. Secrets are NEVER baked into code.
     */
    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ORCIDConnectionConfig> {
        const fromCredential = companyIntegration.CredentialID
            ? await this.loadFromCredential(companyIntegration.CredentialID, contextUser)
            : null;
        const fromConfig = this.parseConfigurationJson(companyIntegration.Configuration);

        const merged: ORCIDConnectionConfig = { ...fromCredential, ...fromConfig };
        // Credential secrets win over any duplicate in Configuration; scope/host win from Configuration.
        if (fromCredential) {
            merged.ClientID = fromCredential.ClientID ?? merged.ClientID;
            merged.ClientSecret = fromCredential.ClientSecret ?? merged.ClientSecret;
            merged.TokenURL = fromCredential.TokenURL ?? merged.TokenURL;
            merged.Scope = merged.Scope ?? fromCredential.Scope;
        }

        if (!merged.ClientID || !merged.ClientSecret) {
            throw new Error(
                'ORCIDConnector: ClientID and ClientSecret must be provided via the credential store ' +
                '(OAuth2 client_credentials).'
            );
        }
        if ((!merged.SearchQuery || merged.SearchQuery.trim().length === 0) && (!merged.OrcidIds || merged.OrcidIds.length === 0)) {
            // Not fatal at auth time — surfaced as a ZERO_SCOPE warning per object in FetchChanges.
            merged.OrcidIds = [];
        }
        return merged;
    }

    /** Parses the non-secret scope/host config from CompanyIntegration.Configuration JSON. */
    private parseConfigurationJson(raw: string | null): Partial<ORCIDConnectionConfig> {
        if (!raw || raw.trim().length === 0) return {};
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            throw new Error('ORCIDConnector: CompanyIntegration.Configuration is not valid JSON.');
        }
        const out: Partial<ORCIDConnectionConfig> = {};
        const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
        out.SearchQuery = str(parsed['searchQuery']);
        out.UseExpandedSearch = parsed['useExpandedSearch'] === true;
        out.UseSandbox = parsed['useSandbox'] === true;
        if (Array.isArray(parsed['orcidIds'])) {
            out.OrcidIds = (parsed['orcidIds'] as unknown[]).filter(x => typeof x === 'string') as string[];
        }
        if (typeof parsed['maxSearchResults'] === 'number') out.MaxSearchResults = parsed['maxSearchResults'] as number;
        // Allow non-secret OAuth host overrides from Configuration (secrets never live here).
        out.TokenURL = str(parsed['tokenUrl']);
        out.ApiBaseUrl = str(parsed['apiBaseUrl'] ?? parsed['BaseURL']);
        // Fallback client credentials from Configuration — the credential store remains preferred
        // (the parseConfig merge gives fromCredential precedence). This matches the GrowthZone /
        // Path LMS pattern and is what makes credential-free replay harnesses possible.
        out.ClientID = str(parsed['ClientID'] ?? parsed['clientId']);
        out.ClientSecret = str(parsed['ClientSecret'] ?? parsed['clientSecret']);
        out.Scope = str(parsed['scope']);
        if (typeof parsed['requestTimeoutMs'] === 'number') out.RequestTimeoutMs = parsed['requestTimeoutMs'] as number;
        if (typeof parsed['maxRetries'] === 'number') out.MaxRetries = parsed['maxRetries'] as number;
        if (typeof parsed['minRequestIntervalMs'] === 'number') out.MinRequestIntervalMs = parsed['minRequestIntervalMs'] as number;
        return out;
    }

    /** Loads OAuth2 secrets from the MJ credential store (generic OAuth2 client-credentials schema). */
    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<Partial<ORCIDConnectionConfig> | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        let raw: Record<string, unknown>;
        try {
            raw = JSON.parse(credential.Values) as Record<string, unknown>;
        } catch {
            return null;
        }
        const get = (...keys: string[]): string | undefined => {
            for (const k of keys) {
                const hit = Object.entries(raw).find(([key]) => key.toLowerCase() === k.toLowerCase());
                if (hit && typeof hit[1] === 'string') return hit[1] as string;
            }
            return undefined;
        };
        return {
            ClientID: get('ClientID', 'clientId', 'client_id'),
            ClientSecret: get('ClientSecret', 'clientSecret', 'client_secret'),
            TokenURL: get('TokenURL', 'tokenUrl', 'token_url'),
            Scope: get('Scope', 'scope'),
        };
    }
}

/** Tree-shaking prevention function — import and call from the module entry point. */
export function LoadORCIDConnector(): void { /* no-op */ }
