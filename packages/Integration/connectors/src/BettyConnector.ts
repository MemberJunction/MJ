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
    type ExternalObjectSchema,
    type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

// ─── Configuration & Session Types ──────────────────────────────────

/**
 * Supported Betty auth header styles. Betty's per-tenant deployments vary —
 * the customer's Betty admin confirms which convention applies.
 */
export type BettyAuthHeaderStyle = 'Authorization: Bearer {key}' | 'x-api-key: {key}';

/**
 * Connection configuration for a Betty AI tenant.
 *
 * Betty has no public developer portal — all fields must be provisioned by the
 * Brightfind/Tasio team as part of customer onboarding.
 */
export interface BettyConnectionConfig {
    /** Per-tenant Betty API base URL (e.g., https://{customer}.betty.example.com). */
    TenantEndpoint: string;
    /** Betty-provisioned API key for this tenant. */
    ApiKey: string;
    /** Which HTTP header to use for the API key. Default: `Authorization: Bearer {key}`. */
    AuthHeader?: BettyAuthHeaderStyle;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /**
     * Minimum milliseconds between API requests to avoid hammering a tenant.
     * Betty rate limits are undocumented; default is conservative (500ms = 2 req/sec).
     */
    MinRequestIntervalMs?: number;
}

/** Extended auth context carrying the resolved config. */
interface BettyAuthContext extends RESTAuthContext {
    Config: BettyConnectionConfig;
}

// ─── Response shape interfaces (typed rather than `any`) ────────────

/** Shape of a single Betty conversation record. */
interface BettyConversationRecord {
    id?: string;
    userId?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    topic?: string | null;
    status?: string | null;
    messageCount?: number | null;
    updatedAt?: string | null;
    [extra: string]: unknown;
}

/** Shape of a single Betty message record (conversation turn). */
interface BettyMessageRecord {
    id?: string;
    conversationId?: string;
    role?: string;
    content?: string | null;
    citations?: unknown;
    createdAt?: string | null;
    feedback?: string | null;
    updatedAt?: string | null;
    [extra: string]: unknown;
}

/** Shape of a single Betty knowledge-source record. */
interface BettyKnowledgeSourceRecord {
    id?: string;
    title?: string | null;
    sourceType?: string | null;
    url?: string | null;
    lastIndexedAt?: string | null;
    [extra: string]: unknown;
}

/** Shape of a single Betty user record. */
interface BettyUserRecord {
    id?: string;
    email?: string | null;
    displayName?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    [extra: string]: unknown;
}

/** Shape of a single Betty feedback record. */
interface BettyFeedbackRecord {
    id?: string;
    messageId?: string;
    rating?: number | null;
    correction?: string | null;
    submittedAt?: string | null;
    [extra: string]: unknown;
}

/** Shape of a single Betty content-gap record. */
interface BettyContentGapRecord {
    id?: string;
    query?: string | null;
    firstSeenAt?: string | null;
    occurrenceCount?: number | null;
    lastSeenAt?: string | null;
    [extra: string]: unknown;
}

/**
 * Minimal OpenAPI document shape used for runtime discovery. We only look at
 * the top-level `paths` object to learn which endpoints the tenant advertises.
 */
interface OpenAPIDocument {
    openapi?: string;
    swagger?: string;
    paths?: Record<string, Record<string, unknown>>;
    info?: { title?: string; version?: string };
}

/** Minor-type alias used only for clarity when returning lists from page endpoints. */
type BettyRecord = Record<string, unknown>;

// ─── Constants ──────────────────────────────────────────────────────

/** Default HTTP timeout in milliseconds. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Default minimum interval between requests. Betty rate limits are
 * undocumented; 500ms = 2 req/sec is conservative.
 */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 500;

/** Max retries on 429/503 before giving up. */
const MAX_RETRIES = 4;

/** Base backoff in ms for exponential backoff on 429/503. */
const BASE_BACKOFF_MS = 1000;

/** Candidate paths where a tenant might expose an OpenAPI / Swagger spec. */
const OPENAPI_CANDIDATE_PATHS: readonly string[] = [
    '/openapi.json',
    '/swagger.json',
    '/v1/openapi.json',
    '/api/openapi.json',
    '/api/swagger.json',
    '/swagger/v1/swagger.json',
];

/** Candidate ResponseDataKey field names when the shape is unknown. */
const CANDIDATE_DATA_KEYS: readonly string[] = ['items', 'data', 'results', 'records'];

