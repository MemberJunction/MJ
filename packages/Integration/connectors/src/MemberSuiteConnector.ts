/**
 * MemberSuiteConnector — Integration connector for MemberSuite (Association Management System).
 *
 * MemberSuite is a multi-service AMS exposed over a REST API v2 (JSON). Member data is reached
 * across six in-scope services — CRM, Membership, Events, Orders, Certifications, Fundraising —
 * each versioned independently (`/{service}/v1/{resource}`; the Platform auth service is v2). The
 * shared host is `https://rest.membersuite.com`; tenancy is resolved by a `{tenantId}` PATH segment
 * on every list endpoint plus the auth-token context — there is NO per-account hostname variation.
 *
 *   READS  — list/get via `GET /{service}/v1/{resource}/{tenantId}?msql=&page=&pageSize=`.
 *            PageNumber pagination (1-indexed). Filtering + incremental sync use MSQL
 *            (MemberSuite Query Language) on the uniform `lastModifiedDate` watermark field:
 *            `msql=select * from {object} where lastModifiedDate > {watermark}`.
 *   WRITES — SCOPED to Activity + Certification writebacks ONLY (the operator-approved write-back
 *            use cases per the MemberSuiteContext). The API documents full CRUD on most objects, but
 *            writing arbitrary member/membership/order records against a live AMS is high-risk, so
 *            the connector REFUSES writes outside the writeback allowlist even though the per-IO
 *            write columns exist in metadata. Allowed writes route through the generic per-operation
 *            BaseRESTIntegrationConnector CRUD path (create POST flat / id-in-body → BuildCreatedResult;
 *            update PUT path-keyed; delete uses the non-standard infix `/delete/{id}`).
 *
 * AUTH (two-step signed request):
 *   1. POST the 6-part signed credential set (accessKeyId + associationId + associationKey +
 *      secretAccessKey + signingCertificate + signingCertificateId) to
 *      `/platform/v2/msc_authdata/{tenantId}` → receive AuthenticationData {accessToken, idToken,
 *      refreshToken}.
 *   2. Pass the raw `accessToken` as the `Authorization` header value (NO "Bearer " prefix — the
 *      swagger documents the Authorization parameter as the bare access-token string) on all
 *      subsequent data requests. The `/platform/v2/refreshtoken` endpoint refreshes an expired token.
 *
 *   The 6-part credential set + tenantId are ALL per-connection Configuration/credential values —
 *   never baked constants (tenant-agnostic code). The "signing certificate" and its id are POSTed as
 *   credential VALUES in the auth body per the OpenAPI spec; the public swagger documents NO
 *   client-side HMAC/signature computation, so this connector performs NO inline crypto. See the
 *   RemainingGaps note in CODE_REPORT.md if a tenant's deployment requires request-signing beyond
 *   posting the credential set — that is a live-verification gap, not a fabricated routine here.
 *
 * DISCOVERY: DiscoverObjects/DiscoverFields return the Declared baseline (the credential-free swagger
 * universe, seeded into the engine cache) AND encode the runtime MECHANISM for tenant-specific
 * custom-field (`/platform/v2/customfields/{tenantId}`) + saved-search (`/platform/v2/savedsearches/
 * {tenantId}`) discovery — never a baked catalog of a customer's customs/saved searches.
 * DiscoveryIsAuthoritative stays FALSE: the baseline is multi-swagger (not a single enumerate-all
 * endpoint) and the custom/saved-search surface is per-tenant + partial, so absence in any one
 * tenant's refresh must NEVER deactivate the Declared metadata.
 *
 * API Documentation (swagger, credential-free):
 *   - Platform: https://rest.membersuite.com/platform/swagger/docs/v2
 *   - CRM:      https://rest.membersuite.com/crm/swagger/docs/v1
 *   - (Membership / Events / Orders / Certifications / Fundraising mirror the CRM shape)
 *
 * NO BAKED CATALOG. The object/field universe is Declared (swagger → metadata file → engine cache) +
 * Discovered (runtime custom-field + saved-search MECHANISM). This file is pure mechanism: auth, HTTP,
 * discover, fetch, normalize, transform, write.
 */
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
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type FetchContext,
    type FetchBatchResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type RateLimitPolicy,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * Connection configuration parsed from the Credential entity / CompanyIntegration.Configuration JSON.
 * Every field is per-connection (tenant-scoped) — NONE are baked constants.
 */
