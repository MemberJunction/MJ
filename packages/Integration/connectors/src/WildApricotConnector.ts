import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
} from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    OAuth2TokenManager,
    type OAuth2GrantType,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type CRUDResult,
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Parsed connection config for the Wild Apricot connector.
 *
 * Wild Apricot authenticates via OAuth2 `client_credentials`: the admin API Key is
 * sent as the OAuth2 client secret with a fixed client id of `APIKEY`, encoded as
 * HTTP Basic on the token endpoint (`oauth.wildapricot.org/auth/token`). A short-lived
 * bearer token comes back and is used on every account-scoped request.
 */
interface WildApricotConnectionConfig {
    /** Wild Apricot admin API Key (the OAuth2 client secret). */
    ApiKey: string;
    /**
     * Wild Apricot account (tenant) ID. When omitted it is auto-discovered via
     * `GET /v2/accounts` on first authentication (the first account the key reaches).
     */
    AccountId?: string;
    /** REST API version segment, e.g. `v2.3`. Defaults to {@link DEFAULT_API_VERSION}. */
    ApiVersion?: string;
    /**
     * Connection-level override for the API host+version base (default `https://api.wildapricot.org/<ver>`).
     * Set for a sandbox / on-prem / test endpoint; when set (and no explicit AuthTokenEndpoint), the OAuth2
     * token endpoint defaults to `<thisOrigin>/auth/token`, so one key reroutes BOTH the data API and token host.
     */
    ApiBaseUrl?: string;
    /** Maximum retries for rate-limited / transient failures. Default 4. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default 30000. */
    RequestTimeoutMs?: number;
    /** Maximum wait for async (Contacts) query polling in ms. Default 120000. */
    AsyncPollTimeoutMs?: number;
    /** Polling interval for async query results in ms. Default 2000. */
    AsyncPollIntervalMs?: number;
}

/** Root Integration.Configuration shape (auth + pagination facts the extractor captured). */
interface WildApricotIntegrationConfig {
    AuthTokenEndpoint?: string;
    AuthTokenGrantType?: string;
    AuthClientIdForAPIKeyFlow?: string;
    /**
     * Override for the API host+version base (default `https://api.wildapricot.org/<ver>`). Set this for a
     * sandbox / on-prem / test endpoint. When set and `AuthTokenEndpoint` is NOT explicitly given, the OAuth2
     * token endpoint defaults to `<thisOrigin>/auth/token` (a test/mock server typically serves both at one
     * origin), so a single config key reroutes BOTH the data API and the token endpoint.
     */
    ApiBaseUrl?: string;
}

/** Per-IO Configuration shape carrying the resolved single-record path + watermark facts. */
interface WildApricotObjectConfig {
    SingleRecordPath?: string | null;
    SingleRecordPathParam?: string | null;
    PaginationSkipParam?: string | null;
    PaginationTopParam?: string | null;
    PaginationMaxPageSize?: number | null;
    WatermarkField?: string | null;
    WatermarkParam?: string | null;
    WatermarkServerSideFilter?: boolean | null;
    /** Date-range incremental objects (Invoices/Payments/Refunds/Donations/AuditLog) use StartDate/EndDate. */
    WatermarkRangeStartParam?: string | null;
}

/** Authenticated context carried through a request cycle. */
interface WildApricotAuthContext extends RESTAuthContext {
    Token: string;
    AccountId: string;
    /** Host + version, e.g. `https://api.wildapricot.org/v2.3` (NO trailing /accounts/{id}). */
    ApiBaseUrl: string;
    Config: WildApricotConnectionConfig;
}

