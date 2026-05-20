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
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';

// ─── Configuration & Auth Types ──────────────────────────────────────

/**
 * Connection configuration for GrowthZone, parsed from the
 * CompanyIntegration.Configuration JSON or an attached MJ Credential.
 */
export interface GrowthZoneConnectionConfig {
    /** Tenant subdomain (e.g., "myassociation" for myassociation.growthzoneapp.com) */
    Tenant: string;
    /** API key issued by GrowthZone WebSupport. Sent as 'Authorization: ApiKey {key}'. */
    ApiKey: string;
    /**
     * Optional full base URL override. When provided, takes precedence over Tenant
     * and must end with '/api' (no trailing slash). Used for staging or non-standard
     * deployments.
     */
    BaseUrlOverride?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 3 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /**
     * Minimum milliseconds between API requests. Default: 2000 (2 seconds)
     * per GrowthZone's recommended throttle. Reduce with caution.
     */
    MinRequestIntervalMs?: number;
}

/** Extended REST auth context carrying the parsed GrowthZone config. */
interface GrowthZoneAuthContext extends RESTAuthContext {
    /** Full resolved base URL (e.g., https://myassociation.growthzoneapp.com/api) */
    BaseUrl: string;
    /** Full config for reference */
    Config: GrowthZoneConnectionConfig;
}

/** Raw shape of a GrowthZone delta-contact record */
interface GrowthZoneDeltaContact {
    ContactId: number | string;
    DisplayName?: string | null;
    ModifiedDate?: string | null;
    IsDeleted?: boolean | null;
    SystemContactTypeId?: number | string | null;
}

/** Raw shape of a single GrowthZone custom field on a contact */
interface GrowthZoneCustomField {
    CustomFieldId: number | string;
    Name?: string | null;
    DisplayName?: string | null;
    Description?: string | null;
    CustomFieldType?: string | null;
    CustomFieldDataTypeId?: number | string | null;
    DataSize?: number | string | null;
    Value?: unknown;
    FieldGroupName?: string | null;
    IsPublic?: boolean | null;
    IsMemberEditable?: boolean | null;
    IsRequired?: boolean | null;
    IsArchived?: boolean | null;
    SelectOptions?: unknown;
}

/** Raw shape of a GrowthZone NotesAndFields response */
interface GrowthZoneNotesAndFields {
    Notes?: string | null;
    Bio?: string | null;
    EstablishedDate?: string | null;
    Naics?: string | null;
    Sic?: string | null;
    Fields?: GrowthZoneCustomField[];
}

/** Raw shape of the GrowthZone OrgGeneral response with nested arrays */
interface GrowthZoneOrgGeneral extends Record<string, unknown> {
    ContactId: number | string;
    Activities?: Record<string, unknown>[];
    Categories?: Record<string, unknown>[];
    Certifications?: Record<string, unknown>[];
    Communication?: Record<string, unknown>[];
    Memberships?: Record<string, unknown>[];
    SalesOpportunities?: Record<string, unknown>[];
}

