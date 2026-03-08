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
} from '@memberjunction/integration-engine';

// ─── Configuration & Session Types ──────────────────────────────────

/** Connection configuration parsed from CompanyIntegration.Configuration JSON */
export interface YMConnectionConfig {
    /** YM client/site identifier (integer) */
    ClientID: string;
    /** YM API key (used as UserName for session auth) */
    APIKey: string;
    /** YM API password (used as Password for session auth) */
    APIPassword: string;
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
 * Configuration JSON: { "ClientID": "25363", "APIKey": "...", "APIPassword": "..." }
 */
@RegisterClass(BaseIntegrationConnector, 'YourMembershipConnector')
export class YourMembershipConnector extends BaseRESTIntegrationConnector {
    /** Session cache keyed by ClientID */
    private sessionCache = new Map<string, YMSession>();

    // ─── Abstract method implementations (BaseRESTIntegrationConnector) ──

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration);
        const sessionId = await this.GetSession(config);
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

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            let response: Response;
            try {
                response = await this.FetchWithTimeout(url, method, currentHeaders);
            } catch (err) {
                if (this.IsTimeoutError(err)) {
                    console.warn(`YM timeout on ${url}, re-authenticating (attempt ${attempt + 1}/${MAX_RETRIES})`);
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
                console.warn(`YM rate limited (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await this.Sleep(delayMs);
                continue;
            }

            const body = await this.JsonWithTimeout(response, JSON_TIMEOUT_MS);
            return this.BuildRESTResponse(response, body);
        }

        throw new Error(`YM API request failed after ${MAX_RETRIES} retries: ${url}`);
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

    protected GetBaseURL(companyIntegration: MJCompanyIntegrationEntity): string {
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
            if (clientId) return `${YM_API_BASE}/Ams/${clientId}`;
        }
        throw new Error('Cannot determine YM base URL: no ClientID in configuration');
    }

    // ─── FetchChanges override for YM-specific cases ──────────────────

    /**
     * Overrides base FetchChanges to handle YM-specific edge cases:
     * - Groups/GroupTypes: nested GroupTypeList response needs custom flattening
     * - Members: client-side watermark filtering + selective detail enrichment
     *
     * The MemberList API returns all members every time (no server-side date filter),
     * but each record includes a `LastUpdated` field. We pull the full list, filter
     * to only records changed since the watermark, and only call the expensive
     * per-member detail endpoint for those changed records.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        if (ctx.ObjectName === 'Groups' || ctx.ObjectName === 'GroupTypes') {
            return this.FetchGroups(ctx);
        }

        const result = await super.FetchChanges(ctx);

        if (ctx.ObjectName === 'Members' && result.Records.length > 0) {
            return this.FetchMembersWithWatermark(ctx, result);
        }

        return result;
    }

    /**
     * Filters the full member list to only records changed since the watermark,
     * then enriches only those changed records via the detail endpoint.
     * Returns a new watermark based on the latest LastUpdated value seen.
     */
    private async FetchMembersWithWatermark(
        ctx: FetchContext,
        fullResult: FetchBatchResult
    ): Promise<FetchBatchResult> {
        const { changedRecords, newWatermark } = this.FilterByWatermark(
            fullResult.Records,
            ctx.WatermarkValue,
            'LastUpdated'
        );

        if (changedRecords.length === 0) {
            return {
                Records: [],
                HasMore: false,
                NewWatermarkValue: newWatermark ?? ctx.WatermarkValue ?? undefined,
            };
        }

        console.log(
            `[YM Members] ${changedRecords.length} of ${fullResult.Records.length} records changed since watermark`
        );

        const enriched = await this.EnrichMembersWithDetails(ctx, {
            Records: changedRecords,
            HasMore: false,
        });

        return {
            ...enriched,
            NewWatermarkValue: newWatermark ?? ctx.WatermarkValue ?? undefined,
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
        const auth = await this.Authenticate(ctx.CompanyIntegration) as YMAuthContext;
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
     * Enriches Members records with full profile data from the detail endpoint.
     * The list endpoint returns sparse data (name, email); the detail endpoint
     * returns full address, phone, custom fields, etc.
     */
    private async EnrichMembersWithDetails(
        ctx: FetchContext,
        result: FetchBatchResult
    ): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration) as YMAuthContext;
        const concurrency = 3;
        const enriched: ExternalRecord[] = [];

        for (let i = 0; i < result.Records.length; i += concurrency) {
            const batch = result.Records.slice(i, i + concurrency);
            const results = await Promise.all(
                batch.map(record => this.EnrichSingleMember(auth, record))
            );
            enriched.push(...results);
        }

        return { ...result, Records: enriched };
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
                setTimeout(() => reject(new Error(`Detail fetch timed out for ${record.ExternalID}`)), ENRICH_TIMEOUT_MS)
            );
            const json = await Promise.race([fetchPromise, timeoutPromise]);
            const normalized = this.NormalizeMemberDetail(json);
            record.Fields = { ...record.Fields, ...normalized };
        } catch {
            // Keep list data if detail fetch fails
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
        const parsed = JSON.parse(json) as Record<string, string>;
        const clientId = parsed['ClientID'] || parsed['clientId'] || parsed['ClientId'];
        const apiKey = parsed['APIKey'] || parsed['apiKey'] || parsed['ApiKey'];
        const apiPassword = parsed['APIPassword'] || parsed['apiPassword'] || parsed['ApiPassword'];

        if (!clientId || !apiKey || !apiPassword) {
            throw new Error('Configuration JSON must contain ClientID, APIKey, and APIPassword (any casing)');
        }

        return { ClientID: String(clientId), APIKey: apiKey, APIPassword: apiPassword };
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
                UserName: config.APIPassword,
                Password: config.APIKey,
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
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, { method, headers, signal: controller.signal });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`YM API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`);
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
