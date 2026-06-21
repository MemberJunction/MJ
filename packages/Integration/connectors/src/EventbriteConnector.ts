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
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://www.eventbriteapi.com/v3';
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 4;
/**
 * Eventbrite documents a global limit of 1,000 calls/hour per token (~0.27/s). Run under that
 * ceiling; the engine's AIMD bucket throttles + backs off on the 429 `HIT_RATE_LIMIT` response.
 */
const RATE_LIMIT_TOKENS_PER_SEC = 0.27;
const RATE_LIMIT_BURST = 10;
/** Minimum spacing between outbound requests (ms) — conservative under the per-hour cap. */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;

// ─── Connection configuration ─────────────────────────────────────────

/**
 * Per-connection configuration for the Eventbrite connector.
 *
 * Eventbrite has a single shared API host (`https://www.eventbriteapi.com/v3`). Auth is a
 * Bearer token — either a per-app PRIVATE TOKEN (single-user integration) or an OAuth2
 * authorization-code access token (multi-user app). Both are sent verbatim as
 * `Authorization: Bearer <token>`. The tenant's `OrganizationID` (and optionally `UserID`)
 * scope the organization-nested list endpoints and are resolved from
 * `CompanyIntegration.Configuration` at runtime — NEVER hardcoded.
 */
export interface EventbriteConnectionConfig {
    /** Bearer token: a private token or an OAuth2 access token. From the credential store. */
    Token?: string;
    /**
     * Eventbrite organization id (digits, e.g. `123456789012`). Scopes the
     * `/organizations/{organization_id}/...` list endpoints. Tenant-specific — resolved from
     * Configuration at runtime; if absent, the connector resolves it from `/users/me/organizations/`.
     */
    OrganizationID?: string;
    /** Eventbrite user id; used to substitute `{user_id}` where a path requires it. */
    UserID?: string;
    /**
     * Non-secret API host override (e.g. a local mock for replay/contract testing). When set it
     * wins over the production host. Mirrors the ApiBaseUrl override other connectors expose for
     * the credential-free mock-floor tier.
     */
    ApiBaseUrl?: string;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Maximum retries for rate-limited / transient failures. Default: 4. */
    MaxRetries?: number;
    /** Minimum interval between outbound requests (ms). Default: 200. */
    MinRequestIntervalMs?: number;
}

/** Authenticated context carried through one request cycle. */
interface EventbriteAuthContext extends RESTAuthContext {
    Token: string;
    BaseUrl: string;
    Config: EventbriteConnectionConfig;
}

/** Eventbrite list-response envelope: a `pagination` object plus the resource array under a named key. */
interface EventbritePagination {
    object_count?: number;
    page_number?: number;
    page_size?: number;
    page_count?: number;
    continuation?: string;
    has_more_items?: boolean;
}

/**
 * Eventbrite Platform REST API v3 connector.
 *
 * Read-first with documented write surfaces: events, ticket classes, ticket groups, venues,
 * discounts and webhooks expose create/update/delete (POST/DELETE, wrapped bodies); orders and
 * attendees are read-only with `changed_since` incremental sync. Pagination is the `continuation`
 * cursor. Auth is a Bearer private token or OAuth2 access token. CRUD is delegated to the generic
 * per-operation column path on {@link BaseRESTIntegrationConnector} (v5.39.x) — the metadata's
 * per-IO `Create*`/`Update*`/`Delete*` columns drive every write.
 *
 * Registered against the GRANDPARENT base ({@link BaseIntegrationConnector}) so the connector
 * factory dispatches off the right type.
 */
@RegisterClass(BaseIntegrationConnector, 'EventbriteConnector')
export class EventbriteConnector extends BaseRESTIntegrationConnector {
    private authState: EventbriteAuthContext | null = null;
    /** Timestamp of the last outbound request, used for throttling. */
    private lastRequestTime = 0;
    /** Watermark for the current FetchChanges cycle, emitted as the IO's IncrementalWatermarkField. */
    protected currentWatermark: string | undefined;

    // ── Identity + capability getters ───────────────────────────────────

    /** Verbatim from the metadata Integration row — part of the three-way name invariant. */
    public override get IntegrationName(): string { return 'Eventbrite'; }

    // Eventbrite exposes documented write endpoints on a SUBSET of objects. The generic
    // per-operation path enforces null-capability honesty per IO (an IO with no CreateAPIPath
    // throws on create), so these getters reflect that SOME IOs are writable; the actual writable
    // set is the metadata's per-op columns (Event / EventSeries / Venue / TicketClass / TicketGroup
    // / Discount / Webhook / Question for create; Order & Attendee stay read-only).
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    // ── Sync-efficiency hooks ───────────────────────────────────────────

