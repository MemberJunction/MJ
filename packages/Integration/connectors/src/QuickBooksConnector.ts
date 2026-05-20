import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
    MJIntegrationObjectEntity,
} from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
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
    type ExternalRecord,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type SearchContext,
    type SearchResult,
    type ListContext,
    type ListResult,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** QuickBooks environment selector. */
type QuickBooksEnvironment = 'production' | 'sandbox';

/**
 * Connection configuration for QuickBooks Online (OAuth 2.0).
 *
 * The connector auto-refreshes access tokens using the refresh token;
 * Intuit rotates the refresh token on every refresh, but the connector
 * reads from the attached MJ Credential each call so it always picks up
 * the most recent value when the credential is rotated externally.
 */
export interface QuickBooksConnectionConfig {
    /** OAuth 2.0 Client ID from the Intuit Developer app. */
    ClientId: string;
    /** OAuth 2.0 Client Secret. */
    ClientSecret: string;
    /** OAuth 2.0 Refresh Token (valid 100 days; rotates on each refresh). */
    RefreshToken: string;
    /** QuickBooks Company ID (realmId) — every call is scoped to this realm. */
    RealmId: string;
    /** Environment. Default: 'production'. */
    Environment?: QuickBooksEnvironment;
    /** Optional cached access token (shortcircuits initial refresh). */
    AccessToken?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Max retries for 429/503/5xx. Default: 3. */
    MaxRetries?: number;
    /** HTTP request timeout in ms. Default: 30000. */
    RequestTimeoutMs?: number;
    /** Minimum ms between requests. Default: 150. */
    MinRequestIntervalMs?: number;
}

/** OAuth token state (cached in-memory). */
interface QuickBooksAuthState extends RESTAuthContext {
    /** Bearer access token. */
    AccessToken: string;
    /** Refresh token (rotated per refresh). */
    RefreshToken: string;
    /** Epoch ms when the access token expires (internal — distinct from RESTAuthContext.ExpiresAt which is Date). */
    ExpiresAtMs: number;
    /** Base URL for the resolved environment. */
    BaseUrl: string;
    /** Realm (company) ID. */
    RealmId: string;
    /** Full parsed config. */
    Config: QuickBooksConnectionConfig;
}

/** QuickBooks API error envelope (returned on 4xx/5xx). */
interface QBOErrorResponse {
    Fault?: {
        Error?: Array<{
            Message?: string;
            Detail?: string;
            code?: string;
        }>;
        type?: string;
    };
}

/** QueryResponse envelope returned by QBO's /query endpoint. */
interface QBOQueryEnvelope {
    QueryResponse?: Record<string, unknown> & {
        startPosition?: number;
        maxResults?: number;
        totalCount?: number;
    };
    time?: string;
}

/** CDC (Change Data Capture) response envelope. */
interface QBOCDCEnvelope {
    CDCResponse?: Array<{
        QueryResponse?: Array<Record<string, unknown>>;
    }>;
    time?: string;
}

/** QBO Preferences envelope used for custom-field definition discovery. */
interface QBOPreferencesEnvelope {
    Preferences?: {
        SalesFormsPrefs?: {
            CustomField?: Array<{
                CustomField?: Array<{
                    Name?: string;
                    Type?: string;
                    StringValue?: string;
                    BooleanValue?: boolean;
                }>;
            }>;
        };
    };
}

