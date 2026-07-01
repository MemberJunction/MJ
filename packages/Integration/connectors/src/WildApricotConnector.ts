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
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
    type RateLimitPolicy,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

/**
 * Wild Apricot membership-management connector (Admin API v2.3).
 *
 * ── AUTH ──────────────────────────────────────────────────────────────────
 * OAuth 2.0 `client_credentials`. The admin API Key is sent as the HTTP-Basic
 * USERNAME (empty password) on `POST https://oauth.wildapricot.org/auth/token`
 * with `grant_type=client_credentials&scope=auto`. Both the Basic token-endpoint
 * header AND the resulting `Authorization: Bearer <access_token>` header are built
 * via the shared auth-helpers ({@link OAuth2TokenManager} with `UseBasicAuth:true`)
 * — no inline base64/crypto lives in this connector. The access token is cached +
 * auto-refreshed by the manager; the `client_credentials` grant returns no refresh
 * token, so expiry re-mints via the same API key (per Configuration.TokenRefreshStrategy).
 *
 * ── TENANT ANCHOR (accountId) ───────────────────────────────────────────────
 * Every data path is `/accounts/{accountId}/…`. The accountId is a per-tenant anchor,
 * NOT a synced parent record: {@link TestConnection} / {@link Authenticate} resolve it
 * by issuing `GET /v2.3/accounts` (no id in path) and taking the first account's Id when
 * the credential omits AccountId (Configuration.accountIdDiscovery). It is cached on the
 * auth context and substituted into `{accountId}` in {@link MakeHTTPRequest}. It is
 * per-tenant config — NEVER hardcoded.
 *
 * ── DISCOVERY (mechanism only — NO baked catalog) ───────────────────────────
 * Wild Apricot's object/field universe is credential-free-documented (public OpenAPI
 * 9.14.0), so it is seeded as Declared metadata in the integration file. This connector
 * therefore carries NO `WILD_APRICOT_OBJECTS` catalog constant (the deprecated
 * connector's anti-pattern): {@link DiscoverObjects}/{@link DiscoverFields} inherit the
 * base cache-driven implementation that reads the Declared metadata. That is the
 * sanctioned "case-1 → Declared metadata" mechanism.
 *
 * ── CRUD ────────────────────────────────────────────────────────────────────
 * Generic per-operation CRUD from {@link BaseRESTIntegrationConnector} (reads
 * Create/Update/Delete APIPath/Method/BodyShape/IDLocation off each IO row) is used
 * as-is; create fails LOUDLY on an empty response ID via `BuildCreatedResult`. No CRUD
 * verb is re-implemented here.
 *
 * ── PAGINATION ──────────────────────────────────────────────────────────────
 * Offset pagination via Wild Apricot's `$top`/`$skip` params (NOT the base's
 * `limit`/`offset`), clamped to a 100-item max page per spec — {@link BuildPaginatedURL}
 * + {@link ExtractPaginationInfo} are overridden for the vendor param names.
 *
 * ── THE ONE IDIOSYNCRATIC OVERRIDE: async Contacts list ─────────────────────
 * `GET /accounts/{accountId}/contacts` defaults to ASYNC: it returns a `ResultId`
 * that must be polled (`?resultId=<ResultId>`) until `State=Complete`, then the same
 * URL returns the `Contacts` array. {@link FetchChanges} overrides ONLY the `Contact`
 * object to run that request→poll→collect flow (bounded poll timeout); every other
 * object delegates to the base flat/nested paginated fetch. See {@link FetchContacts}.
 */
@RegisterClass(BaseIntegrationConnector, 'WildApricotConnector')
export class WildApricotConnector extends BaseRESTIntegrationConnector {

    /** Cached OAuth2 token manager (one per connector instance; the manager caches + refreshes the token). */
    private tokenManager = new OAuth2TokenManager();
    /** Cached tenant anchor accountId, resolved once per instance (per-tenant, never hardcoded). */
    private cachedAccountId: string | null = null;

    /** Verbatim three-way invariant name: IntegrationName getter === MJ: Integrations.Name. */
    public override get IntegrationName(): string {
        return 'Wild Apricot';
    }

