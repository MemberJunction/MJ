/**
 * NimbleAMSConnector — Integration connector for Nimble AMS (Salesforce-native association management).
 *
 * Nimble AMS is a Salesforce-native AMS: data lives as Salesforce sObjects — standard SF objects
 * (Account, Contact) and NU__/NUINT__-prefixed managed-package custom objects (`__c` suffix). The
 * connector surfaces THREE access doors, each carried on the per-IO `Configuration` from the frozen
 * contract — never hardcoded here:
 *
 *   1. Salesforce REST SOQL — `/services/data/v{apiVersion}/query` with `nextRecordsUrl` cursor
 *      pagination + `WHERE LastModifiedDate >= :watermark` incremental. The default read door, and
 *      the write door for sObject CRUD (`/sobjects/{ObjectName}` flat body, path-delete).
 *   2. Nimble Fuse — POST `/services/apexrest/NUINT/NUIntegrationService`. OUTBOUND reads run a
 *      named Integration-Setting SOQL and return `{Records, RecordCount, Message}` (null fields are
 *      OMITTED — missing fields are nullable, NOT a schema error). INBOUND writes are an
 *      External-ID-keyed JSON upsert returning `{RecordCount, InboundResults:[{...,SalesforceId,
 *      ErrorMessages}], ErrorMessages}` with per-record partial success.
 *   3. NAMS LMS REST — `/services/apexrest/nams/api/lms/v1/...` GET with a `lastUpdated` incremental.
 *
 * API Documentation:
 *   - Nimble AMS API:          https://help.nimbleams.com/help/live/api
 *   - Call the Integration API: https://help.nimbleams.com/help/live/call-the-integration-api
 *   - Object Reference:        https://nimbleuser.github.io/nams-api-docs/
 *
 * Auth: Salesforce OAuth 2.0 bearer (Connected App; client_credentials or refresh_token grant).
 * Base URL: the per-org Salesforce instance URL (from the OAuth token response `instance_url`).
 *
 * NO BAKED CATALOG. The object/field universe is Declared (credential-free docs → metadata file) +
 * Discovered (runtime SF global-describe MECHANISM, scoped to the NU__/NUINT__ managed-package
 * namespace). This file is pure mechanism: auth, HTTP, discover, fetch, normalize, transform, write.
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
    type IntrospectSchemaOptions,
    type SourceSchemaInfo,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────────

/** Connection configuration parsed from the Credential entity / CompanyIntegration.Configuration JSON. */
export interface NimbleAMSConnectionConfig {
    /** Salesforce org instance URL, e.g. https://myorg.my.salesforce.com (from OAuth `instance_url`). */
    InstanceURL: string;
    ClientID: string;
    ClientSecret?: string;
    AccessToken?: string;
    RefreshToken?: string;
    /** Salesforce login host for the token exchange. */
    LoginURL: string;
    /** Salesforce REST API version (e.g. "59.0"), from Configuration.SalesforceAPIVersion. */
    ApiVersion: string;
}

interface NimbleAuthContext extends RESTAuthContext {
    Config: NimbleAMSConnectionConfig;
    InstanceURL: string;
    ApiVersion: string;
}

interface CachedToken { AccessToken: string; InstanceURL: string; ExpiresAt: number; }

/** Salesforce SOQL query response envelope. */
interface SFQueryResponse {
    totalSize?: number;
    done: boolean;
    nextRecordsUrl?: string;
    records?: Record<string, unknown>[];
}

/** Nimble Fuse OUTBOUND (named-SOQL read) response envelope. */
interface FuseOutboundResponse {
    Records?: Record<string, unknown>[] | null;
    RecordCount?: number;
    Message?: string;
    InboundResults?: null;
}

/** One per-record result in a Nimble Fuse INBOUND (upsert) response. */
interface FuseInboundResult {
    ExternalId?: string;
    SalesforceId?: string;
    Success?: boolean;
    ErrorMessage?: string;
    ErrorMessages?: string | string[];
}

/** Nimble Fuse INBOUND (upsert) response envelope. */
interface FuseInboundResponse {
    Records?: null;
    RecordCount?: number;
    Message?: string;
    InboundResults?: FuseInboundResult[];
    ErrorMessages?: string | string[];
}