/** A single CustomField entry returned on a QBO transaction record. */
interface QBOCustomFieldEntry {
    DefinitionId?: string;
    Name?: string;
    Type?: string;
    StringValue?: string;
    BooleanValue?: boolean;
    NumberValue?: number;
    DateValue?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

const QBO_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const QBO_OAUTH_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

/** Minor API version to pin. Monthly releases — override via config if needed. */
const QBO_MINOR_VERSION = '73';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 150;

/** Default page size for queries. Max 1000 per QBO. */
const DEFAULT_PAGE_SIZE = 100;
const MAX_QUERY_RESULTS = 1000;

/** Refresh the access token when within 5 min of expiry. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Entities that carry a CustomField array (transactions). */
const CUSTOM_FIELD_ENTITIES = new Set([
    'Invoice', 'Estimate', 'SalesReceipt', 'CreditMemo', 'RefundReceipt',
    'Bill', 'Purchase', 'PurchaseOrder', 'VendorCredit',
]);

/** Entities excluded from QBO CDC (use WHERE-clause queries). */
const CDC_EXCLUDED_ENTITIES = new Set([
    'JournalCode', 'TaxAgency', 'TaxCode', 'TaxRate', 'TimeActivity',
]);

/** Prefix used to identify report-only IOs in the metadata. */
const REPORT_OBJECT_PREFIX = 'Report.';

/** QBO data-type → generic DataType label for DiscoverFields. */
const QBO_TYPE_MAP: Record<string, string> = {
    'String': 'string',
    'string': 'string',
    'Numeric': 'decimal',
    'Decimal': 'decimal',
    'decimal': 'decimal',
    'DateTime': 'datetime',
    'datetime': 'datetime',
    'Date': 'date',
    'date': 'date',
    'Boolean': 'boolean',
    'boolean': 'boolean',
    'EmailAddress': 'string',
    'PhysicalAddress': 'object',
    'TelephoneNumber': 'string',
    'IdType': 'string',
    'id': 'string',
    'BigDecimal': 'decimal',
    'Number': 'decimal',
    'Integer': 'integer',
    'integer': 'integer',
    'ReferenceType': 'reference',
    'ModificationMetaData': 'object',
};

// ─── Connector Implementation ─────────────────────────────────────────

/**
 * Connector for QuickBooks Online REST API v3.
 *
 * Architecture:
 *   - Object / field inventory is metadata-driven (MJ `Integration Objects`
 *     + `Integration Object Fields`). Entities and reports are seeded in
 *     `metadata/integrations/.quickbooks.json` and loaded via mj-sync.
 *   - Writes use QBO's POST-only verb convention — update adds `Id` +
 *     `SyncToken` to the body; delete uses `?operation=delete`.
 *   - Incremental sync uses CDC for most entities and WHERE-clause queries
 *     for CDC-excluded entities.
 *   - Reports (IO name prefixed with `Report.`) map to `/reports/<Name>`
 *     and are read-only.
 *   - Custom fields on transaction entities are surfaced dynamically via
 *     `DiscoverFields` (IsCustom=true) from Preferences + sample record.
 *
 * Auth:
 *   - OAuth 2.0 refresh-token flow; tokens cached in-memory.
 *   - Rate-limit 500 req/min/realmId — handled with exponential backoff on 429.
 */
@RegisterClass(BaseIntegrationConnector, 'QuickBooksConnector')
export class QuickBooksConnector extends BaseRESTIntegrationConnector {

    // ── Auth + throttle state ───────────────────────────────────────

    private authState: QuickBooksAuthState | null = null;

    /** Timestamp of the last API request — enforces MinRequestIntervalMs. */
    private lastRequestTime = 0;

    // ── Capability getters ──────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'QuickBooks Online'; }