    // ─── Capability surface ──────────────────────────────────────────────────
    // Wild Apricot supports create/update/delete on many objects; the ACTUAL per-verb
    // support is metadata-driven (each IO's Create/Update/Delete columns), and the base's
    // generic CRUD throws for any verb whose columns are null. These getters declare the
    // connector is capable so the engine offers the write surface.

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * Documented rate-limit policy (Configuration.RateLimitDetail). The general ceiling is
     * 400 requests/min (≈6.67/s) for "other request types"; the two Contacts-specific
     * ceilings (list=40/min, by-id=120/min) are lower, so the engine's AIMD bucket starts
     * from the CONSERVATIVE general rate and backs off further on a 429 (honored via
     * ExtractRetryAfterMs). Burst kept modest to respect the per-minute windows.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 6, Burst: 6, ThrottleBackoffFactor: 0.5 };
    }

    /** Parses Wild Apricot's 429 Retry-After (seconds) into ms so the AIMD bucket waits the full window. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        // Wild Apricot returns HTTP 429 "wait for a minute"; when a Retry-After header is present we honor it.
        const headers = this.ExtractErrorHeaders(error);
        const retryAfter = headers?.['retry-after'];
        if (retryAfter) {
            const secs = Number(retryAfter);
            if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
        }
        // No header → the documented guidance is "wait for a minute" on a 429.
        if (this.IsRateLimitError(error)) return 60_000;
        return undefined;
    }

    // ─── Auth + transport (BaseRESTIntegrationConnector abstracts) ────────────

    /**
     * Mints/refreshes the bearer token via the shared OAuth2 manager, then resolves the
     * tenant accountId (from the credential config, else auto-discovered via GET /accounts).
     * Returns the bearer token + accountId on the auth context.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<WildApricotAuthContext> {
        const creds = await this.LoadCredentials(companyIntegration, contextUser);
        const token = await this.tokenManager.GetAccessToken(
            {
                TokenURL: creds.TokenUrl,
                ClientId: creds.ApiKey,     // API key is the Basic-auth USERNAME …
                ClientSecret: '',           // … with an EMPTY password.
                Scopes: 'auto',
                UseBasicAuth: true,         // → Authorization: Basic base64(apiKey:) — built by the helper, no inline crypto.
            },
            'client_credentials'
        );
        const accountId = await this.ResolveAccountId(creds, token.AccessToken);
        return {
            Token: token.AccessToken,
            AccountId: accountId,
            BaseHost: creds.BaseHost,
            ApiVersion: creds.ApiVersion,
        };
    }

    /** Bearer header for API calls, built from the manager-minted token. No inline crypto. */
    protected BuildHeaders(auth: WildApricotAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
        };
    }

    /** Base URL: host + versioned path segment (e.g. https://api.wildapricot.org/v2.3). */
    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: WildApricotAuthContext): string {
        const host = auth.BaseHost ?? WILDAPRICOT_API_HOST;
        const version = auth.ApiVersion ?? DEFAULT_API_VERSION;
        return `${host.replace(/\/+$/, '')}/${version}`;
    }

    /**
     * Executes an HTTP request via fetch. Substitutes the resolved `{accountId}` tenant anchor
     * into the URL (the base leaves it as a template var; here it becomes the concrete tenant id)
     * and parses JSON responses. The concrete connector owns the transport seam so tests override it.
     */
    protected async MakeHTTPRequest(
        auth: WildApricotAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const resolvedUrl = this.SubstituteAccountId(url, auth.AccountId);
        const init: RequestInit = { method, headers };
        if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
            (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
        const response = await fetch(resolvedUrl, init);
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });
        const text = await response.text();
        let parsed: unknown = text;
        const contentType = responseHeaders['content-type'] ?? '';
        if (contentType.includes('json') || (text.length > 0 && (text[0] === '{' || text[0] === '['))) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        return { Status: response.status, Body: parsed, Headers: responseHeaders };
    }

    /**
     * Extracts the record array from a Wild Apricot response. ResponseDataKey is null in the
     * Declared metadata because the wrapper key varies by endpoint (e.g. `Contacts`, `Events`,
     * `Invoices`) and some endpoints return a bare array. So: honor an explicit key when set,
     * else return a root-level array, else unwrap the first array-valued property of an object,
     * else wrap a single object. This handles both wrapped-collection and bare-array shapes.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (responseDataKey && isRecord(rawBody)) {
            const inner = rawBody[responseDataKey];
            if (Array.isArray(inner)) return inner.filter(isRecord);
        }
        if (Array.isArray(rawBody)) return rawBody.filter(isRecord);
        if (isRecord(rawBody)) {
            const arr = this.FindArrayInObject(rawBody);
            if (arr.length > 0) return arr.filter(isRecord);
            return [rawBody];
        }
        return [];
    }

    /**
     * Wild Apricot uses OData-style `$top`/`$skip` Offset pagination (NOT the base's `limit`/`offset`).
     * `$top` is clamped to 100 per spec ("more than 100 → maximum 100 items returned"). Overridden
     * here so the vendor param names + the 100 clamp are honored.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = Math.min(effectivePageSize ?? obj.DefaultPageSize ?? WILDAPRICOT_MAX_PAGE_SIZE, WILDAPRICOT_MAX_PAGE_SIZE);
        const separator = basePath.includes('?') ? '&' : '?';
        return `${basePath}${separator}$skip=${offset}&$top=${pageSize}`;
    }

    /**
     * Offset pagination termination: Wild Apricot list endpoints return fewer than `$top` items on
     * the final page (and none past the end). More pages remain only when a FULL page came back.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        const records = this.NormalizeResponse(rawBody, null);
        const count = records.length;
        const hasMore = pageSize > 0 && count >= pageSize;
        return {
            HasMore: hasMore,
            NextOffset: currentOffset + count,
        };
    }

    // ─── TestConnection (auto-discovers the accountId) ────────────────────────

    /**
     * Tests connectivity by minting a token and listing accounts (GET /accounts). When the credential
     * omits AccountId, the first account's Id is adopted as the tenant anchor (Configuration.accountIdDiscovery).
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const url = `${this.GetBaseURL(companyIntegration, auth)}/accounts`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Wild Apricot authentication failed (HTTP ${response.Status}) — check the API key.` };
            }
            if (response.Status < 200 || response.Status >= 300) {
                return { Success: false, Message: `Wild Apricot /accounts returned HTTP ${response.Status}.` };
            }
            const accounts = this.NormalizeResponse(response.Body, null);
            return {
                Success: true,
                Message: `Connected to Wild Apricot account ${auth.AccountId}; ${accounts.length} account(s) accessible to this API key.`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Wild Apricot connection error: ${message}` };
        }
    }

    // ─── THE idiosyncratic override: async Contacts list ──────────────────────

    /**
     * Fetches records. Only the `Contact` object is idiosyncratic — its list endpoint is ASYNC:
     * the request returns a `ResultId` which must be polled until `State=Complete`. All other
     * objects use the generic base flat/nested paginated fetch unchanged.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        if (ctx.ObjectName === CONTACT_OBJECT_NAME) {
            return this.FetchContacts(ctx);
        }
        return super.FetchChanges(ctx);
    }

    /**
     * Contacts async list flow (the single documented idiosyncrasy):
     *   1. GET /accounts/{accountId}/contacts?$async=true&$skip&$top  → 200/202 with a ResultId.
     *   2. Poll GET /accounts/{accountId}/contacts?resultId=<ResultId> until State='Complete'
     *      (or the poll budget below is exhausted), then read the Contacts array.
     * Incremental narrowing: when a watermark is present it is applied as a `$filter` on the
     * documented cursor field (ProfileLastUpdated). Bounded by POLL_MAX_ATTEMPTS × POLL_INTERVAL_MS
     * so a stuck async job can never hang the sync. Watermark persists on full-page success only.
     */
    private async FetchContacts(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const pkFieldNames = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);
        const effectivePk = pkFieldNames.length > 0 ? pkFieldNames : ['Id'];

        const offset = ctx.CurrentOffset ?? 0;
        const pageSize = Math.min(ctx.BatchSize && ctx.BatchSize > 0 ? ctx.BatchSize : WILDAPRICOT_MAX_PAGE_SIZE, WILDAPRICOT_MAX_PAGE_SIZE);
        const base = `${this.GetBaseURL(ctx.CompanyIntegration, auth)}${obj.APIPath}`;

        // Build the OData query string with LITERAL $-prefixed param names (not URLSearchParams, which
        // percent-encodes `$` → `%24`), keeping it consistent with BuildPaginatedURL's $skip/$top.
        const queryParts = [`$async=true`, `$skip=${offset}`, `$top=${pageSize}`];
        if (ctx.WatermarkValue && obj.IncrementalWatermarkField) {
            // Documented incremental strategy: $filter on ProfileLastUpdated (ISO8601 comparison).
            queryParts.push(`$filter=${encodeURIComponent(`${obj.IncrementalWatermarkField} ge ${ctx.WatermarkValue}`)}`);
        }
        const requestUrl = `${base}?${queryParts.join('&')}`;

        // Step 1: kick off the async query.
        const start = await this.MakeHTTPRequest(auth, requestUrl, 'GET', this.BuildHeaders(auth));
        this.AssertContactsOK(start, 'start async contacts query');
        const records = await this.ResolveAsyncContacts(auth, base, start.Body);

        // Step 2: emit with FULL-RECORD pass-through (Fields = raw source record).
        const out: ExternalRecord[] = records.map(raw => ({
            ExternalID: this.BuildContactIdentity(raw, effectivePk),
            ObjectType: ctx.ObjectName,
            Fields: raw,
        }));

        const hasMore = records.length >= pageSize;
        const result: FetchBatchResult = {
            Records: out,
            HasMore: hasMore,
            NextOffset: offset + records.length,
        };
        // Persist the max watermark seen on this (full-page-success) batch.
        if (obj.IncrementalWatermarkField) {
            const maxWatermark = this.MaxWatermark(records, obj.IncrementalWatermarkField, ctx.WatermarkValue);
            if (maxWatermark) result.NewWatermarkValue = maxWatermark;
        }
        return result;
    }

    /**
     * Resolves the async Contacts response: if a ResultId is present, polls the same endpoint with
     * `?resultId=<id>` until State='Complete' (bounded), then returns the Contacts array. If the
     * initial response already carried the Contacts array synchronously, returns it directly.
     */
    private async ResolveAsyncContacts(
        auth: WildApricotAuthContext,
        baseUrl: string,
        firstBody: unknown
    ): Promise<Record<string, unknown>[]> {
        const parsed = AsyncContactsSchema.safeParse(firstBody);
        const resultId = parsed.success ? parsed.data.ResultId : undefined;

        // Synchronous shape: the body already carries the Contacts array (no polling needed).
        if (!resultId) {
            return this.NormalizeResponse(firstBody, 'Contacts');
        }

        const pollUrl = `${baseUrl}?resultId=${encodeURIComponent(resultId)}`;
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
            const poll = await this.MakeHTTPRequest(auth, pollUrl, 'GET', this.BuildHeaders(auth));
            this.AssertContactsOK(poll, 'poll async contacts result');
            const state = this.ReadState(poll.Body);
            if (state === 'Complete') {
                return this.NormalizeResponse(poll.Body, 'Contacts');
            }
            if (state === 'Failed') {
                throw new Error(`Wild Apricot async contacts query failed (ResultId ${resultId}).`);
            }
            await delay(POLL_INTERVAL_MS);
        }
        throw new Error(
            `Wild Apricot async contacts query did not complete within ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s ` +
            `(ResultId ${resultId}) — poll timeout.`
        );
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Substitutes the resolved `{accountId}` tenant anchor into a URL (case-insensitive on the var name). */
    private SubstituteAccountId(url: string, accountId: string): string {
        return url.replace(/\{accountId\}/gi, encodeURIComponent(accountId));
    }

    /**
     * Resolves the tenant accountId: prefers the credential-configured value, else issues
     * GET /accounts and adopts the first account's Id. Cached per instance. NEVER hardcoded.
     */
    private async ResolveAccountId(creds: WildApricotCredentials, token: string): Promise<string> {
        if (creds.AccountId) return creds.AccountId;
        if (this.cachedAccountId) return this.cachedAccountId;

        const host = creds.BaseHost ?? WILDAPRICOT_API_HOST;
        const version = creds.ApiVersion ?? DEFAULT_API_VERSION;
        const url = `${host.replace(/\/+$/, '')}/${version}/accounts`;
        // Auth is not yet fully assembled (that's what we're resolving), so build a minimal context.
        const bootstrapAuth: WildApricotAuthContext = { Token: token, AccountId: '', BaseHost: creds.BaseHost, ApiVersion: creds.ApiVersion };
        const response = await this.MakeHTTPRequest(bootstrapAuth, url, 'GET', this.BuildHeaders(bootstrapAuth));
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Wild Apricot account auto-discovery failed: GET /accounts returned HTTP ${response.Status}.`);
        }
        const accounts = this.NormalizeResponse(response.Body, null);
        const first = accounts[0];
        const id = first ? first['Id'] ?? first['id'] : undefined;
        if (id == null) {
            throw new Error('Wild Apricot account auto-discovery returned no accounts for this API key.');
        }
        this.cachedAccountId = String(id);
        return this.cachedAccountId;
    }

    /** Finds the first array-valued property of an object (a wrapped collection under a vendor key). */
    private FindArrayInObject(obj: Record<string, unknown>): unknown[] {
        for (const v of Object.values(obj)) {
            if (Array.isArray(v)) return v;
        }
        return [];
    }

    /** Reads the async-result State ('Complete'/'Processing'/'Failed'/…) from a poll body, tolerant of shape. */
    private ReadState(body: unknown): string | undefined {
        if (!isRecord(body)) return undefined;
        const state = body['State'] ?? body['state'];
        return typeof state === 'string' ? state : undefined;
    }

    /** Builds a Contact record identity from its declared PK (falls back to a common id key, then a content hash). */
    private BuildContactIdentity(raw: Record<string, unknown>, pkFieldNames: string[]): string {
        const parts = pkFieldNames.map(name => raw[name]).filter(v => v != null && String(v).length > 0);
        if (parts.length === pkFieldNames.length && parts.length > 0) {
            return parts.map(v => String(v)).join('|');
        }
        for (const k of ['Id', 'id', 'ID']) {
            const v = raw[k];
            if (v != null && String(v).length > 0) return String(v);
        }
        return stableHash(raw);
    }

    /** Max watermark value across a record batch (ISO8601 string comparison), never below the current one. */
    private MaxWatermark(records: Record<string, unknown>[], field: string, current: string | null): string | undefined {
        let max = current ?? '';
        for (const r of records) {
            const v = r[field];
            if (typeof v === 'string' && v > max) max = v;
        }
        return max.length > 0 && max !== (current ?? '') ? max : undefined;
    }

    /** Throws a descriptive error on a non-2xx contacts response (202 Accepted is treated as OK for the async kick-off). */
    private AssertContactsOK(response: RESTResponse, action: string): void {
        if (response.Status === 202) return;
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Wild Apricot failed to ${action}: HTTP ${response.Status}`);
        }
    }

    /** Reads headers off an error-like object (for Retry-After parsing). */
    private ExtractErrorHeaders(error: unknown): Record<string, string> | undefined {
        if (isRecord(error)) {
            const headers = error['Headers'] ?? error['headers'];
            if (isRecord(headers)) {
                const out: Record<string, string> = {};
                for (const [k, v] of Object.entries(headers)) {
                    if (typeof v === 'string') out[k.toLowerCase()] = v;
                }
                return out;
            }
        }
        return undefined;
    }

    /** Whether an error indicates a 429 rate-limit. */
    private IsRateLimitError(error: unknown): boolean {
        if (isRecord(error)) {
            const status = error['Status'] ?? error['status'] ?? error['StatusCode'];
            if (status === 429) return true;
        }
        const msg = error instanceof Error ? error.message : String(error ?? '');
        return /\b429\b/.test(msg);
    }

    /**
     * Resolves the API key + tenant config from the linked Credential entity, falling back to the
     * CompanyIntegration.Configuration / APIKey. The credential bytes never leave this scope.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<WildApricotCredentials> {
        let apiKey: string | undefined;
        let accountId: string | undefined;
        let tokenUrl: string | undefined;
        let baseHost: string | undefined;
        let apiVersion: string | undefined;

        if (companyIntegration.CredentialID) {
            const fromCred = await this.LoadFromCredentialEntity(companyIntegration.CredentialID, contextUser);
            if (fromCred) {
                apiKey = fromCred.ApiKey || apiKey;
                accountId = fromCred.AccountId || accountId;
                tokenUrl = fromCred.TokenUrl || tokenUrl;
                baseHost = fromCred.BaseHost || baseHost;
                apiVersion = fromCred.ApiVersion || apiVersion;
            }
        }

        // Non-secret tenant config lives on Configuration JSON (AccountId, tokenUrl, host, version).
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const fromConfig = this.ParseConfigJson(configJson);
            if (fromConfig) {
                apiKey = apiKey ?? fromConfig.ApiKey;
                accountId = accountId ?? fromConfig.AccountId;
                tokenUrl = tokenUrl ?? fromConfig.TokenUrl;
                baseHost = baseHost ?? fromConfig.BaseHost;
                apiVersion = apiVersion ?? fromConfig.ApiVersion;
            }
        }

        // Legacy fallback: the API key may live on CompanyIntegration.APIKey.
        apiKey = apiKey ?? companyIntegration.APIKey ?? undefined;

        if (!apiKey) {
            throw new Error('No Wild Apricot API key found — set the admin API Key on the credential, Configuration JSON, or CompanyIntegration.APIKey.');
        }
        return {
            ApiKey: apiKey,
            AccountId: accountId,
            TokenUrl: tokenUrl ?? WILDAPRICOT_TOKEN_URL,
            BaseHost: baseHost,
            ApiVersion: apiVersion,
        };
    }

    /** Loads credential fields from a Credential entity's Values JSON. */
    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<WildApricotCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseConfigJson(credential.Values);
    }

    /** Parses a JSON string into credential/config fields (tolerant of casing/aliases). */
    private ParseConfigJson(json: string): WildApricotCredentials | null {
        try {
            const result = WildApricotConfigSchema.safeParse(JSON.parse(json));
            if (!result.success) return null;
            const p = result.data;
            const apiKey = p.ApiKey ?? p.apiKey ?? p.APIKey ?? p.Key ?? p.Token ?? p.token;
            const accountId = p.AccountId ?? p.accountId ?? p.AccountID;
            const tokenUrl = p.tokenUrl ?? p.TokenUrl ?? p.tokenURL;
            const baseHost = p.apiBaseUrl ?? p.BaseURL ?? p.baseHost;
            const apiVersion = p.ApiVersion ?? p.apiVersion;
            return {
                ApiKey: apiKey ?? '',
                AccountId: accountId != null ? String(accountId) : undefined,
                TokenUrl: tokenUrl ?? WILDAPRICOT_TOKEN_URL,
                BaseHost: baseHost,
                ApiVersion: apiVersion,
            };
        } catch {
            return null;
        }
    }
}