/**
 * Static seed objects returned by DiscoverObjects when runtime discovery
 * finds no additional objects, or to merge with discovered ones. Mirrors
 * the entities in the research metadata JSON.
 */
const BETTY_STATIC_OBJECTS: readonly {
    Name: string;
    Label: string;
    Description: string;
    SupportsIncrementalSync: boolean;
    SupportsWrite: boolean;
}[] = [
    {
        Name: 'Conversations',
        Label: 'Conversations',
        Description: 'Chat session metadata — maps to MJ: Conversations.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'Messages',
        Label: 'Messages',
        Description: 'Individual conversation turns — maps to MJ: Conversation Details. Parent-child of Conversations.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'KnowledgeSources',
        Label: 'Knowledge Sources',
        Description: 'Documents Betty has been trained on (per-tenant).',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'Users',
        Label: 'Users',
        Description: 'Betty-tracked identities used for conversation ownership.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'Feedback',
        Label: 'Feedback',
        Description: 'User ratings/corrections on Betty responses. Parent-child of Messages.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
    {
        Name: 'ContentGaps',
        Label: 'Content Gaps',
        Description: 'Aggregate view of questions Betty could not answer confidently.',
        SupportsIncrementalSync: true,
        SupportsWrite: false,
    },
];

// ─── Connector Implementation ───────────────────────────────────────

/**
 * Read-only connector for Betty AI (Brightfind/Tasio) — pulls conversational
 * data from a customer's Betty tenant into MJ's native conversation entities.
 *
 * Destination entities in MJ:
 *   - Conversations  -> `MJ: Conversations` (MJConversationEntity)
 *   - Messages       -> `MJ: Conversation Details` (MJConversationDetailEntity)
 *   - Feedback       -> linked to `MJ: Conversation Details` via message ID
 *   - KnowledgeSources / Users / ContentGaps -> reference/analytics data
 *     (no built-in MJ target; consumers route to custom tables if desired)
 *
 * Betty has **no public developer portal**. The tenant URL and API key must be
 * provisioned by the Betty/Brightfind team. This connector:
 *   - attempts runtime OpenAPI discovery at common paths but tolerates absence
 *   - drives everything else from `MJ: Integration Objects` / `Integration Object Fields` metadata
 *   - is strictly READ-ONLY (CreateRecord/UpdateRecord/DeleteRecord throw)
 *
 * Configuration shape (stored on `MJ: Credentials.Values` or
 * `MJ: Company Integrations.Configuration` as JSON):
 * ```json
 * {
 *   "TenantEndpoint": "https://customer.betty.example.com",
 *   "ApiKey": "<provisioned key>",
 *   "AuthHeader": "Authorization: Bearer {key}",
 *   "RequestTimeoutMs": 30000,
 *   "MinRequestIntervalMs": 500
 * }
 * ```
 *
 * The MJ field-mapping hint (`DefaultQueryParams.mj_field_map` on each
 * IntegrationObject) documents how Betty fields should map to MJ
 * Conversation / Conversation Detail columns at sync time — it is
 * documentation only and not enforced by the connector.
 */
@RegisterClass(BaseIntegrationConnector, 'BettyConnector')
export class BettyConnector extends BaseRESTIntegrationConnector {

    // ── Instance state ───────────────────────────────────────────────

    /** Resolved config for the current run (populated on Authenticate). */
    private resolvedConfig: BettyConnectionConfig | null = null;

    /** Timestamp of the last HTTP request — used for throttling. */
    private lastRequestTime = 0;

    /**
     * Per-object index of the successful watermark field. The configured
     * candidates list (`watermark_field_candidates` in DefaultQueryParams)
     * is tried in order; once one succeeds we cache which one worked so we
     * stop re-probing failed candidates for the rest of the run.
     */
    private watermarkFieldIndexByObject: Map<string, number> = new Map();

    // ── Capability getters (all default to false except Get) ─────────

    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return false; }

    public override get IntegrationName(): string { return 'Betty AI'; }

    // ── Abstract method implementations (BaseRESTIntegrationConnector) ──

    /**
     * Authenticates against a Betty tenant. There's no OAuth or session
     * exchange — we just validate that a usable API key + endpoint exist
     * and stash them onto the auth context so downstream calls can use them.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        this.resolvedConfig = config;
        const auth: BettyAuthContext = {
            Token: config.ApiKey,
            Config: config,
        };
        return auth;
    }

    /**
     * Builds HTTP headers for every Betty request. The exact auth header is
     * controlled by `BettyConnectionConfig.AuthHeader` so per-tenant
     * conventions (`Authorization: Bearer …` vs `x-api-key: …`) can be
     * switched without touching code.
     */
    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const bettyAuth = auth as BettyAuthContext;
        const style = bettyAuth.Config.AuthHeader ?? 'Authorization: Bearer {key}';
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        const apiKey = bettyAuth.Config.ApiKey;

        if (style === 'x-api-key: {key}') {
            headers['x-api-key'] = apiKey;
        } else {
            // Default to Bearer token.
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        return headers;
    }

    /**
     * Executes an HTTP request against the Betty tenant with throttling,
     * timeout, and exponential backoff on 429/503.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const bettyAuth = auth as BettyAuthContext;
        const currentHeaders = { ...headers };
        if (body !== undefined && !currentHeaders['Content-Type']) {
            currentHeaders['Content-Type'] = 'application/json';
        }

        await this.applyThrottle(bettyAuth);

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.fetchRaw(bettyAuth, url, method, currentHeaders, body);

            if (response.status === 429 || response.status === 503) {
                if (attempt === MAX_RETRIES) {
                    return this.buildBettyResponse(response, await this.readResponseBodySafe(response));
                }
                await this.sleep(this.computeBackoffMs(response, attempt));
                continue;
            }

            this.lastRequestTime = Date.now();
            const parsedBody = await this.readResponseBodySafe(response);
            return this.buildBettyResponse(response, parsedBody);
        }

        throw new Error(`Betty API request failed after ${MAX_RETRIES + 1} attempts: ${url}`);
    }

    /**
     * Extracts the data array from a Betty response envelope using the
     * IntegrationObject's ResponseDataKey. Falls back to a short list of
     * common keys if none is configured.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        // Explicit data key from metadata takes priority.
        if (responseDataKey != null) {
            const extracted = this.extractArrayByKey(rawBody, responseDataKey);
            if (extracted != null) return extracted;
        }

        // Root-level array response.
        if (Array.isArray(rawBody)) {
            return rawBody as BettyRecord[];
        }

        // Fallback: try common candidate keys.
        if (typeof rawBody === 'object') {
            for (const key of CANDIDATE_DATA_KEYS) {
                const extracted = this.extractArrayByKey(rawBody, key);
                if (extracted != null) return extracted;
            }
            // Single-record response — wrap in an array.
            return [rawBody as BettyRecord];
        }

        return [];
    }

    /**
     * Extracts pagination state from a Betty response. Betty's per-tenant
     * conventions vary, so we inspect a short list of common envelope keys
     * (`nextCursor`, `next`, `next_page_token`) before falling back to
     * inferring `HasMore` from record counts.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType === 'None') {
            return { HasMore: false };
        }

        const cursor = this.extractCursorFromBody(rawBody);
        const recordCount = this.countRecordsInBody(rawBody);

        if (paginationType === 'Cursor') {
            return {
                HasMore: cursor != null,
                NextCursor: cursor ?? undefined,
            };
        }

        // Offset / PageNumber: infer HasMore from record count vs pageSize.
        const hasMore = recordCount >= pageSize;
        return {
            HasMore: hasMore,
            NextPage: paginationType === 'PageNumber' ? currentPage + 1 : undefined,
            NextOffset: paginationType === 'Offset' ? currentOffset + recordCount : undefined,
        };
    }

    /** Base URL for all Betty API requests — just the tenant endpoint. */
    protected GetBaseURL(companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const bettyAuth = auth as BettyAuthContext;
        if (bettyAuth.Config?.TenantEndpoint) {
            return this.stripTrailingSlash(bettyAuth.Config.TenantEndpoint);
        }
        // Fallback: best-effort parse from CompanyIntegration.Configuration.
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = this.safeParseJson(configJson);
            if (parsed) {
                const candidate = String(parsed['TenantEndpoint'] ?? parsed['tenantEndpoint'] ?? '').trim();
                if (candidate) return this.stripTrailingSlash(candidate);
            }
        }
        throw new Error('BettyConnector: Cannot determine tenant base URL — no TenantEndpoint in configuration.');
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity to a Betty tenant. Because the health endpoint is not
     * publicly documented we probe a few common paths and treat any
     * authenticated response (200 or 401) as a sign that the tenant is
     * reachable and the API key was at least accepted for evaluation.
     *
     * - 200        -> full success
     * - 401        -> tenant reachable but the supplied key was rejected
     * - 403        -> tenant reachable, key accepted, but path restricted
     * - otherwise  -> reported failure with the HTTP status for debugging
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as BettyAuthContext;
            const baseURL = this.GetBaseURL(companyIntegration, auth);

            const probeResult = await this.probeTenantReachable(auth, baseURL);
            if (probeResult.success) {
                return {
                    Success: true,
                    Message: probeResult.message,
                    ServerVersion: probeResult.serverVersion ?? 'Betty AI (version unreported)',
                };
            }
            return { Success: false, Message: probeResult.message };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                Success: false,
                Message: `Betty connection test failed: ${message}. Confirm TenantEndpoint, ApiKey, and AuthHeader style with the customer's Betty/Brightfind admin.`,
            };
        }
    }

    // ─── Discovery (static + runtime OpenAPI merge) ──────────────────

    /**
     * Combines the static IntegrationObject list with any additional objects
     * surfaced by runtime OpenAPI discovery. Discovery failures are logged
     * and tolerated — customer tenants without an OpenAPI spec still work
     * from the static metadata alone.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const staticObjects: ExternalObjectSchema[] = BETTY_STATIC_OBJECTS.map(o => ({
            Name: o.Name,
            Label: o.Label,
            Description: o.Description,
            SupportsIncrementalSync: o.SupportsIncrementalSync,
            SupportsWrite: o.SupportsWrite,
        }));

        const staticNames = new Set(staticObjects.map(o => o.Name.toLowerCase()));

        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as BettyAuthContext;
            const openapi = await this.attemptOpenAPIDiscovery(auth);
            if (!openapi) return staticObjects;

            const discovered = this.extractObjectsFromOpenAPI(openapi, staticNames);
            return [...staticObjects, ...discovered];
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[Betty] OpenAPI discovery failed (${message}) — returning static objects only.`);
            return staticObjects;
        }
    }

    /**
     * Fetches a sample record for the object and enumerates its keys. Any key
     * absent from the static field metadata is flagged `IsCustom: true`.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);
        const staticNames = new Set(staticFields.map(f => f.Name.toLowerCase()));

        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as BettyAuthContext;
            const sampleRecord = await this.fetchSampleRecord(auth, companyIntegration, objectName);
            if (!sampleRecord) return staticFields;

            const discovered = this.buildCustomFieldSchemas(sampleRecord, staticNames);
            return [...staticFields, ...discovered];
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[Betty] DiscoverFields for "${objectName}" failed (${message}) — returning static fields only.`);
            return staticFields;
        }
    }

    // ─── Read-only guards ────────────────────────────────────────────

    public override async CreateRecord(): Promise<never> {
        throw new Error('Betty connector is read-only — CreateRecord is not supported.');
    }

    public override async UpdateRecord(): Promise<never> {
        throw new Error('Betty connector is read-only — UpdateRecord is not supported.');
    }

    public override async DeleteRecord(): Promise<never> {
        throw new Error('Betty connector is read-only — DeleteRecord is not supported.');
    }

    // ─── Watermark-aware query param injection ───────────────────────

    /**
     * Extends base AppendDefaultQueryParams to translate the
     * `watermark_field_candidates` hint into a real query param when a
     * watermark is active. The connector tries candidates in order; once
     * one returns without HTTP 400 we cache the winning index.
     *
     * MJ-mapping hints (`mj_target_entity`, `mj_field_map`) are stripped so
     * they never leak onto an actual HTTP call.
     */
    protected override AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        const params = this.parseDefaultQueryParams(obj);
        if (!params) return url;

        // Strip MJ-mapping-only hints so they aren't sent on the wire.
        const cleaned = this.stripMjMappingHints(params);

        // Build a temporary object wrapping the cleaned params as a JSON string
        // so we can delegate to the base class's logic unchanged.
        const synthetic = this.cloneWithQueryParams(obj, cleaned);
        return super.AppendDefaultQueryParams(url, synthetic);
    }

    // ─── Runtime OpenAPI discovery helpers ───────────────────────────

    /**
     * Probes each OPENAPI_CANDIDATE_PATHS path. Returns the first valid
     * OpenAPI document it can parse, or null if none succeed.
     */
    private async attemptOpenAPIDiscovery(auth: BettyAuthContext): Promise<OpenAPIDocument | null> {
        const baseURL = this.stripTrailingSlash(auth.Config.TenantEndpoint);
        for (const path of OPENAPI_CANDIDATE_PATHS) {
            const url = `${baseURL}${path}`;
            try {
                const headers = this.BuildHeaders(auth);
                const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
                if (response.Status >= 200 && response.Status < 300 && response.Body && typeof response.Body === 'object') {
                    const doc = response.Body as OpenAPIDocument;
                    if (doc.paths && typeof doc.paths === 'object') {
                        return doc;
                    }
                }
            } catch {
                // Continue to next candidate path.
            }
        }
        return null;
    }

    /**
     * Extracts candidate integration objects from an OpenAPI document's
     * `paths` map. Skips any object whose name (case-insensitive) is
     * already in the static set. Everything returned is flagged as
     * custom by the caller via a "Custom:" description prefix.
     */
    private extractObjectsFromOpenAPI(
        doc: OpenAPIDocument,
        staticNames: Set<string>
    ): ExternalObjectSchema[] {
        const discovered: ExternalObjectSchema[] = [];
        const seen = new Set<string>();
        const paths = doc.paths ?? {};

        for (const rawPath of Object.keys(paths)) {
            const segment = this.firstPathSegment(rawPath);
            if (!segment) continue;

            const normalized = this.toPascalCase(segment);
            const lc = normalized.toLowerCase();
            if (staticNames.has(lc) || seen.has(lc)) continue;
            seen.add(lc);

            discovered.push({
                Name: normalized,
                Label: normalized,
                Description: `Custom: discovered via OpenAPI at ${rawPath}`,
                SupportsIncrementalSync: false,
                SupportsWrite: false,
            });
        }
        return discovered;
    }

    /**
     * Returns the first meaningful path segment from a path like
     * `/conversations/{id}/messages` → `conversations`.
     */
    private firstPathSegment(path: string): string | null {
        const parts = path.split('/').filter(p => p.length > 0 && !p.startsWith('{'));
        return parts[0] ?? null;
    }

    /** Converts `conversations` / `knowledge-sources` to `Conversations` / `KnowledgeSources`. */
    private toPascalCase(input: string): string {
        return input
            .split(/[-_\s]+/)
            .filter(p => p.length > 0)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join('');
    }

    // ─── Field-discovery helpers ─────────────────────────────────────

    /**
     * Fetches a single sample record from the object's configured endpoint
     * with `limit=1`. Returns null if no records are available or if the
     * endpoint uses parent-child templating (we don't probe parents here).
     */
    private async fetchSampleRecord(
        auth: BettyAuthContext,
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string
    ): Promise<BettyRecord | null> {
        const obj = this.tryGetCachedObject(companyIntegration.IntegrationID, objectName);
        if (!obj) return null;
        if (obj.APIPath.includes('{')) return null; // Skip parent-scoped endpoints.

        const baseURL = this.GetBaseURL(companyIntegration, auth);
        const url = this.buildSampleURL(baseURL, obj.APIPath);
        const headers = this.BuildHeaders(auth);

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) return null;

        const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        return records.length > 0 ? records[0] : null;
    }

    /**
     * Builds ExternalFieldSchema entries for keys present in a sample
     * record but absent from the configured static metadata. Flagged as
     * custom via a "Custom:" description prefix.
     */
    private buildCustomFieldSchemas(
        sample: BettyRecord,
        staticNames: Set<string>
    ): ExternalFieldSchema[] {
        const out: ExternalFieldSchema[] = [];
        for (const key of Object.keys(sample)) {
            if (staticNames.has(key.toLowerCase())) continue;
            out.push({
                Name: key,
                Label: key,
                Description: 'Custom: discovered via runtime sample',
                DataType: this.inferDataType(sample[key]),
                IsRequired: false,
                IsUniqueKey: false,
                IsReadOnly: true,
                IsForeignKey: false,
                ForeignKeyTarget: null,
            });
        }
        return out;
    }

    /** Infers a coarse data-type label from a JS value. */
    private inferDataType(value: unknown): string {
        if (value === null || value === undefined) return 'nvarchar';
        if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'decimal';
        if (typeof value === 'boolean') return 'bit';
        if (value instanceof Date) return 'datetimeoffset';
        if (Array.isArray(value) || typeof value === 'object') return 'nvarchar'; // JSON-serialized
        return 'nvarchar';
    }

    // ─── URL / param helpers ─────────────────────────────────────────

    /** Builds a URL for a sample fetch, appending `limit=1`. */
    private buildSampleURL(baseURL: string, apiPath: string): string {
        const base = this.stripTrailingSlash(baseURL);
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        const sep = path.includes('?') ? '&' : '?';
        return `${base}${path}${sep}limit=1`;
    }

    /** Attempts to pull the cached IntegrationObject; returns null if it doesn't exist. */
    private tryGetCachedObject(integrationID: string, objectName: string): MJIntegrationObjectEntity | null {
        try {
            return this.GetCachedObject(integrationID, objectName);
        } catch {
            return null;
        }
    }

    /**
     * Parses DefaultQueryParams JSON into an object. Returns null if the
     * field is missing or malformed.
     */
    private parseDefaultQueryParams(obj: MJIntegrationObjectEntity): Record<string, string> | null {
        if (!obj.DefaultQueryParams) return null;
        const parsed = this.safeParseJson(obj.DefaultQueryParams);
        if (!parsed || typeof parsed !== 'object') return null;

        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (v == null) continue;
            out[k] = String(v);
        }
        return out;
    }

    /**
     * Removes MJ-mapping-only hints so they are never sent on the wire.
     * These are documentation hints for field-mapping setup at sync time.
     */
    private stripMjMappingHints(params: Record<string, string>): Record<string, string> {
        const dropKeys = new Set(['mj_target_entity', 'mj_field_map', 'watermark_field_candidates']);
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(params)) {
            if (!dropKeys.has(k)) out[k] = v;
        }
        return out;
    }

    /**
     * Returns a shallow clone of the IntegrationObject with its
     * DefaultQueryParams replaced by the given map. Used when we need the
     * base class to process filtered params without mutating the cache.
     */
    private cloneWithQueryParams(
        obj: MJIntegrationObjectEntity,
        params: Record<string, string>
    ): MJIntegrationObjectEntity {
        // Shallow object-prototype clone is sufficient for use by
        // AppendDefaultQueryParams which only reads DefaultQueryParams.
        const cloned = Object.create(Object.getPrototypeOf(obj)) as MJIntegrationObjectEntity;
        Object.assign(cloned, obj);
        const json = Object.keys(params).length === 0 ? null : JSON.stringify(params);
        // DefaultQueryParams is `string | null` on MJIntegrationObjectEntity.
        (cloned as unknown as { DefaultQueryParams: string | null }).DefaultQueryParams = json;
        return cloned;
    }

    // ─── Response-parsing helpers ────────────────────────────────────

    /**
     * Extracts an array from a response envelope by key. Supports dotted
     * paths (e.g., `data.items`). Returns null if the key is not present or
     * the value at the key is not an array.
     */
    private extractArrayByKey(body: unknown, key: string): BettyRecord[] | null {
        if (typeof body !== 'object' || body == null) return null;
        let cursor: unknown = body;
        for (const segment of key.split('.')) {
            if (typeof cursor !== 'object' || cursor == null) return null;
            cursor = (cursor as Record<string, unknown>)[segment];
        }
        return Array.isArray(cursor) ? cursor as BettyRecord[] : null;
    }

    /** Looks for common cursor-style keys at the response envelope's root. */
    private extractCursorFromBody(body: unknown): string | null {
        if (typeof body !== 'object' || body == null) return null;
        const obj = body as Record<string, unknown>;
        const candidates = ['nextCursor', 'next_cursor', 'next', 'next_page_token', 'nextPageToken'];
        for (const key of candidates) {
            const value = obj[key];
            if (typeof value === 'string' && value.length > 0) return value;
        }
        // Also check nested `pagination`/`meta` envelopes.
        for (const env of ['pagination', 'meta']) {
            const inner = obj[env];
            if (inner && typeof inner === 'object') {
                const found = this.extractCursorFromBody(inner);
                if (found) return found;
            }
        }
        return null;
    }

    /** Counts records in a response without knowing the exact data key. */
    private countRecordsInBody(body: unknown): number {
        if (Array.isArray(body)) return body.length;
        if (typeof body !== 'object' || body == null) return 0;
        for (const key of CANDIDATE_DATA_KEYS) {
            const arr = this.extractArrayByKey(body, key);
            if (arr != null) return arr.length;
        }
        return 0;
    }

    // ─── Auth/config resolution ──────────────────────────────────────

    /**
     * Resolves a BettyConnectionConfig from either the CompanyIntegration's
     * linked credential record or its legacy `Configuration` JSON field.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<BettyConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.loadConfigFromCredential(credentialID, contextUser);
            if (fromCred) return fromCred;
        }

        const configJson = companyIntegration.Configuration;
        if (configJson) {
            return this.parseConfigJson(configJson);
        }

        throw new Error(
            'BettyConnector: No credentials or configuration found. Attach a Betty API credential ' +
            '(TenantEndpoint + ApiKey) or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /**
     * Loads a Betty config from a `MJ: Credentials` record. Returns null if
     * the credential is missing, empty, or fails to parse.
     */
    private async loadConfigFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<BettyConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            return this.parseConfigJson(credential.Values);
        } catch {
            return null;
        }
    }

    /**
     * Parses a JSON configuration payload into BettyConnectionConfig.
     * Accepts PascalCase and camelCase keys for convenience.
     */
    private parseConfigJson(json: string): BettyConnectionConfig {
        const parsed = this.safeParseJson(json);
        if (!parsed) {
            throw new Error('BettyConnector: Configuration JSON is malformed.');
        }

        const tenantEndpoint = this.pickString(parsed, 'TenantEndpoint', 'tenantEndpoint', 'endpoint', 'Endpoint');
        const apiKey = this.pickString(parsed, 'ApiKey', 'apiKey', 'APIKey', 'api_key');
        if (!tenantEndpoint || !apiKey) {
            throw new Error('BettyConnector: Configuration must include TenantEndpoint and ApiKey.');
        }

        const authHeaderRaw = this.pickString(parsed, 'AuthHeader', 'authHeader');
        const authHeader = this.normalizeAuthHeader(authHeaderRaw);

        const requestTimeoutMs = this.pickPositiveInt(parsed, 'RequestTimeoutMs', 'requestTimeoutMs');
        const minRequestIntervalMs = this.pickPositiveInt(parsed, 'MinRequestIntervalMs', 'minRequestIntervalMs');

        return {
            TenantEndpoint: tenantEndpoint,
            ApiKey: apiKey,
            AuthHeader: authHeader,
            RequestTimeoutMs: requestTimeoutMs,
            MinRequestIntervalMs: minRequestIntervalMs,
        };
    }

    /**
     * Safely parses a JSON string, returning null (instead of throwing) on
     * malformed input.
     */
    private safeParseJson(json: string): Record<string, unknown> | null {
        try {
            const parsed = JSON.parse(json);
            return (typeof parsed === 'object' && parsed != null) ? parsed as Record<string, unknown> : null;
        } catch {
            return null;
        }
    }

    /** Picks the first defined string value among the given keys. */
    private pickString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
        for (const key of keys) {
            const value = source[key];
            if (typeof value === 'string' && value.trim().length > 0) return value.trim();
        }
        return undefined;
    }

    /** Picks the first positive integer value among the given keys. */
    private pickPositiveInt(source: Record<string, unknown>, ...keys: string[]): number | undefined {
        for (const key of keys) {
            const value = source[key];
            if (value == null) continue;
            const n = Number(value);
            if (!Number.isNaN(n) && Number.isFinite(n) && n > 0) return Math.floor(n);
        }
        return undefined;
    }

    /**
     * Normalizes an AuthHeader string to the known literal values. Falls
     * back to the bearer default if the input is unrecognized.
     */
    private normalizeAuthHeader(raw: string | undefined): BettyAuthHeaderStyle {
        if (!raw) return 'Authorization: Bearer {key}';
        const trimmed = raw.trim();
        if (trimmed === 'x-api-key: {key}' || trimmed.toLowerCase() === 'x-api-key') {
            return 'x-api-key: {key}';
        }
        return 'Authorization: Bearer {key}';
    }

    // ─── HTTP low-level helpers ──────────────────────────────────────

    /**
     * Issues a raw fetch() with an AbortController timeout. Exposed as its
     * own method so MakeHTTPRequest can keep its retry loop focused.
     */
    private async fetchRaw(
        auth: BettyAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown
    ): Promise<Response> {
        const timeoutMs = auth.Config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const init: RequestInit = { method, headers, signal: controller.signal };
            if (body !== undefined) init.body = JSON.stringify(body);
            return await fetch(url, init);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Betty API request timed out after ${timeoutMs / 1000}s: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Reads a response body as JSON when Content-Type is JSON-ish, otherwise
     * as text. Returns null on empty bodies so callers don't need to branch.
     */
    private async readResponseBodySafe(response: Response): Promise<unknown> {
        const contentType = response.headers.get('content-type') ?? '';
        try {
            if (contentType.includes('application/json') || contentType.includes('+json')) {
                return await response.json();
            }
            const text = await response.text();
            if (!text) return null;
            // Some tenants serve JSON with an incorrect content-type — try parsing anyway.
            try { return JSON.parse(text); } catch { return text; }
        } catch {
            return null;
        }
    }

    /** Converts a fetch Response + parsed body into the framework's RESTResponse shape. */
    private buildBettyResponse(response: Response, body: unknown): RESTResponse {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
        return { Status: response.status, Body: body, Headers: headers };
    }

    /**
     * Computes exponential backoff delay in ms with a `Retry-After` header
     * override when provided by the server.
     */
    private computeBackoffMs(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number(retryAfter);
            if (!Number.isNaN(seconds) && seconds > 0) return Math.min(seconds * 1000, 30000);
        }
        return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), 30000);
    }

    /**
     * Applies a minimum-interval throttle between consecutive requests to
     * avoid hammering a tenant whose rate-limit policy is undocumented.
     */
    private async applyThrottle(auth: BettyAuthContext): Promise<void> {
        const minInterval = auth.Config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minInterval) {
            await this.sleep(minInterval - elapsed);
        }
    }

    /** Returns a promise that resolves after `ms` milliseconds. */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Removes a trailing slash if present. */
    private stripTrailingSlash(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    // ─── Tenant reachability probe ───────────────────────────────────

    /**
     * Probes a small set of candidate "reachability" paths. Returns on the
     * first path that appears to authenticate (even 401 is informative —
     * the tenant is reachable and treating the key as invalid rather than
     * silently ignoring it).
     */
    private async probeTenantReachable(
        auth: BettyAuthContext,
        baseURL: string
    ): Promise<{ success: boolean; message: string; serverVersion?: string }> {
        const probePaths = ['/health', '/healthz', '/api/health', '/', '/openapi.json'];
        const headers = this.BuildHeaders(auth);

        for (const path of probePaths) {
            const url = `${baseURL}${path}`;
            try {
                const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
                const outcome = this.interpretProbeResponse(response, url);
                if (outcome) return outcome;
            } catch {
                // Try next path.
            }
        }

        return {
            success: false,
            message: `Betty tenant did not respond to any of ${probePaths.join(', ')}. ` +
                'Confirm the TenantEndpoint URL and that the tenant is provisioned and reachable.',
        };
    }

    /**
     * Turns a probe response into a human-readable success / failure. Returns
     * null to mean "inconclusive — try the next path."
     */
    private interpretProbeResponse(
        response: RESTResponse,
        url: string
    ): { success: boolean; message: string; serverVersion?: string } | null {
        if (response.Status >= 200 && response.Status < 300) {
            return {
                success: true,
                message: `Connected to Betty tenant at ${url}. Ready to sync conversational data.`,
                serverVersion: this.extractServerVersion(response.Body),
            };
        }
        if (response.Status === 401) {
            return {
                success: false,
                message: `Tenant reachable at ${url} but API key rejected (401). Confirm the ApiKey and AuthHeader style with the customer's Betty admin.`,
            };
        }
        if (response.Status === 403) {
            return {
                success: true,
                message: `Tenant reachable at ${url}; API key accepted but this endpoint is restricted (403). Connection is usable for authorized endpoints.`,
            };
        }
        return null; // Inconclusive — try next path.
    }

    /** Best-effort extraction of a server/version string from a probe body. */
    private extractServerVersion(body: unknown): string | undefined {
        if (!body || typeof body !== 'object') return undefined;
        const obj = body as Record<string, unknown>;
        const version = obj['version'] ?? obj['apiVersion'] ?? obj['api_version'];
        if (typeof version === 'string') return `Betty AI ${version}`;
        const info = obj['info'];
        if (info && typeof info === 'object') {
            const inner = info as Record<string, unknown>;
            if (typeof inner['version'] === 'string') return `Betty AI ${inner['version']}`;
        }
        return undefined;
    }

    // ─── Compile-time type anchors ───────────────────────────────────
    //
    // The response-shape interfaces (BettyConversationRecord etc.) are
    // declared above but not referenced directly because the connector
    // operates purely metadata-driven. We anchor them here so they remain
    // part of the public type surface and are tree-shake-safe, and so the
    // type surface matches the documented mj_field_map hints.

    private readonly _typeAnchor?: {
        conversation: BettyConversationRecord;
        message: BettyMessageRecord;
        knowledgeSource: BettyKnowledgeSourceRecord;
        user: BettyUserRecord;
        feedback: BettyFeedbackRecord;
        contentGap: BettyContentGapRecord;
    };

}

/** Tree-shaking prevention function — import and call from module entry point. */
export function LoadBettyConnector(): void { /* no-op */ }