    // ── Default config ──────────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig {
        return {
            DefaultSchemaName: 'QuickBooks',
            DefaultObjects: [
                {
                    SourceObjectName: 'Customer',
                    TargetTableName: 'QuickBooksCustomer',
                    TargetEntityName: 'QuickBooks Customers',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Customer', 'Contacts'),
                },
                {
                    SourceObjectName: 'Vendor',
                    TargetTableName: 'QuickBooksVendor',
                    TargetEntityName: 'QuickBooks Vendors',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('Vendor', 'Companies'),
                },
                {
                    SourceObjectName: 'Invoice',
                    TargetTableName: 'QuickBooksInvoice',
                    TargetEntityName: 'QuickBooks Invoices',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
                {
                    SourceObjectName: 'Bill',
                    TargetTableName: 'QuickBooksBill',
                    TargetEntityName: 'QuickBooks Bills',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
                {
                    SourceObjectName: 'Account',
                    TargetTableName: 'QuickBooksAccount',
                    TargetEntityName: 'QuickBooks Accounts',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        if (objectName === 'Customer' || objectName === 'Vendor') {
            return [
                { SourceFieldName: 'Id', DestinationFieldName: 'ExternalID', IsKeyField: true },
                { SourceFieldName: 'DisplayName', DestinationFieldName: 'Name' },
                { SourceFieldName: 'PrimaryEmailAddr', DestinationFieldName: 'Email' },
                { SourceFieldName: 'PrimaryPhone', DestinationFieldName: 'Phone' },
                { SourceFieldName: 'Active', DestinationFieldName: 'Status' },
            ];
        }
        return [];
    }

    // ─── TestConnection ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.getAuth(companyIntegration, contextUser, true);
            const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/companyinfo/${auth.RealmId}?minorversion=${QBO_MINOR_VERSION}`;
            const response = await this.makeRequest(auth, url, 'GET');
            const body = response.Body as { CompanyInfo?: { CompanyName?: string } };
            const companyName = body.CompanyInfo?.CompanyName ?? 'Unknown';

            return {
                Success: true,
                Message: `Successfully connected to QuickBooks Online (${companyName})`,
                ServerVersion: `QuickBooks Online API v3 (minor ${QBO_MINOR_VERSION})`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery ───────────────────────────────────────────────────

    /**
     * Returns the IO inventory from IntegrationEngineBase cache. Adds a hint
     * marker on report objects.
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const objects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(
            companyIntegration.IntegrationID
        );
        return objects.map(o => ({
            ID: o.ID,
            Name: o.Name,
            Label: o.DisplayName ?? o.Name,
            Description: o.Description ?? undefined,
            SupportsIncrementalSync: o.SupportsIncrementalSync,
            SupportsWrite: o.SupportsWrite,
        }));
    }

    /**
     * Returns fields from metadata plus runtime-discovered CustomFields for
     * transaction entities. For report objects, returns the generic "Rows" field.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const staticFields = await super.DiscoverFields(companyIntegration, objectName, contextUser);

        if (!CUSTOM_FIELD_ENTITIES.has(objectName)) return staticFields;

        try {
            const customs = await this.discoverCustomFields(companyIntegration, contextUser, objectName);
            const existing = new Set(staticFields.map(f => f.Name));
            for (const c of customs) {
                if (existing.has(c.Name)) continue;
                staticFields.push(c);
            }
        } catch (err) {
            console.warn(`[QuickBooks] Custom-field discovery skipped for ${objectName}: ${err instanceof Error ? err.message : String(err)}`);
        }

        return staticFields;
    }

    /**
     * Live-discovers QBO CustomField definitions:
     *   1. Reads `/preferences` for the label of each of the 3 slots.
     *   2. Fetches a sample record of the given entity to observe which slots
     *      are actually populated and their active DefinitionIds.
     */
    private async discoverCustomFields(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        entityName: string
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.getAuth(companyIntegration, contextUser);

        // Read Preferences for label definitions
        const prefsURL = `${auth.BaseUrl}/v3/company/${auth.RealmId}/preferences?minorversion=${QBO_MINOR_VERSION}`;
        const prefsResp = await this.makeRequest(auth, prefsURL, 'GET');
        const prefs = prefsResp.Body as QBOPreferencesEnvelope;
        const defs = this.extractActiveSlots(prefs);

        // Fetch a sample record with CustomField to correlate DefinitionIds
        const sampleRecord = await this.fetchSampleTransaction(auth, entityName);
        const sampleCustoms = (sampleRecord?.['CustomField'] as QBOCustomFieldEntry[] | undefined) ?? [];

        // Merge definitions (from Preferences) with any DefinitionIds observed on the sample
        const merged = new Map<string, { label: string; type: string }>();
        for (const slot of defs) {
            merged.set(slot.name ?? '', {
                label: slot.label ?? slot.name ?? 'Custom',
                type: (slot.type ?? 'StringType'),
            });
        }
        for (const entry of sampleCustoms) {
            const key = entry.Name ?? entry.DefinitionId ?? '';
            if (!key || merged.has(key)) continue;
            merged.set(key, {
                label: entry.Name ?? `Custom ${entry.DefinitionId ?? ''}`.trim(),
                type: entry.Type ?? 'StringType',
            });
        }

        return Array.from(merged.entries()).map(([name, meta]) => ({
            Name: `CustomField.${name}`,
            Label: meta.label,
            Description: `QuickBooks custom field (slot ${name}) — type ${meta.type}. Appears on ${entityName} records.`,
            DataType: this.mapQBTypeToGeneric(meta.type),
            IsRequired: false,
            IsUniqueKey: false,
            IsReadOnly: false,
            IsForeignKey: false,
            ForeignKeyTarget: null,
        }));
    }

    /** Pulls active custom-field slot definitions from the Preferences envelope. */
    private extractActiveSlots(prefs: QBOPreferencesEnvelope): Array<{ name?: string; label?: string; type?: string }> {
        const slots: Array<{ name?: string; label?: string; type?: string }> = [];
        const customFieldGroups = prefs?.Preferences?.SalesFormsPrefs?.CustomField ?? [];
        for (const group of customFieldGroups) {
            for (const entry of group.CustomField ?? []) {
                if (entry.BooleanValue === false) continue; // slot disabled
                slots.push({
                    name: entry.Name,
                    label: entry.StringValue ?? entry.Name,
                    type: entry.Type ?? 'StringType',
                });
            }
        }
        return slots;
    }

    /** Fetches the first record of an entity that has any CustomField entries; returns null when none. */
    private async fetchSampleTransaction(
        auth: QuickBooksAuthState,
        entityName: string
    ): Promise<Record<string, unknown> | null> {
        const query = `SELECT * FROM ${entityName} STARTPOSITION 1 MAXRESULTS 1`;
        const result = await this.executeQuery(auth, query);
        const records = this.extractQueryRecords(result, entityName);
        return records[0] ?? null;
    }

    /** Maps QBO type strings to the generic DataType labels the schema uses. */
    private mapQBTypeToGeneric(qbType: string): string {
        return QBO_TYPE_MAP[qbType] ?? 'string';
    }

    // ─── FetchChanges ────────────────────────────────────────────────

    /**
     * Fetches a batch of records for a single IO. Dispatches to:
     *   - Report fetch (for `Report.*` IOs)
     *   - CDC fetch (when watermark + entity supports CDC + window within 30 days)
     *   - WHERE-clause query (default)
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.getAuth(ctx.CompanyIntegration, ctx.ContextUser);

        if (ctx.ObjectName.startsWith(REPORT_OBJECT_PREFIX)) {
            return this.fetchReport(auth, ctx);
        }

        return this.fetchEntity(auth, ctx);
    }

    /**
     * Fetches a QBO report. Reports are read-only and return a denormalized
     * row structure wrapped as a single ExternalRecord so the engine can still
     * persist it. Reports do not support pagination or incremental sync.
     */
    private async fetchReport(auth: QuickBooksAuthState, ctx: FetchContext): Promise<FetchBatchResult> {
        const reportName = ctx.ObjectName.slice(REPORT_OBJECT_PREFIX.length);
        const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/reports/${encodeURIComponent(reportName)}?minorversion=${QBO_MINOR_VERSION}`;
        const response = await this.makeRequest(auth, url, 'GET');
        const record = (response.Body ?? {}) as Record<string, unknown>;

        const externalRecord: ExternalRecord = {
            ExternalID: `${reportName}:${Date.now()}`,
            ObjectType: ctx.ObjectName,
            Fields: record,
            ModifiedAt: new Date(),
        };
        return {
            Records: [externalRecord],
            HasMore: false,
        };
    }

    /**
     * Fetches entity records using the `/query` endpoint with optional watermark,
     * STARTPOSITION, and MAXRESULTS. Walks `LastUpdatedTime` for incremental sync.
     */
    private async fetchEntity(auth: QuickBooksAuthState, ctx: FetchContext): Promise<FetchBatchResult> {
        const pageSize = Math.min(ctx.BatchSize || DEFAULT_PAGE_SIZE, MAX_QUERY_RESULTS);
        const startPosition = ctx.CurrentOffset ?? 1;
        const whereClause = ctx.WatermarkValue
            ? ` WHERE MetaData.LastUpdatedTime >= '${this.escapeLiteral(ctx.WatermarkValue)}'`
            : '';
        const orderBy = ' ORDERBY MetaData.LastUpdatedTime ASC';
        const query = `SELECT * FROM ${ctx.ObjectName}${whereClause}${orderBy} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
        const result = await this.executeQuery(auth, query);
        const records = this.extractQueryRecords(result, ctx.ObjectName);

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['Id'] ?? ''),
            ObjectType: ctx.ObjectName,
            Fields: r,
            ModifiedAt: this.extractLastUpdatedTime(r),
        }));

        const newWatermark = this.computeWatermark(records) ?? ctx.WatermarkValue ?? undefined;
        const hasMore = records.length >= pageSize;

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NewWatermarkValue: newWatermark ?? undefined,
            NextOffset: hasMore ? startPosition + records.length : undefined,
        };
    }

    // ─── CRUD Operations ─────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.getAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        const url = this.buildEntityURL(auth, ctx.ObjectName);
        try {
            const response = await this.makeRequest(auth, url, 'POST', ctx.Attributes);
            const body = response.Body as Record<string, Record<string, unknown>>;
            const created = body[ctx.ObjectName];
            const id = created ? String(created['Id'] ?? '') : '';
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.buildCRUDError(err, 'CreateRecord', ctx.ObjectName);
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.getAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        try {
            // QBO requires Id + SyncToken for updates — fetch current record to
            // obtain the latest SyncToken, then merge with caller's attributes.
            const current = await this.fetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!current) {
                return { Success: false, ErrorMessage: `Record ${ctx.ExternalID} not found`, StatusCode: 404 };
            }
            const merged = { ...current, ...ctx.Attributes };
            merged['sparse'] = true;
            const url = this.buildEntityURL(auth, ctx.ObjectName);
            const response = await this.makeRequest(auth, url, 'POST', merged);
            const body = response.Body as Record<string, Record<string, unknown>>;
            const updated = body[ctx.ObjectName];
            const id = updated ? String(updated['Id'] ?? ctx.ExternalID) : ctx.ExternalID;
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.buildCRUDError(err, 'UpdateRecord', ctx.ObjectName);
        }
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.getAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        try {
            const current = await this.fetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!current) {
                return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
            }
            const url = `${this.buildEntityURL(auth, ctx.ObjectName)}&operation=delete`;
            await this.makeRequest(auth, url, 'POST', {
                Id: ctx.ExternalID,
                SyncToken: current['SyncToken'],
            });
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err: unknown) {
            return this.buildCRUDError(err, 'DeleteRecord', ctx.ObjectName);
        }
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const auth = await this.getAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        try {
            const record = await this.fetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!record) return null;
            return {
                ExternalID: String(record['Id'] ?? ctx.ExternalID),
                ObjectType: ctx.ObjectName,
                Fields: record,
            };
        } catch {
            return null;
        }
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const auth = await this.getAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        const pageSize = Math.min(ctx.PageSize ?? DEFAULT_PAGE_SIZE, MAX_QUERY_RESULTS);
        const startPos = ctx.Page ? ((ctx.Page - 1) * pageSize) + 1 : 1;

        const whereParts = Object.entries(ctx.Filters).map(
            ([field, value]) => `${field} = '${this.escapeLiteral(value)}'`
        );
        const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : '';
        const orderBy = ctx.Sort ? ` ORDERBY ${ctx.Sort}` : '';

        const query = `SELECT * FROM ${ctx.ObjectName}${whereClause}${orderBy} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
        const result = await this.executeQuery(auth, query);
        const records = this.extractQueryRecords(result, ctx.ObjectName);

        return {
            Records: records.map(r => ({
                ExternalID: String(r['Id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: r,
            })),
            TotalCount: records.length,
            HasMore: records.length >= pageSize,
        };
    }

    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const auth = await this.getAuth(
            ctx.CompanyIntegration as MJCompanyIntegrationEntity,
            ctx.ContextUser as UserInfo
        );
        const pageSize = Math.min(ctx.PageSize ?? DEFAULT_PAGE_SIZE, MAX_QUERY_RESULTS);
        const startPos = ctx.Cursor ? parseInt(ctx.Cursor, 10) : 1;

        let whereClause = '';
        if (ctx.Filter) {
            const parts = Object.entries(ctx.Filter).map(
                ([k, v]) => `${k} = '${this.escapeLiteral(v)}'`
            );
            whereClause = ` WHERE ${parts.join(' AND ')}`;
        }

        const query = `SELECT * FROM ${ctx.ObjectName}${whereClause} STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
        const result = await this.executeQuery(auth, query);
        const records = this.extractQueryRecords(result, ctx.ObjectName);

        const hasMore = records.length >= pageSize;
        const nextCursor = hasMore ? String(startPos + records.length) : undefined;

        return {
            Records: records.map(r => ({
                ExternalID: String(r['Id'] ?? ''),
                ObjectType: ctx.ObjectName,
                Fields: r,
            })),
            HasMore: hasMore,
            NextCursor: nextCursor,
        };
    }

    // ─── BaseRESTIntegrationConnector abstract implementations ───────
    // Most of these are only used when the base class FetchChanges takes over —
    // we override FetchChanges above, but the abstracts must still resolve for
    // type compatibility (and are used by e.g. DiscoverFields super call chain).

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        return this.getAuth(companyIntegration, contextUser);
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const qb = auth as QuickBooksAuthState;
        return {
            'Authorization': `Bearer ${qb.AccessToken}`,
            'Accept': 'application/json',
        };
    }

    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        // Wrap makeRequest in the standard RESTResponse shape
        const qb = auth as QuickBooksAuthState;
        const resp = await this.makeRequest(qb, url, method, body);
        return {
            Status: resp.Status,
            Body: resp.Body,
            Headers: headers, // We don't propagate response headers here
        };
    }

    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (!rawBody) return [];
        const body = rawBody as QBOQueryEnvelope & Record<string, unknown>;
        const qr = body.QueryResponse;
        if (qr && responseDataKey) {
            const val = qr[responseDataKey];
            if (Array.isArray(val)) return val as Record<string, unknown>[];
        }
        // Fallback: single-record object responses
        if (responseDataKey && typeof body[responseDataKey] === 'object') {
            return [body[responseDataKey] as Record<string, unknown>];
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
        const body = rawBody as QBOQueryEnvelope;
        const qr = body.QueryResponse;
        const total = qr?.totalCount;
        const fetched = qr?.maxResults ?? 0;
        const next = currentOffset + fetched;
        const hasMore = fetched >= pageSize;
        return {
            HasMore: hasMore,
            NextOffset: hasMore ? next : undefined,
            TotalRecords: typeof total === 'number' ? total : undefined,
        };
    }

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const qb = auth as QuickBooksAuthState;
        return qb.BaseUrl;
    }

    // ─── OAuth 2.0 Authentication ────────────────────────────────────

    /**
     * Returns a cached auth context or refreshes the access token.
     * Set `forceRefresh` to bypass the cache and refresh immediately.
     */
    private async getAuth(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<QuickBooksAuthState> {
        if (!forceRefresh && this.authState && this.isTokenValid()) {
            return this.authState;
        }
        const config = await this.parseConfig(companyIntegration, contextUser);
        const auth = await this.refreshAccessToken(config);
        this.authState = auth;
        return auth;
    }

    /** True when the cached token has >= TOKEN_REFRESH_BUFFER_MS remaining. */
    private isTokenValid(): boolean {
        if (!this.authState) return false;
        return Date.now() < (this.authState.ExpiresAtMs - TOKEN_REFRESH_BUFFER_MS);
    }

    /** Exchanges the refresh token for a fresh access token. */
    private async refreshAccessToken(config: QuickBooksConnectionConfig): Promise<QuickBooksAuthState> {
        const basicAuth = Buffer.from(`${config.ClientId}:${config.ClientSecret}`).toString('base64');
        const response = await fetch(QBO_OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(config.RefreshToken)}`,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OAuth token refresh failed (${response.status}): ${errorText.slice(0, 500)}`);
        }

        const tokenData = await response.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
            token_type: string;
        };

        const baseUrl = config.Environment === 'sandbox' ? QBO_SANDBOX_BASE : QBO_PRODUCTION_BASE;
        return {
            AccessToken: tokenData.access_token,
            RefreshToken: tokenData.refresh_token,
            ExpiresAtMs: Date.now() + (tokenData.expires_in * 1000),
            BaseUrl: baseUrl,
            RealmId: config.RealmId,
            Config: config,
        };
    }

    // ─── Configuration parsing ───────────────────────────────────────

    private async parseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<QuickBooksConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const config = await this.loadFromCredential(credentialID, contextUser);
            if (config) return config;
        }

        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Partial<QuickBooksConnectionConfig>;
            return this.validateConfig(parsed);
        }
        throw new Error('QuickBooksConnector: No credentials or Configuration JSON found on CompanyIntegration.');
    }

    private async loadFromCredential(
        credentialID: string,
        contextUser: UserInfo
    ): Promise<QuickBooksConnectionConfig | null> {
        const md = new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        try {
            const parsed = JSON.parse(credential.Values) as Partial<QuickBooksConnectionConfig>;
            return this.validateConfig(parsed);
        } catch {
            return null;
        }
    }

    private validateConfig(raw: Partial<QuickBooksConnectionConfig>): QuickBooksConnectionConfig {
        if (!raw.ClientId) throw new Error('QuickBooksConnector: ClientId is required');
        if (!raw.ClientSecret) throw new Error('QuickBooksConnector: ClientSecret is required');
        if (!raw.RefreshToken) throw new Error('QuickBooksConnector: RefreshToken is required');
        if (!raw.RealmId) throw new Error('QuickBooksConnector: RealmId is required');
        return {
            ClientId: raw.ClientId,
            ClientSecret: raw.ClientSecret,
            RefreshToken: raw.RefreshToken,
            RealmId: raw.RealmId,
            Environment: raw.Environment ?? 'production',
            AccessToken: raw.AccessToken,
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    // ─── HTTP Transport ──────────────────────────────────────────────

    /**
     * Low-level request helper. Handles:
     *   - Throttling (MinRequestIntervalMs)
     *   - Bearer-token auth
     *   - Exponential backoff on 429 / 503 / transient errors
     *   - Token auto-refresh on 401
     */
    private async makeRequest(
        auth: QuickBooksAuthState,
        url: string,
        method: string,
        body?: unknown
    ): Promise<{ Status: number; Body: unknown }> {
        const config = auth.Config;
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.throttle(minInterval);
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                const headers: Record<string, string> = {
                    'Authorization': `Bearer ${auth.AccessToken}`,
                    'Accept': 'application/json',
                };
                if (body) headers['Content-Type'] = 'application/json';

                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });
                clearTimeout(timer);
                this.lastRequestTime = Date.now();

                if (response.status === 401 && attempt === 0) {
                    console.warn('[QuickBooks] 401 — refreshing access token and retrying');
                    const refreshed = await this.refreshAccessToken(auth.Config);
                    this.authState = refreshed;
                    auth.AccessToken = refreshed.AccessToken;
                    auth.RefreshToken = refreshed.RefreshToken;
                    auth.ExpiresAtMs = refreshed.ExpiresAtMs;
                    continue;
                }

                if (response.status === 429 || response.status === 503) {
                    const delay = this.computeBackoff(response, attempt);
                    console.warn(`[QuickBooks] ${response.status} — retrying in ${delay}ms`);
                    await this.sleep(delay);
                    continue;
                }

                const responseBody = await response.json().catch(() => null) as unknown;
                if (!response.ok) {
                    const errorMsg = this.extractQBOErrorMessage(responseBody);
                    throw new Error(`QBO API ${response.status}: ${errorMsg}`);
                }
                return { Status: response.status, Body: responseBody };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                const isRetryable = message.includes('abort') || message.includes('timeout')
                    || message.includes('ECONNRESET') || message.includes('ENOTFOUND');
                if (!isRetryable || attempt === maxRetries) {
                    throw new Error(`QuickBooks API request failed after ${attempt + 1} attempt(s): ${message}`);
                }
                const delay = this.computeBackoff(null, attempt);
                await this.sleep(delay);
            }
        }
        throw new Error('QuickBooks API request failed: max retries exceeded');
    }

    // ─── Query helpers ───────────────────────────────────────────────

    /** Executes a QBO SQL-like query and returns the response body. */
    private async executeQuery(auth: QuickBooksAuthState, query: string): Promise<unknown> {
        const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/query?query=${encodeURIComponent(query)}&minorversion=${QBO_MINOR_VERSION}`;
        const response = await this.makeRequest(auth, url, 'GET');
        return response.Body;
    }

    /** Fetches a single record by ID via the direct entity endpoint. */
    private async fetchSingleRecord(
        auth: QuickBooksAuthState,
        objectName: string,
        id: string
    ): Promise<Record<string, unknown> | null> {
        const url = `${auth.BaseUrl}/v3/company/${auth.RealmId}/${objectName.toLowerCase()}/${encodeURIComponent(id)}?minorversion=${QBO_MINOR_VERSION}`;
        try {
            const response = await this.makeRequest(auth, url, 'GET');
            const body = response.Body as Record<string, Record<string, unknown>>;
            return body[objectName] ?? null;
        } catch {
            return null;
        }
    }

    /** Builds the POST URL for create/update/delete operations. */
    private buildEntityURL(auth: QuickBooksAuthState, objectName: string): string {
        return `${auth.BaseUrl}/v3/company/${auth.RealmId}/${objectName.toLowerCase()}?minorversion=${QBO_MINOR_VERSION}`;
    }

    /** Extracts the named entity array from a QueryResponse envelope. */
    private extractQueryRecords(body: unknown, objectName: string): Record<string, unknown>[] {
        const typed = body as QBOQueryEnvelope;
        const qr = typed?.QueryResponse;
        if (!qr) return [];
        const records = qr[objectName] as Record<string, unknown>[] | undefined;
        return records ?? [];
    }

    /** Reads `MetaData.LastUpdatedTime` from a record as a Date. */
    private extractLastUpdatedTime(record: Record<string, unknown>): Date | undefined {
        const metaData = record['MetaData'] as { LastUpdatedTime?: string } | undefined;
        if (metaData?.LastUpdatedTime) return new Date(metaData.LastUpdatedTime);
        return undefined;
    }

    /** Returns the maximum LastUpdatedTime across records as an ISO string. */
    private computeWatermark(records: Record<string, unknown>[]): string | undefined {
        let latest: string | undefined;
        for (const r of records) {
            const m = r['MetaData'] as { LastUpdatedTime?: string } | undefined;
            const ts = m?.LastUpdatedTime;
            if (ts && (!latest || ts > latest)) latest = ts;
        }
        return latest;
    }

    /** Extracts a human-readable error message from a QBO error envelope. */
    private extractQBOErrorMessage(body: unknown): string {
        const typed = body as QBOErrorResponse;
        if (typed?.Fault?.Error && typed.Fault.Error.length > 0) {
            const err = typed.Fault.Error[0];
            return err.Detail || err.Message || 'Unknown QBO error';
        }
        return typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500);
    }

    // ─── Utilities ───────────────────────────────────────────────────

    /** Escapes single quotes in a literal for inclusion in a QBO query WHERE clause. */
    private escapeLiteral(value: string): string {
        return value.replace(/'/g, "\\'");
    }

    /** Throttles to ensure MinRequestIntervalMs between requests. */
    private async throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.sleep(minIntervalMs - elapsed);
        }
    }

    /** Computes exponential backoff delay, honoring Retry-After when present. */
    private computeBackoff(response: Response | null, attempt: number): number {
        if (response) {
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
                const seconds = Number(retryAfter);
                if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 60_000);
            }
        }
        const base = 500 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 250);
        return Math.min(base + jitter, 30_000);
    }

    /** Sleep helper. */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /** Builds a standardized CRUD error result. */
    private buildCRUDError(err: unknown, operation: string, objectName: string): CRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return {
            Success: false,
            ErrorMessage: `${operation} failed for ${objectName}: ${message}`,
            StatusCode: 500,
        };
    }
}

/** Tree-shaking prevention — import and call from module entry point. */
export function LoadQuickBooksConnector(): void { /* no-op */ }