/** GrowthZone paginated list envelope */
interface GrowthZoneListEnvelope<T> {
    Results?: T[];
    TotalRecordAvailable?: number;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Default maximum retries */
const DEFAULT_MAX_RETRIES = 3;

/** Default HTTP timeout (ms) */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** Default minimum interval between requests (ms) — GrowthZone recommends 2 seconds */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 2_000;

/** Default page size for flat list endpoints */
const DEFAULT_PAGE_SIZE = 500;

/** Sentinel date used by GrowthZone to represent null datetimes */
const GROWTHZONE_NULL_DATE = '0001-01-01T00:00:00';

/** Names of nested array fields to flatten from OrgGeneral */
const ORG_NESTED_ARRAYS = [
    'Activities',
    'Categories',
    'Certifications',
    'Communication',
    'Memberships',
    'SalesOpportunities',
] as const;

// ─── Action-metadata objects (mirrors .growthzone.json) ──────────────

const GROWTHZONE_ACTION_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'contacts', DisplayName: 'Contact',
        Description: 'A contact (person or organization) in GrowthZone',
        SupportsWrite: false,
        Fields: [
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'GrowthZone contact identifier' },
            { Name: 'DisplayName', DisplayName: 'Display Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Formatted display name' },
            { Name: 'ModifiedDate', DisplayName: 'Modified Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'IsDeleted', DisplayName: 'Is Deleted', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Soft-delete flag' },
            { Name: 'SystemContactTypeId', DisplayName: 'Contact Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Individual (1) or Organization (2)' },
        ],
    },
    {
        Name: 'memberships', DisplayName: 'Membership',
        Description: 'A membership held by a contact in GrowthZone',
        SupportsWrite: false,
        Fields: [
            { Name: 'MembershipId', DisplayName: 'Membership ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership identifier' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Holder contact' },
            { Name: 'MembershipTypeId', DisplayName: 'Membership Type ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership type/package' },
            { Name: 'MembershipTypeName', DisplayName: 'Membership Type Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Type name' },
            { Name: 'MembershipStatusTypeId', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status code (0-9)' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Effective start date' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Expiration date' },
        ],
    },
    {
        Name: 'groups', DisplayName: 'Group',
        Description: 'A group/committee in GrowthZone', SupportsWrite: false,
        Fields: [
            { Name: 'GroupId', DisplayName: 'Group ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group identifier' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group name' },
            { Name: 'Description', DisplayName: 'Description', Type: 'text', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group description' },
            { Name: 'IsActive', DisplayName: 'Is Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active flag' },
        ],
    },
    {
        Name: 'events', DisplayName: 'Event',
        Description: 'An event in GrowthZone', SupportsWrite: false,
        Fields: [
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event identifier' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event name' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start datetime' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End datetime' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event location' },
            { Name: 'IsActive', DisplayName: 'Is Active', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Active flag' },
        ],
    },
    {
        Name: 'invoices', DisplayName: 'Invoice',
        Description: 'An invoice in GrowthZone billing', SupportsWrite: false,
        Fields: [
            { Name: 'InvoiceId', DisplayName: 'Invoice ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice identifier' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Billed contact' },
            { Name: 'InvoiceNumber', DisplayName: 'Invoice Number', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User-visible invoice number' },
            { Name: 'TotalAmount', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice total' },
            { Name: 'BalanceDue', DisplayName: 'Balance Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Outstanding balance' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice status' },
        ],
    },
    {
        Name: 'payments', DisplayName: 'Payment',
        Description: 'A payment record in GrowthZone', SupportsWrite: false,
        Fields: [
            { Name: 'PaymentId', DisplayName: 'Payment ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment identifier' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Paying contact' },
            { Name: 'Amount', DisplayName: 'Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment amount' },
            { Name: 'PaymentMethod', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Method (Card, ACH, Check, Cash)' },
            { Name: 'PaymentStatus', DisplayName: 'Payment Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status (Pending, Captured, Refunded)' },
        ],
    },
    {
        Name: 'certifications', DisplayName: 'Certification',
        Description: 'A certification held by a contact', SupportsWrite: false,
        Fields: [
            { Name: 'CertificationContactId', DisplayName: 'Certification Contact ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Unique record identifier' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Holder contact' },
            { Name: 'CertificationId', DisplayName: 'Certification ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Certification definition' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Certification name' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status (InProgress, Completed, Expired)' },
        ],
    },
];

// ─── Connector Implementation ────────────────────────────────────────

/**
 * Connector for the GrowthZone association management REST API.
 *
 * Extends BaseRESTIntegrationConnector to leverage metadata-driven object/field
 * discovery from IntegrationEngineBase cache plus generic pagination.
 *
 * Auth: sends `Authorization: ApiKey {key}` on every request. API keys are
 * provisioned by GrowthZone WebSupport. Tenant subdomain is required to
 * resolve the base URL.
 *
 * Pagination: GrowthZone uses OData-style params on flat endpoints —
 * `$skip`, `$top`, and `$orderby`. `$filter`, `$expand`, `$select` are NOT
 * supported. The only incremental endpoint is `/api/contacts/delta`, which
 * accepts `?modifiedSince=ISO8601&top=N`.
 *
 * Throttle: GrowthZone recommends 2s minimum interval; the connector defaults
 * to that. Responds to HTTP 429/503 with exponential backoff.
 */
@RegisterClass(BaseIntegrationConnector, 'GrowthZoneConnector')
export class GrowthZoneConnector extends BaseRESTIntegrationConnector {

    /** Cached auth context for the current sync run */
    private authCache: GrowthZoneAuthContext | null = null;

    /** Timestamp of the last API request, for throttling */
    private lastRequestTime = 0;

    /**
     * Object name currently being fetched — tracked so BuildPaginatedURL can
     * emit endpoint-specific query parameters (e.g., `modifiedSince` for delta).
     */
    private currentObjectName = '';

    /** Current watermark value, used for `modifiedSince` on delta contacts */
    private currentWatermark: string | undefined;

    public override get IntegrationName(): string { return 'GrowthZone'; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return GROWTHZONE_ACTION_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;
        return {
            IntegrationName: 'GrowthZone',
            CategoryName: 'GrowthZone',
            IconClass: 'fa-solid fa-seedling',
            Objects: objects,
            IncludeSearch: false,
            IncludeList: false,
            CategoryDescription: 'GrowthZone association management integration for contacts, memberships, events, and billing',
            ParentCategoryName: 'Association Management',
        };
    }

    // ── Capability getters ───────────────────────────────────────────

    public override get SupportsCreate(): boolean { return false; }
    public override get SupportsUpdate(): boolean { return false; }
    public override get SupportsDelete(): boolean { return false; }

    // ── Default mappings ─────────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'GrowthZone',
            DefaultObjects: [],
        };
    }

    public override GetDefaultFieldMappings(
        objectName: string,
        _entityName: string
    ): DefaultFieldMapping[] {
        const lower = objectName.toLowerCase();

        if (lower === 'contacts' || lower === 'contact-person') {
            return [
                { SourceFieldName: 'ContactId', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'DisplayName', DestinationFieldName: 'Name' },
                { SourceFieldName: 'FirstName', DestinationFieldName: 'FirstName' },
                { SourceFieldName: 'LastName', DestinationFieldName: 'LastName' },
                { SourceFieldName: 'IsDeleted', DestinationFieldName: 'IsDeleted' },
                { SourceFieldName: 'ModifiedDate', DestinationFieldName: 'UpdatedAt' },
            ];
        }

        if (lower === 'contact-org') {
            return [
                { SourceFieldName: 'ContactId', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'OrganizationName', DestinationFieldName: 'Name' },
                { SourceFieldName: 'ModifiedDate', DestinationFieldName: 'UpdatedAt' },
            ];
        }

        if (lower === 'memberships') {
            return [
                { SourceFieldName: 'MembershipId', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'ContactId', DestinationFieldName: 'ContactExternalID' },
                { SourceFieldName: 'MembershipStatusTypeId', DestinationFieldName: 'Status' },
                { SourceFieldName: 'StartDate', DestinationFieldName: 'StartDate' },
                { SourceFieldName: 'EndDate', DestinationFieldName: 'EndDate' },
            ];
        }

        return [];
    }

    // ─── BaseRESTIntegrationConnector abstract methods ──────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        if (this.authCache) return this.authCache;

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const baseUrl = this.ResolveBaseUrl(config);
        const auth: GrowthZoneAuthContext = { Token: config.ApiKey, BaseUrl: baseUrl, Config: config };
        this.authCache = auth;
        return auth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const token = auth.Token ?? '';
        return {
            'Authorization': `ApiKey ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        return (auth as GrowthZoneAuthContext).BaseUrl;
    }

    /**
     * Extracts records from GrowthZone responses. Handles three shapes:
     *   1. `{ Results: [...], TotalRecordAvailable: N }` — paginated lists
     *   2. Raw array — some endpoints return arrays at the root
     *   3. Single object — detail endpoints (per-contact fetches)
     *
     * Normalizes `0001-01-01` dates and empty strings to null.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (rawBody == null) return [];

        if (Array.isArray(rawBody)) {
            return (rawBody as Record<string, unknown>[]).map(r => this.NormalizeRecord(r));
        }

        if (typeof rawBody === 'object') {
            const body = rawBody as Record<string, unknown>;

            // Paginated envelope: { Results: [...], TotalRecordAvailable: N }
            const envelope = body as GrowthZoneListEnvelope<Record<string, unknown>>;
            if (Array.isArray(envelope.Results)) {
                return envelope.Results.map(r => this.NormalizeRecord(r));
            }

            // Custom response key from metadata
            if (responseDataKey && Array.isArray(body[responseDataKey])) {
                const arr = body[responseDataKey] as Record<string, unknown>[];
                return arr.map(r => this.NormalizeRecord(r));
            }

            // Nested flattening cases for OrgGeneral/NotesAndFields
            const flattened = this.MaybeFlattenNested(body);
            if (flattened) return flattened;

            // Single detail record
            return [this.NormalizeRecord(body)];
        }

        return [];
    }

    /**
     * Extracts pagination state. GrowthZone uses OData pagination with
     * `$skip` and `$top`; there's no `HasMore` flag — we derive it from
     * `TotalRecordAvailable` vs. current offset + returned count.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        if (!rawBody || typeof rawBody !== 'object') {
            return { HasMore: false };
        }

        const body = rawBody as Record<string, unknown>;
        const results = Array.isArray(body.Results) ? body.Results : [];
        const total = typeof body.TotalRecordAvailable === 'number'
            ? body.TotalRecordAvailable
            : undefined;

        // Fewer records than requested = end of stream
        if (results.length < pageSize) {
            return { HasMore: false, TotalRecords: total };
        }

        // Check against total count if provided
        const nextOffset = currentOffset + results.length;
        if (total !== undefined && nextOffset >= total) {
            return { HasMore: false, TotalRecords: total };
        }

        return {
            HasMore: true,
            NextOffset: nextOffset,
            TotalRecords: total,
        };
    }

    /**
     * Overrides the base pagination URL builder to emit GrowthZone-specific
     * OData parameters (`$skip`, `$top`) and, for the delta contacts endpoint,
     * the `modifiedSince` watermark parameter.
     *
     * Driven entirely by IntegrationObject metadata — no hardcoded object-name
     * switches beyond the delta-specific param which is keyed on APIPath.
     */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        _page: number,
        offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const limit = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const params = new URLSearchParams();

        // GrowthZone's only incremental endpoint: /api/contacts/delta
        const isDelta = obj.APIPath?.toLowerCase().endsWith('/delta') ?? false;
        if (isDelta && this.currentWatermark) {
            params.set('modifiedSince', this.currentWatermark);
            params.set('top', String(limit));
            if (offset > 0) params.set('skip', String(offset));
        } else if (obj.SupportsPagination && obj.PaginationType === 'Offset') {
            params.set('$top', String(limit));
            if (offset > 0) params.set('$skip', String(offset));
        }

        const qs = params.toString();
        return qs ? `${basePath}?${qs}` : basePath;
    }

    /**
     * Executes an HTTP request with rate limiting and retry for 429/503.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const gzAuth = auth as GrowthZoneAuthContext;
        const maxRetries = gzAuth.Config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = gzAuth.Config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = gzAuth.Config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.ThrottleIfNeeded(minInterval);

            const fetchOptions: RequestInit = {
                method,
                headers,
                signal: AbortSignal.timeout(timeoutMs),
            };
            if (body !== undefined && method !== 'GET') {
                fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            }

            let response: Response;
            try {
                response = await fetch(url, fetchOptions);
            } catch (err) {
                if (attempt < maxRetries && this.IsTransientNetworkError(err)) {
                    await this.Sleep(this.BackoffDelay(attempt));
                    continue;
                }
                throw err;
            }
            this.lastRequestTime = Date.now();

            if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
                console.warn(`[GrowthZone] HTTP ${response.status} from ${url} — backing off`);
                await this.Sleep(this.BackoffDelay(attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`GrowthZone request failed after ${maxRetries + 1} attempts: ${url}`);
    }

    // ─── TestConnection ──────────────────────────────────────────────

    /**
     * Tests connectivity by calling the delta endpoint with a recent
     * watermark. A 200 response confirms that the tenant and API key are
     * valid.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            const baseUrl = this.ResolveBaseUrl(config);
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const url = `${baseUrl}/contacts/delta?modifiedSince=${encodeURIComponent(since)}&top=1`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `ApiKey ${config.ApiKey}`,
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS),
            });

            if (!response.ok) {
                const preview = (await response.text()).slice(0, 300);
                return {
                    Success: false,
                    Message: `GrowthZone returned HTTP ${response.status} from ${url}: ${preview}`,
                };
            }

            return {
                Success: true,
                Message: `Connected to GrowthZone tenant '${config.Tenant}'`,
                ServerVersion: 'GrowthZone REST API',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery with runtime custom fields ───────────────────────

    /**
     * Discovers objects from the cache. GrowthZone's dynamic capability is
     * limited to custom fields on contacts (not custom objects/tables) —
     * so DiscoverObjects only returns the metadata-seeded baseline.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return super.DiscoverObjects(companyIntegration, contextUser);
    }

    /**
     * Discovers fields for a given object, augmenting the cached metadata
     * with runtime-discovered custom fields for contact objects. Custom
     * fields get IsCustom=true via IntegrationSchemaSync when persisted.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);

        // Custom-field discovery only applies to the contact-custom-field-values
        // and custom-field-definitions objects.
        const lower = objectName.toLowerCase();
        if (lower !== 'custom-field-definitions' && lower !== 'contact-custom-field-values') {
            return staticFields;
        }

        try {
            const customFields = await this.FetchCustomFieldDefinitions(companyIntegration, contextUser);
            const discovered = customFields.map(cf => this.CustomFieldToSchema(cf));
            return [...staticFields, ...discovered];
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[GrowthZone] Runtime custom-field discovery failed: ${message}`);
            return staticFields;
        }
    }

    /**
     * Fetches custom field definitions from GrowthZone. Uses a sample contact
     * ID to query NotesAndFields — since the curated API does not expose a
     * global custom-fields list endpoint, a sample contact is used to probe
     * the defined fields.
     */
    private async FetchCustomFieldDefinitions(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<GrowthZoneCustomField[]> {
        const auth = (await this.Authenticate(companyIntegration, contextUser)) as GrowthZoneAuthContext;
        const headers = this.BuildHeaders(auth);

        // Canonical vendor endpoint: POST /api/customfields/getall returns ALL
        // tenant-defined custom field definitions across all object types in one
        // call. Documented at documentation.growthzoneapp.com/CustomField.html.
        // Previously this method probed per-contact NotesAndFields, which was
        // both slow and limited to fields actually attached to the probed record.
        try {
            const url = `${auth.BaseUrl}/customfields/getall`;
            const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, {});
            if (response.Status >= 200 && response.Status < 300) {
                const body = response.Body as GrowthZoneListEnvelope<GrowthZoneCustomField> | GrowthZoneCustomField[];
                const items = Array.isArray(body) ? body : (body.Results ?? []);
                if (items.length > 0) return items;
            }
        } catch {
            // Fall through to legacy per-contact probe if the global endpoint isn't
            // available on the tenant (e.g., older deployments may not expose it).
        }

        // Legacy fallback: probe a single contact's NotesAndFields. Kept so older
        // GrowthZone deployments without /customfields/getall continue to work.
        const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
        const listUrl = `${auth.BaseUrl}/contacts/delta?modifiedSince=${encodeURIComponent(since)}&top=1`;
        const listResp = await this.MakeHTTPRequest(auth, listUrl, 'GET', headers);
        if (listResp.Status < 200 || listResp.Status >= 300) return [];

        const listBody = listResp.Body as GrowthZoneListEnvelope<GrowthZoneDeltaContact> | GrowthZoneDeltaContact[];
        const contacts = Array.isArray(listBody) ? listBody : (listBody.Results ?? []);
        if (contacts.length === 0) return [];

        const probeId = String(contacts[0].ContactId);
        const fieldsUrl = `${auth.BaseUrl}/contacts/${encodeURIComponent(probeId)}/NotesAndFields`;
        const fieldsResp = await this.MakeHTTPRequest(auth, fieldsUrl, 'GET', headers);
        if (fieldsResp.Status < 200 || fieldsResp.Status >= 300) return [];

        const notesAndFields = fieldsResp.Body as GrowthZoneNotesAndFields;
        return notesAndFields.Fields ?? [];
    }

    /**
     * Maps a GrowthZone custom field definition to an ExternalFieldSchema.
     */
    private CustomFieldToSchema(cf: GrowthZoneCustomField): ExternalFieldSchema {
        return {
            Name: `CustomField_${cf.CustomFieldId}`,
            Label: cf.DisplayName ?? cf.Name ?? `Custom Field ${cf.CustomFieldId}`,
            Description: cf.Description ?? undefined,
            DataType: this.MapCustomFieldType(cf.CustomFieldType),
            IsRequired: cf.IsRequired === true,
            IsUniqueKey: false,
            IsReadOnly: cf.IsArchived === true,
            IsForeignKey: false,
        };
    }

    /**
     * Maps GrowthZone custom-field type to generic integration type.
     */
    private MapCustomFieldType(cfType: string | null | undefined): string {
        const t = (cfType ?? '').toLowerCase();
        if (t === 'number') return 'decimal';
        if (t === 'date') return 'datetime';
        if (t === 'selectlist' || t === 'scale') return 'string';
        if (t === 'file') return 'string';
        return 'string';
    }

    // ─── FetchChanges override ──────────────────────────────────────

    /**
     * Override to store watermark/object-name context used by BuildPaginatedURL
     * and to advance the watermark from returned records.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        this.currentObjectName = ctx.ObjectName;
        this.currentWatermark = ctx.WatermarkValue ?? undefined;

        const result = await super.FetchChanges(ctx);

        const isFinal = !result.HasMore;
        const newWatermark = isFinal
            ? (this.ExtractLatestModifiedDate(result.Records) ?? ctx.WatermarkValue ?? undefined)
            : undefined;

        return {
            ...result,
            NewWatermarkValue: newWatermark,
        };
    }

    // ─── Private helpers ────────────────────────────────────────────

    /**
     * Normalizes a raw record: strips GrowthZone null-sentinel dates and
     * treats empty strings as null. Does NOT recurse into nested objects
     * beyond the top level — the base class handles that.
     */
    private NormalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
            out[key] = this.NormalizeValue(value);
        }
        return out;
    }

    /** Converts GrowthZone sentinel values to null. */
    private NormalizeValue(value: unknown): unknown {
        if (value == null) return null;
        if (typeof value === 'string') {
            if (value === '' ) return null;
            if (value.startsWith(GROWTHZONE_NULL_DATE)) return null;
            return value;
        }
        return value;
    }

    /**
     * For OrgGeneral / NotesAndFields responses, the current object being
     * fetched may request a flattened nested array rather than the root
     * record. Returns flattened rows when currentObjectName matches a
     * known nested-array target, else null.
     */
    private MaybeFlattenNested(body: Record<string, unknown>): Record<string, unknown>[] | null {
        const name = this.currentObjectName.toLowerCase();

        // NotesAndFields — flatten Fields[] array for custom field values
        if (name === 'contact-custom-field-values' && Array.isArray(body.Fields)) {
            const fields = body.Fields as GrowthZoneCustomField[];
            const contactId = body.ContactId ?? body.contactId;
            return fields.map(cf => this.NormalizeRecord({
                ContactId: contactId ?? '',
                CustomFieldId: cf.CustomFieldId,
                Name: cf.Name ?? null,
                DisplayName: cf.DisplayName ?? null,
                CustomFieldType: cf.CustomFieldType ?? null,
                Value: this.StringifyCustomFieldValue(cf.Value),
                FieldGroupName: cf.FieldGroupName ?? null,
                IsPublic: cf.IsPublic ?? null,
                IsArchived: cf.IsArchived ?? null,
            }));
        }

        // OrgGeneral — flatten one of the nested arrays based on current object
        const nestedMap: Record<string, typeof ORG_NESTED_ARRAYS[number]> = {
            'contact-activities': 'Activities',
            'contact-categories': 'Categories',
            'contact-communications': 'Communication',
            'contact-sales-opportunities': 'SalesOpportunities',
        };
        const arrKey = nestedMap[name];
        if (arrKey && Array.isArray(body[arrKey])) {
            const rows = body[arrKey] as Record<string, unknown>[];
            const contactId = body.ContactId ?? body.contactId;
            return rows.map(row => this.NormalizeRecord({
                ContactId: contactId ?? '',
                ...row,
            }));
        }

        return null;
    }

    /** Stringifies custom-field values so they fit nvarchar storage. */
    private StringifyCustomFieldValue(value: unknown): string | null {
        if (value == null) return null;
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        try {
            return JSON.stringify(value);
        } catch {
            return null;
        }
    }

    /**
     * Extracts the latest ModifiedDate from a batch of records for
     * watermark advancement.
     */
    private ExtractLatestModifiedDate(records: { Fields: Record<string, unknown> }[]): string | null {
        let latest: Date | null = null;
        for (const rec of records) {
            const dateStr = rec.Fields?.ModifiedDate;
            if (typeof dateStr !== 'string' || dateStr.length === 0) continue;
            const d = new Date(dateStr);
            if (!isNaN(d.getTime()) && (latest === null || d > latest)) {
                latest = d;
            }
        }
        return latest ? latest.toISOString() : null;
    }

    /**
     * Parses connection config, preferring the attached credential entity
     * over the raw Configuration JSON.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo
    ): Promise<GrowthZoneConnectionConfig> {
        if (companyIntegration.CredentialID) {
            return this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
        }
        if (companyIntegration.Configuration) {
            return this.ValidateConfig(JSON.parse(companyIntegration.Configuration));
        }
        throw new Error('GrowthZone connector requires either CredentialID or Configuration JSON');
    }

    /** Loads config from the MJ: Credentials entity. */
    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo
    ): Promise<GrowthZoneConnectionConfig> {
        const md = new Metadata();
        const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        await cred.Load(credentialID);
        if (!cred.Values) throw new Error('GrowthZone credential has no Values JSON');
        return this.ValidateConfig(JSON.parse(cred.Values));
    }

    /** Validates and applies defaults to the config. */
    private ValidateConfig(raw: unknown): GrowthZoneConnectionConfig {
        if (!raw || typeof raw !== 'object') {
            throw new Error('GrowthZone configuration is not a valid object');
        }
        const get = (key: string): string | undefined => {
            const obj = raw as Record<string, unknown>;
            const lower = key.toLowerCase();
            for (const [k, v] of Object.entries(obj)) {
                if (k.toLowerCase() === lower && typeof v === 'string') return v;
            }
            return undefined;
        };
        const getNum = (key: string): number | undefined => {
            const obj = raw as Record<string, unknown>;
            const lower = key.toLowerCase();
            for (const [k, v] of Object.entries(obj)) {
                if (k.toLowerCase() === lower && typeof v === 'number') return v;
            }
            return undefined;
        };

        const tenant = get('tenant') ?? get('subdomain');
        const apiKey = get('apikey') ?? get('api_key') ?? get('key');
        const baseUrlOverride = get('baseurloverride') ?? get('base_url_override') ?? get('baseurl');

        if (!tenant && !baseUrlOverride) {
            throw new Error('GrowthZone configuration missing required field: Tenant (or BaseUrlOverride)');
        }
        if (!apiKey) {
            throw new Error('GrowthZone configuration missing required field: ApiKey');
        }

        return {
            Tenant: tenant ?? '',
            ApiKey: apiKey,
            BaseUrlOverride: baseUrlOverride,
            MaxRetries: getNum('maxretries') ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: getNum('requesttimeoutms') ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: getNum('minrequestintervalms') ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    /**
     * Resolves the base URL from either an override or the tenant subdomain.
     * Always returns a URL ending in `/api` with no trailing slash.
     */
    private ResolveBaseUrl(config: GrowthZoneConnectionConfig): string {
        if (config.BaseUrlOverride) {
            const trimmed = config.BaseUrlOverride.replace(/\/+$/, '');
            return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
        }
        return `https://${config.Tenant}.growthzoneapp.com/api`;
    }

    /** Throttle to respect GrowthZone's recommended minimum request interval. */
    private async ThrottleIfNeeded(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.Sleep(minIntervalMs - elapsed);
        }
    }

    /** Exponential backoff delay for retry attempts. */
    private BackoffDelay(attempt: number): number {
        return Math.min(2_000 * Math.pow(2, attempt), 30_000);
    }

    /** Checks whether an error is transient (network/timeout). */
    private IsTransientNetworkError(err: unknown): boolean {
        if (!(err instanceof Error)) return false;
        const msg = err.message.toLowerCase();
        return msg.includes('timeout') || msg.includes('abort') ||
               msg.includes('econnreset') || msg.includes('econnrefused') ||
               msg.includes('fetch failed');
    }

    /** Builds the normalized RESTResponse from a fetch Response. */
    private async BuildRESTResponse(response: Response): Promise<RESTResponse> {
        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

        const text = await response.text();
        let body: unknown = null;
        if (text.length > 0) {
            try { body = JSON.parse(text); }
            catch { body = text; }
        }
        return { Status: response.status, Body: body, Headers: headers };
    }

    /** Promise-wrapped setTimeout. */
    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/** Tree-shaking prevention function — import and call from module entry point */
export function LoadGrowthZoneConnector(): void { /* no-op */ }
