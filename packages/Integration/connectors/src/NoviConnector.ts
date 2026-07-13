import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
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
    type CRUDResult,
    type UpdateRecordContext,
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';

// ─── Connection configuration ─────────────────────────────────────────

/**
 * Per-connection configuration for the Novi AMS connector.
 *
 * Novi AMS has NO shared API host — every tenant runs on their own website
 * domain (`https://www.<association>.org/api/`). The connector resolves the
 * tenant base URL from CompanyIntegration.Configuration.TenantBaseURL at
 * runtime. Auth is a single raw API key placed verbatim after `Basic ` in the
 * Authorization header (NOT base64 of user:password — see {@link BuildHeaders}).
 */
export interface NoviConnectionConfig {
    /**
     * The raw API key. Used verbatim as `Authorization: Basic <apiKey>` — this is NOT
     * standard HTTP Basic Auth (no base64 of user:password). From the credential store.
     */
    APIKey?: string;
    /**
     * Per-tenant base URL, e.g. `https://www.myassociation.org` or
     * `https://www.myassociation.org/api`. The connector normalizes a trailing `/api`
     * so resource paths (which already start `/api/...`) are not doubled. Required.
     */
    TenantBaseURL?: string;
    /**
     * Non-secret API host override (e.g. a local mock for replay testing). When set, it
     * wins over TenantBaseURL. Mirrors ORCID/GrowthZone `ApiBaseUrl` — required for the
     * mock-floor e2e testability tier.
     */
    ApiBaseUrl?: string;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Maximum retries for rate-limited / transient failures. Default: 4. */
    MaxRetries?: number;
    /** Minimum interval between outbound requests (ms). Default: 50 (~20 req/s ceiling). */
    MinRequestIntervalMs?: number;
}

/** Authenticated context carried through one request cycle. */
interface NoviAuthContext extends RESTAuthContext {
    APIKey: string;
    BaseUrl: string;
    Config: NoviConnectionConfig;
}

/** List envelope from Novi list endpoints: `{ TotalCount, Results }`. */
interface NoviListEnvelope {
    TotalCount?: number;
    Results?: unknown;
}

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 4;
/** Novi caps at 20 req/s; a 50ms floor keeps us at/under that per single connector. */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 50;
const DEFAULT_PAGE_SIZE = 50;
/** Novi documented limits: 20/s, 600/min, 100k/day per key. Run conservatively under the per-second cap. */
const RATE_LIMIT_TOKENS_PER_SEC = 15;
const RATE_LIMIT_BURST = 20;

// ─── Connector implementation ─────────────────────────────────────────

/**
 * Connector for the Novi AMS REST API.
 *
 * Authenticates via the Novi API key placed RAW (not base64) after `Basic ` in
 * the Authorization header. Novi has no shared host — the per-tenant base URL
 * (`https://www.<assoc>.org`) is resolved from CompanyIntegration.Configuration.
 *
 * Reads ride the base {@link BaseRESTIntegrationConnector} pull path; this class
 * overrides only the genuinely Novi-specific bits:
 *  - {@link BuildHeaders}: `Basic <rawApiKey>` (NOT base64 user:password).
 *  - {@link GetBaseURL}: per-tenant host from Configuration.
 *  - {@link NormalizeResponse}: unwraps the `{TotalCount, Results}` list envelope
 *    and the `{data}` single-record envelope.
 *  - {@link ExtractPaginationInfo} / {@link BuildPaginatedURL}: Novi offset
 *    pagination uses `pageSize` + `offset` (the base default emits `limit`/`offset`).
 *  - {@link FetchChanges}: emits each IO's `IncrementalWatermarkField` as a request
 *    param for incremental sync and advances the watermark on full-batch success only.
 *  - {@link UpdateRecord}: Novi PUT is FULL-OBJECT REPLACEMENT (no PATCH), so update
 *    is GET-then-merge-then-PUT to avoid nulling unspecified fields.
 *
 * Create/Delete use the generic per-operation column path (CreateAPIPath/Method/
 * BodyShape/IDLocation, DeleteAPIPath/Method/IDLocation) driven entirely by the IO
 * metadata — no per-verb override.
 */
