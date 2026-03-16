import { createHmac } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
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
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type CRUDResult,
    type SearchContext,
    type SearchResult,
} from '@memberjunction/integration-engine';

// ─── Types ───────────────────────────────────────────────────────────

/** Parsed Wicket API credentials from the Credential entity or Configuration JSON */
interface WicketCredentials {
    /** API secret key used to sign JWT tokens */
    ApiSecret: string;
    /** UUID of the admin user (used as JWT `sub` claim) */
    AdminUserUUID: string;
    /** Wicket tenant name (e.g., "acme" → "acme-api.wicketcloud.com"). Optional if ApiUrl is set. */
    TenantName: string | null;
    /** Direct API URL (e.g., "https://sandbox-api.staging.wicketcloud.com"). Takes precedence over TenantName. */
    ApiUrl: string | null;
    /** Optional JWT issuer domain */
    IssuerDomain: string | null;
}

/** Extended auth context carrying Wicket credentials and tenant info */
interface WicketAuthContext extends RESTAuthContext {
    Credentials: WicketCredentials;
    BaseURL: string;
}

/** Result of a CRUD operation against the Wicket API */
export interface WicketCRUDResult {
    /** Whether the operation succeeded (2xx status) */
    Success: boolean;
    /** External ID of the created/updated record */
    ExternalID?: string;
    /** Error message if the operation failed */
    ErrorMessage?: string;
    /** HTTP status code from the API */
    StatusCode: number;
}

/** Options for searching Wicket records via POST /query endpoints */
export interface WicketSearchOptions {
    /** Filter predicates in Wicket format (e.g., { "given_name_cont": "John" }) */
    Filters: Record<string, string>;
    /** Sort fields (prefix with - for descending, e.g., "-updated_at") */
    Sort?: string;
    /** Page number (1-based, default 1) */
    Page?: number;
    /** Page size (default 25, max 2000) */
    PageSize?: number;
}