/** Shape of an entry returned by `GET /v2/accounts`. */
interface WildApricotAccountSummary {
    Id?: number;
    Name?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const WA_OAUTH_TOKEN_URL = 'https://oauth.wildapricot.org/auth/token';
const WA_API_HOST = 'https://api.wildapricot.org';
const WA_OAUTH_CLIENT_ID = 'APIKEY';
const WA_OAUTH_SCOPE = 'auto';
const DEFAULT_API_VERSION = 'v2.3';

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_ASYNC_POLL_TIMEOUT_MS = 120_000;
const DEFAULT_ASYNC_POLL_INTERVAL_MS = 2_000;
/** WildApricot caps $top at 100 per request (PaginationDefaults.maxPageSize). */
const WA_MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 100;
/** WildApricot's offset pagination params (Nov-2025 model). Per-IO Configuration can override. */
const WA_DEFAULT_SKIP_PARAM = '$skip';
const WA_DEFAULT_TOP_PARAM = '$top';
/** WildApricot rate-limit baseline: ~60 req/min → ~1 req/sec sustained. */
const WA_TOKENS_PER_SEC = 1;

// ─── Connector Implementation ─────────────────────────────────────────

/**
 * Connector for Wild Apricot (Personify / Momentive Software) Admin REST API.
 *
 * Rides {@link BaseRESTIntegrationConnector} over HTTP/JSON. The connector is
 * METADATA-DRIVEN: objects, fields, paths, pagination type, per-operation CRUD
 * columns, and incremental watermark fields all come from the persisted
 * IntegrationObject / IntegrationObjectField rows (the frozen contract), never a
 * baked in-code catalog.
 *
 * Idiosyncrasy that forces a handful of overrides (each documented inline):
 *   - Every endpoint is TENANT-SCOPED under `/accounts/{accountId}/…`. `{accountId}`
 *     is the OAuth2 tenant, NOT a syncable parent object — so the connector
 *     substitutes it from the auth context rather than letting the base resolve it
 *     as a template variable.
 *   - Single-record (Update/Delete/Get) paths use a NAMED id placeholder
 *     (`{contactId}`, `{eventId}`, `{event_registration_id}`, …) which the base's
 *     generic `{ID}` substitution does not cover.
 *   - Incremental sync uses a server-side OData `$filter` with display-name fields
 *     (Contacts/Events) or a `StartDate` date-range param (Invoices/Payments/…),
 *     not a generic cursor query param.
 *   - Contacts uses the `$async=true` + poll pattern for large result sets.
 *
 * Auth: OAuth2 `client_credentials`, API key sent as the client secret with a fixed
 * `APIKEY` client id, HTTP Basic on the token endpoint — minted via the shared
 * {@link OAuth2TokenManager} (no inline crypto).
 */
@RegisterClass(BaseIntegrationConnector, 'WildApricotConnector')
export class WildApricotConnector extends BaseRESTIntegrationConnector {

    /** Per-connector OAuth2 token manager (caches the bearer until near expiry). */
    private tokenManager = new OAuth2TokenManager();

    /** Cached auth context (token + resolved account + base url). */
    private authCache: WildApricotAuthContext | null = null;

    // ── Identity + capabilities ──────────────────────────────────────

    public override get IntegrationName(): string { return 'Wild Apricot'; }

    // WildApricot supports per-object writes (Contacts, Events, EventRegistrations,
    // Invoices, Payments, Refunds, Tenders, Products, etc.). The precise per-object
    // write surface is enforced by the metadata's per-operation columns; these
    // getters declare the connector is write-capable at all.
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    // ── Sync-efficiency hooks (evidence-backed) ──────────────────────

