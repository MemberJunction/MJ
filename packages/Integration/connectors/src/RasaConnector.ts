import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
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
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity } from '@memberjunction/core-entities';

// ─── Configuration & Auth Types ──────────────────────────────────────

/** Connection configuration parsed from CompanyIntegration credentials */
export interface RasaConnectionConfig {
    /** Rasa.io API key (UUID format) used for Basic auth to obtain JWT */
    APIKey: string;
    /** Basic auth username (email) for the Rasa.io account */
    Username: string;
    /** Basic auth password for the Rasa.io account */
    Password: string;
    /** Community identifier — scopes API calls to a specific newsletter community */
    CommunityIdentifier?: string;
}

/** Extended auth context with Rasa-specific JWT token */
interface RasaAuthContext extends RESTAuthContext {
    Config: RasaConnectionConfig;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Rasa.io API base URL */
const RASA_API_BASE = 'https://api.rasa.io/v1';

/** JWT tokens are refreshed every 50 minutes (tokens last ~60 min) */
const TOKEN_TTL_MS = 50 * 60 * 1000;

/** Maximum retries for rate-limited or failed requests */
const MAX_RETRIES = 3;

/** HTTP request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 60000;

/** Minimum milliseconds between API requests */
const MIN_REQUEST_INTERVAL_MS = 200;

/** Default page size for Rasa.io API calls */
const DEFAULT_PAGE_SIZE = 50;

// ─── Connector Implementation ────────────────────────────────────────

/**
 * Connector for the Rasa.io newsletter platform REST API.
 *
 * Extends BaseRESTIntegrationConnector to leverage metadata-driven object/field
 * discovery from IntegrationEngineBase cache and generic pagination handling.
 *
 * Auth flow:
 *   1. POST /v1/tokens with Basic auth header + { "key": "<API-key>" } body
 *   2. Receive JWT token in response
 *   3. Pass JWT as rasa-token header on all data requests
 *
 * Pagination:
 *   - persons/posts: offset-based (skip/limit), supports updated_since watermark
 *   - insights/actions: cursor-based (base64 skip token from next_link), supports created_since watermark
 *   - insights/topics: no pagination, full replace on each sync
 *
 * Response envelope: { code, metadata: { next_link, record_count }, results: [...] }
 */
// ─── Action Metadata Objects ──────────────────────────────────────────

const RASA_ACTION_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'persons', DisplayName: 'Person',
        Description: 'A newsletter subscriber/contact in Rasa.io', SupportsWrite: false,
        Fields: [
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Subscriber email address' },
            { Name: 'first_name', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Subscriber first name' },
            { Name: 'last_name', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Subscriber last name' },
            { Name: 'external_id', DisplayName: 'Source External ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'External ID from source system' },
            { Name: 'is_active', DisplayName: 'Is Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether the subscriber is active' },
            { Name: 'is_subscribed', DisplayName: 'Is Subscribed', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether the subscriber is subscribed' },
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Rasa.io internal person ID' },
            { Name: 'created', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the person was created' },
            { Name: 'updated', DisplayName: 'Updated Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last updated' },
        ],
    },
    {
        Name: 'posts', DisplayName: 'Post',
        Description: 'A newsletter content article/post in Rasa.io', SupportsWrite: false,
        Fields: [
            { Name: 'title', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Post title' },
            { Name: 'description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Post description/summary' },
            { Name: 'url', DisplayName: 'URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Post URL' },
            { Name: 'source_url', DisplayName: 'Source URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Original source URL' },
            { Name: 'image_url', DisplayName: 'Image URL', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Post image URL' },
            { Name: 'quality_score', DisplayName: 'Quality Score', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Content quality score' },
            { Name: 'is_active', DisplayName: 'Is Active', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether the post is active' },
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Rasa.io internal post ID' },
            { Name: 'created', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the post was created' },
            { Name: 'updated', DisplayName: 'Updated Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When last updated' },
        ],
    },
    {
        Name: 'insights-actions', DisplayName: 'Insight Action',
        Description: 'User action/engagement events from Rasa.io analytics', SupportsWrite: false,
        Fields: [
            { Name: 'person_id', DisplayName: 'Person ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated person ID' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Person email' },
            { Name: 'action_type', DisplayName: 'Action Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type of action (click, open, etc.)' },
            { Name: 'created', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the action occurred' },
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Action event ID' },
        ],
    },
    {
        Name: 'insights-topics', DisplayName: 'Insight Topic',
        Description: 'User topic interest data from Rasa.io analytics', SupportsWrite: false,
        Fields: [
            { Name: 'person_id', DisplayName: 'Person ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated person ID' },
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Person email' },
            { Name: 'topic', DisplayName: 'Topic', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Topic name' },
            { Name: 'weight', DisplayName: 'Weight', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Interest weight/score' },
            { Name: 'first_click', DisplayName: 'First Click', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'First interaction with this topic' },
            { Name: 'last_click', DisplayName: 'Last Click', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Most recent interaction' },
            { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Topic interest ID' },
        ],
    },
];

@RegisterClass(BaseIntegrationConnector, 'RasaConnector')
export class RasaConnector extends BaseRESTIntegrationConnector {
    /** Cached JWT token */
    private cachedToken: string | null = null;
    /** When the cached token was obtained */
    private tokenObtainedAt = 0;

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Rasa.io'; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return RASA_ACTION_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-envelope-open-text';
        // Rasa.io is read-only but we still want Search/List actions for querying
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    /** Running count of records fetched for the current object in this sync run */
    private _runningFetchTotal = 0;

    /** Tracks all ExternalIDs seen per object in this sync run to detect API wrap-around */
    private _seenIDs: Map<string, Set<string>> = new Map();


    /** Last fetched URL path, used for per-page logging */
    private _lastFetchedPath = '';

    /** Watermark value for the current FetchChanges call — used in BuildPaginatedURL */
    private _currentWatermark: string | undefined = undefined;

    /** Object name for the current FetchChanges call — used in NormalizeResponse and BuildPaginatedURL */
    private _currentObjectName = '';

    /**
     * Buffer for non-paginated objects that return more records than BatchSize in one shot.
     * Keyed by object name. Records are spliced out as they're served to the engine.
     */
    private _batchBuffer: Map<string, FetchBatchResult['Records']> = new Map();

    /**
     * Watermark values pre-computed from the full result set when buffering.
     * Stored so the final buffer batch can still advance the watermark correctly.
     */
    private _batchBufferWatermarks: Map<string, string | null> = new Map();

    // ─── Abstract method implementations ─────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<RESTAuthContext> {
        console.log(`[Rasa.io] Authenticating...`);
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const token = await this.GetToken(config);
        console.log(`[Rasa.io] Authenticated successfully, token length: ${token.length}`);
        const auth: RasaAuthContext = { Token: token, Config: config };
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'rasa-token': auth.Token!,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const rasaAuth = auth as RasaAuthContext;

        // Throttle requests
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
        }

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const fetchOptions: RequestInit = {
                method,
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            };
            if (body && method !== 'GET') {
                fetchOptions.body = JSON.stringify(body);
            }

            let response: Response;
            try {
                response = await fetch(url, fetchOptions);
            } catch (err) {
                if (attempt < MAX_RETRIES && this.IsTimeoutOrNetworkError(err)) {
                    console.warn(`Rasa.io timeout on ${url}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    await this.Sleep(1000 * (attempt + 1));
                    continue;
                }
                throw err;
            }

            if (response.status === 401 && attempt < MAX_RETRIES) {
                // Token expired, refresh and retry
                console.warn('Rasa.io 401, refreshing token');
                this.cachedToken = null;
                const newToken = await this.GetToken(rasaAuth.Config);
                rasaAuth.Token = newToken;
                headers['rasa-token'] = newToken;
                continue;
            }

            if (response.status === 429 && attempt < MAX_RETRIES) {
                const delayMs = 2000 * Math.pow(2, attempt);
                console.warn(`Rasa.io rate limited (429), retrying in ${delayMs}ms`);
                await this.Sleep(delayMs);
                continue;
            }

            this.lastRequestTime = Date.now();
            const responseBody = await response.json();
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key.toLowerCase()] = value;
            });

            return {
                Status: response.status,
                Body: responseBody,
                Headers: responseHeaders,
            };
        }

        throw new Error(`Rasa.io request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        const body = rawBody as Record<string, unknown>;

        if (body.results && Array.isArray(body.results)) {
            const rawResults = body.results as Record<string, unknown>[];

            // insights/topics: flatten nested topics[] per person into individual rows
            if (this._currentObjectName.toLowerCase() === 'insights-topics') {
                return this.FlattenInsightsTopics(rawResults);
            }

            // Standard envelope: each item may wrap actual record under 'data' key — unwrap it
            const records = rawResults.map(item => {
                const inner = item['data'];
                return (inner && typeof inner === 'object' && !Array.isArray(inner))
                    ? inner as Record<string, unknown>
                    : item;
            });
            this._runningFetchTotal += records.length;
            const pathLabel = this._lastFetchedPath || 'unknown';
            console.log(`[Rasa.io] Fetched ${records.length} records (running total: ${this._runningFetchTotal}) from ${pathLabel}`);
            return records;
        }

        // If responseDataKey is specified, use it
        if (responseDataKey && body[responseDataKey]) {
            const data = body[responseDataKey];
            return Array.isArray(data) ? data as Record<string, unknown>[] : [data as Record<string, unknown>];
        }

        // Fallback: if body itself is an array
        if (Array.isArray(body)) {
            return body as Record<string, unknown>[];
        }

        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        const body = rawBody as Record<string, unknown>;
        const metadata = body.metadata as Record<string, unknown> | undefined;

        if (!metadata) {
            return { HasMore: false };
        }

        const totalRecords = metadata.record_count as number | undefined;
        const nextLink = metadata.next_link as string | undefined;

        // Count actual records returned in this page
        const results = body.results;
        const returnedCount = Array.isArray(results) ? results.length : 0;

        // If the API returned fewer records than the page size, this is the last page.
        // The Rasa API returns next_link even past the end of the dataset, so we cannot
        // rely on next_link alone. Fewer records than requested = no more data.
        if (returnedCount < pageSize) {
            return { HasMore: false, TotalRecords: totalRecords };
        }

        const hasMore = !!nextLink && nextLink.length > 0;
        if (!hasMore) {
            return { HasMore: false, TotalRecords: totalRecords };
        }

        // Determine cursor vs offset by inspecting the skip param in next_link
        let nextCursor: string | undefined;
        let nextOffset: number | undefined;

        try {
            const url = new URL(nextLink!);
            const skipParam = url.searchParams.get('skip');
            if (skipParam && isNaN(Number(skipParam))) {
                // Non-numeric skip param = base64 cursor token (insights/actions)
                nextCursor = skipParam;
            } else {
                nextOffset = currentOffset + returnedCount;
            }
        } catch {
            nextOffset = currentOffset + pageSize;
        }

        return {
            HasMore: true,
            NextOffset: nextOffset,
            NextCursor: nextCursor,
            TotalRecords: totalRecords,
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity
    ): string {
        return RASA_API_BASE;
    }

    /**
     * Builds paginated URL with:
     *  - Watermark filter params (updated_since / created_since) sent server-side
     *  - Offset-based skip/limit for persons and posts
     *  - Cursor-based skip token for insights/actions
     *  - No pagination params for insights/topics
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        try {
            this._lastFetchedPath = new URL(basePath).pathname;
        } catch {
            this._lastFetchedPath = basePath;
        }

        const objectName = (obj.Name ?? '').toLowerCase();
        const limit = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const params = new URLSearchParams();

        // Pass watermark filter to API so it only returns changed records
        if (this._currentWatermark) {
            if (objectName === 'persons' || objectName === 'posts') {
                params.set('updated_since', this._currentWatermark);
            } else if (objectName === 'insights-actions') {
                params.set('created_since', this._currentWatermark);
            }
        }

        // Pagination params — insights/topics has no pagination
        if (objectName !== 'insights-topics') {
            if (objectName === 'insights-actions' && cursor) {
                // Cursor-based: cursor is the base64 skip token extracted from previous next_link
                params.set('skip', cursor);
            } else if (offset > 0) {
                // Offset-based
                params.set('skip', String(offset));
            }
            params.set('limit', String(limit));
        }

        const queryString = params.toString();
        return queryString ? `${basePath}?${queryString}` : basePath;
    }

    // ─── TestConnection ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            const token = await this.GetToken(config);

            // Verify token works by listing communities
            const response = await fetch(`${RASA_API_BASE}/communities`, {
                method: 'GET',
                headers: { 'rasa-token': token, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (!response.ok) {
                return {
                    Success: false,
                    Message: `Connection failed: HTTP ${response.status} from communities endpoint`,
                };
            }

            const body = await response.json() as Record<string, unknown>;
            const results = body.results as Record<string, unknown>[] | undefined;
            const communityCount = results?.length ?? 0;

            return {
                Success: true,
                Message: `Connected to Rasa.io — ${communityCount} community(ies) accessible`,
                ServerVersion: 'Rasa.io API v1',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Default Configuration ───────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'RasaIO',
            DefaultObjects: [],
        };
    }

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        const lowerName = objectName.toLowerCase();

        if (lowerName === 'persons' || lowerName === 'contacts') {
            return [
                { SourceFieldName: 'id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'email', DestinationFieldName: 'Email' },
                { SourceFieldName: 'first_name', DestinationFieldName: 'FirstName' },
                { SourceFieldName: 'last_name', DestinationFieldName: 'LastName' },
                { SourceFieldName: 'external_id', DestinationFieldName: 'SourceExternalID' },
                { SourceFieldName: 'is_active', DestinationFieldName: 'IsActive' },
                { SourceFieldName: 'is_subscribed', DestinationFieldName: 'IsSubscribed' },
                { SourceFieldName: 'created', DestinationFieldName: 'CreatedAt' },
                { SourceFieldName: 'updated', DestinationFieldName: 'UpdatedAt' },
            ];
        }

        if (lowerName === 'posts' || lowerName === 'content') {
            return [
                { SourceFieldName: 'id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'url', DestinationFieldName: 'URL' },
                { SourceFieldName: 'title', DestinationFieldName: 'Title' },
                { SourceFieldName: 'description', DestinationFieldName: 'Description' },
                { SourceFieldName: 'source_url', DestinationFieldName: 'SourceURL' },
                { SourceFieldName: 'image_url', DestinationFieldName: 'ImageURL' },
                { SourceFieldName: 'quality_score', DestinationFieldName: 'QualityScore' },
                { SourceFieldName: 'is_active', DestinationFieldName: 'IsActive' },
                { SourceFieldName: 'created', DestinationFieldName: 'CreatedAt' },
                { SourceFieldName: 'updated', DestinationFieldName: 'UpdatedAt' },
            ];
        }

        return [];
    }

    // ─── FetchChanges Override ────────────────────────────────────────

    /**
     * Override FetchChanges to:
     *  1. Store watermark and object name for use in BuildPaginatedURL/NormalizeResponse
     *  2. Advance watermark on final batch using latest record timestamp
     *
     * Watermark filtering is done server-side via updated_since/created_since params
     * (set in BuildPaginatedURL), so no client-side filtering is needed here.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        console.log(`[Rasa.io] FetchChanges called for '${ctx.ObjectName}' (batchSize=${ctx.BatchSize}, watermark=${ctx.WatermarkValue ?? 'none'}, offset=${ctx.CurrentOffset ?? 'none'}, cursor=${ctx.CurrentCursor ?? 'none'})`);

        // Reset counter and seen-IDs on the first page. Don't reset when serving from buffer
        // (buffer calls also have no offset/cursor but the buffer key will be present).
        const isFirstCall = !ctx.CurrentOffset && !ctx.CurrentPage && !ctx.CurrentCursor;
        if (isFirstCall && !this._batchBuffer.has(ctx.ObjectName)) {
            this._runningFetchTotal = 0;
            this._seenIDs.set(ctx.ObjectName, new Set());
        }

        // Store for use in BuildPaginatedURL and NormalizeResponse
        this._currentWatermark = ctx.WatermarkValue ?? undefined;
        this._currentObjectName = ctx.ObjectName ?? '';

        // Serve from buffer if a previous call left unconsumed records
        const buffered = this._batchBuffer.get(ctx.ObjectName);
        if (buffered && buffered.length > 0) {
            return this.ServeBufferedRecords(ctx.ObjectName, buffered, ctx.BatchSize);
        }

        const result = await super.FetchChanges(ctx);

        // Detect API wrap-around: track all seen IDs, stop when entire batch is duplicates
        const seen = this._seenIDs.get(ctx.ObjectName);
        if (seen && result.Records.length > 0) {
            const dupeCount = result.Records.filter(r => seen.has(r.ExternalID)).length;
            for (const r of result.Records) seen.add(r.ExternalID);

            if (dupeCount === result.Records.length) {
                return {
                    Records: [],
                    HasMore: false,
                    NewWatermarkValue: this.FindLatestTimestamp(result.Records) ?? ctx.WatermarkValue ?? undefined,
                };
            }
        }

        // When a non-paginated endpoint returns more than BatchSize in one shot,
        // buffer the full set and serve it in chunks so no records are silently dropped.
        if (!result.HasMore && result.Records.length > ctx.BatchSize) {
            const watermark = this.FindLatestTimestamp(result.Records);
            this._batchBuffer.set(ctx.ObjectName, result.Records);
            this._batchBufferWatermarks.set(ctx.ObjectName, watermark);
            return this.ServeBufferedRecords(ctx.ObjectName, result.Records, ctx.BatchSize);
        }

        const isFinalBatch = !result.HasMore;
        const latestTimestamp = isFinalBatch ? this.FindLatestTimestamp(result.Records) : null;

        return {
            ...result,
            NewWatermarkValue: isFinalBatch ? (latestTimestamp ?? ctx.WatermarkValue ?? undefined) : undefined,
        };
    }

    /**
     * Serves records from the internal buffer in BatchSize-sized chunks.
     * Splices consumed records from the buffer array so subsequent calls advance correctly.
     * Emits NewWatermarkValue only on the final chunk.
     */
    private ServeBufferedRecords(
        objectName: string,
        buffer: FetchBatchResult['Records'],
        batchSize: number
    ): FetchBatchResult {
        const batch = buffer.splice(0, batchSize);
        const hasMore = buffer.length > 0;

        let newWatermarkValue: string | undefined;
        if (!hasMore) {
            const stored = this._batchBufferWatermarks.get(objectName);
            newWatermarkValue = stored ?? undefined;
            this._batchBuffer.delete(objectName);
            this._batchBufferWatermarks.delete(objectName);
        }

        return {
            Records: batch,
            HasMore: hasMore,
            NewWatermarkValue: newWatermarkValue,
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────

    /**
     * Flattens the nested insights/topics response structure.
     * API returns one item per person with a topics[] array; we emit one row per (person, topic).
     */
    private FlattenInsightsTopics(rawResults: Record<string, unknown>[]): Record<string, unknown>[] {
        const rows: Record<string, unknown>[] = [];

        for (const item of rawResults) {
            // Unwrap 'data' envelope if present
            const record = (item['data'] && typeof item['data'] === 'object' && !Array.isArray(item['data']))
                ? item['data'] as Record<string, unknown>
                : item;

            const personId = record['id'] ?? record['person_id'];
            const externalId = record['external_id'];
            const email = record['email'];
            const topics = record['topics'];

            if (!Array.isArray(topics)) continue;

            for (const topicEntry of topics as Record<string, unknown>[]) {
                rows.push({
                    person_id: personId,
                    external_id: externalId,
                    email,
                    topic: topicEntry['topic'],
                    first_click: topicEntry['first_click'],
                    last_click: topicEntry['last_click'],
                    weight: topicEntry['weight'],
                });
            }
        }

        this._runningFetchTotal += rows.length;
        console.log(`[Rasa.io] Flattened ${rows.length} insights/topics rows from ${rawResults.length} persons`);
        return rows;
    }

    /**
     * Parses connection config from CompanyIntegration credentials.
     * Tries CredentialID first (MJ: Credentials entity), then Configuration JSON.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<RasaConnectionConfig> {
        // Try CredentialID first
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }

        // Fallback to Configuration JSON
        if (companyIntegration.Configuration) {
            return this.ParseConfigFromJSON(companyIntegration.Configuration);
        }

        throw new Error('Rasa.io connector requires either CredentialID or Configuration JSON');
    }

    /**
     * Loads credentials from the MJ: Credentials entity.
     */
    private async ParseConfigFromCredential(credentialID: string, contextUser?: UserInfo): Promise<RasaConnectionConfig> {
        const md = new Metadata();
        const credEntity = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        await credEntity.Load(credentialID);

        const valuesJSON = credEntity.Values;
        if (!valuesJSON) {
            throw new Error('Credential record has no Values JSON');
        }

        const values = JSON.parse(valuesJSON) as Record<string, string>;
        return this.ExtractConfigFields(values);
    }

    /**
     * Parses config from the CompanyIntegration.Configuration JSON string.
     */
    private ParseConfigFromJSON(configJSON: string): RasaConnectionConfig {
        const parsed = JSON.parse(configJSON) as Record<string, string>;
        return this.ExtractConfigFields(parsed);
    }

    /**
     * Extracts config fields with case-insensitive key matching.
     */
    private ExtractConfigFields(values: Record<string, string>): RasaConnectionConfig {
        const get = (key: string): string | undefined => {
            const lower = key.toLowerCase();
            for (const [k, v] of Object.entries(values)) {
                if (k.toLowerCase() === lower) return v;
            }
            return undefined;
        };

        const apiKey = get('apikey') ?? get('api_key') ?? get('key');
        const username = get('username') ?? get('email') ?? get('user');
        const password = get('password') ?? get('pass');
        const communityIdentifier = get('communityidentifier') ?? get('community_identifier') ?? get('community');

        if (!apiKey) {
            throw new Error('Rasa.io configuration missing required field: APIKey');
        }
        if (!username || !password) {
            throw new Error('Rasa.io configuration missing required fields: Username and Password (for Basic auth)');
        }

        return {
            APIKey: apiKey,
            Username: username,
            Password: password,
            CommunityIdentifier: communityIdentifier,
        };
    }

    /**
     * Obtains a JWT token from Rasa.io, using cache if still valid.
     */
    private async GetToken(config: RasaConnectionConfig): Promise<string> {
        // Return cached token if still fresh
        if (this.cachedToken && (Date.now() - this.tokenObtainedAt) < TOKEN_TTL_MS) {
            return this.cachedToken;
        }

        const basicAuth = Buffer.from(`${config.Username}:${config.Password}`).toString('base64');

        const response = await fetch(`${RASA_API_BASE}/tokens`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ key: config.APIKey }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Rasa.io token request failed (HTTP ${response.status}): ${body.slice(0, 500)}`);
        }

        const body = await response.json() as Record<string, unknown>;

        // Token could be in results array or directly in response
        let token: string | undefined;
        if (body.results && Array.isArray(body.results) && body.results.length > 0) {
            const firstResult = body.results[0] as Record<string, unknown>;
            token = (firstResult.token ?? firstResult['rasa-token'] ?? firstResult.jwt) as string | undefined;
        }
        if (!token && typeof body.token === 'string') {
            token = body.token;
        }
        if (!token && typeof body['rasa-token'] === 'string') {
            token = body['rasa-token'] as string;
        }

        if (!token) {
            throw new Error('Rasa.io token response did not contain a token');
        }

        this.cachedToken = token;
        this.tokenObtainedAt = Date.now();
        return token;
    }

    /**
     * Finds the latest timestamp from records for watermark advancement.
     * Uses 'created' for insights/actions (its only timestamp field); 'updated' for everything else.
     */
    private FindLatestTimestamp(records: { Fields: Record<string, unknown> }[]): string | null {
        const objectName = this._currentObjectName.toLowerCase();
        const primaryField = objectName.includes('action') ? 'created' : 'updated';
        const fallbackField = primaryField === 'updated' ? 'created' : 'updated';

        let latest: Date | null = null;

        for (const record of records) {
            const dateStr = (record.Fields[primaryField] ?? record.Fields[fallbackField]) as string | undefined;
            if (!dateStr) continue;

            const date = new Date(dateStr);
            if (!isNaN(date.getTime()) && (latest === null || date > latest)) {
                latest = date;
            }
        }

        return latest ? latest.toISOString() : null;
    }

    /**
     * Checks if an error is a timeout or network error.
     */
    private IsTimeoutOrNetworkError(err: unknown): boolean {
        if (err instanceof Error) {
            const msg = err.message.toLowerCase();
            return msg.includes('timeout') || msg.includes('abort') ||
                   msg.includes('econnreset') || msg.includes('econnrefused') ||
                   msg.includes('fetch failed');
        }
        return false;
    }

    /**
     * Sleeps for the specified number of milliseconds.
     */
    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