/** Per-IO access-path Configuration shape carried in the frozen contract. */
interface IOAccessConfig {
    Family?: string;
    SObjectType?: string | null;
    AccessPath?: {
        door?: string;
        nestingPath?: string[];
        args?: Record<string, unknown>;
        singleRecord?: string;
    };
    /** Fuse outbound: the admin-configured Integration-Setting name to invoke for reads. */
    OutboundSettingName?: string;
    /** Fuse inbound: the admin-configured Integration-Setting name to invoke for writes. */
    InboundSettingName?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_SF_API_VERSION = '59.0';
const FUSE_PATH = '/services/apexrest/NUINT/NUIntegrationService';
/** SF managed-package namespaces that scope the global describe to Nimble objects. */
const NIMBLE_NAMESPACES = ['NU__', 'NUINT__'];
/** Standard SF objects used by Nimble AMS alongside the managed package. */
const NIMBLE_STANDARD_OBJECTS = new Set(['Account', 'Contact']);
/** Nimble Fuse OUTBOUND hard limits per call — 50,000 records OR 3MB, whichever is reached first. */
const FUSE_MAX_RECORDS_PER_CALL = 50_000;
const FUSE_MAX_BYTES_PER_CALL = 3 * 1024 * 1024; // 3MB

const TOKEN_REFRESH_BUFFER_MS = 60_000;
const TOKEN_LIFETIME_MS = 3_600_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 50;

// ─── Connector ──────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'NimbleAMSConnector')
export class NimbleAMSConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Nimble AMS'; }

    // Capability getters reflect the contract: writeable objects expose SF-REST sObject CRUD
    // (Create/Update/Delete) and Fuse upsert (Create/Update). The per-IO write columns gate which
    // verb actually fires; these getters declare the connector CAN write where metadata says so.
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    /**
     * AUTHORITATIVE discovery (§ deactivation gate): the live SF global describe returns the FULL set
     * of NU__/NUINT__ + standard objects the credential can see, so absence on a later refresh genuinely
     * means the source dropped it. The Declared baseline plus the describe extension are the complete
     * gamut for the scoped namespace.
     */
    public override get DiscoveryIsAuthoritative(): boolean { return true; }

    /**
     * Route schema introspection through the connector's LIVE SF global-describe discovery.
     *
     * `BaseRESTIntegrationConnector` (our parent) overrides the grandparent's real discover loop with a
     * CACHE-DRIVEN `IntrospectSchema` that re-reads persisted ACTIVE metadata and is hard-coded
     * non-authoritative — so it never calls our `DiscoverObjects`/`DiscoverFields` and can never drive
     * the authoritative deactivation overlay. Nimble HAS live describe-backed discovery (and declares
     * `DiscoveryIsAuthoritative = true`), so we invoke the grandparent `BaseIntegrationConnector`
     * implementation directly. It calls `this.DiscoverObjects` → `this.DiscoverFields` per object and
     * sets `IsAuthoritative` from our getter, so the full field set is discovered and absent
     * objects/fields deactivate (reversibly) on a comprehensive refresh.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        options?: IntrospectSchemaOptions
    ): Promise<SourceSchemaInfo> {
        return BaseIntegrationConnector.prototype.IntrospectSchema.call(
            this, companyIntegration, contextUser, options
        ) as Promise<SourceSchemaInfo>;
    }

    // ── §7 sync-efficiency hooks ─────────────────────────────────────────────

    /** Salesforce REST is monotonic when we ORDER BY the watermark column — narrow the next incremental. */
    public override get MonotonicWatermark(): boolean { return true; }

    /** Every Nimble sObject carries the immutable 18-char `Id`; the LMS REST objects carry `id`. */
    public override StableOrderingKey(objectName: string): string | null {
        return objectName.startsWith('Lms') ? 'id' : 'Id';
    }

    /**
     * Salesforce enforces a per-org rolling 24h API-call cap (Enterprise ~100k/day) rather than a
     * tokens/sec rate — a conservative sustained rate keeps the connector well clear of the daily cap.
     */
    public override get RateLimitPolicy(): RateLimitPolicy | null {
        return { TokensPerSec: 20, Burst: 25, ThrottleBackoffFactor: 0.5 };
    }

    /** Salesforce 429 / REQUEST_LIMIT_EXCEEDED → honor the standard `Retry-After` header (seconds). */
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