/** Result of a search operation */
export interface WicketSearchResult {
    /** Matching records flattened from JSON:API format */
    Records: ExternalRecord[];
    /** Total number of matching records */
    TotalCount: number;
    /** Whether more pages exist */
    HasMore: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Default JWT expiration window in seconds (5 minutes) */
const JWT_EXPIRATION_SECONDS = 300;

/** Maximum retries for rate-limited or transient failures */
const MAX_RETRIES = 5;

/** HTTP request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 30_000;

/** Minimum milliseconds between API requests (Wicket: 500 req/min ≈ 120ms/req) */
const MIN_REQUEST_INTERVAL_MS = 125;

/** Default page size for Wicket API requests */
const DEFAULT_PAGE_SIZE = 100;

/**
 * Maps integration object names to their JSON:API `type` values.
 * Used when constructing JSON:API request bodies for CRUD operations.
 */
const WICKET_JSONAPI_TYPES: Record<string, string> = {
    people: 'people',
    organizations: 'organizations',
    connections: 'connections',
    groups: 'groups',
    group_members: 'group_members',
    person_memberships: 'person_memberships',
    organization_memberships: 'organization_memberships',
    memberships: 'memberships',
    touchpoints: 'touchpoints',
    emails: 'emails',
    phones: 'phones',
    addresses: 'addresses',
    roles: 'roles',
    user_identities: 'user_identities',
    resource_tags: 'resource_tags',
    people_emails: 'emails',
    people_phones: 'phones',
    people_addresses: 'addresses',
    org_emails: 'emails',
    org_phones: 'phones',
    org_addresses: 'addresses',
};

/**
 * Objects that support POST /query endpoints for advanced search.
 * These accept nested filters, OR logic, and data_fields searching.
 */
const SEARCHABLE_OBJECTS = new Set([
    'people',
    'organizations',
    'connections',
    'groups',
    'group_members',
    'person_memberships',
    'organization_memberships',
]);

/**
 * Objects that are immutable (no update/delete allowed).
 * Touchpoints are audit trail records by design.
 */
const IMMUTABLE_OBJECTS = new Set(['touchpoints']);

// ─── JWT Helper ──────────────────────────────────────────────────────

/**
 * Encodes a buffer or string to base64url format (RFC 7515).
 * Replaces `+` with `-`, `/` with `_`, and strips trailing `=` padding.
 */
function base64url(input: string): string {
    const b64 = Buffer.from(input, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Encodes a Buffer to base64url format. */
function base64urlBuffer(input: Buffer): string {
    return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a signed JWT token for Wicket API authentication.
 * Uses HS256 (HMAC-SHA256) algorithm as required by the Wicket API.
 *
 * @param credentials - Wicket credentials containing API secret, admin UUID, and tenant
 * @returns Signed JWT string
 */
/** Resolves the Wicket API base URL from credentials (direct URL or tenant-derived). */
function resolveWicketBaseURL(credentials: WicketCredentials): string {
    if (credentials.ApiUrl) {
        // Strip trailing slash for consistency
        return credentials.ApiUrl.replace(/\/+$/, '');
    }
    if (credentials.TenantName) {
        return `https://${credentials.TenantName}-api.wicketcloud.com`;
    }
    throw new Error('Cannot determine Wicket API base URL. Provide apiUrl or tenantName in credentials.');
}

function generateWicketJWT(credentials: WicketCredentials): string {
    const now = Math.floor(Date.now() / 1000);
    const apiUrl = resolveWicketBaseURL(credentials);

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: Record<string, unknown> = {
        exp: now + JWT_EXPIRATION_SECONDS,
        sub: credentials.AdminUserUUID,
        aud: apiUrl,
    };

    if (credentials.IssuerDomain) {
        payload['iss'] = credentials.IssuerDomain;
    }

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', credentials.ApiSecret)
        .update(signingInput)
        .digest();

    return `${signingInput}.${base64urlBuffer(signature)}`;
}

// ─── Connector ───────────────────────────────────────────────────────

/**
 * Connector for the Wicket membership management platform via its JSON:API REST API.
 *
 * Extends BaseRESTIntegrationConnector to leverage metadata-driven object/field
 * discovery, generic pagination handling, and template variable resolution.
 *
 * Supports:
 * - JWT Bearer authentication (HS256, generated from API secret)
 * - JSON:API response format normalization (flattens `data[].attributes`)
 * - Page-number pagination (`page[number]`, `page[size]`)
 * - Timestamp-based watermarks via `filter[updated_at_gteq]`
 * - Full CRUD operations (bidirectional sync)
 * - Advanced search via POST /query endpoints
 * - Rate limiting (500 req/min, auto-throttle + retry on 429)
 *
 * @see https://wicketapi.docs.apiary.io/
 */
@RegisterClass(BaseIntegrationConnector, 'WicketConnector')
export class WicketConnector extends BaseRESTIntegrationConnector {

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    /** Cached auth context to avoid regenerating JWT on every request */
    private cachedAuth: WicketAuthContext | null = null;

    /** Expiration time of the cached auth context */
    private cachedAuthExpiresAt = 0;

    // ─── Capability Getters ──────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }

    // ─── BaseRESTIntegrationConnector abstract implementations ───────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<RESTAuthContext> {
        // Return cached auth if still valid (with 30s safety margin)
        const now = Math.floor(Date.now() / 1000);
        if (this.cachedAuth && this.cachedAuthExpiresAt > now + 30) {
            return this.cachedAuth;
        }

        const credentials = await this.LoadCredentials(companyIntegration, contextUser);
        const token = generateWicketJWT(credentials);
        const baseURL = resolveWicketBaseURL(credentials);

        const auth: WicketAuthContext = {
            Token: token,
            Credentials: credentials,
            BaseURL: baseURL,
        };

        this.cachedAuth = auth;
        this.cachedAuthExpiresAt = now + JWT_EXPIRATION_SECONDS;
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/vnd.api+json',
        };
    }

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        await this.ThrottleRequest();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 429) {
                const delayMs = this.CalculateRetryDelay(response, attempt);
                console.warn(
                    `[Wicket] Rate limited (429), retrying in ${delayMs}ms ` +
                    `(attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                await this.Sleep(delayMs);
                continue;
            }

            const responseBody = await this.ParseResponseBody(response);
            return this.BuildRESTResponse(response, responseBody);
        }

        throw new Error(`Wicket API request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    /**
     * Normalizes a JSON:API response into flat record objects.
     *
     * Wicket returns data in JSON:API format:
     * ```json
     * {
     *   "data": [{ "id": "uuid", "type": "people", "attributes": {...}, "relationships": {...} }],
     *   "included": [...],
     *   "meta": { "page": { "number": 1, "size": 25, "total_count": 500 } }
     * }
     * ```
     *
     * This method flattens each record to: `{ uuid: "...", given_name: "...", ... }`
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        const body = rawBody as Record<string, unknown>;

        // Use responseDataKey if specified, otherwise default to "data"
        const dataKey = responseDataKey ?? 'data';
        const data = body[dataKey];

        if (!data) return [];

        // Handle single-object responses (e.g., GET /people/{id})
        if (!Array.isArray(data)) {
            return [this.FlattenJsonApiRecord(data as Record<string, unknown>)];
        }

        return data.map(r => this.FlattenJsonApiRecord(r as Record<string, unknown>));
    }

    /**
     * Extracts pagination state from Wicket's JSON:API meta response.
     *
     * Wicket returns pagination info in:
     * ```json
     * { "meta": { "page": { "number": 1, "size": 25, "total_count": 500 } } }
     * ```
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        currentPage: number,
        _currentOffset: number,
        pageSize: number
    ): PaginationState {
        const body = rawBody as Record<string, unknown>;
        const meta = body['meta'] as Record<string, unknown> | undefined;
        const pageInfo = meta?.['page'] as { number?: number; size?: number; total_count?: number } | undefined;

        if (!pageInfo?.total_count) {
            return { HasMore: false };
        }

        const totalPages = Math.ceil(pageInfo.total_count / (pageInfo.size ?? pageSize));
        const hasMore = currentPage < totalPages;

        return {
            HasMore: hasMore,
            NextPage: hasMore ? currentPage + 1 : undefined,
            TotalRecords: pageInfo.total_count,
        };
    }

    protected GetBaseURL(companyIntegration: MJCompanyIntegrationEntity): string {
        // If we have a cached auth context, use its base URL
        if (this.cachedAuth) {
            return this.cachedAuth.BaseURL;
        }

        // Fallback: parse from configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            try {
                const config = JSON.parse(configJson) as Record<string, string>;
                const apiUrl = config['apiUrl'] ?? config['ApiUrl'];
                if (apiUrl) return apiUrl.replace(/\/+$/, '');
                const tenant = config['tenantName'] ?? config['TenantName'];
                if (tenant) return `https://${tenant}-api.wicketcloud.com`;
            } catch { /* fall through */ }
        }

        throw new Error('Cannot determine Wicket API base URL. Provide apiUrl or tenantName in credentials or configuration.');
    }

