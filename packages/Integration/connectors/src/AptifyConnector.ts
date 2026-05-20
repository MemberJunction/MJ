/**
 * AptifyConnector — REST integration connector for Aptify (Community Brands / Momentive Software)
 * association management software.
 *
 * Reference: https://aptifysupport.zendesk.com/ (entity services + Aptify Web API docs are
 *            customer-portal gated; the public Web API root is /AptifyServicesAPI/services).
 *
 * Auth      : Token-based. POST {BaseURL}/authentication with Username + Password
 *             (and optional AuthProvider, defaults to "AptifyUser") returns a TokenId GUID.
 *             Subsequent requests carry `Authorization: Web {TokenId}` (NOT a Bearer token).
 * Base path : `${BaseURL}/services/{EntityName}` for generic CRUD on Aptify entities.
 * Pagination: OData-style `$top` / `$skip` query parameters. List endpoints typically return
 *             a JSON array directly (or an envelope with an `Items` / `value` property).
 * Increment : Filter `LastModifiedDate ge datetime'<iso>'` for entities that expose it.
 * CRUD      : Full Create / Read / Update / Delete via /services/{Entity}/{id}.
 *
 * NOT supported by this connector:
 *   - Aptify 7 Azure-native API (separate endpoint, different auth)
 *   - Bulk Import service (file-based, not API-driven)
 *   - Service Data Objects (business-logic wrappers — call the underlying entities instead)
 */
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
    type ExternalRecord,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type FetchContext,
    type FetchBatchResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type CRUDResult,
    type IntegrationObjectInfo,
} from '@memberjunction/integration-engine';

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Credentials required to authenticate against an Aptify Web Services API tenant.
 * BaseURL is customer-specific (no trailing slash); AuthProvider defaults to "AptifyUser".
 */
export interface AptifyConnectionConfig {
    BaseURL: string;
    Username: string;
    Password: string;
    AuthProvider?: string;

    /** Maximum retries for rate-limited or transient failures. Default: 3. */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests (client-side throttle). Default: 200. */
    MinRequestIntervalMs?: number;
}

interface AptifyAuthContext extends RESTAuthContext {
    Token: string;
    TokenType: 'Web';
    ExpiresAt: Date;
    Config: AptifyConnectionConfig;
    BaseURL: string;
}

interface AptifyTokenResponse {
    TokenId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 200;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

/**
 * Static catalog of the Aptify entities this connector exposes for action generation
 * and as the seed for runtime DiscoverFields. Field lists are intentionally sparse — the
 * connector enriches them at runtime by fetching a sample record per entity and inferring
 * the full property set. The static entries below pin primary keys and known foreign keys
 * so downstream consumers (Action generator, Schema builder) get correct types even before
 * a live API connection has been made.
 */
const APT_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Persons', DisplayName: 'Person',
        Description: 'Individual contacts and members. Aptify\'s primary identity entity.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Person record ID' },
            { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Used for incremental watermark' },
        ],
    },
    {
        Name: 'Companies', DisplayName: 'Company',
        Description: 'Organization records — employers, member orgs, vendors.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Company record ID' },
        ],
    },
    {
        Name: 'Memberships', DisplayName: 'Membership',
        Description: 'Membership records linking Persons or Companies to MembershipTypes.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
            { Name: 'CompanyId', DisplayName: 'Company ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Companies' },
            { Name: 'MembershipTypeId', DisplayName: 'Membership Type ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → MembershipTypes' },
        ],
    },
    {
        Name: 'MembershipTypes', DisplayName: 'Membership Type',
        Description: 'Definitions of membership categories (Individual, Corporate, Student, etc.).',
        SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership type ID' },
        ],
    },
    {
        Name: 'Events', DisplayName: 'Event',
        Description: 'Events, meetings, conferences.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event record ID' },
        ],
    },
    {
        Name: 'EventRegistrations', DisplayName: 'Event Registration',
        Description: 'Person attendance records for Events.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration record ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Events' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
        ],
    },
    {
        Name: 'Orders', DisplayName: 'Order',
        Description: 'Sales / fulfillment order headers.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Order record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
            { Name: 'CompanyId', DisplayName: 'Company ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Companies' },
        ],
    },
    {
        Name: 'OrderDetails', DisplayName: 'Order Detail',
        Description: 'Order line items linking Products to Orders.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Order detail record ID' },
            { Name: 'OrderId', DisplayName: 'Order ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Orders' },
            { Name: 'ProductId', DisplayName: 'Product ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Products' },
        ],
    },
    {
        Name: 'Products', DisplayName: 'Product',
        Description: 'Sellable products / SKUs.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product record ID' },
        ],
    },
    {
        Name: 'Committees', DisplayName: 'Committee',
        Description: 'Committees, boards, working groups.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Committee record ID' },
        ],
    },
    {
        Name: 'CommitteeMembers', DisplayName: 'Committee Member',
        Description: 'Person assignments to Committees.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Committee member record ID' },
            { Name: 'CommitteeId', DisplayName: 'Committee ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Committees' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
        ],
    },
    {
        Name: 'Addresses', DisplayName: 'Address',
        Description: 'Postal addresses linked to Persons or Companies.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Address record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
            { Name: 'CompanyId', DisplayName: 'Company ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Companies' },
        ],
    },
    {
        Name: 'Donations', DisplayName: 'Donation',
        Description: 'Donations and gifts.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
        ],
    },
    {
        Name: 'Certifications', DisplayName: 'Certification',
        Description: 'Professional certifications held by Persons.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Certification record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
        ],
    },
    {
        Name: 'Education', DisplayName: 'Education',
        Description: 'Education / degree records for Persons.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Education record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
        ],
    },
    {
        Name: 'Payments', DisplayName: 'Payment',
        Description: 'Payment transactions against Orders / Invoices.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment record ID' },
            { Name: 'OrderId', DisplayName: 'Order ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Orders' },
        ],
    },
    {
        Name: 'Invoices', DisplayName: 'Invoice',
        Description: 'Invoice headers issued for Orders.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice record ID' },
            { Name: 'OrderId', DisplayName: 'Order ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Orders' },
        ],
    },
    {
        Name: 'Chapters', DisplayName: 'Chapter',
        Description: 'Geographic / topical chapters or branches.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Chapter record ID' },
        ],
    },
    {
        Name: 'Subscriptions', DisplayName: 'Subscription',
        Description: 'Publication / content subscription records.',
        SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Subscription record ID' },
            { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
        ],
    },
];

