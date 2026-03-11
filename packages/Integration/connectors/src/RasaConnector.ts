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
const REQUEST_TIMEOUT_MS = 30000;

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
 * Pagination: Offset-based with skip/limit parameters.
 * Response envelope: { code, metadata: { next_link, record_count }, results: [...] }
 */
@RegisterClass(BaseIntegrationConnector, 'RasaConnector')
export class RasaConnector extends BaseRESTIntegrationConnector {
    /** Cached JWT token */
    private cachedToken: string | null = null;
    /** When the cached token was obtained */
    private tokenObtainedAt = 0;

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    // ─── Abstract method implementations ─────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration);
        const token = await this.GetToken(config);
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

        // Rasa.io envelope: { code, metadata, results }
        if (body.results && Array.isArray(body.results)) {
            return body.results as Record<string, unknown>[];
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
        paginationType: PaginationType,
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

        // Rasa.io uses offset pagination with next_link
        const hasMore = !!nextLink && nextLink.length > 0;
        const nextOffset = hasMore ? currentOffset + pageSize : undefined;

        return {
            HasMore: hasMore,
            NextOffset: nextOffset,
            TotalRecords: totalRecords,
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity
    ): string {
        return RASA_API_BASE;
    }

    /**
     * Rasa.io uses skip/limit for pagination (not offset/limit).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        _cursor?: string
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';
        const limit = obj.DefaultPageSize || DEFAULT_PAGE_SIZE;
        return `${basePath}${separator}skip=${offset}&limit=${limit}`;
    }

    // ─── TestConnection ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration);
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
     * Override FetchChanges to support incremental sync via updated_since filter.
     * Rasa.io's /persons endpoint supports updated_since query param.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const result = await super.FetchChanges(ctx);

        // If we have a watermark and records, filter client-side for objects
        // that don't support server-side updated_since filtering
        if (ctx.WatermarkValue && result.Records.length > 0) {
            const watermarkDate = new Date(ctx.WatermarkValue);
            const filtered = result.Records.filter(r => {
                const updated = r.Fields['updated'] as string | undefined;
                if (!updated) return true; // Keep records without updated field
                return new Date(updated) > watermarkDate;
            });

            // Compute new watermark from latest updated timestamp
            const latestUpdated = this.FindLatestTimestamp(result.Records);
            return {
                Records: filtered,
                HasMore: result.HasMore,
                NewWatermarkValue: latestUpdated ?? ctx.WatermarkValue,
            };
        }

        // For full sync, set watermark to latest record timestamp
        const latestUpdated = this.FindLatestTimestamp(result.Records);
        return {
            ...result,
            NewWatermarkValue: latestUpdated ?? undefined,
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────────

    /**
     * Parses connection config from CompanyIntegration credentials.
     * Tries CredentialID first (MJ: Credentials entity), then Configuration JSON.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity
    ): Promise<RasaConnectionConfig> {
        // Try CredentialID first
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID);
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
    private async ParseConfigFromCredential(credentialID: string): Promise<RasaConnectionConfig> {
        const md = new Metadata();
        const credEntity = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials');
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
     * Finds the latest 'updated' or 'created' timestamp from a set of records.
     */
    private FindLatestTimestamp(records: { Fields: Record<string, unknown> }[]): string | null {
        let latest: Date | null = null;

        for (const record of records) {
            const updated = record.Fields['updated'] as string | undefined;
            const created = record.Fields['created'] as string | undefined;
            const dateStr = updated ?? created;
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