    /** ~60 req/min documented baseline; 429 says "wait for a minute and try again". */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: WA_TOKENS_PER_SEC, Burst: WA_MAX_PAGE_SIZE, ThrottleBackoffFactor: 0.5 };
    }

    /** Parses WildApricot's Retry-After header (delta-seconds or HTTP-date) into ms. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const retryAfter = (error as { RetryAfter?: string }).RetryAfter;
        if (typeof retryAfter !== 'string' || retryAfter.length === 0) return undefined;
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
        const asDate = Date.parse(retryAfter);
        if (!Number.isNaN(asDate)) {
            const delta = asDate - Date.now();
            if (delta > 0) return Math.min(delta, 60_000);
        }
        return undefined;
    }

    /**
     * Stable ordering key for no-watermark objects: WildApricot's universal `Id` PK is
     * a monotonic integer, so keyset resume is safe for any object lacking an
     * incremental cursor. Returns 'Id' (the documented universal PK).
     */
    public override StableOrderingKey(_objectName: string): string | null {
        return 'Id';
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Verifies connectivity by authenticating (which also resolves the account id)
     * and reading the account record at `/v{ver}/accounts/{id}`.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = (await this.Authenticate(companyIntegration, contextUser)) as WildApricotAuthContext;
            const url = `${auth.ApiBaseUrl}/accounts/${encodeURIComponent(auth.AccountId)}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `Wild Apricot TestConnection failed: HTTP ${response.Status}` };
            }
            const body = response.Body as WildApricotAccountSummary | null;
            return {
                Success: true,
                Message: `Connected to Wild Apricot account: ${body?.Name ?? auth.AccountId}`,
                ServerVersion: `Wild Apricot Admin API ${auth.Config.ApiVersion ?? DEFAULT_API_VERSION}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── FetchChanges ────────────────────────────────────────────────
    //
    // OVERRIDE REASON: every WildApricot path is tenant-scoped under
    // /accounts/{accountId}/… where {accountId} is the OAuth2 tenant (NOT a syncable
    // parent object). The base FetchChanges would treat {accountId} as a template var
    // and fail to resolve it. This override substitutes {accountId} from auth, then
    // runs WildApricot's offset ($skip/$top) pagination with optional server-side
    // $filter / StartDate watermark injection, and the $async=true poll pattern for
    // Contacts. Full-record pass-through (Fields = raw) is preserved.

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = (await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser)) as WildApricotAuthContext;
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const cfg = this.parseObjectConfig(obj);
        const pkFieldNames = this.findPrimaryKeyFieldNames(fields.map(f => ({ Name: f.Name, IsPrimaryKey: f.IsPrimaryKey })));

        const accountPath = this.substituteAccountId(obj.APIPath, auth.AccountId);
        const pageSize = this.resolvePageSize(ctx.BatchSize, cfg);
        const offset = ctx.CurrentOffset ?? 0;

        const url = this.buildListUrl(auth.ApiBaseUrl, accountPath, obj, cfg, pageSize, offset, ctx.WatermarkValue);

        const records = obj.Name.toLowerCase() === 'contact'
            ? await this.fetchContactsAsync(auth, url)
            : await this.fetchPage(auth, url, obj.ResponseDataKey);

        const externalRecords = records.map(r => this.toExternalRecord(r, ctx.ObjectName, pkFieldNames));
        const paginated = obj.SupportsPagination && obj.PaginationType !== 'None';
        const hasMore = paginated && records.length >= pageSize;
        const newWatermark = !hasMore ? this.computeWatermark(records, cfg, ctx.WatermarkValue) : undefined;

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: hasMore ? offset + records.length : undefined,
            NewWatermarkValue: newWatermark ?? undefined,
        };
    }

    /** Resolves the requested page size, honoring the per-IO + vendor max ceiling. */
    private resolvePageSize(batchSize: number, cfg: WildApricotObjectConfig): number {
        const max = cfg.PaginationMaxPageSize ?? WA_MAX_PAGE_SIZE;
        const requested = batchSize > 0 ? batchSize : DEFAULT_PAGE_SIZE;
        return Math.min(requested, max);
    }

    /**
     * Builds the list URL: offset pagination ($skip/$top, per-IO param names) plus an
     * optional server-side watermark filter — OData `$filter='Display Field' ge 'iso'`
     * for Contacts/Events, or a `StartDate` date-range param for the financial objects.
     */
    private buildListUrl(
        apiBase: string,
        accountPath: string,
        obj: MJIntegrationObjectEntity,
        cfg: WildApricotObjectConfig,
        top: number,
        skip: number,
        watermark: string | null
    ): string {
        const params: string[] = [];
        if (obj.SupportsPagination && obj.PaginationType !== 'None') {
            const skipParam = cfg.PaginationSkipParam ?? WA_DEFAULT_SKIP_PARAM;
            const topParam = cfg.PaginationTopParam ?? WA_DEFAULT_TOP_PARAM;
            params.push(`${encodeURIComponent(skipParam)}=${skip}`);
            params.push(`${encodeURIComponent(topParam)}=${top}`);
        }
        if (watermark && obj.SupportsIncrementalSync) {
            this.appendWatermarkParam(params, obj, cfg, watermark);
        }
        const query = params.length > 0 ? `?${params.join('&')}` : '';
        return `${apiBase}${accountPath}${query}`;
    }

    /**
     * Appends the incremental watermark to the query params. Two documented shapes:
     *  - server-side OData `$filter` with the display-name field in quotes (Contacts, Events);
     *  - a `StartDate` date-range param (Invoices, Payments, Refunds, Donations, AuditLog).
     */
    private appendWatermarkParam(
        params: string[],
        obj: MJIntegrationObjectEntity,
        cfg: WildApricotObjectConfig,
        watermark: string
    ): void {
        const watermarkParam = cfg.WatermarkParam ?? (obj.IncrementalWatermarkField ? '$filter' : null);
        if (!watermarkParam) return;
        if (cfg.WatermarkServerSideFilter && watermarkParam === '$filter') {
            const filterField = cfg.WatermarkField ?? obj.IncrementalWatermarkField ?? 'LastUpdated';
            const filter = `'${this.toDisplayFilterField(filterField)}' ge '${watermark}'`;
            params.push(`$filter=${encodeURIComponent(filter)}`);
            return;
        }
        // Date-range objects: pass the watermark as StartDate (creation-date range).
        const startParam = cfg.WatermarkRangeStartParam ?? watermarkParam;
        params.push(`${encodeURIComponent(startParam)}=${encodeURIComponent(watermark)}`);
    }

    /**
     * Maps a PascalCase watermark field code to WildApricot's display-name `$filter`
     * syntax (spaces). ProfileLastUpdated → "Profile last updated"; LastUpdated →
     * "Last updated". Other fields fall back to a space-separated split.
     */
    private toDisplayFilterField(field: string): string {
        switch (field) {
            case 'ProfileLastUpdated': return 'Profile last updated';
            case 'LastUpdated': return 'Last updated';
            default: {
                const spaced = field.replace(/([a-z])([A-Z])/g, '$1 $2');
                return spaced.charAt(0) + spaced.slice(1).toLowerCase();
            }
        }
    }

    /** GETs a single page and normalizes it to the record array. */
    private async fetchPage(
        auth: WildApricotAuthContext,
        url: string,
        responseDataKey: string | null
    ): Promise<Record<string, unknown>[]> {
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status === 403) return [];
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Wild Apricot GET ${url} returned HTTP ${response.Status}`);
        }
        return this.NormalizeResponse(response.Body, responseDataKey);
    }

    /**
     * Fetches Contacts via WildApricot's async pattern: an initial request returns
     * either the Contacts inline (small queries) or a ResultUrl to poll until ready.
     */
    private async fetchContactsAsync(
        auth: WildApricotAuthContext,
        baseUrl: string
    ): Promise<Record<string, unknown>[]> {
        const sep = baseUrl.includes('?') ? '&' : '?';
        const url = `${baseUrl}${sep}$async=true`;
        const initial = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (initial.Status === 403) return [];
        if (initial.Status < 200 || initial.Status >= 300) {
            throw new Error(`Wild Apricot async Contacts initial call returned HTTP ${initial.Status}`);
        }
        const body = (initial.Body ?? {}) as { Contacts?: Record<string, unknown>[]; ResultUrl?: string };
        if (Array.isArray(body.Contacts)) return body.Contacts;
        if (typeof body.ResultUrl === 'string' && body.ResultUrl.length > 0) {
            return this.pollAsyncResult(auth, body.ResultUrl);
        }
        return this.NormalizeResponse(initial.Body, 'Contacts');
    }

    /** Polls the async ResultUrl until it returns a Contacts array or times out. */
    private async pollAsyncResult(
        auth: WildApricotAuthContext,
        resultUrl: string
    ): Promise<Record<string, unknown>[]> {
        const interval = auth.Config.AsyncPollIntervalMs ?? DEFAULT_ASYNC_POLL_INTERVAL_MS;
        const timeout = auth.Config.AsyncPollTimeoutMs ?? DEFAULT_ASYNC_POLL_TIMEOUT_MS;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            await this.sleep(interval);
            const resp = await this.MakeHTTPRequest(auth, resultUrl, 'GET', this.BuildHeaders(auth));
            if (resp.Status === 202) continue;
            if (resp.Status < 200 || resp.Status >= 300) {
                throw new Error(`Wild Apricot async ResultUrl poll returned HTTP ${resp.Status}`);
            }
            const body = (resp.Body ?? {}) as { Contacts?: Record<string, unknown>[] };
            if (Array.isArray(body.Contacts)) return body.Contacts;
        }
        throw new Error(`Wild Apricot async Contacts query timed out after ${timeout}ms`);
    }

    /** Computes the rolling watermark = max of the IO's watermark field across the batch. */
    private computeWatermark(
        records: Record<string, unknown>[],
        cfg: WildApricotObjectConfig,
        previous: string | null
    ): string | undefined {
        const field = cfg.WatermarkField;
        if (!field) return undefined;
        let latest: Date | null = previous ? this.parseDate(previous) : null;
        for (const rec of records) {
            const parsed = this.parseDate(rec[field]);
            if (parsed && (!latest || parsed > latest)) latest = parsed;
        }
        return latest ? latest.toISOString() : (previous ?? undefined);
    }

    private parseDate(raw: unknown): Date | null {
        if (typeof raw !== 'string' || raw.length === 0) return null;
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // ─── CRUD (metadata-driven, account-scoped) ──────────────────────
    //
    // OVERRIDE REASON: the generic base CRUD substitutes only {ID}/{id}/{ExternalID}
    // and cannot handle WildApricot's tenant-scoped paths ({accountId}) nor its NAMED
    // single-record placeholders ({contactId}, {eventId}, {event_registration_id}, …).
    // These overrides STILL read the per-operation metadata columns (CreateAPIPath /
    // CreateMethod / CreateBodyShape / CreateBodyKey / CreateIDLocation, Update*,
    // Delete*) — they do not bake paths — and route create through BuildCreatedResult
    // so a 2xx-but-no-id create fails loudly.

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) {
            throw new Error(
                `CreateRecord not supported for "${ctx.ObjectName}": CreateAPIPath / CreateMethod not configured.`
            );
        }
        const auth = (await this.Authenticate(ci, contextUser)) as WildApricotAuthContext;
        const path = this.substituteAccountId(obj.CreateAPIPath, auth.AccountId);
        const url = `${auth.ApiBaseUrl}${path}`;
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, this.BuildHeaders(auth), body);
        if (response.Status >= 200 && response.Status < 300) {
            const externalID = this.ExtractIDFromResponse(response, obj.CreateIDLocation);
            return this.BuildCreatedResult(externalID, response.Status, ctx.ObjectName);
        }
        return this.crudFailure(response, 'create');
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.UpdateAPIPath || !obj.UpdateMethod) {
            throw new Error(
                `UpdateRecord not supported for "${ctx.ObjectName}": UpdateAPIPath / UpdateMethod not configured.`
            );
        }
        const auth = (await this.Authenticate(ci, contextUser)) as WildApricotAuthContext;
        const cfg = this.parseObjectConfig(obj);
        const url = this.buildSingleRecordUrl(auth, obj.UpdateAPIPath, cfg, ctx.ExternalID, obj.UpdateIDLocation);
        const body = this.BuildOperationBody(ctx.Attributes, obj.UpdateBodyShape, obj.UpdateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.UpdateMethod, this.BuildHeaders(auth), body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return this.crudFailure(response, 'update');
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.DeleteAPIPath || !obj.DeleteMethod) {
            throw new Error(
                `DeleteRecord not supported for "${ctx.ObjectName}": DeleteAPIPath / DeleteMethod not configured.`
            );
        }
        const auth = (await this.Authenticate(ci, contextUser)) as WildApricotAuthContext;
        const cfg = this.parseObjectConfig(obj);
        const url = this.buildSingleRecordUrl(auth, obj.DeleteAPIPath, cfg, ctx.ExternalID, obj.DeleteIDLocation);
        const response = await this.MakeHTTPRequest(auth, url, obj.DeleteMethod, this.BuildHeaders(auth));
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return this.crudFailure(response, 'delete');
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = (await this.Authenticate(ci, contextUser)) as WildApricotAuthContext;
        const cfg = this.parseObjectConfig(obj);
        // Single-record path from Configuration (preferred) or UpdateAPIPath, else APIPath/{id}.
        const template = cfg.SingleRecordPath ?? obj.UpdateAPIPath ?? `${obj.APIPath.replace(/\/+$/, '')}/{id}`;
        const url = this.buildSingleRecordUrl(auth, template, cfg, ctx.ExternalID, 'path');
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status === 404) return null;
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`GetRecord failed for "${ctx.ObjectName}" id "${ctx.ExternalID}": HTTP ${response.Status}`);
        }
        const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        if (records.length === 0) return null;
        const pkFieldNames = this.findPrimaryKeyFieldNames(fields.map(f => ({ Name: f.Name, IsPrimaryKey: f.IsPrimaryKey })));
        return this.toExternalRecord(records[0], ctx.ObjectName, pkFieldNames);
    }

    /**
     * Builds a single-record URL: substitutes {accountId} from auth, then substitutes
     * the named id placeholder (from Configuration.SingleRecordPathParam, or any
     * remaining `{var}` other than accountId) with the ExternalID when idLocation='path'.
     */
    private buildSingleRecordUrl(
        auth: WildApricotAuthContext,
        template: string,
        cfg: WildApricotObjectConfig,
        externalID: string,
        idLocation: string | null
    ): string {
        let path = this.substituteAccountId(template, auth.AccountId);
        if (!idLocation || idLocation === 'path') {
            const encoded = encodeURIComponent(externalID);
            const idParam = cfg.SingleRecordPathParam;
            if (idParam) {
                path = path.replace(new RegExp(`\\{${idParam}\\}`, 'g'), encoded);
            }
            // Substitute any remaining placeholder that is not {accountId} (named id var fallback).
            path = path.replace(/\{(?!accountId\})\w+\}/g, encoded);
        }
        return `${auth.ApiBaseUrl}${path}`;
    }

    private crudFailure(response: RESTResponse, op: string): CRUDResult {
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `Wild Apricot ${op} failed (HTTP ${response.Status})`,
        };
    }

    // ─── REST hooks ──────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.parseConfig(companyIntegration, contextUser);
        const integrationCfg = this.parseIntegrationConfig(companyIntegration);
        const apiVersion = config.ApiVersion ?? DEFAULT_API_VERSION;
        // Base override (sandbox / on-prem / test). When set, the OAuth2 token endpoint defaults to the SAME
        // origin's /auth/token unless AuthTokenEndpoint is given explicitly — one key reroutes both hosts.
        // Override resolves from the connection config (CompanyIntegration.Configuration) first, then the
        // Integration.Configuration — either may carry it; a sandbox/test endpoint typically sets the former.
        const baseOverride = config.ApiBaseUrl ?? integrationCfg.ApiBaseUrl;
        const apiBaseUrl = baseOverride ?? `${WA_API_HOST}/${apiVersion}`;
        const defaultTokenURL = baseOverride
            ? `${new URL(baseOverride).origin}/auth/token`
            : WA_OAUTH_TOKEN_URL;
        const token = await this.tokenManager.GetAccessToken(
            {
                TokenURL: integrationCfg.AuthTokenEndpoint ?? defaultTokenURL,
                ClientId: integrationCfg.AuthClientIdForAPIKeyFlow ?? WA_OAUTH_CLIENT_ID,
                ClientSecret: config.ApiKey,
                Scopes: WA_OAUTH_SCOPE,
                UseBasicAuth: true,
                TimeoutMs: config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            },
            (integrationCfg.AuthTokenGrantType as OAuth2GrantType) ?? 'client_credentials'
        );

        const accountId = config.AccountId ?? (await this.resolveAccountId(token.AccessToken));

        this.authCache = {
            Token: token.AccessToken,
            AccountId: accountId,
            ApiBaseUrl: apiBaseUrl,
            Config: config,
        };
        return this.authCache;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const wa = auth as WildApricotAuthContext;
        return {
            'Authorization': `Bearer ${wa.Token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as WildApricotAuthContext).ApiBaseUrl;
    }

    /**
     * Extracts the record array from a WildApricot response. WildApricot returns either:
     *   - a wrapped envelope `{ <Key>: [...] }` (Contacts → `Contacts`, Events → `Events`,
     *     AuditLog → `Items`, …) — read via the IO's ResponseDataKey when authored, else
     *     auto-detect the first array-valued property;
     *   - a bare root array (membershiplevels, tenders, …);
     *   - a single object (per-id GET).
     * The FULL source record passes through unfiltered (custom-column capture contract).
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;
            if (responseDataKey && Array.isArray(body[responseDataKey])) {
                return body[responseDataKey] as Record<string, unknown>[];
            }
            for (const value of Object.values(body)) {
                if (Array.isArray(value)) return value as Record<string, unknown>[];
            }
            return [body];
        }
        return [];
    }

    /**
     * Offset pagination state. WildApricot has no total-count envelope on most list
     * endpoints, so the caller (FetchChanges) decides HasMore by page fill; this hook
     * (used by any base-routed paths) advances the offset by page size.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        const records = this.NormalizeResponse(rawBody, null);
        const hasMore = records.length >= pageSize && pageSize > 0;
        return hasMore
            ? { HasMore: true, NextOffset: currentOffset + records.length }
            : { HasMore: false };
    }

    /** Executes an HTTP request with retry/backoff for 401 (re-auth), 429, and 503. */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const wa = auth as WildApricotAuthContext;
        const maxRetries = wa.Config?.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = wa.Config?.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const isWrite = method !== 'GET' && method !== 'HEAD';

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let response: Response;
            try {
                const options: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
                if (body !== undefined && isWrite) {
                    options.body = typeof body === 'string' ? body : JSON.stringify(body);
                }
                response = await fetch(url, options);
            } catch (err: unknown) {
                if (!isWrite && attempt < maxRetries && this.isTransientNetworkError(err)) {
                    await this.sleep(this.backoffMs(attempt));
                    continue;
                }
                throw err;
            }

            // 401 → token expired/revoked. WildApricot's client_credentials grant issues no refresh
            // token (re-acquire on expiry). Clear the cached token + auth so the NEXT Authenticate()
            // re-mints; we surface the 401 to the caller rather than re-authenticate here (we don't hold
            // the CompanyIntegration at the transport layer). The token manager's expiry-skew refresh
            // (RefreshBufferMs) avoids most mid-batch 401s in the first place.
            if (response.status === 401) {
                this.tokenManager.Reset();
                this.authCache = null;
            }

            if ((response.status === 429 || response.status === 503) && !isWrite && attempt < maxRetries) {
                const retryAfter = response.headers.get('retry-after') ?? undefined;
                const waitMs = this.ExtractRetryAfterMs({ RetryAfter: retryAfter }) ?? this.backoffMs(attempt);
                await this.sleep(waitMs);
                continue;
            }

            return this.toRESTResponse(response);
        }
        throw new Error(`Wild Apricot request to ${url} exhausted ${maxRetries + 1} attempts`);
    }

    private async toRESTResponse(response: Response): Promise<RESTResponse> {
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { respHeaders[key.toLowerCase()] = value; });
        const text = await response.text();
        const parsed = text.length > 0 ? this.safeParseJSON(text) : null;
        return { Status: response.status, Body: parsed, Headers: respHeaders };
    }

    private safeParseJSON(text: string): unknown {
        try { return JSON.parse(text) as unknown; } catch { return text; }
    }

    private isTransientNetworkError(err: unknown): boolean {
        const msg = err instanceof Error ? err.message : String(err);
        return /abort|timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|network|fetch failed/i.test(msg);
    }

    private backoffMs(attempt: number): number {
        const base = Math.min(1000 * Math.pow(2, attempt), 20_000);
        return base + Math.floor(Math.random() * 500);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Account resolution ──────────────────────────────────────────

    /** Auto-discovers the account id via `GET /v2/accounts`; picks the first reachable account. */
    private async resolveAccountId(accessToken: string): Promise<string> {
        const response = await fetch(`${WA_API_HOST}/v2/accounts`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Wild Apricot /v2/accounts failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
        }
        const body = (await response.json()) as WildApricotAccountSummary[] | WildApricotAccountSummary;
        const accounts = Array.isArray(body) ? body : [body];
        const first = accounts.find(a => typeof a?.Id === 'number');
        if (!first || first.Id == null) {
            throw new Error('Wild Apricot /v2/accounts returned no accounts for this API Key');
        }
        return String(first.Id);
    }

    // ─── Path / config helpers ───────────────────────────────────────

    /** Substitutes the {accountId} tenant token into a path. */
    private substituteAccountId(path: string, accountId: string): string {
        return path.replace(/\{accountId\}/g, encodeURIComponent(accountId));
    }

    /** Parses the per-IO Configuration JSON into the typed shape (tolerant of absent/invalid). */
    private parseObjectConfig(obj: MJIntegrationObjectEntity): WildApricotObjectConfig {
        const raw = obj.Configuration;
        if (!raw || typeof raw !== 'string') return {};
        try {
            return JSON.parse(raw) as WildApricotObjectConfig;
        } catch {
            return {};
        }
    }

    /**
     * Parses the root Integration.Configuration JSON for auth facts (token endpoint,
     * grant type, client id). Read from the engine cache when available; falls back to
     * the documented WildApricot constants when the cache isn't seeded (e.g. unit tests).
     */
    private parseIntegrationConfig(companyIntegration: MJCompanyIntegrationEntity): WildApricotIntegrationConfig {
        try {
            const integration = IntegrationEngineBase.Instance.GetIntegrationByID(companyIntegration.IntegrationID);
            const raw = (integration as unknown as { Configuration?: string | null } | undefined)?.Configuration;
            if (!raw || typeof raw !== 'string') return {};
            return JSON.parse(raw) as WildApricotIntegrationConfig;
        } catch {
            return {};
        }
    }

    /** Returns the PK field names (sorted as given), falling back to ['Id'] when none marked. */
    private findPrimaryKeyFieldNames(fields: { Name: string; IsPrimaryKey: boolean }[]): string[] {
        const pks = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);
        return pks.length > 0 ? pks : ['Id'];
    }

    /**
     * Builds an ExternalRecord with full-record pass-through. The composite PK is joined
     * with '|' when every part is present; otherwise the synthetic-PK fallback in the base
     * write layer handles keyless rows. Fields = raw (the complete source record).
     */
    private toExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        const allPresent = pkFieldNames.length > 0
            && pkFieldNames.every(n => raw[n] != null && String(raw[n]).length > 0);
        const externalID = allPresent ? pkFieldNames.map(n => String(raw[n])).join('|') : '';
        return { ExternalID: externalID, ObjectType: objectType, Fields: raw };
    }

    // ─── Connection config parsing ───────────────────────────────────

    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<WildApricotConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const fromCred = await this.loadFromCredential(companyIntegration.CredentialID, contextUser);
            if (fromCred) return fromCred;
        }
        if (companyIntegration.Configuration) {
            return this.validateConfig(JSON.parse(companyIntegration.Configuration) as Record<string, unknown>);
        }
        throw new Error('WildApricotConnector: No credential or Configuration JSON found on CompanyIntegration');
    }

    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<WildApricotConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await cred.Load(credentialID);
        if (!loaded || !cred.Values) return null;
        try {
            const raw = JSON.parse(cred.Values) as Record<string, unknown>;
            return this.validateConfig(raw);
        } catch {
            return null;
        }
    }

    /** Validates + defaults the parsed config. Field names are matched case-insensitively. */
    private validateConfig(raw: Record<string, unknown>): WildApricotConnectionConfig {
        const getStr = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const lower = key.toLowerCase();
                for (const [k, v] of Object.entries(raw)) {
                    if (k.toLowerCase() === lower && typeof v === 'string' && v.length > 0) return v;
                }
            }
            return undefined;
        };
        const getNum = (...keys: string[]): number | undefined => {
            for (const key of keys) {
                const lower = key.toLowerCase();
                for (const [k, v] of Object.entries(raw)) {
                    if (k.toLowerCase() === lower && typeof v === 'number') return v;
                }
            }
            return undefined;
        };
        const apiKey = getStr('apikey', 'api_key', 'key', 'token');
        if (!apiKey) {
            throw new Error('WildApricotConnector: API Key is required (config field "apiKey")');
        }
        return {
            ApiKey: apiKey,
            AccountId: getStr('accountid', 'account_id'),
            ApiBaseUrl: getStr('apibaseurl', 'api_base_url'),
            ApiVersion: getStr('apiversion', 'api_version') ?? DEFAULT_API_VERSION,
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
            AsyncPollTimeoutMs: getNum('asyncpolltimeoutms') ?? DEFAULT_ASYNC_POLL_TIMEOUT_MS,
            AsyncPollIntervalMs: getNum('asyncpollintervalms') ?? DEFAULT_ASYNC_POLL_INTERVAL_MS,
        };
    }
}

/** Tree-shaking prevention function — import + call from the package entry point. */
export function LoadWildApricotConnector(): void { /* no-op */ }