export interface MemberSuiteConnectionConfig {
    /** Tenant / association id — the `{tenantId}` path segment on the auth + list endpoints. */
    TenantID: string;
    /** 6-part signed-request credential set. */
    AccessKeyID: string;
    AssociationID: string;
    AssociationKey: string;
    SecretAccessKey: string;
    /** Signing certificate (PEM/base64) — a POSTed credential VALUE, not a client-side signing key. */
    SigningCertificate: string;
    SigningCertificateID: string;
    /** Optional pre-provisioned access token (test/broker injection) — bypasses the token exchange. */
    AccessToken?: string;
    RefreshToken?: string;
    /** Override for the shared host (defaults to https://rest.membersuite.com). */
    BaseURL?: string;
}

interface MemberSuiteAuthContext extends RESTAuthContext {
    Config: MemberSuiteConnectionConfig;
    BaseURL: string;
    /** The accessToken value passed verbatim as the Authorization header. */
    AccessToken: string;
}

interface CachedToken { AccessToken: string; RefreshToken?: string; ExpiresAt: number; }

/** AuthenticationData shape returned by the msc_authdata token-exchange endpoint. */
interface AuthenticationDataResponse {
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
}

/** Per-IO access-path Configuration shape carried in the frozen contract. */
interface IOAccessConfig {
    service?: string;
    apiVersion?: string;
    listPath?: string | null;
    listParams?: Record<string, string>;
    pagination?: { type?: string; pageParam?: string; pageSizeParam?: string; oneIndexed?: boolean };
    accessPath?: { entryQuery?: string; nesting?: string[]; doorArgs?: string[] };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://rest.membersuite.com';
const AUTH_PATH_TEMPLATE = '/platform/v2/msc_authdata/{tenantId}';
const REFRESH_PATH = '/platform/v2/refreshtoken';
/** Runtime-discovery MECHANISM endpoints (per-tenant, auth-gated, partial — never the baseline). */
const CUSTOM_FIELDS_PATH_TEMPLATE = '/platform/v2/customfields/{tenantId}';
const SAVED_SEARCHES_PATH_TEMPLATE = '/platform/v2/savedsearches/{tenantId}';
/** Uniform vendor watermark field across all six in-scope services. */
const DEFAULT_WATERMARK_FIELD = 'lastModifiedDate';
/** Vendor-wide PK convention (id on every resource definition). */
const PK_FIELD = 'id';
/** PageNumber pagination is 1-indexed (first page = 1). */
const FIRST_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

/**
 * The ONLY objects this connector will write to — the operator-approved writeback allowlist
 * (Activity + Certification). Lower-cased IO names. Per-connection, not a vendor constant of the API
 * surface: it encodes the SCOPE decision, not a catalog. Writes to any other object are refused even
 * though the API + metadata declare CRUD columns for them.
 */
const WRITEBACK_ALLOWLIST = new Set<string>(['activities', 'certifications']);

const TOKEN_REFRESH_BUFFER_MS = 60_000;
const TOKEN_LIFETIME_MS = 3_600_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 50;

// ─── Connector ──────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'MemberSuiteConnector')
export class MemberSuiteConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'MemberSuite'; }

    // Capability getters: the connector CAN write (the writeback path exists), but the per-object
    // allowlist guard in CreateRecord/UpdateRecord/DeleteRecord enforces that only Activity +
    // Certification writebacks actually fire. Declaring the capability here lets the engine route
    // writes to the connector; the guard decides per object.
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * NOT authoritative for deactivation (matches the contract). The Declared baseline is seeded from
     * six independent swagger specs (no single enumerate-all endpoint), and the runtime custom-field /
     * saved-search surface is per-tenant + partial — absence in any one refresh proves nothing about
     * the canonical object set, so it must NEVER trigger deactivation of Declared metadata.
     */
    public override get DiscoveryIsAuthoritative(): boolean { return false; }

    // ── §7 sync-efficiency hooks ─────────────────────────────────────────────

    /**
     * MSQL incremental orders by lastModifiedDate and re-fetches `> watermark`, so the watermark is
     * monotonic per object — the engine may narrow the next incremental window.
     */
    public override get MonotonicWatermark(): boolean { return true; }

    /** Every resource exposes `id`; for no-watermark resume the engine keyset-orders by it. */
    public override StableOrderingKey(_objectName: string): string | null { return PK_FIELD; }

    /**
     * MemberSuite publishes no documented tokens/sec rate limit in the swagger specs. A conservative
     * sustained rate keeps the connector polite against a shared host; the engine's AIMD bucket adapts
     * downward on any throttle signal. (Provable-only: this is a safe default, not a documented limit.)
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 10, Burst: 15, ThrottleBackoffFactor: 0.5 };
    }

    /** Honor a standard `Retry-After` header (seconds) if the vendor sends one on a 429. */
    public override ExtractRetryAfterMs(error: unknown): number | undefined {
        if (!error || typeof error !== 'object') return undefined;
        const headers = (error as { Headers?: Record<string, string> }).Headers;
        const ra = headers?.['retry-after'];
        if (ra) {
            const secs = Number(ra);
            if (!isNaN(secs)) return secs * 1000;
        }
        return undefined;
    }

    // ── Discovery (Declared baseline + runtime custom-field / saved-search MECHANISM) ─

    /**
     * Returns the Declared baseline (the swagger universe seeded into the engine cache by the base
     * implementation) PLUS — additively, when a credential is present — tenant-specific custom objects
     * surfaced by the runtime saved-search MECHANISM. The baseline ALWAYS comes back credential-free
     * (so a credential-free DocStructureSelfCheck re-yields the standard universe); a live credential is
     * additive only. No catalog of customs is baked here.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        // 1) Declared baseline — credential-free, from the engine cache. ALWAYS the standard universe.
        const baseline = await super.DiscoverObjects(companyIntegration, contextUser);

        // 2) ADDITIVE runtime discovery (mechanism, never a baked answer): a tenant's saved searches are
        //    a per-tenant custom query surface. Surface them as extra discoverable objects ONLY when a
        //    credential is configured — absence never removes baseline objects (DiscoveryIsAuthoritative=false).
        if (!this.HasCredential(companyIntegration)) return baseline;
        try {
            const extras = await this.DiscoverSavedSearchObjects(companyIntegration, contextUser);
            const known = new Set(baseline.map(o => o.Name.toLowerCase()));
            for (const e of extras) if (!known.has(e.Name.toLowerCase())) baseline.push(e);
        } catch (err) {
            // Runtime discovery is best-effort + additive — a failure must not break the standard universe.
            console.warn(`[${this.IntegrationName}] saved-search discovery skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
        return baseline;
    }

    /**
     * Returns the Declared fields (from the engine cache) PLUS — additively, with a credential — the
     * tenant's custom fields for the object via the runtime custom-field MECHANISM. The Declared set is
     * always present; customs are an extension, never a replacement, and are never baked.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const declared = await super.DiscoverFields(companyIntegration, objectName, contextUser);
        if (!this.HasCredential(companyIntegration)) return declared;
        try {
            const customs = await this.DiscoverCustomFields(companyIntegration, objectName, contextUser);
            const known = new Set(declared.map(f => f.Name.toLowerCase()));
            for (const c of customs) if (!known.has(c.Name.toLowerCase())) declared.push(c);
        } catch (err) {
            console.warn(`[${this.IntegrationName}] custom-field discovery skipped for "${objectName}": ${err instanceof Error ? err.message : String(err)}`);
        }
        return declared;
    }

    /**
     * Runtime MECHANISM: fetch a tenant's custom-field definitions for an object and map them to
     * ExternalFieldSchema. Custom fields are tenant-defined extensions — never declared, never NOT NULL
     * (provable-only: a custom field's required-ness is not asserted by this endpoint's shape unless
     * the vendor flags it). This is the discovery mechanism; the actual fields come from the live call.
     */
    private async DiscoverCustomFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as MemberSuiteAuthContext;
        const path = this.ResolveTenantPath(CUSTOM_FIELDS_PATH_TEMPLATE, auth.Config.TenantID);
        const url = `${this.GetBaseURL(companyIntegration, auth)}${path}?objectType=${encodeURIComponent(objectName)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) return [];
        const raw = this.NormalizeResponse(response.Body, null);
        return raw.map(cf => this.CustomFieldToSchema(cf));
    }

    /** Maps a raw custom-field definition to a field schema. Provable-only on required/type. */
    private CustomFieldToSchema(cf: Record<string, unknown>): ExternalFieldSchema {
        const name = String(cf['name'] ?? cf['fieldName'] ?? cf['id'] ?? '');
        const dataType = typeof cf['dataType'] === 'string' ? this.MapCustomFieldType(cf['dataType'] as string) : 'string';
        const schema: ExternalFieldSchema = {
            Name: name,
            Label: typeof cf['label'] === 'string' ? (cf['label'] as string) : name,
            Description: typeof cf['description'] === 'string' ? (cf['description'] as string) : undefined,
            DataType: dataType,
            // Provable-only: only mark required when the vendor explicitly flags it.
            IsRequired: cf['isRequired'] === true,
            IsUniqueKey: false,
            IsReadOnly: cf['isReadOnly'] === true,
        };
        return schema;
    }

    private MapCustomFieldType(t: string): string {
        const map: Record<string, string> = {
            string: 'string', text: 'string', textarea: 'string', email: 'string', url: 'string', phone: 'string',
            boolean: 'boolean', bool: 'boolean', integer: 'number', int: 'number', number: 'number',
            decimal: 'decimal', currency: 'decimal', money: 'decimal', date: 'datetime', datetime: 'datetime',
            picklist: 'string', lookup: 'string',
        };
        return map[t.toLowerCase()] ?? 'string';
    }

    /**
     * Runtime MECHANISM: surface a tenant's saved searches as discoverable objects. Saved searches are a
     * per-tenant query surface (each tenant defines its own) — never a standard object family, so they
     * are additive-only and the connector stays non-authoritative.
     */
    private async DiscoverSavedSearchObjects(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as MemberSuiteAuthContext;
        const path = this.ResolveTenantPath(SAVED_SEARCHES_PATH_TEMPLATE, auth.Config.TenantID);
        const url = `${this.GetBaseURL(companyIntegration, auth)}${path}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) return [];
        const raw = this.NormalizeResponse(response.Body, null);
        return raw.map(ss => ({
            Name: `savedsearch:${String(ss['name'] ?? ss['id'] ?? '')}`,
            Label: typeof ss['name'] === 'string' ? (ss['name'] as string) : 'Saved Search',
            Description: 'Tenant-defined saved search (runtime-discovered query surface).',
            SupportsIncrementalSync: false,
            SupportsWrite: false,
        }));
    }

    // ── Auth (two-step signed request → accessToken header) ───────────────────

    protected async Authenticate(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return this.BuildAuthContext(config, this.tokenCache.AccessToken);
        }
        const token = await this.ObtainToken(config);
        this.tokenCache = token;
        return this.BuildAuthContext(config, token.AccessToken);
    }

    private BuildAuthContext(config: MemberSuiteConnectionConfig, accessToken: string): MemberSuiteAuthContext {
        return {
            Token: accessToken,
            AccessToken: accessToken,
            Config: config,
            BaseURL: config.BaseURL ?? DEFAULT_BASE_URL,
        } as MemberSuiteAuthContext;
    }

    /**
     * Step 1 of the two-step flow: POST the 6-part signed credential set to msc_authdata → accessToken.
     *
     * NO inline crypto. The swagger documents the signing certificate + its id as VALUES posted in the
     * auth body (the server verifies them); it documents NO client-side HMAC/signature computation. If a
     * future tenant deployment requires request-signing beyond posting the credential set, that is a
     * NOTED auth-helpers extension request (RemainingGaps), not a fabricated routine here.
     */
    private async ObtainToken(config: MemberSuiteConnectionConfig): Promise<CachedToken> {
        // Pre-provisioned token (test/broker injection) — use as-is, no exchange.
        if (config.AccessToken) {
            return { AccessToken: config.AccessToken, RefreshToken: config.RefreshToken, ExpiresAt: Date.now() + TOKEN_LIFETIME_MS };
        }
        const baseURL = config.BaseURL ?? DEFAULT_BASE_URL;
        // Refresh path: a cached refresh token can re-mint an access token without re-signing.
        if (this.tokenCache?.RefreshToken) {
            const refreshed = await this.RefreshToken(baseURL, this.tokenCache.RefreshToken, config);
            if (refreshed) return refreshed;
        }
        const authPath = this.ResolveTenantPath(AUTH_PATH_TEMPLATE, config.TenantID);
        const body = {
            accessKeyId: config.AccessKeyID,
            associationId: config.AssociationID,
            associationKey: config.AssociationKey,
            secretAccessKey: config.SecretAccessKey,
            signingCertificate: config.SigningCertificate,
            signingCertificateId: config.SigningCertificateID,
        };
        const response = await this.RawPost(`${baseURL}${authPath}`, body);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`MemberSuite auth failed: HTTP ${response.Status} at ${authPath} — ${this.SafeBody(response)}`);
        }
        const data = response.Body as AuthenticationDataResponse;
        if (!data || typeof data.accessToken !== 'string' || data.accessToken.length === 0) {
            throw new Error('MemberSuite auth response carried no accessToken.');
        }
        return { AccessToken: data.accessToken, RefreshToken: data.refreshToken, ExpiresAt: Date.now() + TOKEN_LIFETIME_MS };
    }

    /** Step 2 refresh: POST RefreshTokenRequest {idToken, refreshToken} → new accessToken. Best-effort. */
    private async RefreshToken(baseURL: string, refreshToken: string, _config: MemberSuiteConnectionConfig): Promise<CachedToken | null> {
        try {
            const response = await this.RawPost(`${baseURL}${REFRESH_PATH}`, { refreshToken });
            if (response.Status < 200 || response.Status >= 300) return null;
            const data = response.Body as AuthenticationDataResponse;
            if (typeof data?.accessToken !== 'string' || data.accessToken.length === 0) return null;
            return { AccessToken: data.accessToken, RefreshToken: data.refreshToken ?? refreshToken, ExpiresAt: Date.now() + TOKEN_LIFETIME_MS };
        } catch {
            return null; // fall back to a full re-auth
        }
    }

    private async ParseConfig(companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MemberSuiteConnectionConfig> {
        const fromConfigJSON = this.ParseConfigJSON(companyIntegration.Configuration);
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const md = provider ?? new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                return this.BuildConfig(parsed, fromConfigJSON);
            }
        }
        if (fromConfigJSON) return this.BuildConfig(fromConfigJSON, null);
        throw new Error('No MemberSuite credentials found — set the Credential entity or Configuration JSON.');
    }

    private ParseConfigJSON(json: string | null | undefined): Record<string, string> | null {
        if (!json) return null;
        try { return JSON.parse(json) as Record<string, string>; } catch { return null; }
    }

    private BuildConfig(creds: Record<string, string>, configJSON: Record<string, string> | null): MemberSuiteConnectionConfig {
        const pick = (...keys: string[]): string | undefined => {
            for (const k of keys) {
                if (creds[k]) return creds[k];
                if (configJSON && configJSON[k]) return configJSON[k];
            }
            return undefined;
        };
        return {
            TenantID: pick('TenantID', 'tenantId', 'tenant_id', 'AssociationID', 'associationId') ?? '',
            AccessKeyID: pick('AccessKeyID', 'accessKeyId', 'access_key_id') ?? '',
            AssociationID: pick('AssociationID', 'associationId', 'association_id') ?? '',
            AssociationKey: pick('AssociationKey', 'associationKey', 'association_key') ?? '',
            SecretAccessKey: pick('SecretAccessKey', 'secretAccessKey', 'secret_access_key') ?? '',
            SigningCertificate: pick('SigningCertificate', 'signingCertificate', 'signing_certificate') ?? '',
            SigningCertificateID: pick('SigningCertificateID', 'signingCertificateId', 'signing_certificate_id') ?? '',
            AccessToken: pick('AccessToken', 'accessToken', 'access_token'),
            RefreshToken: pick('RefreshToken', 'refreshToken', 'refresh_token'),
            BaseURL: pick('BaseURL', 'baseUrl', 'base_url'),
        };
    }

    /** True when a credential or Configuration-carried credential set is present (gates live discovery). */
    private HasCredential(companyIntegration: MJCompanyIntegrationEntity): boolean {
        if (companyIntegration.CredentialID) return true;
        const cfg = this.ParseConfigJSON(companyIntegration.Configuration);
        return !!cfg && (!!cfg['AccessToken'] || !!cfg['accessToken'] || !!cfg['SecretAccessKey'] || !!cfg['secretAccessKey']);
    }

    // ── TestConnection ───────────────────────────────────────────────────────

    public async TestConnection(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as MemberSuiteAuthContext;
            if (!auth.AccessToken) return { Success: false, Message: 'MemberSuite authentication returned no access token.' };
            // A successful token exchange is the connection proof; confirm the host is reachable for a read.
            const probePath = this.ResolveTenantPath(CUSTOM_FIELDS_PATH_TEMPLATE, auth.Config.TenantID);
            const response = await this.MakeHTTPRequest(auth, `${this.GetBaseURL(companyIntegration, auth)}${probePath}`, 'GET', this.BuildHeaders(auth));
            if (response.Status >= 200 && response.Status < 300) return { Success: true, Message: 'Connected to MemberSuite REST API v2.' };
            if (response.Status === 401 || response.Status === 403) return { Success: false, Message: `MemberSuite authorization denied: HTTP ${response.Status}.` };
            // The token exchange already succeeded; a non-2xx on the probe (e.g. 404 for a tenant with no
            // custom fields) still means we authenticated successfully.
            return { Success: true, Message: `Authenticated to MemberSuite (probe returned HTTP ${response.Status}).` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── URL / Response / Pagination ──────────────────────────────────────────

    protected GetBaseURL(_ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as MemberSuiteAuthContext).BaseURL;
    }

    /** Substitute the `{tenantId}` segment into a path template (tenant-scoped, never a constant). */
    private ResolveTenantPath(template: string, tenantID: string): string {
        return template.replace(/\{tenantId\}/g, encodeURIComponent(tenantID));
    }

    /**
     * Strip the response envelope to expose individual records. MemberSuite list responses return either
     * a bare array, or an envelope with the records under a `results`/`items`/`data` key (the swagger
     * uses `results` for the paged list shape); a get-one returns a single object.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (!rawBody || typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        if (responseDataKey && Array.isArray(body[responseDataKey])) return body[responseDataKey] as Record<string, unknown>[];
        for (const k of ['results', 'items', 'data', 'records', 'Results', 'Items']) {
            if (Array.isArray(body[k])) return body[k] as Record<string, unknown>[];
        }
        // A single non-enveloped record (e.g. get-one) — pass through as one record.
        return [body];
    }

    /**
     * PageNumber pagination (1-indexed). A page that returns a full page-size implies more may remain;
     * a short/empty page is the last. The total may be reported under `totalCount`/`count` — when present
     * we use it for an exact HasMore, otherwise fall back to the page-fill heuristic.
     */
    protected ExtractPaginationInfo(rawBody: unknown, _pt: PaginationType, currentPage: number, _co: number, pageSize: number): PaginationState {
        const records = this.NormalizeResponse(rawBody, null);
        let total: number | undefined;
        if (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) {
            const body = rawBody as Record<string, unknown>;
            for (const k of ['totalCount', 'count', 'total', 'TotalCount', 'totalRecords']) {
                if (typeof body[k] === 'number') { total = body[k] as number; break; }
            }
        }
        if (typeof total === 'number') {
            const seen = currentPage * pageSize;
            return { HasMore: seen < total, NextPage: currentPage + 1, TotalRecords: total };
        }
        const hasMore = records.length >= pageSize && records.length > 0;
        return { HasMore: hasMore, NextPage: currentPage + 1 };
    }

    // ── FetchChanges (MSQL list with tenantId path + watermark filter + page paging) ─

    /**
     * Reads a MemberSuite object via the list door:
     *   GET /{service}/v1/{resource}/{tenantId}?msql=<select … where lastModifiedDate > wm>&page=&pageSize=
     *
     * The IO's `APIPath` (`/{service}/v1/{resource}`) is the base; we append the `{tenantId}` path segment
     * (the access path's `entryQuery` carries `/{service}/v1/{resource}/{tenantId}`), the MSQL filter
     * (watermark-driven incremental), and the 1-indexed page params. This is genuinely idiosyncratic
     * (tenantId path segment + MSQL query language), so we override the base flat-fetch rather than the
     * base appending only `page`/`pageSize` to a tenantId-less path.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        // Saved-search runtime objects are a query surface, not a standard list door — nothing to pull here.
        if (ctx.ObjectName.startsWith('savedsearch:')) {
            return { Records: [], HasMore: false, Warnings: [{ Code: 'NON_STANDARD_OBJECT', Message: `"${ctx.ObjectName}" is a tenant saved search (runtime query surface); it is not synced via the standard list door.` }] };
        }
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as MemberSuiteAuthContext;
        const headers = this.BuildHeaders(auth);
        const watermarkField = obj.IncrementalWatermarkField ?? DEFAULT_WATERMARK_FIELD;
        const cfg = this.ReadAccessConfig(obj);
        const resourceName = this.ResourceNameForMSQL(obj, cfg);

        const pageSize = obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const listBase = `${this.GetBaseURL(ctx.CompanyIntegration, auth)}${this.BuildListPath(obj, cfg, auth.Config.TenantID)}`;
        const msql = this.BuildMSQL(resourceName, watermarkField, ctx.WatermarkValue ?? null);

        const allRaw: Record<string, unknown>[] = [];
        let page = ctx.CurrentPage ?? FIRST_PAGE;
        const batchLimit = ctx.BatchSize ?? Number.MAX_SAFE_INTEGER;
        let hasMore = true;
        let lastPageReached = false;

        while (hasMore && allRaw.length < batchLimit) {
            const url = this.BuildMSQLPageURL(listBase, msql, page, pageSize);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 403) {
                return { Records: [], HasMore: false, Warnings: [{ Code: 'FORBIDDEN', Message: `"${ctx.ObjectName}" requires additional API permissions (HTTP 403); skipping.` }] };
            }
            if (response.Status < 200 || response.Status >= 300) {
                throw new Error(`MemberSuite list error for "${ctx.ObjectName}": HTTP ${response.Status} — ${this.SafeBody(response)}`);
            }
            const pageRecords = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
            if (pageRecords.length === 0) { hasMore = false; lastPageReached = true; break; }
            allRaw.push(...pageRecords);
            const pg = this.ExtractPaginationInfo(response.Body, obj.PaginationType, page, 0, pageSize);
            hasMore = pg.HasMore;
            page = pg.NextPage ?? page + 1;
            if (!hasMore) lastPageReached = true;
        }

        const pkFieldNames = this.FindPKFieldNames(fields);
        const records = allRaw.map(r => this.RawToExternalRecord(r, obj, ctx.ObjectName, watermarkField, pkFieldNames));

        // Watermark advances ONLY when the full batch drained (last page reached, full-batch success),
        // and only to the max lastModifiedDate seen — partial-failure / mid-batch leaves it unchanged.
        let newWatermark: string | undefined;
        if (lastPageReached) {
            for (const r of allRaw) {
                const mod = r[watermarkField];
                if (typeof mod === 'string' && (!newWatermark || mod > newWatermark)) newWatermark = mod;
            }
        }

        return {
            Records: records,
            HasMore: !lastPageReached && hasMore,
            NextPage: !lastPageReached ? page : undefined,
            NewWatermarkValue: lastPageReached ? newWatermark : undefined,
        };
    }

    /** The list path: `/{service}/v1/{resource}/{tenantId}` (from the access path's entryQuery / APIPath). */
    private BuildListPath(obj: MJIntegrationObjectEntity, cfg: IOAccessConfig, tenantID: string): string {
        const entry = cfg.accessPath?.entryQuery ?? cfg.listPath ?? `${obj.APIPath}/{tenantId}`;
        return entry.replace(/\{tenantId\}/g, encodeURIComponent(tenantID));
    }

    /** The MSQL `from` target — the vendor object/definition name (resource segment of the API path). */
    private ResourceNameForMSQL(obj: MJIntegrationObjectEntity, _cfg: IOAccessConfig): string {
        // The MSQL `from` uses the resource name; the API path's last segment is the resource collection.
        const segments = obj.APIPath.split('/').filter(Boolean);
        return segments[segments.length - 1] ?? obj.Name;
    }

    /**
     * Build the MSQL query. Incremental uses `> watermark` on lastModifiedDate; a first sync selects all.
     * `select *` returns the full record so full-record pass-through is preserved.
     */
    private BuildMSQL(resourceName: string, watermarkField: string, watermarkValue: string | null): string {
        let q = `select * from ${resourceName}`;
        if (watermarkValue) q += ` where ${watermarkField} > ${this.FormatMSQLDateTime(watermarkValue)}`;
        return q;
    }

    /** MSQL datetime literals are single-quoted ISO-8601 strings. */
    private FormatMSQLDateTime(value: string): string {
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
            const norm = value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
            return `'${norm}'`;
        }
        const d = new Date(value);
        return `'${isNaN(d.getTime()) ? value : d.toISOString()}'`;
    }

    /** Append `msql`, `page` (1-indexed), and `pageSize` to the tenant-scoped list URL. */
    private BuildMSQLPageURL(listBase: string, msql: string, page: number, pageSize: number): string {
        const sep = listBase.includes('?') ? '&' : '?';
        return `${listBase}${sep}msql=${encodeURIComponent(msql)}&page=${page}&pageSize=${pageSize}`;
    }

    /** Parse the per-IO access Configuration (service / version / listPath / accessPath). */
    private ReadAccessConfig(obj: MJIntegrationObjectEntity): IOAccessConfig {
        const raw = (obj as unknown as { Configuration?: string | null }).Configuration;
        if (!raw) return {};
        try { return JSON.parse(raw) as IOAccessConfig; } catch { return {}; }
    }

    /** PK field names from the IO's fields (id by convention), sorted by sequence; falls back to `id`. */
    private FindPKFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pks = fields.filter(f => f.IsPrimaryKey).sort((a, b) => a.Sequence - b.Sequence).map(f => f.Name);
        return pks.length > 0 ? pks : [PK_FIELD];
    }

    /**
     * Build an ExternalRecord from a raw vendor record. The FULL source record flows into `Fields`
     * (custom-column pass-through contract M1–M4) — the only transformation is the transform-preserving
     * hook (default identity), so no source key is silently dropped. The PK field(s) supply the
     * ExternalID (joined with '|' for composite keys); lastModifiedDate supplies ModifiedAt.
     */
    private RawToExternalRecord(raw: Record<string, unknown>, obj: MJIntegrationObjectEntity, objectType: string, watermarkField: string, pkFieldNames: string[]): ExternalRecord {
        const fields = this.applyTransformPreservingKeys(raw, obj, this.GetCachedFields(obj.ID));
        const allPkPresent = pkFieldNames.length > 0 && pkFieldNames.every(n => fields[n] != null && String(fields[n]).length > 0);
        const externalID = allPkPresent ? pkFieldNames.map(n => String(fields[n])).join('|') : '';
        const modRaw = raw[watermarkField];
        return {
            ExternalID: externalID,
            ObjectType: objectType,
            Fields: fields,
            ModifiedAt: typeof modRaw === 'string' ? new Date(modRaw) : undefined,
            IsDeleted: raw['isDeleted'] === true,
        };
    }

    // ── CRUD (writeback-scoped: Activity + Certification only) ────────────────
    //
    // The generic BaseRESTIntegrationConnector CRUD handles the wire shape (POST flat / id-in-body →
    // BuildCreatedResult; PUT path-keyed update; DELETE via the non-standard `/delete/{id}` infix). We
    // override only to ENFORCE the operator-approved writeback allowlist: a write to any object outside
    // {activities, certifications} is REFUSED, even though metadata declares CRUD columns for it.

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const guard = this.GuardWriteback(ctx.ObjectName, 'create');
        if (guard) return guard;
        return super.CreateRecord(ctx);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const guard = this.GuardWriteback(ctx.ObjectName, 'update');
        if (guard) return guard;
        return super.UpdateRecord(ctx);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const guard = this.GuardWriteback(ctx.ObjectName, 'delete');
        if (guard) return guard;
        return super.DeleteRecord(ctx);
    }

    /**
     * Returns a refusal CRUDResult when the object is OUTSIDE the writeback allowlist; null when the
     * write is allowed (Activity / Certification). This enforces the operator-scoped "only Activity +
     * Certification writebacks" decision in code — not a capability fabrication.
     */
    private GuardWriteback(objectName: string, verb: string): CRUDResult | null {
        if (WRITEBACK_ALLOWLIST.has(objectName.toLowerCase())) return null;
        return {
            Success: false,
            StatusCode: 0,
            ErrorMessage: `MemberSuite ${verb} refused for "${objectName}": writebacks are scoped to Activity + Certification only (operator-approved write-back use cases). Writing other objects against a live AMS is out of scope.`,
        };
    }

    // ── Idempotency on create (honor the configured idempotency key) ──────────

    /**
     * Extract the created-record id from a create response. MemberSuite returns the new record (id in
     * body) per the contract's CreateIDLocation='body'. We also honor a configured idempotency reference
     * (e.g. external_activity_id) when the vendor echoes it — so a duplicate writeback re-resolves to the
     * same record id rather than minting a duplicate.
     */
    protected override ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        const base = super.ExtractIDFromResponse(response, idLocation);
        if (base) return base;
        if (response.Body && typeof response.Body === 'object') {
            const b = response.Body as Record<string, unknown>;
            for (const k of [PK_FIELD, 'ID', 'Id', 'recordId', 'RecordID']) {
                if (typeof b[k] === 'string' || typeof b[k] === 'number') return String(b[k]);
            }
        }
        return undefined;
    }

    // ── Headers + HTTP transport ─────────────────────────────────────────────

    /**
     * Authorization header carries the RAW accessToken value (NO "Bearer " prefix — the swagger
     * documents the Authorization parameter as the bare access-token string).
     */
    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = (auth as MemberSuiteAuthContext).AccessToken ?? auth.Token ?? '';
        return {
            Authorization: token,
            Accept: 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    /** Unauthenticated POST used by the token-exchange + refresh steps (no Authorization header). */
    private async RawPost(url: string, body: unknown): Promise<RESTResponse> {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            const parsed = await this.ParseBody(response);
            return this.ToRESTResponse(response, parsed);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') throw new Error(`MemberSuite auth request timed out: ${url}`);
            throw err;
        } finally {
            clearTimeout(tid);
        }
    }

    protected async MakeHTTPRequest(_auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        await this.Throttle();
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();
            if (response.status === 401 && attempt === 0) { this.tokenCache = null; continue; }
            if (response.status === 429 && attempt < MAX_RETRIES) {
                const ra = Number(response.headers.get('retry-after'));
                const wait = !isNaN(ra) && ra > 0 ? ra * 1000 : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
                await this.Sleep(wait); continue;
            }
            if (response.status >= 500 && attempt < MAX_RETRIES) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000)); continue; }
            const parsed = await this.ParseBody(response);
            return this.ToRESTResponse(response, parsed);
        }
        throw new Error(`MemberSuite request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers };
            opts.signal = controller.signal;
            if (body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                opts.body = JSON.stringify(body);
                opts.headers = { ...headers, 'Content-Type': 'application/json' };
            }
            return await fetch(url, opts);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') throw new Error(`Request timed out: ${url}`);
            throw err;
        } finally {
            clearTimeout(tid);
        }
    }

    private async ParseBody(r: Response): Promise<unknown> {
        const ct = r.headers.get('content-type') ?? '';
        return ct.includes('json') ? r.json().catch(() => null) : r.text();
    }

    private ToRESTResponse(r: Response, body: unknown): RESTResponse {
        const h: Record<string, string> = {};
        r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
        return { Status: r.status, Body: body, Headers: h };
    }

    private SafeBody(r: RESTResponse): string {
        const s = typeof r.Body === 'string' ? r.Body : JSON.stringify(r.Body);
        return (s ?? '').substring(0, 300);
    }

    private async Throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    private Sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
}

// Tree-shaking prevention — REQUIRED so @RegisterClass survives bundling.
export function LoadMemberSuiteConnector() { /* intentionally empty */ }