const WATERMARK_CANDIDATE_FIELDS = ['LastModifiedDate', 'ModifiedDate', 'DateModified', 'UpdatedOn'];

// ─── Connector ──────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'AptifyConnector')
export class AptifyConnector extends BaseRESTIntegrationConnector {

    private authState: AptifyAuthContext | null = null;
    private lastRequestTime = 0;

    // ── Capability flags ────────────────────────────────────────────

    public override get IntegrationName(): string { return 'Aptify'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return APT_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-building-columns';
        config.CategoryDescription = 'Aptify association management — persons, memberships, events, orders, and committees.';
        config.ParentCategoryName = 'Association Management';
        config.IncludeSearch = true;
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
            'Authorization': `Web ${(auth as AptifyAuthContext).Token}`,
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
        const aptifyAuth = auth as AptifyAuthContext;
        const config = aptifyAuth.Config;
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

            if (response.status === 401 && attempt < maxRetries) {
                this.authState = null;
                const fresh = await this.GetAuth(aptifyAuth.Config);
                aptifyAuth.Token = fresh.Token;
                aptifyAuth.ExpiresAt = fresh.ExpiresAt;
                effectiveHeaders['Authorization'] = `Web ${fresh.Token}`;
                continue;
            }

            if (this.ShouldRetry(response.status) && attempt < maxRetries) {
                await this.Sleep(this.ComputeRetryDelay(response, attempt));
                continue;
            }

            return this.BuildRESTResponse(response);
        }