// ─── Module-level constants + helpers (mechanism, NOT a catalog) ──────────────

/** Wild Apricot API host root; the version segment (/v2.3) + tenant paths are appended at runtime. */
const WILDAPRICOT_API_HOST = 'https://api.wildapricot.org';
/** OAuth2 token endpoint (client_credentials). */
const WILDAPRICOT_TOKEN_URL = 'https://oauth.wildapricot.org/auth/token';
/** Default API version path segment. */
const DEFAULT_API_VERSION = 'v2.3';
/** Max page size — `$top` above 100 is silently clamped to 100 per spec. */
const WILDAPRICOT_MAX_PAGE_SIZE = 100;
/** The single object whose list endpoint is async (request → ResultId → poll). */
const CONTACT_OBJECT_NAME = 'Contact';
/** Async-contacts poll bounds: attempts × interval caps total wait so a stuck job cannot hang the sync. */
const POLL_MAX_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 1000;

/** Auth context: resolved bearer token + tenant accountId + non-secret host/version overrides. */
interface WildApricotAuthContext extends RESTAuthContext {
    Token: string;
    AccountId: string;
    BaseHost?: string;
    ApiVersion?: string;
}

/** Resolved Wild Apricot credentials/config. */
interface WildApricotCredentials {
    ApiKey: string;
    AccountId?: string;
    TokenUrl: string;
    BaseHost?: string;
    ApiVersion?: string;
}

