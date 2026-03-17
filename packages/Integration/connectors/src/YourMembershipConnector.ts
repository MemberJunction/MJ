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
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity } from '@memberjunction/core-entities';

// ─── Configuration & Session Types ──────────────────────────────────

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface YMConnectionConfig {
    /** YM client/site identifier (integer) */
    ClientID: string;
    /** YM API key (used as UserName for session auth) */
    APIKey: string;
    /** YM API password (used as Password for session auth) */
    APIPassword: string;

    // ── Optional performance overrides (all have defaults) ──────────
    /** Maximum retries for rate-limited or failed requests. Default: 5 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests to avoid rate limiting. Default: 600 */
    MinRequestIntervalMs?: number;
    /** Number of members to enrich per batch before writing to DB. Default: 500 */
    EnrichBatchSize?: number;
    /** JSON parsing timeout in milliseconds. Default: 30000 */
    JsonTimeoutMs?: number;
    /** Detail enrichment timeout per record in milliseconds. Default: 45000 */
    EnrichTimeoutMs?: number;
}

/** Extended auth context with YM-specific session and config data */
interface YMAuthContext extends RESTAuthContext {
    Config: YMConnectionConfig;
}

/** Cached session data */
interface YMSession {
    SessionId: string;
    CreatedAt: number;
}

/** YM REST API base URL */
const YM_API_BASE = 'https://ws.yourmembership.com';

/** Sessions expire after 14 minutes (YM sessions last ~15 min) */
const SESSION_TTL_MS = 14 * 60 * 1000;

/** Maximum retries for rate-limited or failed requests */
const MAX_RETRIES = 5;

/** HTTP request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30000;

/** Minimum milliseconds between API requests to avoid rate limiting */
const MIN_REQUEST_INTERVAL_MS = 600;

/** Number of members to enrich per batch before writing to DB */
const ENRICH_BATCH_SIZE = 500;

/** JSON parsing timeout in milliseconds */
const JSON_TIMEOUT_MS = 30000;

/** Detail enrichment timeout per record in milliseconds */
const ENRICH_TIMEOUT_MS = 45000;

/** YM API metadata keys that should be filtered from record data */
const METADATA_KEYS = new Set([
    'ResponseStatus', 'UsingRedis', 'AppInitTime', 'ServerID',
    'ClientID', 'BypassCache', 'DateCached', 'Device',
]);

// ─── Connector Implementation ───────────────────────────────────────

/**
 * Connector for the YourMembership (YM) AMS REST API.
 *
 * Extends BaseRESTIntegrationConnector to leverage metadata-driven object/field
 * discovery from IntegrationEngineBase cache and generic pagination handling.
 *
 * Auth flow:
 *   1. POST /Ams/Authenticate with credentials + ClientID
 *   2. Receive SessionId
 *   3. Pass SessionId as X-SS-ID header on all data requests
 *
 * Configuration JSON (required + optional overrides):
 * {
 *   "ClientID": "25363",
 *   "APIKey": "...",
 *   "APIPassword": "...",
 *   "MaxRetries": 5,             // optional, default: 5
 *   "RequestTimeoutMs": 30000,   // optional, default: 30000
 *   "MinRequestIntervalMs": 600, // optional, default: 600
 *   "EnrichBatchSize": 500,      // optional, default: 500
 *   "JsonTimeoutMs": 30000,      // optional, default: 30000
 *   "EnrichTimeoutMs": 45000     // optional, default: 45000
 * }
 */
// ─── Action Metadata Objects ──────────────────────────────────────────