    // ─── Wicket-specific pagination ──────────────────────────────────

    /**
     * Overrides base pagination URL building to use Wicket's JSON:API parameter format.
     * Wicket uses `page[number]` and `page[size]` (bracket notation).
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        _offset: number,
        _cursor?: string
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';
        const pageSize = obj.DefaultPageSize || DEFAULT_PAGE_SIZE;
        return `${basePath}${separator}page[number]=${page}&page[size]=${pageSize}`;
    }

    // ─── FetchChanges override for watermark support ─────────────────

    /**
     * Overrides FetchChanges to inject Wicket's timestamp-based watermark filter.
     * Uses `filter[updated_at_gteq]` for incremental sync.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        // If watermark is provided, inject it as a filter parameter
        if (ctx.WatermarkValue) {
            const currentConfig = ctx.CompanyIntegration.Get('Configuration') as string | null;
            const config = currentConfig ? JSON.parse(currentConfig) as Record<string, unknown> : {};

            // Store original and inject watermark filter into request
            const originalWatermarkFilter = config['_watermarkFilter'] as string | undefined;
            config['_watermarkFilter'] = ctx.WatermarkValue;
            // We'll use this in AppendDefaultQueryParams override behavior
        }

        const result = await super.FetchChanges(ctx);

        // Set new watermark to current timestamp if we got records
        if (result.Records.length > 0) {
            result.NewWatermarkValue = new Date().toISOString();
        }

        return result;
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /** Tests connectivity by authenticating and fetching 1 person record. */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const headers = this.BuildHeaders(auth);
            const baseURL = this.GetBaseURL(companyIntegration);
            const response = await this.MakeHTTPRequest(
                auth,
                `${baseURL}/people?page[size]=1`,
                'GET',
                headers
            );