    // ── Discovery (runtime SF global-describe MECHANISM, namespace-scoped) ────

    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as NimbleAuthContext;
        const url = `${this.SFDataBase(auth)}/sobjects/`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Nimble AMS DiscoverObjects failed: HTTP ${response.Status} at ${url}`);
        }
        const body = response.Body as { sobjects?: Array<{ name: string; label: string; queryable: boolean; createable: boolean; updateable: boolean; deletable: boolean; }> };
        const results: ExternalObjectSchema[] = [];
        for (const obj of (body.sobjects ?? [])) {
            if (!obj.queryable) continue;
            if (!this.IsNimbleScopedObject(obj.name)) continue;
            results.push({
                Name: obj.name,
                Label: obj.label,
                Description: `${obj.label} (Nimble AMS)`,
                SupportsIncrementalSync: true,
                SupportsWrite: obj.createable || obj.updateable,
            });
        }
        return results;
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as NimbleAuthContext;
        const url = `${this.SFDataBase(auth)}/sobjects/${encodeURIComponent(objectName)}/describe`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Nimble AMS DiscoverFields failed for "${objectName}": HTTP ${response.Status}`);
        }
        const body = response.Body as { fields?: Array<{ name: string; label: string; type: string; nillable: boolean; createable: boolean; updateable: boolean; unique: boolean; length?: number; precision?: number; scale?: number; }> };
        return (body.fields ?? []).map(f => {
            const schema: ExternalFieldSchema = {
                Name: f.name,
                Label: f.label,
                Description: '',
                DataType: this.MapSFType(f.type),
                // SF describe states create-time required via `nillable=false` (provable from the source).
                IsRequired: f.nillable === false,
                // Provable-only: the SF `id` system field is the PK; uniqueness alone is NOT PK.
                IsPrimaryKey: f.type === 'id',
                IsUniqueKey: f.type === 'id' || f.unique === true,
                IsReadOnly: !f.createable && !f.updateable,
            };
            // Bounded typing — propagate the source's length/precision/scale when present.
            if (typeof f.length === 'number' && f.length > 0) schema.MaxLength = f.length;
            if (typeof f.precision === 'number' && f.precision > 0) schema.Precision = f.precision;
            if (typeof f.scale === 'number' && f.scale >= 0) schema.Scale = f.scale;
            return schema;
        });
    }

    /** A SF API name is in Nimble scope iff it is a managed-package object or a standard AMS object. */
    private IsNimbleScopedObject(name: string): boolean {
        if (NIMBLE_STANDARD_OBJECTS.has(name)) return true;
        return NIMBLE_NAMESPACES.some(ns => name.startsWith(ns));
    }

    private MapSFType(sfType: string): string {
        const map: Record<string, string> = {
            id: 'string', string: 'string', textarea: 'string', url: 'string', email: 'string', phone: 'string',
            boolean: 'boolean', int: 'number', double: 'decimal', currency: 'decimal', percent: 'decimal',
            date: 'datetime', datetime: 'datetime', time: 'string', reference: 'string',
            picklist: 'string', multipicklist: 'string', base64: 'string', anyType: 'string', address: 'string',
        };
        return map[sfType] ?? 'string';
    }

    // ── Auth (Salesforce OAuth2 bearer) ──────────────────────────────────────

    protected async Authenticate(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return this.BuildAuthContext(config, this.tokenCache.AccessToken, this.tokenCache.InstanceURL);
        }
        const token = await this.ObtainToken(config);
        this.tokenCache = token;
        return this.BuildAuthContext(config, token.AccessToken, token.InstanceURL);
    }

    private BuildAuthContext(config: NimbleAMSConnectionConfig, accessToken: string, instanceURL: string): NimbleAuthContext {
        return {
            Token: accessToken,
            TokenType: 'Bearer',
            Config: config,
            InstanceURL: instanceURL,
            ApiVersion: config.ApiVersion,
        } as NimbleAuthContext;
    }

    private async ObtainToken(config: NimbleAMSConnectionConfig): Promise<CachedToken> {
        // Pre-provisioned access token (e.g. test/broker injection) — use as-is, no exchange.
        if (config.AccessToken && config.InstanceURL) {
            return { AccessToken: config.AccessToken, InstanceURL: config.InstanceURL, ExpiresAt: Date.now() + TOKEN_LIFETIME_MS };
        }
        const tokenURL = `${config.LoginURL.replace(/\/+$/, '')}/services/oauth2/token`;
        const params: Record<string, string> = { client_id: config.ClientID };
        if (config.RefreshToken) {
            params['grant_type'] = 'refresh_token';
            params['refresh_token'] = config.RefreshToken;
            if (config.ClientSecret) params['client_secret'] = config.ClientSecret;
        } else {
            if (!config.ClientSecret) throw new Error('Nimble AMS auth requires either a refresh_token or a client_secret.');
            params['grant_type'] = 'client_credentials';
            params['client_secret'] = config.ClientSecret;
        }
        const body = new URLSearchParams(params);
        const response = await fetch(tokenURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`Nimble AMS auth failed: HTTP ${response.status}`);
        const data = await response.json() as { access_token: string; instance_url?: string };
        // Salesforce returns the org instance_url in the token response — it is the authoritative origin.
        const instanceURL = data.instance_url ?? config.InstanceURL;
        if (!instanceURL) throw new Error('Nimble AMS auth response carried no instance_url and none was configured.');
        return { AccessToken: data.access_token, InstanceURL: instanceURL, ExpiresAt: Date.now() + TOKEN_LIFETIME_MS };
    }

    private async ParseConfig(companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<NimbleAMSConnectionConfig> {
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
        throw new Error('No Nimble AMS credentials found — set the Credential entity or Configuration JSON.');
    }

    private ParseConfigJSON(json: string | null | undefined): Record<string, string> | null {
        if (!json) return null;
        try { return JSON.parse(json) as Record<string, string>; } catch { return null; }
    }

    private BuildConfig(creds: Record<string, string>, configJSON: Record<string, string> | null): NimbleAMSConnectionConfig {
        const pick = (...keys: string[]): string | undefined => {
            for (const k of keys) {
                if (creds[k]) return creds[k];
                if (configJSON && configJSON[k]) return configJSON[k];
            }
            return undefined;
        };
        return {
            InstanceURL: pick('InstanceURL', 'instanceUrl', 'instance_url') ?? '',
            ClientID: pick('ClientID', 'clientId', 'client_id') ?? '',
            ClientSecret: pick('ClientSecret', 'clientSecret', 'client_secret'),
            AccessToken: pick('AccessToken', 'accessToken', 'access_token'),
            RefreshToken: pick('RefreshToken', 'refreshToken', 'refresh_token'),
            LoginURL: pick('LoginURL', 'loginUrl', 'login_url') ?? 'https://login.salesforce.com',
            ApiVersion: this.NormalizeApiVersion(pick('SalesforceAPIVersion', 'ApiVersion', 'apiVersion')),
        };
    }

    /** Accept "59.0" or "v59.0"; the SF data path embeds it as `v{version}`. Store the bare number. */
    private NormalizeApiVersion(raw: string | undefined): string {
        if (!raw) return DEFAULT_SF_API_VERSION;
        return raw.replace(/^v/i, '');
    }

    // ── TestConnection ───────────────────────────────────────────────────────

    public async TestConnection(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NimbleAuthContext;
            const response = await this.MakeHTTPRequest(auth, `${this.SFDataBase(auth)}/sobjects/`, 'GET', this.BuildHeaders(auth));
            if (response.Status >= 200 && response.Status < 300) return { Success: true, Message: 'Connected to Nimble AMS (Salesforce)' };
            return { Success: false, Message: `Nimble AMS API returned HTTP ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ── URL / Response / Pagination ──────────────────────────────────────────

    protected GetBaseURL(_ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as NimbleAuthContext).InstanceURL;
    }

    /** The instance origin for all REST calls. Routes through GetBaseURL so a test harness can redirect. */
    private Origin(auth: NimbleAuthContext): string {
        return this.GetBaseURL(undefined as unknown as MJCompanyIntegrationEntity, auth);
    }

    /** The `/services/data/v{version}` base for all Salesforce REST calls. */
    private SFDataBase(auth: NimbleAuthContext): string {
        return `${this.Origin(auth)}/services/data/v${auth.ApiVersion}`;
    }

    /** Strip the SF `attributes` envelope blob from every record (sanctioned, declared removal). */
    protected override TransformRecord(
        raw: Record<string, unknown>,
        _obj: MJIntegrationObjectEntity,
        _fields: MJIntegrationObjectFieldEntity[]
    ): Record<string, unknown> {
        if (!('attributes' in raw)) return raw;
        const out: Record<string, unknown> = { ...raw };
        delete out['attributes'];
        return out;
    }

    protected override ExcludedSourceKeys(_objectName: string): string[] {
        return ['attributes'];
    }

    /**
     * Strip the response envelope to expose individual records. Handles all three doors:
     *  - SF SOQL  → `body.records`
     *  - Fuse out → `body.Records` (note: PascalCase; null fields omitted per record)
     *  - LMS REST → root array or single object
     */
    protected NormalizeResponse(rawBody: unknown, _key: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        if (!rawBody || typeof rawBody !== 'object') return [];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['records'])) return body['records'] as Record<string, unknown>[];
        if (Array.isArray(body['Records'])) return body['Records'] as Record<string, unknown>[];
        // A single non-enveloped record (e.g. LMS get-one) — pass through as one record.
        return [body];
    }

    protected ExtractPaginationInfo(rawBody: unknown, _pt: PaginationType, _cp: number, _co: number, _ps: number): PaginationState {
        const body = rawBody as SFQueryResponse;
        return { HasMore: body?.done === false, NextCursor: body?.nextRecordsUrl };
    }

    // ── FetchChanges (door-aware) ────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const cfg = this.ReadAccessConfig(obj);
        const family = cfg.Family ?? '';

        if (family === 'FuseEndpoint') {
            // The Fuse endpoint IO is a contract descriptor, not a queryable record type — nothing to pull.
            return { Records: [], HasMore: false, Warnings: [{ Code: 'NON_QUERYABLE', Message: `"${ctx.ObjectName}" is the Fuse contract descriptor; it carries no syncable records.` }] };
        }
        if (family === 'LmsFamily') {
            return this.FetchLMS(ctx, obj);
        }
        // Default door: Salesforce REST SOQL (also used by the Fuse outbound named-SOQL setting when one
        // is configured — the SOQL path is the credential-free-verifiable common case).
        return this.FetchSOQL(ctx, obj);
    }

    /** Salesforce REST SOQL fetch — cursor pagination via nextRecordsUrl + watermark-ordered incremental. */
    private async FetchSOQL(ctx: FetchContext, obj: MJIntegrationObjectEntity): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NimbleAuthContext;
        const headers = this.BuildHeaders(auth);
        const watermarkField = obj.IncrementalWatermarkField ?? 'LastModifiedDate';

        // Follow the SF cursor when present; otherwise build the first SOQL page.
        const url = ctx.CurrentCursor
            ? `${this.GetBaseURL(ctx.CompanyIntegration, auth)}${ctx.CurrentCursor}`
            : `${this.SFDataBase(auth)}/query?q=${encodeURIComponent(this.BuildSOQL(ctx.ObjectName, watermarkField, ctx.WatermarkValue ?? null))}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Nimble AMS SOQL error for "${ctx.ObjectName}": HTTP ${response.Status} — ${this.SafeBody(response)}`);
        }

        const body = response.Body as SFQueryResponse;
        const raw = body.records ?? [];
        // Defensive: the Fuse OUTBOUND door caps a single call at 50,000 records; SF native paging
        // (≤2000/page) keeps SOQL pages well under it, so a page at/over the cap signals a misconfig.
        const warnings = raw.length >= FUSE_MAX_RECORDS_PER_CALL
            ? [{ Code: 'PAGE_AT_RECORD_CAP', Message: `"${ctx.ObjectName}" returned ${raw.length} records in one page — at/over the ${FUSE_MAX_RECORDS_PER_CALL}-record Fuse per-call cap.` }]
            : undefined;
        const records: ExternalRecord[] = raw.map(r => this.RawToExternalRecord(r, obj, ctx.ObjectName, watermarkField, 'Id'));

        // Watermark advances ONLY on the final page (full-batch success), and only to the max seen.
        let newWatermark: string | undefined;
        if (body.done) {
            for (const r of raw) {
                const mod = r[watermarkField];
                if (typeof mod === 'string' && (!newWatermark || mod > newWatermark)) newWatermark = mod;
            }
        }

        return {
            Records: records,
            HasMore: body.done === false,
            NextCursor: body.nextRecordsUrl,
            NewWatermarkValue: body.done ? newWatermark : undefined,
            Warnings: warnings,
        };
    }

    /**
     * Build the SOQL for the first page. CRITICAL: NO `LIMIT` — Salesforce natively paginates via
     * done/nextRecordsUrl, so a SOQL LIMIT would cap the ENTIRE result set and SF would report
     * done=true at that count, silently dropping every record past the limit AND advancing the
     * watermark past them next sync. Use `>=` (not `>`) so records at the exact watermark instant
     * aren't lost; engine dedupe absorbs the boundary re-fetch. ORDER BY the watermark for monotonicity.
     */
    private BuildSOQL(objectName: string, watermarkField: string, watermarkValue: string | null): string {
        let soql = `SELECT FIELDS(ALL) FROM ${objectName}`;
        if (watermarkValue) soql += ` WHERE ${watermarkField} >= ${this.FormatSOQLDateTime(watermarkValue)}`;
        soql += ` ORDER BY ${watermarkField} ASC`;
        return soql;
    }

    /** SF SOQL datetime literals are unquoted ISO-8601 (e.g. 2026-01-01T00:00:00Z). */
    private FormatSOQLDateTime(value: string): string {
        // Already an unquoted ISO literal → use verbatim; otherwise emit a UTC ISO string.
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toISOString();
    }

    /** NAMS LMS REST fetch — GET with an optional `lastUpdated` incremental filter (no pagination). */
    private async FetchLMS(ctx: FetchContext, obj: MJIntegrationObjectEntity): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NimbleAuthContext;
        const headers = this.BuildHeaders(auth);
        const watermarkField = obj.IncrementalWatermarkField ?? 'lastUpdated';

        const base = `${this.GetBaseURL(ctx.CompanyIntegration, auth)}${obj.APIPath}`;
        const url = ctx.WatermarkValue
            ? `${base}?${encodeURIComponent(watermarkField)}=${encodeURIComponent(ctx.WatermarkValue)}`
            : base;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Nimble AMS LMS error for "${ctx.ObjectName}": HTTP ${response.Status} — ${this.SafeBody(response)}`);
        }

        const raw = this.NormalizeResponse(response.Body, null);
        const records = raw.map(r => this.RawToExternalRecord(r, obj, ctx.ObjectName, watermarkField, 'id'));

        let newWatermark: string | undefined;
        for (const r of raw) {
            const mod = r[watermarkField];
            if (typeof mod === 'string' && (!newWatermark || mod > newWatermark)) newWatermark = mod;
        }
        // LMS REST returns the full set in one response (no cursor) → batch is always complete.
        return { Records: records, HasMore: false, NewWatermarkValue: newWatermark };
    }

    // ── CRUD (door-aware: Fuse inbound upsert vs Salesforce REST sObject) ─────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (this.IsFuseWritePath(obj)) {
            return this.FuseUpsert(ctx.ContextUser as UserInfo, ci, obj, ctx.ObjectName, ctx.Attributes, /*forUpdate*/ false);
        }
        return this.SFRestCreate(ctx.ContextUser as UserInfo, ci, ctx.ObjectName, ctx.Attributes, obj);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (this.IsFuseWritePath(obj)) {
            // Fuse is upsert-keyed by External ID — the External ID rides in the record body, not the path.
            const result = await this.FuseUpsert(ctx.ContextUser as UserInfo, ci, obj, ctx.ObjectName, ctx.Attributes, /*forUpdate*/ true);
            // For update we report the supplied ExternalID on success (Fuse returns the SalesforceId).
            return result.Success ? { Success: true, StatusCode: result.StatusCode, ExternalID: result.ExternalID ?? ctx.ExternalID } : result;
        }
        return this.SFRestUpdate(ctx.ContextUser as UserInfo, ci, ctx.ObjectName, ctx.ExternalID, ctx.Attributes, obj);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.DeleteAPIPath || !obj.DeleteMethod) {
            return { Success: false, StatusCode: 0, ErrorMessage: `DeleteRecord not supported for "${ctx.ObjectName}": Fuse is upsert-only; hard delete requires Salesforce REST sObject DELETE, which this object does not declare.` };
        }
        const auth = await this.Authenticate(ci, ctx.ContextUser as UserInfo) as NimbleAuthContext;
        const url = this.ResolveSFRestPath(auth, obj.DeleteAPIPath, ctx.ObjectName, ctx.ExternalID);
        const response = await this.MakeHTTPRequest(auth, url, obj.DeleteMethod, this.BuildHeaders(auth));
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return { Success: false, StatusCode: response.Status, ExternalID: '', ErrorMessage: `DeleteRecord failed for "${ctx.ObjectName}": HTTP ${response.Status} — ${this.SafeBody(response)}` };
    }

    /** Salesforce REST sObject create — POST `/sobjects/{ObjectName}` flat body, ID in response `id`. */
    private async SFRestCreate(contextUser: UserInfo, ci: MJCompanyIntegrationEntity, objectName: string, attributes: Record<string, unknown>, obj: MJIntegrationObjectEntity): Promise<CRUDResult> {
        const auth = await this.Authenticate(ci, contextUser) as NimbleAuthContext;
        const createPath = obj.CreateAPIPath ?? `/services/data/v{apiVersion}/sobjects/{ObjectName}/`;
        const url = this.ResolveSFRestPath(auth, createPath, objectName, undefined);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod ?? 'POST', headers, attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            const newID = body?.['id'] == null ? undefined : String(body['id']);
            return this.BuildCreatedResult(newID, response.Status, objectName); // fail LOUDLY on empty id
        }
        return { Success: false, StatusCode: response.Status, ErrorMessage: `CreateRecord failed for "${objectName}": HTTP ${response.Status} — ${this.SafeBody(response)}` };
    }

    /** Salesforce REST sObject update — PATCH `/sobjects/{ObjectName}/{Id}` flat body. */
    private async SFRestUpdate(contextUser: UserInfo, ci: MJCompanyIntegrationEntity, objectName: string, externalID: string, attributes: Record<string, unknown>, obj: MJIntegrationObjectEntity): Promise<CRUDResult> {
        const auth = await this.Authenticate(ci, contextUser) as NimbleAuthContext;
        const updatePath = obj.UpdateAPIPath ?? `/services/data/v{apiVersion}/sobjects/{ObjectName}/{Id}`;
        const url = this.ResolveSFRestPath(auth, updatePath, objectName, externalID);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const response = await this.MakeHTTPRequest(auth, url, obj.UpdateMethod ?? 'PATCH', headers, attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: externalID };
        }
        return { Success: false, StatusCode: response.Status, ExternalID: '', ErrorMessage: `UpdateRecord failed for "${objectName}": HTTP ${response.Status} — ${this.SafeBody(response)}` };
    }

    /**
     * Nimble Fuse INBOUND upsert — POST `/services/apexrest/NUINT/NUIntegrationService` with the
     * `{Request: {Name, "Authentication Key", InboundRecords:[{Fields:{...}}]}}` envelope. Parses the
     * per-record `InboundResults` for partial success, routes the single-record create through
     * BuildCreatedResult, and fails LOUDLY on an empty SalesforceId.
     */
    private async FuseUpsert(contextUser: UserInfo, ci: MJCompanyIntegrationEntity, obj: MJIntegrationObjectEntity, objectName: string, attributes: Record<string, unknown>, forUpdate: boolean): Promise<CRUDResult> {
        const auth = await this.Authenticate(ci, contextUser) as NimbleAuthContext;
        const cfg = this.ReadAccessConfig(obj);
        const settingName = cfg.InboundSettingName;
        if (!settingName) {
            return { Success: false, StatusCode: 0, ErrorMessage: `Fuse upsert for "${objectName}" requires Configuration.InboundSettingName (the admin-configured Integration-Setting name); none is set.` };
        }
        const authKey = (auth.Config.AccessToken ? undefined : auth.Config.ClientSecret) ?? auth.Token ?? '';
        const envelope = {
            Request: {
                Name: settingName,
                'Authentication Key': authKey,
                InboundRecords: [{ Fields: attributes }],
            },
        };
        const url = `${this.GetBaseURL(ci, auth)}${FUSE_PATH}`;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, envelope);

        if (response.Status < 200 || response.Status >= 300) {
            return { Success: false, StatusCode: response.Status, ErrorMessage: `Fuse upsert failed for "${objectName}": HTTP ${response.Status} — ${this.SafeBody(response)}` };
        }
        const body = response.Body as FuseInboundResponse;
        const result = (body.InboundResults ?? [])[0];
        const envelopeError = this.JoinErrors(body.ErrorMessages);
        if (!result) {
            return { Success: false, StatusCode: response.Status, ErrorMessage: `Fuse upsert for "${objectName}" returned no InboundResults${envelopeError ? ` — ${envelopeError}` : ''}.` };
        }
        const recordError = this.JoinErrors(result.ErrorMessages ?? result.ErrorMessage);
        if (result.Success === false || recordError) {
            return { Success: false, StatusCode: response.Status, ExternalID: '', ErrorMessage: `Fuse upsert for "${objectName}" failed for ExternalId="${result.ExternalId ?? ''}": ${recordError || envelopeError || body.Message || 'unknown error'}` };
        }
        // A 2xx with no SalesforceId is a silent loss — fail LOUDLY via BuildCreatedResult.
        if (!forUpdate) {
            return this.BuildCreatedResult(result.SalesforceId, response.Status, objectName);
        }
        const sfid = result.SalesforceId == null ? '' : String(result.SalesforceId).trim();
        if (sfid.length === 0) {
            return { Success: false, StatusCode: response.Status, ErrorMessage: `Fuse upsert (update) for "${objectName}" returned HTTP ${response.Status} but no SalesforceId — treating as a failure.` };
        }
        return { Success: true, StatusCode: response.Status, ExternalID: sfid };
    }

    private JoinErrors(errs: string | string[] | undefined): string {
        if (!errs) return '';
        return Array.isArray(errs) ? errs.filter(Boolean).join('; ') : errs;
    }

    /** True when the object's write door is the Fuse inbound upsert (vs Salesforce REST sObject CRUD). */
    private IsFuseWritePath(obj: MJIntegrationObjectEntity): boolean {
        return (obj.CreateAPIPath ?? '').includes(FUSE_PATH) || (obj.UpdateAPIPath ?? '').includes(FUSE_PATH);
    }

    /**
     * Resolve a Salesforce-REST path template, substituting `{apiVersion}` (bare version), `{ObjectName}`,
     * and `{Id}`/`{ExternalID}`. The contract's SF-REST paths are root-relative (start at /services/...),
     * so we prefix the instance origin only.
     */
    private ResolveSFRestPath(auth: NimbleAuthContext, pathTemplate: string, objectName: string, externalID: string | undefined): string {
        let path = pathTemplate
            .replace(/\{apiVersion\}/g, auth.ApiVersion)
            .replace(/\{ObjectName\}/g, encodeURIComponent(objectName));
        if (externalID !== undefined) {
            const enc = encodeURIComponent(externalID);
            path = path.replace(/\{Id\}/g, enc).replace(/\{ID\}/g, enc).replace(/\{id\}/g, enc).replace(/\{ExternalID\}/g, enc);
        }
        return `${this.Origin(auth)}${path}`;
    }

    /**
     * Build an ExternalRecord from a raw vendor record. The FULL record flows into `Fields` (custom-column
     * pass-through contract M1–M4) — the ONLY removed key is the sanctioned SF `attributes` envelope blob
     * declared in {@link ExcludedSourceKeys}. The PK field supplies ExternalID; the watermark field supplies
     * ModifiedAt. (FetchSOQL/FetchLMS override the base fetch, so we hand-build records here.)
     */
    private RawToExternalRecord(raw: Record<string, unknown>, obj: MJIntegrationObjectEntity, objectType: string, watermarkField: string, pkField: string): ExternalRecord {
        const transformed = this.TransformRecord(raw, obj, this.GetCachedFields(obj.ID));
        const excluded = new Set(this.ExcludedSourceKeys(objectType));
        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(transformed)) {
            if (excluded.has(key)) continue;
            fields[key] = value;
        }
        const modRaw = raw[watermarkField];
        return {
            ExternalID: String(raw[pkField] ?? ''),
            ObjectType: objectType,
            Fields: fields,
            ModifiedAt: typeof modRaw === 'string' ? new Date(modRaw) : undefined,
            IsDeleted: raw['IsDeleted'] === true,
        };
    }

    /** Parse the per-IO access Configuration (Family / SObjectType / AccessPath / Fuse setting names). */
    private ReadAccessConfig(obj: MJIntegrationObjectEntity): IOAccessConfig {
        const raw = (obj as unknown as { Configuration?: string | null }).Configuration;
        if (!raw) return {};
        try { return JSON.parse(raw) as IOAccessConfig; } catch { return {}; }
    }

    // ── Headers + HTTP transport ─────────────────────────────────────────────

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            Authorization: `Bearer ${auth.Token}`,
            Accept: 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
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
        throw new Error(`Nimble AMS request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                const serialized = JSON.stringify(body);
                // Fuse OUTBOUND enforces a 3MB-per-call ceiling — guard the request body up front.
                if (url.includes(FUSE_PATH) && Buffer.byteLength(serialized, 'utf8') > FUSE_MAX_BYTES_PER_CALL) {
                    throw new Error(`Nimble Fuse request body exceeds the ${FUSE_MAX_BYTES_PER_CALL}-byte (3MB) per-call limit.`);
                }
                opts.body = serialized;
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
export function LoadNimbleAMSConnector() { /* intentionally empty */ }