@RegisterClass(BaseIntegrationConnector, 'NoviConnector')
export class NoviConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context (raw key + resolved per-tenant host). */
    private authState: NoviAuthContext | null = null;
    /** Timestamp of the last outbound request, used for throttling. */
    private lastRequestTime = 0;
    /** Watermark for the current FetchChanges cycle, emitted as the IO's IncrementalWatermarkField. */
    private currentWatermark: string | undefined;

    // ── Identity + capability getters ───────────────────────────────────

    /** Verbatim from the metadata Integration row — part of the three-way name invariant. */
    public override get IntegrationName(): string { return 'Novi AMS'; }

    // Novi exposes a documented two-way API. The generic per-operation path enforces
    // null-capability honesty per IO (an IO with no CreateAPIPath throws on create), so
    // these getters reflect that SOME IOs are writable; the actual writable set is the
    // metadata's per-op columns (~12 Create, ~13 Update, ~5 Delete IOs).
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    // ── Sync-efficiency hooks ───────────────────────────────────────────

    /**
     * Novi documents 20 req/s, 600/min, 100k/day per key. Run under the per-second cap;
     * the engine's AIMD bucket throttles + backs off on 429.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: RATE_LIMIT_TOKENS_PER_SEC, Burst: RATE_LIMIT_BURST, ThrottleBackoffFactor: 0.5 };
    }

    /** Parse Novi's Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
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

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Verifies connectivity by listing a single Member record. A 2xx confirms the
     * raw API key + per-tenant base URL are valid; a 401/403 means the key was rejected.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NoviAuthContext;
            const headers = this.BuildHeaders(auth);
            const probeUrl = `${auth.BaseUrl}/api/members?pageSize=1&offset=0`;
            const resp = await this.MakeHTTPRequest(auth, probeUrl, 'GET', headers);
            if (resp.Status === 401 || resp.Status === 403) {
                return { Success: false, Message: `Novi AMS TestConnection failed: HTTP ${resp.Status} (API key rejected)` };
            }
            if (resp.Status >= 500) {
                return { Success: false, Message: `Novi AMS TestConnection failed: HTTP ${resp.Status} (server error)` };
            }
            if (resp.Status < 200 || resp.Status >= 300) {
                return { Success: false, Message: `Novi AMS returned HTTP ${resp.Status} from ${probeUrl}` };
            }
            return {
                Success: true,
                Message: `Connected to Novi AMS at ${auth.BaseUrl}`,
                ServerVersion: 'Novi AMS REST API',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── FetchChanges (watermark-aware) ───────────────────────────────

    /**
     * Sets the watermark context that {@link BuildPaginatedURL} emits as the IO's
     * `IncrementalWatermarkField`, delegates the actual fetch + pagination to the base,
     * then advances the watermark from the returned records on the FINAL batch only
     * (HasMore=false) so a partial-failure mid-pagination leaves the watermark unchanged.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentWatermark = ctx.WatermarkValue ?? undefined;

        const result = await super.FetchChanges(ctx);

        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (obj.SupportsIncrementalSync && obj.IncrementalWatermarkField && !result.HasMore) {
            const advanced = this.ExtractLatestWatermark(result.Records, obj.IncrementalWatermarkField);
            const newWatermark = advanced ?? ctx.WatermarkValue ?? undefined;
            if (newWatermark != null) return { ...result, NewWatermarkValue: newWatermark };
        }
        return result;
    }

    /**
     * Scans a batch for the latest watermark value. Novi's per-object watermark column is
     * a server-side date field (e.g. `lastModifiedDate`); the corresponding RECORD field
     * carries the comparable timestamp. We probe the common date columns a record may
     * surface and take the max ISO date so the next run resumes from there.
     */
    private ExtractLatestWatermark(
        records: { Fields: Record<string, unknown> }[],
        _watermarkField: string
    ): string | null {
        // Candidate record-level date columns that mirror a Novi watermark param.
        const candidates = [
            'lastModifiedDate', 'LastModifiedDate', 'lastUpdatedDate', 'LastUpdatedDate',
            'modifiedDate', 'ModifiedDate', 'publishOnDate', 'PublishOnDate',
            'orderDate', 'OrderDate', 'date', 'Date',
        ];
        let latest: Date | null = null;
        for (const rec of records) {
            for (const key of candidates) {
                const raw = rec.Fields?.[key];
                if (typeof raw !== 'string' || raw.length === 0) continue;
                const d = new Date(raw);
                if (!isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
            }
        }
        return latest ? latest.toISOString() : null;
    }

    // ─── Update: GET-then-merge-then-PUT (full-object replacement) ─────

    /**
     * Novi PUT is FULL-OBJECT REPLACEMENT — there is no PATCH, so a bare PUT of only the
     * mapped attributes would NULL every unspecified field. We override UpdateRecord to
     * GET the current record, deep-merge the changed attributes over it, then PUT the
     * merged whole. (Create/Delete use the generic per-operation column path unchanged.)
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.UpdateAPIPath || !obj.UpdateMethod) {
            throw new Error(
                `UpdateRecord not supported for "${ctx.ObjectName}": ` +
                `UpdateAPIPath / UpdateMethod not configured on IntegrationObject.`
            );
        }
        const auth = await this.Authenticate(ci, contextUser) as NoviAuthContext;
        const headers = this.BuildHeaders(auth);

        // 1) Resolve the single-record path: substitute {id} with the ExternalID, plus any
        //    remaining {var} template segments (e.g. {CommitteeUniqueID}) from the attributes.
        const resolvedPath = this.ResolveUpdatePath(obj.UpdateAPIPath, ctx.ExternalID, ctx.Attributes);
        const url = `${auth.BaseUrl}${this.ensureLeadingSlash(resolvedPath)}`;

        // 2) GET the current full record so the PUT preserves unspecified fields.
        const current = await this.GetCurrentRecord(auth, url, headers);

        // 3) Merge the changed attributes over the current record (shallow — Novi resources are flat).
        const merged: Record<string, unknown> = { ...(current ?? {}), ...ctx.Attributes };

        // 4) PUT the full merged object.
        const response = await this.MakeHTTPRequest(auth, url, obj.UpdateMethod, headers, merged);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on update`,
        };
    }

    /** GETs the current single record (for merge); returns null on 404/empty. */
    private async GetCurrentRecord(
        auth: NoviAuthContext,
        url: string,
        headers: Record<string, string>
    ): Promise<Record<string, unknown> | null> {
        const resp = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (resp.Status === 404) return null;
        if (resp.Status < 200 || resp.Status >= 300) {
            throw Object.assign(
                new Error(`Novi AMS update pre-fetch failed: HTTP ${resp.Status} for ${url}`),
                { Status: resp.Status, Headers: resp.Headers }
            );
        }
        const records = this.NormalizeResponse(resp.Body, null);
        return records.length > 0 ? records[0] : null;
    }

    /**
     * Resolves an update path template: {id}/{ID}/{ExternalID} → the record's ExternalID,
     * and any remaining {var} (e.g. {CommitteeUniqueID}) from the matching attribute value.
     */
    private ResolveUpdatePath(
        template: string,
        externalID: string,
        attributes: Record<string, unknown>
    ): string {
        const idEncoded = encodeURIComponent(externalID);
        let path = template
            .replace(/\{ID\}/g, idEncoded)
            .replace(/\{id\}/g, idEncoded)
            .replace(/\{ExternalID\}/g, idEncoded);
        // Resolve any remaining {var} from the attributes (case-insensitive key match).
        path = path.replace(/\{(\w+)\}/g, (_match, varName: string) => {
            const hit = Object.entries(attributes).find(([k]) => k.toLowerCase() === varName.toLowerCase());
            return hit && hit[1] != null ? encodeURIComponent(String(hit[1])) : _match;
        });
        return path;
    }

    private ensureLeadingSlash(path: string): string {
        return path.startsWith('/') ? path : `/${path}`;
    }

    /**
     * Extracts the new record's external ID from a create response. Novi names its keys
     * `UniqueID` / `<Object>UniqueId` / `<Object>UniqueID` (e.g. `EventUniqueId`,
     * `OrderUniqueID`, `WebhookUniqueId`) rather than a bare `id`, so for body-located IDs
     * we probe Novi's conventions first, then fall back to the base's common id names.
     * `header` IDs (Location trailing segment) reuse the base behavior.
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        if (!idLocation || idLocation === 'body') {
            const body = response.Body;
            // Novi may return the created record directly or wrapped in { data: {...} }.
            const record = this.asObject(this.NormalizeResponse(body, null)[0]) ?? this.asObject(body);
            if (record) {
                // Prefer the exact `UniqueID`, then any `*UniqueId`/`*UniqueID` key, then common id names.
                const direct = record['UniqueID'] ?? record['uniqueId'] ?? record['uniqueID'];
                if (typeof direct === 'string' || typeof direct === 'number') return String(direct);
                for (const [key, value] of Object.entries(record)) {
                    if (/uniqueid$/i.test(key) && (typeof value === 'string' || typeof value === 'number')) {
                        return String(value);
                    }
                }
                for (const k of ['id', 'ID', 'Id', 'externalID', 'ExternalID']) {
                    const v = record[k];
                    if (typeof v === 'string' || typeof v === 'number') return String(v);
                }
            }
            return undefined;
        }
        return super.ExtractIDFromResponse(response, idLocation);
    }

    // ─── Auth + transport (abstract base requirements) ────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authState) return this.authState;
        const config = await this.parseConfig(companyIntegration, contextUser);
        const state: NoviAuthContext = {
            APIKey: config.APIKey ?? '',
            BaseUrl: this.resolveBaseUrl(config),
            Config: config,
        };
        this.authState = state;
        return state;
    }

    /**
     * Builds the Novi auth header. The API key is placed VERBATIM after `Basic ` — this is
     * NOT standard HTTP Basic Auth (no base64 of user:password). Documented behavior.
     */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const noviAuth = auth as NoviAuthContext;
        return {
            'Authorization': `Basic ${noviAuth.APIKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    /**
     * Unwraps Novi's response envelopes:
     *  - List endpoints: `{ TotalCount, Results: [ ... ] }` → the Results array.
     *  - Single-record detail: `{ data: { ... } }` → a one-element array of `data`.
     *  - A bare array or bare object is handled as a fallback.
     * `responseDataKey` (from the IO metadata) takes precedence when set.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        const asObj = this.asObject(rawBody);

        // Explicit metadata-declared envelope key wins.
        if (responseDataKey && asObj) {
            return this.coerceToArray(asObj[responseDataKey]);
        }
        if (asObj) {
            // Novi list envelope.
            if ('Results' in asObj) return this.coerceToArray((asObj as NoviListEnvelope).Results);
            // Novi single-record detail envelope.
            if ('data' in asObj) return this.coerceToArray(asObj['data']);
            // Bare single object.
            return [asObj];
        }
        // Bare array.
        if (Array.isArray(rawBody)) return rawBody.filter(this.isRecord) as Record<string, unknown>[];
        return [];
    }

    private coerceToArray(node: unknown): Record<string, unknown>[] {
        if (Array.isArray(node)) return node.filter(this.isRecord) as Record<string, unknown>[];
        if (node && typeof node === 'object') return [node as Record<string, unknown>];
        return [];
    }

    private isRecord(node: unknown): node is Record<string, unknown> {
        return node != null && typeof node === 'object' && !Array.isArray(node);
    }

    /**
     * Offset pagination: Novi reports `TotalCount` in the list envelope. There are more
     * records while `offset + page-size < TotalCount`. When TotalCount is absent, fall
     * back to "stop when the page returned fewer than the page size".
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType !== 'Offset') {
            return { HasMore: false, NextPage: currentPage, NextOffset: currentOffset };
        }
        const asObj = this.asObject(rawBody);
        const results = asObj && 'Results' in asObj ? this.coerceToArray((asObj as NoviListEnvelope).Results) : [];
        const returned = results.length;
        const nextOffset = currentOffset + (returned > 0 ? returned : pageSize);

        const totalCount = asObj && typeof (asObj as NoviListEnvelope).TotalCount === 'number'
            ? (asObj as NoviListEnvelope).TotalCount as number
            : undefined;

        let hasMore: boolean;
        if (totalCount != null) {
            hasMore = nextOffset < totalCount;
        } else {
            hasMore = returned >= pageSize && returned > 0;
        }
        return {
            HasMore: hasMore,
            NextPage: currentPage + 1,
            NextOffset: nextOffset,
            TotalRecords: totalCount,
        };
    }

    /**
     * Novi offset pagination uses `pageSize` + `offset` (the base default emits `limit`/`offset`).
     * Also emits the IO's `IncrementalWatermarkField` as a request param when this is an
     * incremental object and a watermark is in context (fully metadata-driven — never keyed
     * off a hardcoded object name).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const separator = basePath.includes('?') ? '&' : '?';
        const params = new URLSearchParams();

        const watermarkField = obj.IncrementalWatermarkField;
        if (obj.SupportsIncrementalSync && watermarkField && this.currentWatermark) {
            params.set(watermarkField, this.currentWatermark);
        }
        params.set('pageSize', String(pageSize));
        params.set('offset', String(offset));

        return `${basePath}${separator}${params.toString()}`;
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as NoviAuthContext).BaseUrl;
    }

    // ─── HTTP transport with retry + throttling ───────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const noviAuth = auth as NoviAuthContext;
        const cfg = noviAuth.Config;
        const maxRetries = cfg.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = cfg.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = cfg.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.throttle(minInterval);
            try {
                const resp = await this.doFetch(url, method, headers, body, timeoutMs);
                this.lastRequestTime = Date.now();

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
        throw new Error(`Novi AMS request to ${url} exhausted ${maxRetries + 1} attempts`);
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
                body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
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
        return /abort|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|fetch failed|network/i.test(msg);
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

    private asObject(node: unknown): Record<string, unknown> | undefined {
        return node && typeof node === 'object' && !Array.isArray(node) ? node as Record<string, unknown> : undefined;
    }

    // ─── Config parsing ───────────────────────────────────────────────

    /**
     * Resolves the connection config: the raw API key from the credential store; the
     * per-tenant base URL + non-secret overrides from CompanyIntegration.Configuration.
     * Secrets are NEVER baked into code.
     */
    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<NoviConnectionConfig> {
        const fromCredential = companyIntegration.CredentialID
            ? await this.loadFromCredential(companyIntegration.CredentialID, contextUser)
            : null;
        const fromConfig = this.parseConfigurationJson(companyIntegration.Configuration);

        const merged: NoviConnectionConfig = { ...fromConfig, ...fromCredential };
        // Credential's APIKey wins; tenant host + overrides come from Configuration.
        merged.TenantBaseURL = merged.TenantBaseURL ?? fromConfig.TenantBaseURL;
        merged.ApiBaseUrl = merged.ApiBaseUrl ?? fromConfig.ApiBaseUrl;
        merged.RequestTimeoutMs = merged.RequestTimeoutMs ?? fromConfig.RequestTimeoutMs;
        merged.MaxRetries = merged.MaxRetries ?? fromConfig.MaxRetries;
        merged.MinRequestIntervalMs = merged.MinRequestIntervalMs ?? fromConfig.MinRequestIntervalMs;

        if (!merged.APIKey) {
            throw new Error('NoviConnector: an API key (APIKey) must be provided via the credential store.');
        }
        if (!merged.ApiBaseUrl && !merged.TenantBaseURL) {
            throw new Error(
                'NoviConnector: TenantBaseURL must be set on CompanyIntegration.Configuration ' +
                '(Novi has no shared host — e.g. "https://www.myassociation.org").'
            );
        }
        return merged;
    }

    /** Resolves the per-tenant base host; normalizes a trailing `/api` (resource paths already include it). */
    private resolveBaseUrl(config: NoviConnectionConfig): string {
        const raw = (config.ApiBaseUrl ?? config.TenantBaseURL ?? '').trim();
        return raw.replace(/\/+$/, '').replace(/\/api$/i, '');
    }

    /** Parses the non-secret tenant/overrides config from CompanyIntegration.Configuration JSON. */
    private parseConfigurationJson(raw: string | null): NoviConnectionConfig {
        if (!raw || raw.trim().length === 0) return {};
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            throw new Error('NoviConnector: CompanyIntegration.Configuration is not valid JSON.');
        }
        const str = (...keys: string[]): string | undefined => {
            for (const k of keys) {
                const hit = Object.entries(parsed).find(([key]) => key.toLowerCase() === k.toLowerCase());
                if (hit && typeof hit[1] === 'string' && hit[1].length > 0) return hit[1] as string;
            }
            return undefined;
        };
        const num = (...keys: string[]): number | undefined => {
            for (const k of keys) {
                const hit = Object.entries(parsed).find(([key]) => key.toLowerCase() === k.toLowerCase());
                if (hit && typeof hit[1] === 'number') return hit[1] as number;
            }
            return undefined;
        };
        return {
            APIKey: str('apiKey', 'api_key', 'key'),
            TenantBaseURL: str('tenantBaseUrl', 'tenant_base_url', 'baseUrl', 'base_url'),
            ApiBaseUrl: str('apiBaseUrl', 'api_base_url'),
            RequestTimeoutMs: num('requestTimeoutMs'),
            MaxRetries: num('maxRetries'),
            MinRequestIntervalMs: num('minRequestIntervalMs'),
        };
    }

    /** Loads the raw API key from the MJ credential store. */
    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<NoviConnectionConfig | null> {
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
            APIKey: get('APIKey', 'apiKey', 'api_key', 'key'),
            // A credential MAY also carry the tenant host (single source of truth for a connection).
            TenantBaseURL: get('TenantBaseURL', 'tenantBaseUrl', 'baseUrl', 'base_url'),
        };
    }
}

/** Tree-shaking prevention function — import and call from the package entry point. */
export function LoadNoviConnector(): void { /* no-op */ }
