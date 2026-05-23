/**
 * PropFuelConnector — REST integration connector for PropFuel (now part of re:Members),
 * a personalized member-engagement platform for associations (email + SMS conversational
 * "Ask, Capture, Act" campaigns).
 *
 * ⚠️ STATUS: READ-ONLY SCAFFOLD.
 *
 * PropFuel does not publish a public developer portal. The connector below is built
 * against the *expected* shape of a tenant-scoped REST API (per-customer BaseURL +
 * bearer-token API key) and the documented domain objects (member profiles, campaigns,
 * conversations / engagements, captures / responses, segments, tags). Endpoint paths,
 * pagination strategy, and field names should be confirmed against PropFuel's actual
 * API specification before relying on this connector for production sync.
 *
 * To productionize:
 *   1. Obtain PropFuel API documentation (Swagger / OpenAPI / Postman collection).
 *   2. Verify the BaseURL pattern, auth header (Bearer vs X-API-Key), and pagination type.
 *   3. Replace the `PROPFUEL_OBJECT_PATHS` placeholder paths with real endpoints.
 *   4. Audit the field metadata in `metadata/integrations/.propfuel.json` against the spec.
 *   5. Add Create/Update/Delete support and flip `SupportsCreate/Update/Delete` to true.
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type FetchContext,
    type FetchBatchResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type IntegrationObjectInfo,
} from '@memberjunction/integration-engine';

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Credentials for a PropFuel tenant. The BaseURL pattern is per-customer; the connector
 * sends the ApiKey as a bearer token by default. Confirm the actual auth header
 * (Bearer / X-API-Key / etc.) with PropFuel before deploying against production.
 */
export interface PropFuelConnectionConfig {
    BaseURL: string;
    ApiKey: string;

    /** Maximum retries for rate-limited or transient failures. Default: 3. */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests (client-side throttle). Default: 250. */
    MinRequestIntervalMs?: number;
}

interface PropFuelAuthContext extends RESTAuthContext {
    Token: string;
    Config: PropFuelConnectionConfig;
    BaseURL: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;

/**
 * Placeholder API paths. Update these once PropFuel publishes formal API docs. Each
 * value should be the URL path segment (no leading slash) appended to the BaseURL —
 * for example, `/v1/contacts` with BaseURL `https://api.propfuel.com` resolves to
 * `https://api.propfuel.com/v1/contacts`.
 */
const PROPFUEL_OBJECT_PATHS: Record<string, string> = {
    Contacts: '/contacts',
    Campaigns: '/campaigns',
    Conversations: '/conversations',
    Captures: '/captures',
    Segments: '/segments',
    Tags: '/tags',
};

/**
 * Static catalog of the PropFuel objects this connector knows how to discover.
 * Field metadata is intentionally minimal — DiscoverFields infers the rest from a
 * sample API response. This list mirrors the integration metadata in
 * `metadata/integrations/.propfuel.json`.
 */
const PROPFUEL_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Contacts', DisplayName: 'Contacts',
        Description: 'Member / subscriber profile records — the primary identity for engagement.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact ID' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
        ],
    },
    {
        Name: 'Campaigns', DisplayName: 'Campaigns',
        Description: 'Engagement campaigns built from PropFuel blueprints (Ask / Capture / Act flows).',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign ID' },
        ],
    },
    {
        Name: 'Conversations', DisplayName: 'Conversations',
        Description: 'Two-way member interactions across email and SMS.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Conversation ID' },
            { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        ],
    },
    {
        Name: 'Captures', DisplayName: 'Captures',
        Description: 'Member responses to Ask prompts — the data PropFuel collects from a campaign.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Capture ID' },
            { Name: 'contact_id', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
            { Name: 'campaign_id', DisplayName: 'Campaign ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Campaigns' },
        ],
    },
    {
        Name: 'Segments', DisplayName: 'Segments',
        Description: 'Audience segments used to target campaigns.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Segment ID' },
        ],
    },
    {
        Name: 'Tags', DisplayName: 'Tags',
        Description: 'Tags applied to Contacts for segmentation and targeting.',
        SupportsWrite: false,
        Fields: [
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tag ID' },
        ],
    },
];