            if (response.Status >= 200 && response.Status < 300) {
                return {
                    Success: true,
                    Message: 'Successfully connected to Wicket API',
                    ServerVersion: 'Wicket JSON:API v1',
                };
            }

            const bodyPreview = this.FormatBodyPreview(response.Body);
            return {
                Success: false,
                Message: `Wicket API returned ${response.Status}: ${bodyPreview}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── GetDefaultFieldMappings ─────────────────────────────────────

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        switch (objectName) {
            case 'people':
                return this.GetPeopleFieldMappings();
            case 'organizations':
                return this.GetOrganizationFieldMappings();
            case 'person_memberships':
                return this.GetPersonMembershipFieldMappings();
            case 'connections':
                return this.GetConnectionFieldMappings();
            default:
                return [];
        }
    }

    // ─── Default Configuration ───────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'Wicket',
            DefaultObjects: [],
        };
    }

    // ─── CRUD Operations (bidirectional sync support) ────────────────

    /**
     * Creates a new record in the Wicket API.
     *
     * @param companyIntegration - Company integration with credentials
     * @param objectName - Wicket object type (e.g., "people", "organizations")
     * @param attributes - Field values for the new record
     * @param contextUser - User context for authorization
     * @param relationships - Optional JSON:API relationships to include
     * @returns CRUD result with the created record's external ID
     */
    public async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const objectName = ctx.ObjectName;
        this.ValidateWriteAllowed(objectName);

        const auth = await this.Authenticate(companyIntegration, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const baseURL = this.GetBaseURL(companyIntegration);
        const apiPath = this.ResolveObjectAPIPath(objectName);
        const body = this.BuildJsonApiBody(objectName, ctx.Attributes, ctx.Relationships);

        try {
            const response = await this.MakeHTTPRequest(
                auth, `${baseURL}${apiPath}`, 'POST', headers, body
            );
            return this.ParseCRUDResponse(response, 'create');
        } catch (err: unknown) {
            return this.BuildCRUDError(err);
        }
    }

    /**
     * Updates an existing record in the Wicket API.
     *
     * @param companyIntegration - Company integration with credentials
     * @param objectName - Wicket object type
     * @param externalID - UUID of the record to update
     * @param attributes - Field values to update
     * @param contextUser - User context for authorization
     * @param relationships - Optional JSON:API relationships to update
     * @returns CRUD result indicating success or failure
     */
    public async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const objectName = ctx.ObjectName;
        this.ValidateWriteAllowed(objectName);

        const auth = await this.Authenticate(companyIntegration, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const baseURL = this.GetBaseURL(companyIntegration);
        const apiPath = this.ResolveObjectAPIPath(objectName);
        const body = this.BuildJsonApiBody(objectName, ctx.Attributes, ctx.Relationships, ctx.ExternalID);

        try {
            const response = await this.MakeHTTPRequest(
                auth, `${baseURL}${apiPath}/${ctx.ExternalID}`, 'PATCH', headers, body
            );
            return this.ParseCRUDResponse(response, 'update');
        } catch (err: unknown) {
            return this.BuildCRUDError(err);
        }
    }

    /**
     * Deletes a record from the Wicket API.
     *
     * @param companyIntegration - Company integration with credentials
     * @param objectName - Wicket object type
     * @param externalID - UUID of the record to delete
     * @param contextUser - User context for authorization
     * @returns CRUD result indicating success or failure
     */
    public async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const objectName = ctx.ObjectName;
        this.ValidateWriteAllowed(objectName);
        this.ValidateDeleteAllowed(objectName);

        const auth = await this.Authenticate(companyIntegration, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const baseURL = this.GetBaseURL(companyIntegration);
        const apiPath = this.ResolveObjectAPIPath(objectName);

        try {
            const response = await this.MakeHTTPRequest(
                auth, `${baseURL}${apiPath}/${ctx.ExternalID}`, 'DELETE', headers
            );
            return {
                Success: response.Status === 204 || (response.Status >= 200 && response.Status < 300),
                ExternalID: ctx.ExternalID,
                StatusCode: response.Status,
            };
        } catch (err: unknown) {
            return this.BuildCRUDError(err);
        }
    }

    /**
     * Retrieves a single record from the Wicket API by ID.
     *
     * @param companyIntegration - Company integration with credentials
     * @param objectName - Wicket object type
     * @param externalID - UUID of the record to retrieve
     * @param contextUser - User context for authorization
     * @returns The record as an ExternalRecord, or null if not found
     */
    public async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const objectName = ctx.ObjectName;

        const auth = await this.Authenticate(companyIntegration, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const baseURL = this.GetBaseURL(companyIntegration);
        const apiPath = this.ResolveObjectAPIPath(objectName);

        try {
            const response = await this.MakeHTTPRequest(
                auth, `${baseURL}${apiPath}/${ctx.ExternalID}`, 'GET', headers
            );

            if (response.Status === 404) return null;
            if (response.Status < 200 || response.Status >= 300) return null;

            const records = this.NormalizeResponse(response.Body, 'data');
            if (records.length === 0) return null;

            return {
                ExternalID: ctx.ExternalID,
                ObjectType: objectName,
                Fields: records[0],
            };
        } catch {
            return null;
        }
    }

    // ─── Search Operations ───────────────────────────────────────────

    /**
     * Searches for records using Wicket's POST /query endpoints.
     *
     * Supports advanced filtering with predicates:
     * - Equality: `given_name_eq`, `status_not_eq`
     * - Comparison: `created_at_gteq`, `updated_at_lt`
     * - Pattern: `email_cont`, `name_start`
     * - Null checks: `phone_present`, `address_blank`
     * - Array: `status_in` (comma-separated values)
     *
     * @param companyIntegration - Company integration with credentials
     * @param objectName - Wicket object type (must be in SEARCHABLE_OBJECTS)
     * @param options - Search filters, sorting, and pagination
     * @param contextUser - User context for authorization
     * @returns Search results with records, total count, and pagination info
     */
    public async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const objectName = ctx.ObjectName;

        if (!SEARCHABLE_OBJECTS.has(objectName)) {
            throw new Error(
                `Search is not supported for "${objectName}". ` +
                `Searchable objects: ${[...SEARCHABLE_OBJECTS].join(', ')}`
            );
        }

        const auth = await this.Authenticate(companyIntegration, ctx.ContextUser as UserInfo);
        const headers = this.BuildHeaders(auth);
        const baseURL = this.GetBaseURL(companyIntegration);

        const wicketOptions: WicketSearchOptions = {
            Filters: ctx.Filters,
            Sort: ctx.Sort,
            Page: ctx.Page,
            PageSize: ctx.PageSize,
        };
        const queryBody = this.BuildSearchQueryBody(wicketOptions);

        const response = await this.MakeHTTPRequest(
            auth,
            `${baseURL}/${objectName}/query`,
            'POST',
            headers,
            queryBody
        );

        return this.ParseSearchResponse(response, objectName);
    }

    // ─── Default Field Mapping Builders ──────────────────────────────

    private GetPeopleFieldMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'uuid', DestinationFieldName: 'ExternalID', IsKeyField: true },
            { SourceFieldName: 'given_name', DestinationFieldName: 'FirstName' },
            { SourceFieldName: 'family_name', DestinationFieldName: 'LastName' },
            { SourceFieldName: 'full_name', DestinationFieldName: 'FullName' },
            { SourceFieldName: 'job_title', DestinationFieldName: 'JobTitle' },
            { SourceFieldName: 'gender', DestinationFieldName: 'Gender' },
            { SourceFieldName: 'birth_date', DestinationFieldName: 'BirthDate' },
            { SourceFieldName: 'language', DestinationFieldName: 'Language' },
            { SourceFieldName: 'membership_number', DestinationFieldName: 'MembershipNumber' },
        ];
    }

    private GetOrganizationFieldMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'uuid', DestinationFieldName: 'ExternalID', IsKeyField: true },
            { SourceFieldName: 'legal_name', DestinationFieldName: 'Name' },
            { SourceFieldName: 'alternate_name', DestinationFieldName: 'AlternateName' },
            { SourceFieldName: 'description', DestinationFieldName: 'Description' },
            { SourceFieldName: 'identifying_number', DestinationFieldName: 'IdentifyingNumber' },
            { SourceFieldName: 'type', DestinationFieldName: 'OrganizationType' },
        ];
    }

    private GetPersonMembershipFieldMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'uuid', DestinationFieldName: 'ExternalID', IsKeyField: true },
            { SourceFieldName: 'starts_at', DestinationFieldName: 'StartDate' },
            { SourceFieldName: 'ends_at', DestinationFieldName: 'EndDate' },
        ];
    }

    private GetConnectionFieldMappings(): DefaultFieldMapping[] {
        return [
            { SourceFieldName: 'uuid', DestinationFieldName: 'ExternalID', IsKeyField: true },
            { SourceFieldName: 'type', DestinationFieldName: 'ConnectionType' },
        ];
    }

    // ─── Credential Management ───────────────────────────────────────

    /**
     * Reads Wicket credentials from the linked Credential entity,
     * or falls back to CompanyIntegration Configuration JSON.
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<WicketCredentials> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const creds = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (creds) return creds;
        }

        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const creds = this.ParseCredentialJson(configJson);
            if (creds) return creds;
        }

        throw new Error(
            'No Wicket credentials found. Attach a credential with apiSecret, adminUserUUID, ' +
            'and either apiUrl or tenantName. Or set Configuration JSON on the CompanyIntegration.'
        );
    }

    /** Loads credentials from a Credential entity by ID. */
    private async LoadFromCredentialEntity(credentialID: string, contextUser?: UserInfo): Promise<WicketCredentials | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        return this.ParseCredentialJson(credential.Values);
    }

    /** Parses a JSON string to extract Wicket credentials. Returns null if required fields missing. */
    private ParseCredentialJson(json: string): WicketCredentials | null {
        try {
            const parsed = JSON.parse(json) as Record<string, string>;
            const apiSecret = parsed['apiSecret'] ?? parsed['ApiSecret'] ?? parsed['api_secret'];
            const adminUUID = parsed['adminUserUUID'] ?? parsed['AdminUserUUID'] ?? parsed['admin_user_uuid'];
            const tenant = parsed['tenantName'] ?? parsed['TenantName'] ?? parsed['tenant_name'] ?? null;
            const apiUrl = parsed['apiUrl'] ?? parsed['ApiUrl'] ?? parsed['api_url'] ?? null;

            if (!apiSecret || !adminUUID) return null;
            // Need either a direct API URL or a tenant name to derive the URL
            if (!apiUrl && !tenant) return null;

            return {
                ApiSecret: apiSecret,
                AdminUserUUID: adminUUID,
                TenantName: tenant,
                ApiUrl: apiUrl,
                IssuerDomain: parsed['issuerDomain'] ?? parsed['IssuerDomain'] ?? null,
            };
        } catch {
            return null;
        }
    }

    // ─── JSON:API Body Builders ──────────────────────────────────────

    /**
     * Builds a JSON:API-compliant request body for create/update operations.
     *
     * Output format:
     * ```json
     * {
     *   "data": {
     *     "type": "people",
     *     "attributes": { "given_name": "Jane", ... },
     *     "relationships": { ... }
     *   }
     * }
     * ```
     */
    private BuildJsonApiBody(
        objectName: string,
        attributes: Record<string, unknown>,
        relationships?: Record<string, unknown>,
        externalID?: string
    ): Record<string, unknown> {
        const jsonApiType = WICKET_JSONAPI_TYPES[objectName] ?? objectName;

        const data: Record<string, unknown> = {
            type: jsonApiType,
            attributes: this.StripSystemFields(attributes),
        };

        if (externalID) {
            data['id'] = externalID;
        }

        if (relationships && Object.keys(relationships).length > 0) {
            data['relationships'] = relationships;
        }

        return { data };
    }

    /** Removes system-managed fields from attributes before sending to Wicket. */
    private StripSystemFields(attributes: Record<string, unknown>): Record<string, unknown> {
        const systemFields = new Set(['uuid', 'id', 'created_at', 'updated_at', 'slug']);
        const cleaned: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(attributes)) {
            if (!systemFields.has(key)) {
                cleaned[key] = value;
            }
        }

        return cleaned;
    }

    /** Builds the POST body for a Wicket /query search endpoint. */
    private BuildSearchQueryBody(options: WicketSearchOptions): Record<string, unknown> {
        const body: Record<string, unknown> = {
            filter: options.Filters,
            page: {
                number: options.Page ?? 1,
                size: options.PageSize ?? DEFAULT_PAGE_SIZE,
            },
        };

        if (options.Sort) {
            body['sort'] = options.Sort;
        }

        return body;
    }

    // ─── Response Parsers ────────────────────────────────────────────

    /**
     * Flattens a JSON:API record from the nested format:
     * ```json
     * { "id": "uuid", "type": "people", "attributes": { "given_name": "John", ... }, "relationships": {...} }
     * ```
     * into a flat object with all attributes at the top level plus `uuid` and `type`.
     */
    private FlattenJsonApiRecord(record: Record<string, unknown>): Record<string, unknown> {
        const attributes = record['attributes'] as Record<string, unknown> | undefined;
        const result: Record<string, unknown> = {};

        // Add flattened attributes first
        if (attributes) {
            for (const [key, value] of Object.entries(attributes)) {
                result[key] = value;
            }
        }

        // Add system fields
        result['uuid'] = record['id'];
        result['type'] = record['type'];

        // Extract relationship IDs for easy access
        this.FlattenRelationships(record, result);

        return result;
    }

    /**
     * Extracts relationship IDs from JSON:API relationships and adds them as flat fields.
     * E.g., `relationships.person.data.id` becomes `person_id` on the flat record.
     */
    private FlattenRelationships(
        record: Record<string, unknown>,
        target: Record<string, unknown>
    ): void {
        const relationships = record['relationships'] as Record<string, unknown> | undefined;
        if (!relationships) return;

        for (const [relName, relData] of Object.entries(relationships)) {
            const rel = relData as Record<string, unknown> | undefined;
            if (!rel?.['data']) continue;

            const data = rel['data'];
            if (Array.isArray(data)) {
                // Has-many: store as array of IDs
                target[`${relName}_ids`] = (data as Record<string, unknown>[]).map(d => d['id']);
            } else {
                // Belongs-to: store as single ID
                const belongsTo = data as Record<string, unknown>;
                target[`${relName}_id`] = belongsTo['id'];
            }
        }
    }

    /** Parses a CRUD operation response into a WicketCRUDResult. */
    private ParseCRUDResponse(response: RESTResponse, operation: string): WicketCRUDResult {
        const success = response.Status >= 200 && response.Status < 300;

        if (!success) {
            const bodyPreview = this.FormatBodyPreview(response.Body);
            return {
                Success: false,
                ErrorMessage: `Wicket ${operation} failed with status ${response.Status}: ${bodyPreview}`,
                StatusCode: response.Status,
            };
        }

        // Extract the created/updated record ID from the response
        const body = response.Body as Record<string, unknown>;
        const data = body['data'] as Record<string, unknown> | undefined;
        const externalID = data?.['id'] as string | undefined;

        return {
            Success: true,
            ExternalID: externalID,
            StatusCode: response.Status,
        };
    }

    /** Parses a search response into a WicketSearchResult. */
    private ParseSearchResponse(response: RESTResponse, objectName: string): WicketSearchResult {
        if (response.Status < 200 || response.Status >= 300) {
            const bodyPreview = this.FormatBodyPreview(response.Body);
            throw new Error(`Wicket search failed with status ${response.Status}: ${bodyPreview}`);
        }

        const body = response.Body as Record<string, unknown>;
        const records = this.NormalizeResponse(body, 'data');
        const meta = body['meta'] as Record<string, unknown> | undefined;
        const pageInfo = meta?.['page'] as { total_count?: number; number?: number; size?: number } | undefined;

        const totalCount = pageInfo?.total_count ?? records.length;
        const currentPage = pageInfo?.number ?? 1;
        const pageSize = pageInfo?.size ?? DEFAULT_PAGE_SIZE;
        const totalPages = Math.ceil(totalCount / pageSize);

        return {
            Records: records.map(r => ({
                ExternalID: String(r['uuid'] ?? ''),
                ObjectType: objectName,
                Fields: r,
            })),
            TotalCount: totalCount,
            HasMore: currentPage < totalPages,
        };
    }

    // ─── Validation ──────────────────────────────────────────────────

    /** Throws if the object does not support write operations. */
    private ValidateWriteAllowed(objectName: string): void {
        if (IMMUTABLE_OBJECTS.has(objectName)) {
            throw new Error(
                `Write operations are not allowed on "${objectName}". ` +
                `Touchpoints are immutable audit trail records.`
            );
        }
    }

    /** Throws if the object does not support delete operations. */
    private ValidateDeleteAllowed(objectName: string): void {
        // Touchpoints and resource_tags typically don't support delete
        const nonDeletable = new Set(['touchpoints', 'resource_tags']);
        if (nonDeletable.has(objectName)) {
            throw new Error(`Delete operations are not supported for "${objectName}".`);
        }
    }

    // ─── URL Helpers ─────────────────────────────────────────────────

    /**
     * Resolves the API path for a given Wicket object name.
     * Handles top-level and nested (contact info) objects.
     */
    private ResolveObjectAPIPath(objectName: string): string {
        // Contact info objects nested under people
        if (objectName === 'people_emails') return '/people';
        if (objectName === 'people_phones') return '/people';
        if (objectName === 'people_addresses') return '/people';
        if (objectName === 'org_emails') return '/organizations';
        if (objectName === 'org_phones') return '/organizations';
        if (objectName === 'org_addresses') return '/organizations';

        // For direct CRUD, emails/phones/addresses use their direct endpoints
        if (objectName === 'emails' || objectName === 'phones' || objectName === 'addresses') {
            return `/${objectName}`;
        }

        // Top-level objects
        return `/${objectName}`;
    }

    // ─── HTTP Helpers ────────────────────────────────────────────────

    /** Ensures minimum interval between API requests to avoid rate limiting. */
    private async ThrottleRequest(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
        }
    }

    /** Executes an HTTP request with a timeout and optional body. */
    private async FetchWithTimeout(
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const fetchOptions: RequestInit = {
            method,
            headers,
            signal: controller.signal,
        };

        if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
            fetchOptions.body = JSON.stringify(body);
        }

        try {
            return await fetch(url, fetchOptions);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Wicket API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /** Safely parses a response body as JSON, falling back to text. */
    private async ParseResponseBody(response: Response): Promise<unknown> {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('json')) {
            return response.json() as Promise<unknown>;
        }
        return response.text();
    }

    /** Calculates retry delay from Retry-After header or exponential backoff. */
    private CalculateRetryDelay(response: Response, attempt: number): number {
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed * 1000;
        }
        return Math.min(1000 * Math.pow(2, attempt), 30000);
    }

    /** Converts a fetch Response + parsed body into a RESTResponse. */
    private BuildRESTResponse(response: Response, body: unknown): RESTResponse {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return { Status: response.status, Body: body, Headers: headers };
    }

    /** Formats a response body as a truncated string for error messages. */
    private FormatBodyPreview(body: unknown): string {
        if (typeof body === 'string') return body.slice(0, 500);
        return JSON.stringify(body).slice(0, 500);
    }

    /** Builds a WicketCRUDResult from a caught error. */
    private BuildCRUDError(err: unknown): WicketCRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return { Success: false, ErrorMessage: message, StatusCode: 0 };
    }

    /** Returns a promise that resolves after the specified number of milliseconds. */
    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