const YM_ACTION_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'members', DisplayName: 'Member',
        Description: 'An individual membership record in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'EmailAddr', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Member email address (key field)' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member last name' },
            { Name: 'Phone', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member phone number' },
            { Name: 'Organization', DisplayName: 'Company Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Member company/organization' },
            { Name: 'MemberTypeCode', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership type code/status' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'YM profile identifier' },
            { Name: 'Address1', DisplayName: 'Address Line 1', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Street address line 1' },
            { Name: 'City', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'City' },
            { Name: 'State', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State/province' },
            { Name: 'PostalCode', DisplayName: 'Postal Code', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Postal/zip code' },
            { Name: 'Country', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'ExpirationDate', DisplayName: 'Expiration Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership expiration date' },
            { Name: 'LastUpdated', DisplayName: 'Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the member record was last updated' },
        ],
    },
    {
        Name: 'events', DisplayName: 'Event',
        Description: 'An event or conference in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event identifier' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event name' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event start date' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Event end date' },
        ],
    },
    {
        Name: 'event-registrations', DisplayName: 'Event Registration',
        Description: 'A registration for an event in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated event ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Registrant first name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Registrant last name' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Registrant display name' },
            { Name: 'DateRegistered', DisplayName: 'Date Registered', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When registration occurred' },
            { Name: 'IsPrimary', DisplayName: 'Is Primary', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Whether this is the primary registrant' },
        ],
    },
    {
        Name: 'event-sessions', DisplayName: 'Event Session',
        Description: 'A session within an event in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'SessionId', DisplayName: 'Session ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session identifier' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated event ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Session name' },
            { Name: 'Presenter', DisplayName: 'Presenter', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Session presenter' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Session start date/time' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Session end date/time' },
        ],
    },
    {
        Name: 'groups', DisplayName: 'Group',
        Description: 'A membership group in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'GroupId', DisplayName: 'Group ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group identifier' },
            { Name: 'GroupName', DisplayName: 'Group Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group name' },
            { Name: 'GroupTypeId', DisplayName: 'Group Type ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Associated group type ID' },
            { Name: 'GroupTypeName', DisplayName: 'Group Type Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Group type name' },
        ],
    },
    {
        Name: 'invoice-items', DisplayName: 'Invoice Item',
        Description: 'A line item from an invoice in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'LineItemID', DisplayName: 'Line Item ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Line item identifier' },
            { Name: 'InvoiceNo', DisplayName: 'Invoice Number', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice number' },
            { Name: 'InvoiceType', DisplayName: 'Invoice Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type of invoice' },
            { Name: 'WebSiteMemberID', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Website member ID' },
            { Name: 'LineItemDescription', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Line item description' },
            { Name: 'LineItemAmount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Line item amount' },
            { Name: 'LineItemDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Line item date' },
        ],
    },
    {
        Name: 'dues-transactions', DisplayName: 'Dues Transaction',
        Description: 'A membership dues transaction in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'TransactionID', DisplayName: 'Transaction ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Transaction identifier' },
            { Name: 'WebsiteMemberID', DisplayName: 'Member ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Website member ID' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Transaction status' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Transaction amount' },
            { Name: 'MembershipRequested', DisplayName: 'Membership Requested', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership type requested' },
            { Name: 'DateSubmitted', DisplayName: 'Date Submitted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When transaction was submitted' },
        ],
    },
    {
        Name: 'donation-history', DisplayName: 'Donation',
        Description: 'A historical donation record in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'intDonationId', DisplayName: 'Donation ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation identifier' },
            { Name: 'ProfileID', DisplayName: 'Profile ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donor profile ID' },
            { Name: 'dblDonation', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donation amount' },
            { Name: 'strFundName', DisplayName: 'Fund Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donation fund name' },
            { Name: 'DatDonation', DisplayName: 'Donation Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the donation was made' },
            { Name: 'strStatus', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Donation status' },
        ],
    },
    {
        Name: 'career-openings', DisplayName: 'Career Opening',
        Description: 'A job/career listing in YourMembership', SupportsWrite: false,
        Fields: [
            { Name: 'CareerOpeningID', DisplayName: 'Career Opening ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Career opening identifier' },
            { Name: 'Position', DisplayName: 'Position', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Job position/title' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Hiring organization' },
            { Name: 'DatePosted', DisplayName: 'Date Posted', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When the listing was posted' },
        ],
    },
];

@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseRESTIntegrationConnector {
    /** Session cache keyed by ClientID */
    private sessionCache = new Map<string, YMSession>();

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'YourMembership'; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return YM_ACTION_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-id-card';
        // YM is read-only but we still want Search/List for querying
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    /** Resolved config (populated after first Authenticate call) */
    private _config: YMConnectionConfig | null = null;

    /** Current adaptive request interval — increases on 429, recovers toward resolved MIN */
    private currentRequestIntervalMs = MIN_REQUEST_INTERVAL_MS;

    // ── Per-instance config accessors (fall back to module-level defaults) ──
    private get effectiveMaxRetries(): number { return this._config?.MaxRetries ?? MAX_RETRIES; }
    private get effectiveRequestTimeoutMs(): number { return this._config?.RequestTimeoutMs ?? REQUEST_TIMEOUT_MS; }
    private get effectiveMinRequestIntervalMs(): number { return this._config?.MinRequestIntervalMs ?? MIN_REQUEST_INTERVAL_MS; }
    private get effectiveEnrichBatchSize(): number { return this._config?.EnrichBatchSize ?? ENRICH_BATCH_SIZE; }
    private get effectiveJsonTimeoutMs(): number { return this._config?.JsonTimeoutMs ?? JSON_TIMEOUT_MS; }
    private get effectiveEnrichTimeoutMs(): number { return this._config?.EnrichTimeoutMs ?? ENRICH_TIMEOUT_MS; }

    /** Cache of the filtered member list pending enrichment, shared across batch calls */
    private memberFetchCache: {
        changedRecords: ExternalRecord[];
        newWatermark: string | null;
    } | null = null;

    // ─── Abstract method implementations (BaseRESTIntegrationConnector) ──

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        console.log(`[YM] Authenticating...`);
        const config = await this.ParseConfig(companyIntegration, contextUser);
        this._config = config;
        this.currentRequestIntervalMs = this.effectiveMinRequestIntervalMs;
        const sessionId = await this.GetSession(config);
        console.log(`[YM] Authenticated, sessionId length: ${sessionId.length}`);
        const auth: YMAuthContext = { SessionID: sessionId, Config: config };
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return { 'X-SS-ID': auth.SessionID!, 'Accept': 'application/json' };
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        _body?: unknown
    ): Promise<RESTResponse> {
        const ymAuth = auth as YMAuthContext;
        const currentHeaders = { ...headers };

        // Throttle: ensure adaptive minimum interval between requests
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < this.currentRequestIntervalMs) {
            await this.Sleep(this.currentRequestIntervalMs - elapsed);
        }

        const maxRetries = this.effectiveMaxRetries;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let response: Response;
            try {
                response = await this.FetchWithTimeout(url, method, currentHeaders);
            } catch (err) {
                if (this.IsTimeoutError(err)) {
                    console.warn(`YM timeout on ${url}, re-authenticating (attempt ${attempt + 1}/${maxRetries})`);
                    await this.RefreshSession(ymAuth, currentHeaders);
                    continue;
                }
                throw err;
            }

            if (response.status === 401) {
                await this.RefreshSession(ymAuth, currentHeaders);
                continue;
            }

            if (response.status === 429) {
                const delayMs = this.CalculateRetryDelay(response, attempt);
                this.currentRequestIntervalMs = Math.min(this.currentRequestIntervalMs * 2, 10000);
                console.warn(`YM rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries}). Interval adjusted to ${this.currentRequestIntervalMs}ms`);
                await this.Sleep(delayMs);
                continue;
            }

            this.lastRequestTime = Date.now();
            // Gradually recover interval toward configured minimum on successful requests
            const minInterval = this.effectiveMinRequestIntervalMs;
            if (this.currentRequestIntervalMs > minInterval) {
                this.currentRequestIntervalMs = Math.max(
                    this.currentRequestIntervalMs - 50,
                    minInterval
                );
            }
            const body = await this.JsonWithTimeout(response, this.effectiveJsonTimeoutMs);
            return this.BuildRESTResponse(response, body);
        }

        throw new Error(`YM API request failed after ${maxRetries} retries: ${url}`);
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        // Check for YM API-level errors in the response envelope
        if (typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)) {
            this.CheckResponseError(rawBody as Record<string, unknown>);
        }

        if (responseDataKey != null) {
            const body = rawBody as Record<string, unknown>;
            const data = body[responseDataKey];
            if (!data || !Array.isArray(data)) return [];
            return data as Record<string, unknown>[];
        }

        // Null responseDataKey: raw array (Products) or single object (EngagementScores)
        if (Array.isArray(rawBody)) {
            return rawBody as Record<string, unknown>[];
        }

        // Single object response — filter metadata and wrap in array
        return [this.FilterMetadataKeys(rawBody as Record<string, unknown>)];
    }

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

        // YM API doesn't return total counts; infer from record count
        const recordCount = this.EstimateRecordCount(rawBody);
        const hasMore = recordCount >= pageSize;

        return {
            HasMore: hasMore,
            NextPage: paginationType === 'PageNumber' ? currentPage + 1 : undefined,
            NextOffset: paginationType === 'Offset' ? currentOffset + recordCount : undefined,
        };
    }

    protected GetBaseURL(companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const ymAuth = auth as YMAuthContext;
        if (ymAuth.Config?.ClientID) {
            return `${YM_API_BASE}/Ams/${ymAuth.Config.ClientID}`;
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
            if (clientId) return `${YM_API_BASE}/Ams/${clientId}`;
        }
        throw new Error('Cannot determine YM base URL: no ClientID in configuration');
    }

    // ─── YM-specific pagination parameter names ───────────────────────

    /**
     * Overrides base pagination URL building to use YM's expected parameter names:
     * - PageNumber type: `PageNumber` / `PageSize` (not `page` / `pageSize`)
     * - Offset type: `OffSet` (not `offset`); no explicit limit param — YM uses
     *   its own default batch size (~200 records)
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';

        switch (obj.PaginationType) {
            case 'PageNumber':
                return `${basePath}${separator}PageNumber=${page}&PageSize=${obj.DefaultPageSize}`;
            case 'Offset':
                return `${basePath}${separator}OffSet=${offset}&PageSize=${obj.DefaultPageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&limit=${obj.DefaultPageSize}`
                    : `${basePath}${separator}limit=${obj.DefaultPageSize}`;
            default:
                return basePath;
        }
    }

    // ─── FetchChanges override for YM-specific cases ──────────────────

    /**
     * Overrides base FetchChanges to handle YM-specific edge cases:
     * - Groups/GroupTypes: nested GroupTypeList response needs custom flattening
     * - Members: client-side watermark filtering + batched detail enrichment
     *
     * The MemberList API returns all members every time (no server-side date filter),
     * but each record includes a `LastUpdated` field. We pull the full list once,
     * filter to only records changed since the watermark, cache that filtered list,
     * and enrich + return ENRICH_BATCH_SIZE records per FetchChanges call so the
     * engine writes each batch to the database before moving to the next.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        console.log(`[YM] FetchChanges called for '${ctx.ObjectName}' (batchSize=${ctx.BatchSize}, watermark=${ctx.WatermarkValue ?? 'none'}, offset=${ctx.CurrentOffset ?? 'none'})`);

        if (ctx.ObjectName === 'Groups' || ctx.ObjectName === 'GroupTypes') {
            return this.FetchGroups(ctx);
        }

        if (ctx.ObjectName === 'Members') {
            return this.FetchMemberBatch(ctx);
        }

        return super.FetchChanges(ctx);
    }

    /**
     * Fetches and enriches members in batches of ENRICH_BATCH_SIZE.
     *
     * On the first call (CurrentOffset = 0 or undefined), fetches the full member
     * list via the base class, filters by watermark, and caches the result.
     * On subsequent calls, uses the cached list and enriches the next slice.
     * Returns HasMore=true until all records are enriched.
     * Only sets NewWatermarkValue on the final batch so the watermark is only
     * updated once all records have been written to the database.
     */
    private async FetchMemberBatch(ctx: FetchContext): Promise<FetchBatchResult> {
        // Simple approach: fetch one page of member IDs, enrich them, return.
        // The engine's outer loop handles pagination — it calls FetchChanges
        // repeatedly with incrementing offsets until HasMore=false.
        const pageResult = await super.FetchChanges(ctx);

        if (pageResult.Records.length === 0) {
            return pageResult;
        }

        // Client-side watermark filtering: YM's MemberList API returns all members
        // every time (no server-side date filter), so we filter locally by LastUpdated.
        const { changedRecords, newWatermark } = this.FilterByWatermark(
            pageResult.Records, ctx.WatermarkValue, 'LastUpdated'
        );

        if (changedRecords.length === 0) {
            return {
                Records: [],
                HasMore: pageResult.HasMore,
                NextOffset: pageResult.NextOffset,
                NextPage: pageResult.NextPage,
                NextCursor: pageResult.NextCursor,
                NewWatermarkValue: !pageResult.HasMore ? (newWatermark ?? pageResult.NewWatermarkValue) : undefined,
            };
        }

        console.log(`[YM Members] Fetched ${pageResult.Records.length} member IDs, ${changedRecords.length} changed since watermark, enriching...`);

        const enriched = await this.EnrichMembersWithDetails(
            ctx, changedRecords, ctx.CurrentOffset ?? 0, changedRecords.length
        );

        return {
            Records: enriched,
            HasMore: pageResult.HasMore,
            NextOffset: pageResult.NextOffset,
            NextPage: pageResult.NextPage,
            NextCursor: pageResult.NextCursor,
            NewWatermarkValue: !pageResult.HasMore ? (newWatermark ?? pageResult.NewWatermarkValue) : undefined,
        };
    }

    /**
     * Filters records by comparing a date field against a watermark timestamp.
     * Returns only records where the date field is newer than the watermark,
     * plus the latest date value seen (to use as the next watermark).
     */
    private FilterByWatermark(
        records: ExternalRecord[],
        watermarkValue: string | null,
        dateFieldName: string
    ): { changedRecords: ExternalRecord[]; newWatermark: string | null } {
        let latestDate: Date | null = null;
        const watermarkDate = watermarkValue ? new Date(watermarkValue) : null;

        const changed: ExternalRecord[] = [];

        for (const record of records) {
            const dateValue = record.Fields[dateFieldName];
            if (dateValue == null) {
                // No date field — include record (can't determine if changed)
                changed.push(record);
                continue;
            }

            const recordDate = new Date(String(dateValue));
            if (isNaN(recordDate.getTime())) {
                changed.push(record);
                continue;
            }

            // Track the latest date for the new watermark
            if (!latestDate || recordDate > latestDate) {
                latestDate = recordDate;
            }

            // Include if no watermark or record is newer than watermark
            if (!watermarkDate || recordDate > watermarkDate) {
                changed.push(record);
            }
        }

        const newWatermark = latestDate ? latestDate.toISOString() : null;
        return { changedRecords: changed, newWatermark };
    }

    // ─── TestConnection ─────────────────────────────────────────────

    /** Tests connectivity by authenticating and fetching ClientConfig. */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            const sessionId = await this.GetSession(config);
            const auth: YMAuthContext = { SessionID: sessionId, Config: config };
            const json = await this.MakeYMRequest(auth, 'ClientConfig');
            const siteUrl = (json['SiteUrl'] as string) ?? 'Unknown';

            return {
                Success: true,
                Message: `Connected to YourMembership site: ${siteUrl}`,
                ServerVersion: `ClientID ${config.ClientID}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Default configurations ──────────────────────────────────────

    /** Returns suggested default configuration for YM integration setup. */
    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'YourMembership',
            DefaultObjects: [], // Objects are auto-discovered from metadata via DiscoverObjects
        };
    }

    /** Returns suggested default field mappings for common YM objects to MJ entities. */
    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'Members':
                return [
                    { SourceFieldName: 'EmailAddr', DestinationFieldName: 'Email', IsKeyField: true },
                    { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'Phone', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'Organization', DestinationFieldName: 'CompanyName' },
                    { SourceFieldName: 'MemberTypeCode', DestinationFieldName: 'Status' },
                ];
            case 'Events':
                return [
                    { SourceFieldName: 'EventId', DestinationFieldName: 'ID', IsKeyField: true },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                ];
            case 'InvoiceItems':
                return [
                    { SourceFieldName: 'LineItemID', DestinationFieldName: 'LineItemID', IsKeyField: true },
                    { SourceFieldName: 'InvoiceNo', DestinationFieldName: 'InvoiceNo' },
                    { SourceFieldName: 'InvoiceType', DestinationFieldName: 'InvoiceType' },
                    { SourceFieldName: 'WebSiteMemberID', DestinationFieldName: 'WebSiteMemberID' },
                    { SourceFieldName: 'LineItemDescription', DestinationFieldName: 'Description' },
                    { SourceFieldName: 'LineItemAmount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'LineItemDate', DestinationFieldName: 'Date' },
                ];
            case 'DuesTransactions':
                return [
                    { SourceFieldName: 'TransactionID', DestinationFieldName: 'TransactionID', IsKeyField: true },
                    { SourceFieldName: 'WebsiteMemberID', DestinationFieldName: 'WebsiteMemberID' },
                    { SourceFieldName: 'Status', DestinationFieldName: 'Status' },
                    { SourceFieldName: 'Amount', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'MembershipRequested', DestinationFieldName: 'MembershipRequested' },
                    { SourceFieldName: 'DateSubmitted', DestinationFieldName: 'DateSubmitted' },
                ];
            case 'EventRegistrations':
                return [
                    { SourceFieldName: 'Id', DestinationFieldName: 'Id', IsKeyField: true },
                    { SourceFieldName: 'EventId', DestinationFieldName: 'EventId' },
                    { SourceFieldName: 'RegistrationID', DestinationFieldName: 'RegistrationID' },
                    { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                    { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                    { SourceFieldName: 'DisplayName', DestinationFieldName: 'DisplayName' },
                    { SourceFieldName: 'HeadShotImage', DestinationFieldName: 'HeadShotImage' },
                    { SourceFieldName: 'DateRegistered', DestinationFieldName: 'DateRegistered' },
                    { SourceFieldName: 'IsPrimary', DestinationFieldName: 'IsPrimary' },
                    { SourceFieldName: 'BadgeNumber', DestinationFieldName: 'BadgeNumber' },
                ];
            case 'EventSessions':
                return [
                    { SourceFieldName: 'SessionId', DestinationFieldName: 'SessionId', IsKeyField: true },
                    { SourceFieldName: 'EventId', DestinationFieldName: 'EventId' },
                    { SourceFieldName: 'Name', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'Presenter', DestinationFieldName: 'Presenter' },
                    { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                    { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
                ];
            case 'StoreOrderDetails':
                return [
                    { SourceFieldName: 'OrderDetailID', DestinationFieldName: 'OrderDetailID', IsKeyField: true },
                    { SourceFieldName: 'OrderID', DestinationFieldName: 'OrderID' },
                    { SourceFieldName: 'WebsiteMemberID', DestinationFieldName: 'WebsiteMemberID' },
                    { SourceFieldName: 'ProductName', DestinationFieldName: 'ProductName' },
                    { SourceFieldName: 'Quantity', DestinationFieldName: 'Quantity' },
                    { SourceFieldName: 'TotalPrice', DestinationFieldName: 'TotalPrice' },
                ];
            case 'DonationHistory':
                return [
                    { SourceFieldName: 'intDonationId', DestinationFieldName: 'DonationId', IsKeyField: true },
                    { SourceFieldName: 'ProfileID', DestinationFieldName: 'ProfileID' },
                    { SourceFieldName: 'dblDonation', DestinationFieldName: 'Amount' },
                    { SourceFieldName: 'strFundName', DestinationFieldName: 'FundName' },
                    { SourceFieldName: 'DatDonation', DestinationFieldName: 'DonationDate' },
                    { SourceFieldName: 'strStatus', DestinationFieldName: 'Status' },
                ];
            case 'CareerOpenings':
                return [
                    { SourceFieldName: 'CareerOpeningID', DestinationFieldName: 'CareerOpeningID', IsKeyField: true },
                    { SourceFieldName: 'Position', DestinationFieldName: 'Position' },
                    { SourceFieldName: 'Organization', DestinationFieldName: 'Organization' },
                    { SourceFieldName: 'DatePosted', DestinationFieldName: 'DatePosted' },
                ];
            default:
                return [];
        }
    }

    // ─── Groups special handling ─────────────────────────────────────

    /**
     * Fetches Groups or GroupTypes, which have a nested structure:
     * GroupTypeList → Groups. When objectName is 'GroupTypes', returns just
     * the type entries. When 'Groups', flattens into individual group records.
     */
    private async FetchGroups(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as YMAuthContext;
        const json = await this.MakeYMRequest(auth, 'Groups');
        const typeList = json['GroupTypeList'] as GroupTypeListItem[] | undefined;

        if (!typeList || !Array.isArray(typeList)) {
            return { Records: [], HasMore: false };
        }

        if (ctx.ObjectName === 'GroupTypes') {
            return this.BuildGroupTypeRecords(typeList, ctx.ObjectName);
        }

        return this.FlattenGroupRecords(typeList, ctx.ObjectName);
    }

    /** Builds ExternalRecords for GroupType entries only. */
    private BuildGroupTypeRecords(
        typeList: GroupTypeListItem[],
        objectType: string
    ): FetchBatchResult {
        const records = typeList.map(gt => ({
            ExternalID: String(gt.Id ?? ''),
            ObjectType: objectType,
            Fields: { Id: gt.Id, TypeName: gt.TypeName, SortIndex: gt.SortIndex } as Record<string, unknown>,
        }));
        return { Records: records, HasMore: false };
    }

    /** Flattens nested GroupTypeList → Groups into flat group records. */
    private FlattenGroupRecords(
        typeList: GroupTypeListItem[],
        objectType: string
    ): FetchBatchResult {
        const records: ExternalRecord[] = [];
        for (const groupType of typeList) {
            const typeName = groupType.TypeName ?? '';
            for (const group of groupType.Groups ?? []) {
                records.push({
                    ExternalID: String(group.Id),
                    ObjectType: objectType,
                    Fields: { ...group, GroupTypeName: typeName, GroupTypeId: groupType.Id },
                });
            }
        }
        return { Records: records, HasMore: false };
    }

    // ─── Detail enrichment (Members) ─────────────────────────────────

    /**
     * Enriches a slice of member records with full profile data from the detail endpoint.
     * The list endpoint returns sparse data (name, email); the detail endpoint
     * returns full address, phone, custom fields, etc.
     *
     * @param ctx - Fetch context for auth
     * @param records - The slice of records to enrich
     * @param batchOffset - Starting index of this slice within the overall set (for progress logging)
     * @param overallTotal - Total number of records being enriched across all batches (for progress logging)
     */
    private async EnrichMembersWithDetails(
        ctx: FetchContext,
        records: ExternalRecord[],
        batchOffset: number,
        overallTotal: number
    ): Promise<ExternalRecord[]> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as YMAuthContext;
        const concurrency = 3;
        const enriched: ExternalRecord[] = [];
        let lastLoggedPct = Math.floor((batchOffset / overallTotal) * 100);

        for (let i = 0; i < records.length; i += concurrency) {
            const chunk = records.slice(i, i + concurrency);
            const results = await Promise.all(
                chunk.map(record => this.EnrichSingleMember(auth, record))
            );
            enriched.push(...results);

            const doneOverall = batchOffset + enriched.length;
            const pct = Math.floor((doneOverall / overallTotal) * 100);
            if (pct >= lastLoggedPct + 1) {
                lastLoggedPct = pct;
                console.log(`[YM Members] Enriched ${doneOverall}/${overallTotal} (${pct}%)`);
            }
        }

        return enriched;
    }

    /**
     * Fetches full detail data for a single member and merges it.
     * Detail endpoint returns camelCase + nested objects; we normalize to flat PascalCase.
     */
    private async EnrichSingleMember(
        auth: YMAuthContext,
        record: ExternalRecord
    ): Promise<ExternalRecord> {
        try {
            const detailPath = `Members/${record.ExternalID}`;
            const fetchPromise = this.MakeYMRequest(auth, detailPath);
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Detail fetch timed out for ${record.ExternalID}`)), this.effectiveEnrichTimeoutMs)
            );
            const json = await Promise.race([fetchPromise, timeoutPromise]);
            const normalized = this.NormalizeMemberDetail(json);
            record.Fields = { ...record.Fields, ...normalized };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[YM Members] Failed to enrich member ${record.ExternalID}: ${message}`);
        }

        return record;
    }

    /**
     * Maps the Members detail endpoint response to our flat PascalCase schema.
     * Detail endpoint returns: { firstName, lastName, emailAddress, primaryAddress: { ... } }
     * We need:                 { FirstName, LastName, EmailAddr, Phone, Address1, ... }
     */
    private NormalizeMemberDetail(detail: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const addr = detail['primaryAddress'] as Record<string, unknown> | undefined;

        const fieldMap: Record<string, string> = {
            'id': 'ProfileID',
            'firstName': 'FirstName',
            'lastName': 'LastName',
            'emailAddress': 'EmailAddr',
            'organization': 'Organization',
            'typeCode': 'MemberTypeCode',
            'expirationDate': 'ExpirationDate',
            'isMember': 'Status',
        };

        for (const [detailKey, ourKey] of Object.entries(fieldMap)) {
            const value = detail[detailKey];
            if (value !== undefined && value !== null && value !== '') {
                result[ourKey] = detailKey === 'isMember' ? (value ? 'Active' : 'Inactive') : value;
            }
        }

        if (addr) {
            const addrMap: Record<string, string> = {
                'address1': 'Address1',
                'address2': 'Address2',
                'city': 'City',
                'location': 'State',
                'postalCode': 'PostalCode',
                'countryName': 'Country',
                'phone': 'Phone',
            };
            for (const [addrKey, ourKey] of Object.entries(addrMap)) {
                const value = addr[addrKey];
                if (value !== undefined && value !== null && value !== '') {
                    result[ourKey] = value;
                }
            }
        }

        return result;
    }

    // ─── Configuration parsing ───────────────────────────────────────

    /**
     * Parses credentials from CompanyIntegration.CredentialID (preferred) or
     * falls back to CompanyIntegration.Configuration JSON for backwards compat.
     */
    protected async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<YMConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID && contextUser) {
            const config = await this.LoadFromCredential(credentialID, contextUser);
            if (config) return config;
        }

        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            return this.ParseConfigJson(configJson);
        }

        throw new Error('No YM credentials found. Attach a credential with ClientID, APIKey, and APIPassword, or set Configuration JSON on the CompanyIntegration.');
    }

    private async LoadFromCredential(credentialID: string, contextUser: UserInfo): Promise<YMConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            return this.ParseConfigJson(credential.Values);
        } catch {
            return null;
        }
    }

    private ParseConfigJson(json: string): YMConnectionConfig {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
        const apiKey = parsed['APIKey'] || parsed['apiKey'] || parsed['ApiKey'];
        const apiPassword = parsed['APIPassword'] || parsed['apiPassword'] || parsed['ApiPassword'];

        if (!clientId || !apiKey || !apiPassword) {
            throw new Error('Configuration JSON must contain ClientID, APIKey, and APIPassword (any casing)');
        }

        const parseOptionalInt = (key: string): number | undefined => {
            const v = parsed[key];
            if (v == null) return undefined;
            const n = Number(v);
            return isNaN(n) ? undefined : Math.floor(n);
        };

        return {
            ClientID: String(clientId),
            APIKey: String(apiKey),
            APIPassword: String(apiPassword),
            MaxRetries: parseOptionalInt('MaxRetries'),
            RequestTimeoutMs: parseOptionalInt('RequestTimeoutMs'),
            MinRequestIntervalMs: parseOptionalInt('MinRequestIntervalMs'),
            EnrichBatchSize: parseOptionalInt('EnrichBatchSize'),
            JsonTimeoutMs: parseOptionalInt('JsonTimeoutMs'),
            EnrichTimeoutMs: parseOptionalInt('EnrichTimeoutMs'),
        };
    }

    // ─── Session management ──────────────────────────────────────────

    /** Obtains or reuses a YM session for the given credentials. */
    protected async GetSession(config: YMConnectionConfig): Promise<string> {
        const cached = this.sessionCache.get(config.ClientID);
        if (cached && (Date.now() - cached.CreatedAt) < SESSION_TTL_MS) {
            return cached.SessionId;
        }
        return this.CreateSession(config);
    }

    /** Creates a new YM session via the Authenticate endpoint. */
    private async CreateSession(config: YMConnectionConfig): Promise<string> {
        const response = await fetch(`${YM_API_BASE}/Ams/Authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                provider: 'credentials',
                UserName: config.APIKey,
                Password: config.APIPassword,
                UserType: 'Admin',
                ClientID: Number(config.ClientID),
            }),
        });

        if (!response.ok) {
            throw new Error(`YM authentication failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as {
            SessionId?: string;
            ResponseStatus?: { ErrorCode?: string; Message?: string };
        };

        if (json.ResponseStatus?.ErrorCode && json.ResponseStatus.ErrorCode !== 'None') {
            throw new Error(`YM auth error: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`);
        }

        if (!json.SessionId) {
            throw new Error('YM auth: No SessionId returned');
        }

        this.sessionCache.set(config.ClientID, {
            SessionId: json.SessionId,
            CreatedAt: Date.now(),
        });

        return json.SessionId;
    }

    /** Invalidates a cached session so the next request re-authenticates. */
    protected InvalidateSession(clientId: string): void {
        this.sessionCache.delete(clientId);
    }

    // ─── HTTP helpers ────────────────────────────────────────────────

    /**
     * Makes a direct YM API request using the connector's auth and URL conventions.
     * Used for YM-specific calls (Groups, detail enrichment, TestConnection)
     * that bypass the base class's metadata-driven flow.
     */
    private async MakeYMRequest(
        auth: YMAuthContext,
        endpoint: string,
        queryParams?: Record<string, string>
    ): Promise<Record<string, unknown>> {
        let url = `${YM_API_BASE}/Ams/${auth.Config.ClientID}/${endpoint}`;
        if (queryParams && Object.keys(queryParams).length > 0) {
            url += '?' + new URLSearchParams(queryParams).toString();
        }
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

        if (response.Status < 200 || response.Status >= 300) {
            const bodyPreview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            throw new Error(`YM API error for ${endpoint}: ${response.Status} - ${bodyPreview}`);
        }

        return response.Body as Record<string, unknown>;
    }

    /** Executes an HTTP request with a timeout. */
    private async FetchWithTimeout(
        url: string,
        method: string,
        headers: Record<string, string>
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutMs = this.effectiveRequestTimeoutMs;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { method, headers, signal: controller.signal });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`YM API request timed out after ${timeoutMs / 1000}s: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /** Wraps response.json() with a timeout to prevent indefinite hangs. */
    private async JsonWithTimeout(response: Response, timeoutMs: number): Promise<unknown> {
        return Promise.race([
            response.json(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`response.json() timed out after ${timeoutMs}ms`)), timeoutMs)
            ),
        ]);
    }

    /** Refreshes session after 401 or timeout, updating headers in-place. */
    private async RefreshSession(
        auth: YMAuthContext,
        headers: Record<string, string>
    ): Promise<void> {
        this.InvalidateSession(auth.Config.ClientID);
        const newSessionId = await this.GetSession(auth.Config);
        auth.SessionID = newSessionId;
        headers['X-SS-ID'] = newSessionId;
    }

    /** Checks if an error is a timeout/abort error. */
    private IsTimeoutError(err: unknown): boolean {
        return err instanceof Error && (err.message.includes('timed out') || err.name === 'AbortError');
    }

    /** Calculates retry delay from Retry-After header or exponential backoff. */
    private CalculateRetryDelay(response: Response, attempt: number): number {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '0', 10);
        return retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 30000);
    }

    /** Converts a fetch Response + parsed body into a RESTResponse. */
    private BuildRESTResponse(response: Response, body: unknown): RESTResponse {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return { Status: response.status, Body: body, Headers: headers };
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Response helpers ────────────────────────────────────────────

    /** Checks for YM API-level errors in the response envelope. */
    private CheckResponseError(json: Record<string, unknown>): void {
        const rs = json['ResponseStatus'] as { ErrorCode?: string; Message?: string } | undefined;
        if (rs?.ErrorCode && rs.ErrorCode !== 'None' && rs.ErrorCode !== '') {
            throw new Error(`YM API error: ${rs.Message ?? rs.ErrorCode}`);
        }
    }

    /** Filters out YM API metadata keys that shouldn't be stored as field data. */
    private FilterMetadataKeys(data: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            if (!METADATA_KEYS.has(key)) {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Estimates record count from a raw response body.
     * Used by ExtractPaginationInfo to determine if more pages exist.
     */
    private EstimateRecordCount(rawBody: unknown): number {
        if (Array.isArray(rawBody)) return rawBody.length;
        if (typeof rawBody === 'object' && rawBody !== null) {
            for (const value of Object.values(rawBody as Record<string, unknown>)) {
                if (Array.isArray(value)) return value.length;
            }
        }
        return 0;
    }
}

/** Shape of a GroupType entry from the Groups endpoint */
interface GroupTypeListItem {
    Id?: number;
    TypeName?: string;
    SortIndex?: number;
    Groups?: Array<{ Id: number; Name: string; [key: string]: unknown }>;
}