const WATERMARK_CANDIDATE_FIELDS = ['updated_at', 'modified_at', 'last_updated', 'updatedAt'];

// ─── Connector ──────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'PropFuelConnector')
export class PropFuelConnector extends BaseRESTIntegrationConnector {

    private authState: PropFuelAuthContext | null = null;
    private lastRequestTime = 0;

    // ── Capability flags ────────────────────────────────────────────
    // Read-only initial cut. Flip to true once PropFuel write endpoints are confirmed
    // and the corresponding CreateRecord / UpdateRecord / DeleteRecord overrides are added.

    public override get IntegrationName(): string { return 'PropFuel'; }
    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }
    public override get SupportsSearch(): boolean { return false; }
    public override get SupportsListing(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return PROPFUEL_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-comments';
        config.CategoryDescription = 'PropFuel member-engagement platform — read-only access to contacts, campaigns, conversations, and captures.';
        config.ParentCategoryName = 'Engagement';
        config.IncludeSearch = false;
        config.IncludeList = true;
        return config;
    }

    // ── Auth + transport (abstract methods from BaseRESTIntegrationConnector) ──

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        return this.GetAuth(companyIntegration, contextUser);
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${(auth as PropFuelAuthContext).Token}`,
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const pfAuth = auth as PropFuelAuthContext;
        const config = pfAuth.Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        const effectiveHeaders = { ...headers };
        if (body !== undefined && method !== 'GET' && method !== 'DELETE' && !effectiveHeaders['Content-Type']) {
            effectiveHeaders['Content-Type'] = 'application/json';
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);
            const response = await this.ExecuteFetch(url, method, effectiveHeaders, body, timeoutMs);
            this.lastRequestTime = Date.now();

            if (this.ShouldRetry(response.status) && attempt < maxRetries) {
                await this.Sleep(this.ComputeRetryDelay(response, attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`PropFuel API request failed after ${maxRetries} attempt(s): ${url}`);
    }

    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];

        const body = rawBody as Record<string, unknown>;
        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return body[responseDataKey] as Record<string, unknown>[];
        }
        // Common envelope conventions — pick whichever the live API actually uses.
        for (const key of ['data', 'items', 'results', 'records']) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }
        if (Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };

        const records = this.NormalizeResponse(rawBody, null);
        const effectivePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
        const hasMore = records.length >= effectivePageSize;

        switch (paginationType) {
            case 'Offset':
                return { HasMore: hasMore, NextOffset: currentOffset + records.length };
            case 'PageNumber':
                return { HasMore: hasMore, NextPage: currentPage + 1 };
            case 'Cursor': {
                const body = rawBody as Record<string, unknown> | null;
                const cursor = body?.['next_cursor'] ?? body?.['cursor'] ?? body?.['nextCursor'];
                return {
                    HasMore: !!cursor,
                    NextCursor: typeof cursor === 'string' ? cursor : undefined,
                };
            }
            default:
                return { HasMore: hasMore };
        }
    }

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as PropFuelAuthContext).BaseURL;
    }

    // ── Discovery + connection test ─────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser, true);
            const path = PROPFUEL_OBJECT_PATHS['Contacts'];
            const url = `${auth.BaseURL}${path}?limit=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: `Connected to PropFuel at ${auth.BaseURL}` };
            }
            return {
                Success: false,
                Message: `PropFuel responded HTTP ${response.Status}. The endpoint shape may differ from the placeholder used here — verify against PropFuel's API documentation.`,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `PropFuel connection failed: ${message}` };
        }
    }

    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const staticObjects = await super.DiscoverObjects(companyIntegration, contextUser);
        if (staticObjects.length > 0) return staticObjects;

        return PROPFUEL_OBJECTS.map(o => ({
            Name: o.Name,
            Label: o.DisplayName,
            Description: o.Description,
            SupportsIncrementalSync: true,
            SupportsWrite: o.SupportsWrite,
        }));
    }

    /**
     * Discovery strategy: fetch one sample record and infer the field set from its JSON
     * shape, overlaying any static PK / FK metadata. Falls back to the static field list
     * if the live call fails (offline / sandbox with no data / endpoint mismatch).
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser);
            const path = PROPFUEL_OBJECT_PATHS[objectName];
            if (path) {
                const url = `${auth.BaseURL}${path}?limit=1`;
                const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
                if (response.Status === 200) {
                    const records = this.NormalizeResponse(response.Body, null);
                    if (records.length > 0) return this.InferFieldsFromSample(records[0], objectName);
                }
            }
        } catch {
            // Live discovery failed — fall through to the static fallback below.
        }

        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);
        if (staticFields.length > 0) return staticFields;

        const obj = PROPFUEL_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            Name: f.Name,
            Label: f.DisplayName,
            Description: f.Description,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
        }));
    }

    private InferFieldsFromSample(sample: Record<string, unknown>, objectName: string): ExternalFieldSchema[] {
        const staticObj = PROPFUEL_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));

        return Object.entries(sample).map(([key, value]) => {
            const overlay = staticMap.get(key.toLowerCase());
            return {
                Name: key,
                Label: overlay?.DisplayName ?? key,
                Description: overlay?.Description ?? '',
                DataType: overlay?.Type ?? this.InferType(value),
                IsRequired: overlay?.IsRequired ?? false,
                IsUniqueKey: overlay?.IsPrimaryKey ?? false,
                IsReadOnly: overlay?.IsReadOnly ?? true,
                IsForeignKey: overlay?.Description?.startsWith('FK') ?? false,
            };
        });
    }

    private InferType(value: unknown): string {
        if (value === null || value === undefined) return 'string';
        if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'decimal';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
        return 'string';
    }

    // ── Fetch + watermark ───────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.GetAuth(ctx.CompanyIntegration, ctx.ContextUser) as PropFuelAuthContext;
        const path = PROPFUEL_OBJECT_PATHS[ctx.ObjectName];
        if (!path) {
            throw new Error(`PropFuel: no API path configured for object "${ctx.ObjectName}". Update PROPFUEL_OBJECT_PATHS in PropFuelConnector.ts.`);
        }

        const offset = ctx.CurrentOffset ?? 0;
        const url = this.BuildFetchURL(auth.BaseURL, path, offset, ctx.WatermarkValue);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`PropFuel FetchChanges failed for ${ctx.ObjectName}: HTTP ${response.Status}`);
        }

        const records = this.NormalizeResponse(response.Body, null);
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: this.ExtractIdFromRecord(r),
            ObjectType: ctx.ObjectName,
            Fields: r,
        }));

        return {
            Records: externalRecords,
            HasMore: records.length >= DEFAULT_PAGE_SIZE,
            NextOffset: offset + records.length,
            NewWatermarkValue: this.ComputeNewWatermark(externalRecords, ctx.WatermarkValue),
        };
    }

    private BuildFetchURL(baseURL: string, path: string, offset: number, watermark: string | null): string {
        const params = new URLSearchParams();
        params.set('limit', String(DEFAULT_PAGE_SIZE));
        params.set('offset', String(offset));
        if (watermark) params.set('updated_since', watermark);
        return `${baseURL}${path}?${params.toString()}`;
    }

    private ComputeNewWatermark(records: ExternalRecord[], current: string | null): string | undefined {
        let latest: string | undefined;
        for (const record of records) {
            for (const key of WATERMARK_CANDIDATE_FIELDS) {
                const value = record.Fields[key];
                if (typeof value === 'string' && (!latest || value > latest)) latest = value;
            }
        }
        if (!latest) return current ?? undefined;
        if (current && latest <= current) return current;
        return latest;
    }

    // ── Default config + field mappings ─────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return { DefaultSchemaName: 'PropFuel', DefaultObjects: [] };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        const obj = PROPFUEL_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name === 'id' ? 'ExternalID' : f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }

    // ─────────────────────────────────────────────────────────────────
    //                         Private helpers
    // ─────────────────────────────────────────────────────────────────

    private async GetAuth(
        source: MJCompanyIntegrationEntity | PropFuelConnectionConfig,
        contextUser?: UserInfo,
        forceRefresh = false
    ): Promise<PropFuelAuthContext> {
        if (!forceRefresh && this.authState) return this.authState;

        const config = this.IsConfig(source)
            ? source
            : await this.ParseConfig(source as MJCompanyIntegrationEntity, contextUser);

        const baseURL = this.StripTrailingSlash(config.BaseURL);
        this.authState = {
            Token: config.ApiKey,
            Config: { ...config, BaseURL: baseURL },
            BaseURL: baseURL,
        };
        return this.authState;
    }

    private IsConfig(source: MJCompanyIntegrationEntity | PropFuelConnectionConfig): source is PropFuelConnectionConfig {
        return (source as PropFuelConnectionConfig).BaseURL !== undefined
            && (source as PropFuelConnectionConfig).ApiKey !== undefined;
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo,
    ): Promise<PropFuelConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const fromCred = await this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
            if (fromCred) return fromCred;
        }
        if (companyIntegration.Configuration) {
            const parsed = JSON.parse(companyIntegration.Configuration) as Record<string, string>;
            return this.ExtractConfig(parsed);
        }
        throw new Error('PropFuel connector requires either CredentialID or Configuration JSON');
    }

    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<PropFuelConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        const values = JSON.parse(credential.Values) as Record<string, string>;
        return this.ExtractConfig(values);
    }

    private ExtractConfig(values: Record<string, string>): PropFuelConnectionConfig {
        const get = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const hit = Object.entries(values).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (hit) return String(hit[1] ?? '');
            }
            return undefined;
        };

        // Accepts vendor-specific PascalCase names AND the field names from the
        // standard 'API Key with Endpoint' credential schema (endpoint, apiKey)
        // so the metadata can reference the standard schema rather than a
        // PropFuel-specific one.
        const baseURL = get('BaseURL', 'BaseUrl', 'base_url', 'endpoint');
        const apiKey = get('ApiKey', 'apiKey', 'api_key');
        if (!baseURL) throw new Error('PropFuel configuration missing required field: BaseURL');
        if (!apiKey) throw new Error('PropFuel configuration missing required field: ApiKey');

        return { BaseURL: this.StripTrailingSlash(baseURL), ApiKey: apiKey };
    }

    // ── HTTP helpers ────────────────────────────────────────────────

    private async ExecuteFetch(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number,
    ): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const requestInit: RequestInit = { method, headers, signal: controller.signal };
            if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
                requestInit.body = JSON.stringify(body);
            }
            return await fetch(url, requestInit);
        } finally {
            clearTimeout(timer);
        }
    }

    private async BuildRESTResponse(response: Response): Promise<RESTResponse> {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        const contentType = headers['content-type'] ?? '';
        const body: unknown = contentType.includes('application/json')
            ? await this.ParseJsonSafely(response)
            : await response.text();
        return { Status: response.status, Body: body, Headers: headers };
    }

    private async ParseJsonSafely(response: Response): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    private ShouldRetry(status: number): boolean {
        return status === 429 || status === 502 || status === 503 || status === 504;
    }

    private ComputeRetryDelay(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const seconds = Number.parseInt(retryAfter, 10);
            if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
        }
        return Math.min(Math.pow(2, attempt) * 1000, 15_000);
    }

    private async Throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) await this.Sleep(minIntervalMs - elapsed);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── Misc helpers ────────────────────────────────────────────────

    private ExtractIdFromRecord(body: Record<string, unknown>): string {
        const candidates = ['id', 'ID', 'Id', 'contact_id', 'campaign_id', 'conversation_id', 'capture_id'];
        for (const key of candidates) {
            const value = body[key];
            if (value !== undefined && value !== null) return String(value);
        }
        return '';
    }

    private StripTrailingSlash(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
}

/** Tree-shaking prevention — import and call from module entry point. */
export function LoadPropFuelConnector(): void { /* intentional no-op */ }