    /**
     * Eventbrite documents 1,000 calls/hour per token. Run under that rate; the engine's AIMD
     * bucket throttles + backs off on the 429 `HIT_RATE_LIMIT` response.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: RATE_LIMIT_TOKENS_PER_SEC, Burst: RATE_LIMIT_BURST, ThrottleBackoffFactor: 0.5 };
    }

    /** Parse a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds. */
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
     * Verifies connectivity by fetching the current user (`/users/me/`). A 2xx confirms the
     * Bearer token is valid; a 401/403 means it was rejected.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as EventbriteAuthContext;
            const headers = this.BuildHeaders(auth);
            const probeUrl = `${auth.BaseUrl}/users/me/`;
            const resp = await this.MakeHTTPRequest(auth, probeUrl, 'GET', headers);
            if (resp.Status === 401 || resp.Status === 403) {
                return { Success: false, Message: `Eventbrite TestConnection failed: HTTP ${resp.Status} (token rejected)` };
            }
            if (resp.Status >= 500) {
                return { Success: false, Message: `Eventbrite TestConnection failed: HTTP ${resp.Status} (server error)` };
            }
            if (resp.Status < 200 || resp.Status >= 300) {
                return { Success: false, Message: `Eventbrite returned HTTP ${resp.Status} from ${probeUrl}` };
            }
            return {
                Success: true,
                Message: `Connected to Eventbrite at ${auth.BaseUrl}`,
                ServerVersion: 'Eventbrite Platform API v3',
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── FetchChanges (watermark-aware) ───────────────────────────────

    /**
     * Sets the watermark context that {@link BuildPaginatedURL} emits as `changed_since` for the
     * IO's `IncrementalWatermarkField`, delegates the fetch + cursor pagination to the base, then
     * advances the watermark from the returned records' `changed` field on the FINAL batch only
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
     * Scans a batch for the latest watermark value. The IO's `IncrementalWatermarkField` (`changed`)
     * names the record-level ISO timestamp; we take the max so the next run resumes from there.
     */
    protected ExtractLatestWatermark(
        records: { Fields: Record<string, unknown> }[],
        watermarkField: string
    ): string | null {
        let latest: Date | null = null;
        for (const rec of records) {
            const raw = rec.Fields?.[watermarkField] ?? rec.Fields?.['changed'];
            if (typeof raw !== 'string' || raw.length === 0) continue;
            const d = new Date(raw);
            if (!isNaN(d.getTime()) && (latest === null || d > latest)) latest = d;
        }
        return latest ? latest.toISOString() : null;
    }

    // ─── Auth + transport (abstract base requirements) ────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authState) return this.authState;
        const config = await this.parseConfig(companyIntegration, contextUser);
        const state: EventbriteAuthContext = {
            Token: config.Token ?? '',
            BaseUrl: this.resolveBaseUrl(config),
            Config: config,
        };
        this.authState = state;
        return state;
    }