/** Zod schema for the credential/Configuration JSON shape (tolerant of casing aliases). */
const WildApricotConfigSchema = z.object({
    ApiKey: z.string().optional(),
    apiKey: z.string().optional(),
    APIKey: z.string().optional(),
    Key: z.string().optional(),
    Token: z.string().optional(),
    token: z.string().optional(),
    AccountId: z.union([z.string(), z.number()]).optional(),
    accountId: z.union([z.string(), z.number()]).optional(),
    AccountID: z.union([z.string(), z.number()]).optional(),
    tokenUrl: z.string().optional(),
    TokenUrl: z.string().optional(),
    tokenURL: z.string().optional(),
    apiBaseUrl: z.string().optional(),
    BaseURL: z.string().optional(),
    baseHost: z.string().optional(),
    ApiVersion: z.string().optional(),
    apiVersion: z.string().optional(),
}).passthrough();

/** Zod schema for the async-contacts kick-off response (carries a ResultId to poll). */
const AsyncContactsSchema = z.object({
    ResultId: z.string().optional(),
    State: z.string().optional(),
}).passthrough();

/** Narrows an unknown value to a plain record. */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Small deterministic hash for record-identity fallback (FNV-1a, hex). */
function stableHash(record: Record<string, unknown>): string {
    const json = JSON.stringify(record, Object.keys(record).sort());
    let h = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
        h ^= json.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
}

/** Awaits `ms` milliseconds (poll interval). */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