        throw new Error(`Aptify API request failed after ${maxRetries} attempt(s): ${url}`);
    }

    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (rawBody == null) return [];
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];

        const body = rawBody as Record<string, unknown>;
        if (responseDataKey && Array.isArray(body[responseDataKey])) {
            return body[responseDataKey] as Record<string, unknown>[];
        }
        if (Array.isArray(body['Items'])) return body['Items'] as Record<string, unknown>[];
        if (Array.isArray(body['value'])) return body['value'] as Record<string, unknown>[];
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
            default:
                return { HasMore: hasMore };
        }
    }

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as AptifyAuthContext).BaseURL;
    }

    /** Aptify list endpoints use OData `$top` / `$skip` (capitalized property names). */
    protected override BuildPaginatedURL(
        basePath: string,
        obj: { PaginationType: string; DefaultPageSize: number | null },
        page: number,
        offset: number,
        _cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? DEFAULT_PAGE_SIZE;
        const sep = basePath.includes('?') ? '&' : '?';
        switch (obj.PaginationType) {
            case 'Offset':
                return `${basePath}${sep}$top=${pageSize}&$skip=${offset}`;
            case 'PageNumber':
                return `${basePath}${sep}$top=${pageSize}&$skip=${(page - 1) * pageSize}`;
            default:
                return basePath;
        }
    }

    // ── Discovery + connection test ─────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser, true);
            const url = `${auth.BaseURL}/services/Persons?$top=1`;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status >= 200 && response.Status < 300) {
                return { Success: true, Message: `Connected to Aptify at ${auth.BaseURL}` };
            }
            return { Success: false, Message: `Aptify responded HTTP ${response.Status}` };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Aptify connection failed: ${message}` };
        }
    }

    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const staticObjects = await super.DiscoverObjects(companyIntegration, contextUser);
        if (staticObjects.length > 0) return staticObjects;

        return APT_OBJECTS.map(o => ({
            Name: o.Name,
            Label: o.DisplayName,
            Description: o.Description,
            SupportsIncrementalSync: true,
            SupportsWrite: o.SupportsWrite,
        }));
    }

    /**
     * Discovery strategy: fetch one sample record from `${BaseURL}/services/{Object}?$top=1`
     * and infer fields from its JSON shape, overlaying static PK / FK metadata where we have it.
     * Falls back to the static field set if the live call fails (offline scenarios, sandboxes
     * with empty tables, etc.).
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        try {
            const auth = await this.GetAuth(companyIntegration, contextUser);
            const url = `${auth.BaseURL}/services/${encodeURIComponent(objectName)}?$top=1`;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsFromSample(records[0], objectName);
            }
        } catch {
            // Live discovery failed — fall through to the static fallback below.
        }

        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);
        if (staticFields.length > 0) return staticFields;

        const obj = APT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
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

    /** Pull a sample record's keys + values, overlay any static PK/FK metadata we have for the object. */
    private InferFieldsFromSample(sample: Record<string, unknown>, objectName: string): ExternalFieldSchema[] {
        const staticObj = APT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
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
                IsReadOnly: overlay?.IsReadOnly ?? false,
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
        const auth = await this.GetAuth(ctx.CompanyIntegration, ctx.ContextUser) as AptifyAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = this.BuildFetchURL(auth.BaseURL, ctx.ObjectName, offset, ctx.WatermarkValue);

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Aptify FetchChanges failed for ${ctx.ObjectName}: HTTP ${response.Status}`);
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

    private BuildFetchURL(baseURL: string, objectName: string, offset: number, watermark: string | null): string {
        const path = `${baseURL}/services/${encodeURIComponent(objectName)}`;
        const params = new URLSearchParams();
        params.set('$top', String(DEFAULT_PAGE_SIZE));
        params.set('$skip', String(offset));
        if (watermark) {
            params.set('$filter', `LastModifiedDate ge datetime'${watermark}'`);
        }
        return `${path}?${params.toString()}`;
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

    // ── CRUD ────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo,
        );
        const url = `${auth.BaseURL}/services/${encodeURIComponent(ctx.ObjectName)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', this.BuildHeaders(auth), ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            const body = (response.Body ?? {}) as Record<string, unknown>;
            return { Success: true, ExternalID: this.ExtractIdFromRecord(body), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo,
        );
        const url = `${auth.BaseURL}/services/${encodeURIComponent(ctx.ObjectName)}/${encodeURIComponent(ctx.ExternalID)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'PUT', this.BuildHeaders(auth), ctx.Attributes);

        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo,
        );
        const url = `${auth.BaseURL}/services/${encodeURIComponent(ctx.ObjectName)}/${encodeURIComponent(ctx.ExternalID)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', this.BuildHeaders(auth));

        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const auth = await this.GetAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo,
        );
        const url = `${auth.BaseURL}/services/${encodeURIComponent(ctx.ObjectName)}/${encodeURIComponent(ctx.ExternalID)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
        if (response.Status < 200 || response.Status >= 300) return null;
        if (response.Body == null || typeof response.Body !== 'object') return null;
        const body = response.Body as Record<string, unknown>;
        return { ExternalID: ctx.ExternalID, ObjectType: ctx.ObjectName, Fields: body };
    }

    // ── Default config + field mappings ─────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return { DefaultSchemaName: 'Aptify', DefaultObjects: [] };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        const obj = APT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name === 'Id' ? 'ExternalID' : f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }

    // ─────────────────────────────────────────────────────────────────
    //                         Private helpers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Returns a valid auth context, refreshing the cached token as needed. Accepts either
     * (companyIntegration, contextUser) for normal callers or a pre-parsed config for the
     * silent re-auth path inside MakeHTTPRequest.
     */
    private async GetAuth(
        source: MJCompanyIntegrationEntity | AptifyConnectionConfig,
        contextUser?: UserInfo,
        forceRefresh = false
    ): Promise<AptifyAuthContext> {
        if (!forceRefresh && this.authState && this.IsTokenValid(this.authState)) {
            return this.authState;
        }
        const config = this.IsConfig(source)
            ? source
            : await this.ParseConfig(source as MJCompanyIntegrationEntity, contextUser);
        this.authState = await this.AcquireToken(config);
        return this.authState;
    }

    private IsConfig(source: MJCompanyIntegrationEntity | AptifyConnectionConfig): source is AptifyConnectionConfig {
        return (source as AptifyConnectionConfig).BaseURL !== undefined
            && (source as AptifyConnectionConfig).Username !== undefined;
    }

    private IsTokenValid(auth: AptifyAuthContext): boolean {
        return auth.ExpiresAt.getTime() > Date.now() + TOKEN_REFRESH_BUFFER_MS;
    }

    private async AcquireToken(config: AptifyConnectionConfig): Promise<AptifyAuthContext> {
        const baseURL = this.StripTrailingSlash(config.BaseURL);
        // Vendor canonical: POST {BaseURL}/Services/Authentication/Login/{Method}
        // where {Method} is 'Web' (the AuthProvider name is encoded in the URL path,
        // NOT a body field). Default to 'Web' (Aptify's standard internal provider) —
        // override via AuthProvider for SSO/SAML providers.
        const authMethod = config.AuthProvider && config.AuthProvider.trim().length > 0
            ? config.AuthProvider.trim()
            : 'Web';
        const tokenURL = `${baseURL}/Services/Authentication/Login/${encodeURIComponent(authMethod)}`;
        // Aptify expects 'UserName' (capital N) per the vendor's Web API docs —
        // 'Username' (lower n) would yield a 400/401.
        const requestBody = {
            UserName: config.Username,
            Password: config.Password,
        };
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

        const response = await fetch(tokenURL, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Aptify auth failed (${response.status}): ${detail.slice(0, 300)}`);
        }

        const payload = await response.json() as AptifyTokenResponse;
        if (!payload?.TokenId) {
            throw new Error('Aptify auth response missing TokenId');
        }

        return {
            Token: payload.TokenId,
            TokenType: 'Web',
            ExpiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
            Config: { ...config, BaseURL: baseURL },
            BaseURL: baseURL,
        };
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser?: UserInfo,
    ): Promise<AptifyConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const fromCred = await this.ParseConfigFromCredential(companyIntegration.CredentialID, contextUser);
            if (fromCred) return fromCred;
        }
        if (companyIntegration.Configuration) {
            const parsed = JSON.parse(companyIntegration.Configuration) as Record<string, string>;
            return this.ExtractConfig(parsed);
        }
        throw new Error('Aptify connector requires either CredentialID or Configuration JSON');
    }

    private async ParseConfigFromCredential(
        credentialID: string,
        contextUser?: UserInfo,
    ): Promise<AptifyConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        const values = JSON.parse(credential.Values) as Record<string, string>;
        return this.ExtractConfig(values);
    }

    private ExtractConfig(values: Record<string, string>): AptifyConnectionConfig {
        const get = (...keys: string[]): string | undefined => {
            for (const key of keys) {
                const hit = Object.entries(values).find(([k]) => k.toLowerCase() === key.toLowerCase());
                if (hit) return String(hit[1] ?? '');
            }
            return undefined;
        };

        const baseURL = get('BaseURL', 'BaseUrl', 'base_url');
        const username = get('Username', 'username', 'user');
        const password = get('Password', 'password', 'pass');
        if (!baseURL) throw new Error('Aptify configuration missing required field: BaseURL');
        if (!username) throw new Error('Aptify configuration missing required field: Username');
        if (!password) throw new Error('Aptify configuration missing required field: Password');

        return {
            BaseURL: this.StripTrailingSlash(baseURL),
            Username: username,
            Password: password,
            AuthProvider: get('AuthProvider', 'authProvider', 'auth_provider'),
        };
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
        const candidates = ['Id', 'ID', 'id'];
        for (const key of candidates) {
            const value = body[key];
            if (value !== undefined && value !== null) return String(value);
        }
        return '';
    }

    private StripTrailingSlash(url: string): string {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const body = response.Body;
        let detail: string;
        if (typeof body === 'string') {
            detail = body.slice(0, 500);
        } else if (body && typeof body === 'object') {
            const asRecord = body as Record<string, unknown>;
            const message = asRecord['Message'] ?? asRecord['error'] ?? asRecord['error_description'];
            detail = message !== undefined ? String(message) : JSON.stringify(body).slice(0, 500);
        } else {
            detail = `HTTP ${response.Status}`;
        }
        return {
            Success: false,
            ErrorMessage: `Aptify ${operation} failed on ${objectName}: ${detail}`,
            StatusCode: response.Status,
        };
    }
}

/** Tree-shaking prevention — import and call from module entry point. */
export function LoadAptifyConnector(): void { /* intentional no-op */ }