    /** Builds the Eventbrite Bearer auth header. */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const ebAuth = auth as EventbriteAuthContext;
        return {
            'Authorization': `Bearer ${ebAuth.Token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    /**
     * Unwraps Eventbrite's response envelopes:
     *  - List endpoints: `{ pagination: {...}, <key>: [ ... ] }` → the resource array under
     *    `responseDataKey` (the IO's `ListResponseKey`, e.g. `events`, `attendees`, `orders`).
     *  - Single-record detail: a bare object → a one-element array.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        const asObj = this.asObject(rawBody);

        // Explicit metadata-declared envelope key wins (list endpoints).
        if (responseDataKey && asObj && responseDataKey in asObj) {
            return this.coerceToArray(asObj[responseDataKey]);
        }
        if (asObj) {
            // Heuristic: a `pagination` wrapper present but no declared key — take the first array value.
            if ('pagination' in asObj) {
                for (const [key, value] of Object.entries(asObj)) {
                    if (key !== 'pagination' && Array.isArray(value)) return this.coerceToArray(value);
                }
            }
            // Bare single object (detail / users/me).
            return [asObj];
        }
        // Bare array fallback.
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
     * Cursor pagination: Eventbrite reports `pagination.has_more_items` + a `continuation` token.
     * There are more records while `has_more_items` is true; the next request carries
     * `?continuation=<token>`. (When all records are returned, `continuation` is absent.)
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (paginationType !== 'Cursor') {
            return { HasMore: false, NextPage: currentPage, NextOffset: currentOffset };
        }
        const asObj = this.asObject(rawBody);
        const pag = (asObj && this.asObject(asObj['pagination'])) as EventbritePagination | undefined;
        const hasMore = pag?.has_more_items === true && typeof pag?.continuation === 'string' && pag.continuation.length > 0;
        return {
            HasMore: hasMore,
            NextCursor: hasMore ? pag!.continuation : undefined,
            NextPage: (pag?.page_number ?? currentPage) + 1,
            TotalRecords: typeof pag?.object_count === 'number' ? pag.object_count : undefined,
        };
    }

    /**
     * Eventbrite cursor pagination uses the `continuation` token (NOT the base default `cursor`), and
     * incremental list endpoints (Orders / Attendees) accept `changed_since`. This override emits
     * `continuation` + `changed_since` — both metadata-driven, never keyed off a hardcoded object name.
     * Organization-/event-scoped path vars (`{organization_id}` / `{event_id}`) are resolved by the
     * base's parent-iteration machinery from the IO's `Configuration.parentObjectName` / FK metadata.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        _offset: number,
        cursor?: string,
        _effectivePageSize?: number
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';
        const params = new URLSearchParams();

        const watermarkField = obj.IncrementalWatermarkField;
        if (obj.SupportsIncrementalSync && watermarkField && this.currentWatermark) {
            // The documented incremental query param is `changed_since`.
            params.set('changed_since', this.currentWatermark);
        }
        if (obj.PaginationType === 'Cursor' && cursor) {
            params.set('continuation', cursor);
        }

        const qs = params.toString();
        return qs ? `${basePath}${separator}${qs}` : basePath;
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as EventbriteAuthContext).BaseUrl;
    }

    // ─── HTTP transport with retry + throttling ───────────────────────

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const ebAuth = auth as EventbriteAuthContext;
        const cfg = ebAuth.Config;
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
        throw new Error(`Eventbrite request to ${url} exhausted ${maxRetries + 1} attempts`);
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
     * Resolves the connection config: the Bearer token from the credential store; the tenant
     * organization/user ids + non-secret overrides from CompanyIntegration.Configuration.
     * Secrets are NEVER baked into code.
     */
    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<EventbriteConnectionConfig> {
        const fromCredential = companyIntegration.CredentialID
            ? await this.loadFromCredential(companyIntegration.CredentialID, contextUser)
            : null;
        const fromConfig = this.parseConfigurationJson(companyIntegration.Configuration);

        const merged: EventbriteConnectionConfig = { ...fromConfig, ...fromCredential };
        merged.OrganizationID = merged.OrganizationID ?? fromConfig.OrganizationID;
        merged.UserID = merged.UserID ?? fromConfig.UserID;
        merged.ApiBaseUrl = merged.ApiBaseUrl ?? fromConfig.ApiBaseUrl;
        merged.RequestTimeoutMs = merged.RequestTimeoutMs ?? fromConfig.RequestTimeoutMs;
        merged.MaxRetries = merged.MaxRetries ?? fromConfig.MaxRetries;
        merged.MinRequestIntervalMs = merged.MinRequestIntervalMs ?? fromConfig.MinRequestIntervalMs;

        if (!merged.Token) {
            throw new Error('EventbriteConnector: a Bearer token (PrivateToken / Token) must be provided via the credential store.');
        }
        return merged;
    }

    /** Resolves the API host; the non-secret ApiBaseUrl override wins (mock/contract testing), else the production host. */
    private resolveBaseUrl(config: EventbriteConnectionConfig): string {
        const raw = (config.ApiBaseUrl ?? DEFAULT_BASE_URL).trim();
        return raw.replace(/\/+$/, '');
    }

    /** Parses the non-secret tenant/overrides config from CompanyIntegration.Configuration JSON. */
    private parseConfigurationJson(raw: string | null): EventbriteConnectionConfig {
        if (!raw || raw.trim().length === 0) return {};
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            throw new Error('EventbriteConnector: CompanyIntegration.Configuration is not valid JSON.');
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
            Token: str('token', 'privateToken', 'private_token', 'accessToken', 'access_token'),
            OrganizationID: str('organizationId', 'organization_id', 'orgId'),
            UserID: str('userId', 'user_id'),
            ApiBaseUrl: str('apiBaseUrl', 'api_base_url', 'baseUrl', 'base_url'),
            RequestTimeoutMs: num('requestTimeoutMs'),
            MaxRetries: num('maxRetries'),
            MinRequestIntervalMs: num('minRequestIntervalMs'),
        };
    }

    /** Loads the Bearer token (and optional org/user ids) from the MJ credential store. */
    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<EventbriteConnectionConfig | null> {
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
            Token: get('PrivateToken', 'Token', 'privateToken', 'private_token', 'AccessToken', 'access_token', 'apiKey'),
            OrganizationID: get('OrganizationID', 'organizationId', 'organization_id'),
            UserID: get('UserID', 'userId', 'user_id'),
        };
    }
}

/** Tree-shaking prevention function — import and call from the package entry point. */
export function LoadEventbriteConnector(): void { /* no-op */ }
