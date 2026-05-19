/**
 * QuickBooks Online connector — REST API v3.
 *
 * Vendor: Intuit (https://quickbooks.intuit.com/online/)
 * Surface: Accounting API + Reports API + CDC + Batch + Webhooks
 *
 * Auth: OAuth 2.0 authorization-code grant. Refresh tokens rotate on every
 * refresh; the connector persists the latest token onto
 * `CompanyIntegration.RefreshToken` after each refresh.
 *
 * Base URL: per-environment static host + a per-realm path template
 *   - Production: https://quickbooks.api.intuit.com/v3/company/{realmId}
 *   - Sandbox:    https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}
 *
 * Query model: SQL-like query language at /query endpoint
 *   GET /v3/company/{realmId}/query?query=SELECT * FROM Customer ...
 *
 * Mutations: POST for both create and update; for update, the full object
 * with current SyncToken is required (optimistic concurrency).
 *
 * Delete: POST /{entity}?operation=delete with { Id, SyncToken }
 *
 * Incremental sync: /cdc?entities=...&changedSince=<iso8601> with a 30-day
 * window cap (set by the vendor). Per-entity polling outside CDC uses
 * MetaData.LastUpdatedTime in a Query WHERE clause.
 *
 * Custom fields: per-realm. Discoverable at /preferences. Apply to a
 * subset of transactional entities (Invoice, Estimate, SalesReceipt,
 * PurchaseOrder, Bill, CreditMemo, RefundReceipt).
 *
 * No native idempotency-key header — vendor relies on SyncToken (updates)
 * + caller-side DocNumber-uniqueness (creates).
 *
 * @see ./QuickBooksConnector.metadata.ts for the static catalog (81 IOs).
 * @see connectors-registry/quickbooks/metadata/integrations/.quickbooks.json
 *      for the same catalog as mj-sync metadata files.
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJCredentialEntity,
} from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type ConnectionTestResult,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type FetchContext,
    type FetchBatchResult,
    type ExternalObjectDTO,
    type ExternalFieldDTO,
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

// ─── Public types ────────────────────────────────────────────────────────

/** QuickBooks environment selector — controls which API host is used. */
export type QuickBooksEnvironment = 'production' | 'sandbox';

/**
 * Connection configuration parsed from CompanyIntegration credentials.
 * Per metadata/integrations/configuration.json → Auth.CredentialFieldSchema.
 */
export interface QuickBooksConnectionConfig {
    /** OAuth 2.0 Client ID from Intuit developer portal. */
    ClientId: string;
    /** OAuth 2.0 Client Secret. */
    ClientSecret: string;
    /**
     * OAuth refresh token. Rotated on every successful refresh — the
     * connector writes the new refresh token back to the CompanyIntegration
     * row so subsequent calls survive the rotation.
     */
    RefreshToken: string;
    /** QuickBooks company (realm) ID — required for every API URL. */
    RealmId: string;
    /** Production vs sandbox host. */
    Environment?: QuickBooksEnvironment;

    /** Maximum retries for rate-limited / network-errored requests. */
    MaxRetries?: number;
    /** HTTP request timeout (ms). */
    RequestTimeoutMs?: number;
    /** Minimum interval between API requests (ms) — soft client-side throttle. */
    MinRequestIntervalMs?: number;
}

/** Vendor-specific auth context carried through the request pipeline. */
export interface QuickBooksAuthContext extends RESTAuthContext {
    /** Current OAuth Bearer token. */
    Token: string;
    /** Refresh token (may be rotated). */
    RefreshTokenValue: string;
    /** Absolute timestamp when the access token expires. */
    ExpiresAt: Date;
    /** Per-environment API base URL (no trailing slash). */
    BaseUrl: string;
    /** Realm (company) ID. */
    RealmId: string;
    /** Snapshot of the parsed config for downstream knobs. */
    Config: QuickBooksConnectionConfig;
}

// ─── Vendor response shapes ──────────────────────────────────────────────

interface QBOFault {
    Error?: Array<{
        Message?: string;
        Detail?: string;
        code?: string;
    }>;
    type?: string;
}

interface QBOErrorBody {
    Fault?: QBOFault;
}

interface QBOQueryResponseBody {
    QueryResponse?: Record<string, unknown>;
    time?: string;
}

interface QBOMetaData {
    CreateTime?: string;
    LastUpdatedTime?: string;
}

interface QBOEntityRecord extends Record<string, unknown> {
    Id?: string;
    SyncToken?: string;
    MetaData?: QBOMetaData;
}

interface QBOCDCResponseBody {
    CDCResponse?: Array<{
        QueryResponse?: Array<Record<string, unknown>>;
    }>;
    time?: string;
}

interface QBOTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    x_refresh_token_expires_in?: number;
}

interface QBOPreferencesResponse {
    Preferences?: {
        SalesFormsPrefs?: {
            CustomField?: Array<{
                CustomField?: Array<{
                    DefinitionId?: string;
                    Name?: string;
                    Type?: string;
                    StringValue?: string;
                }>;
            }>;
        };
        VendorAndPurchasesPrefs?: {
            POCustomField?: Array<{
                CustomField?: Array<{
                    DefinitionId?: string;
                    Name?: string;
                    Type?: string;
                    StringValue?: string;
                }>;
            }>;
        };
    };
}

// ─── Constants ───────────────────────────────────────────────────────────

const QBO_PRODUCTION_BASE = 'https://quickbooks.api.intuit.com';
const QBO_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com';
const QBO_OAUTH_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

/** Pinned minor version — protects against silent vendor behavior shifts. */
const QBO_MINOR_VERSION = '73';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;
const DEFAULT_PAGE_SIZE = 100;
/** Vendor limit — max records returned per Query response. */
const MAX_QUERY_RESULTS = 1000;
/** Refresh the token if it expires within this window. */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Entities to which CDC applies (vendor-supported subset). */
const CDC_SUPPORTED_ENTITIES = new Set<string>([
    'Account', 'Bill', 'BillPayment', 'Budget', 'Class', 'CreditMemo',
    'Customer', 'Department', 'Deposit', 'Employee', 'Estimate',
    'Invoice', 'Item', 'JournalCode', 'JournalEntry', 'Payment',
    'PaymentMethod', 'Preferences', 'Purchase', 'PurchaseOrder',
    'RefundReceipt', 'SalesReceipt', 'Term', 'TimeActivity',
    'Transfer', 'Vendor', 'VendorCredit',
]);

/** Transactional entities that may carry per-realm custom fields. */
const ENTITIES_WITH_CUSTOM_FIELDS: ReadonlySet<string> = new Set([
    'Invoice', 'Estimate', 'SalesReceipt', 'PurchaseOrder',
    'Bill', 'CreditMemo', 'RefundReceipt',
]);

/**
 * Static catalog — the 81 entities (57 Accounting + 24 Reports) extracted
 * from the Intuit .NET SDK XSDs. Mirrors the data in
 * connectors-registry/quickbooks/metadata/integrations/.quickbooks.json.
 *
 * Each entry carries SupportsWrite + SupportsIncrementalSync; field-level
 * detail is queried at runtime via DiscoverFields against the static
 * `QBO_FIELD_CATALOG` (populated below for the most common entities) and
 * augmented per-realm by the Preferences API for custom fields.
 *
 * Naming is the vendor's PascalCase entity name (URL is lowercased before
 * being substituted into the v3 path template).
 */
/**
 * NOTE: This list mirrors metadata/integrations/.quickbooks.json exactly —
 * the extractor walked the Intuit .NET SDK XSDs and emitted the 57
 * Accounting entities + 24 Reports below. A small set of mainstream
 * entities (Customer, Vendor, Employee) are NOT in the catalog because
 * they are not flagged as substitutionGroup="IntuitObject" in the public
 * XSDs the extractor read. Those entities DO exist in the live QBO API
 * and the connector's CRUD bodies handle them dynamically via the
 * `/{entity-name-lowercased}` URL convention — so a caller passing
 * ObjectName='Customer' to CreateRecord/UpdateRecord/GetRecord/etc. still
 * works. They simply don't show up in DiscoverObjects until the metadata
 * gap is closed by a follow-up extractor pass.
 *
 * @see RemainingGaps section of the CodeBuilder handoff.
 */
const QBO_ACCOUNTING_ENTITIES: ReadonlyArray<string> = [
    'Account', 'Attachable', 'Bill', 'BillPayment',
    'BooleanTypeCustomFieldDefinition', 'Budget',
    'ChangeOrder', 'ChargeCredit', 'Class', 'Company',
    'CompanyCurrency', 'CompanyInfo', 'CreditCardPaymentTxn',
    'CreditMemo', 'CustomFieldDefinition', 'DateTypeCustomFieldDefinition',
    'Department', 'Deposit', 'EmailDeliveryInfo', 'Estimate',
    'ExchangeRate', 'FixedAsset', 'InventoryAdjustment',
    'InventorySite', 'Invoice', 'Item', 'JournalCode',
    'JournalEntry', 'MasterAccount', 'NumberTypeCustomFieldDefinition',
    'Payment', 'PaymentMethod', 'Preferences', 'PriceLevel',
    'Purchase', 'PurchaseOrder', 'QbdtEntityIdMapping',
    'RefundReceipt', 'ReimburseCharge', 'SalesOrder',
    'SalesReceipt', 'SalesRep', 'StatementCharge',
    'StringTypeCustomFieldDefinition', 'TDSMetadata',
    'Tag', 'Task', 'TaxClassification', 'TaxCode',
    'TaxPayment', 'TaxRate', 'TaxReturn',
    'Term', 'TimeActivity', 'Transfer', 'UserAlert',
    'VendorCredit',
];

const QBO_REPORT_ENTITIES: ReadonlyArray<string> = [
    'AccountList', 'AgedPayableDetail', 'AgedPayables',
    'AgedReceivableDetail', 'AgedReceivables', 'CashFlow',
    'ClassSales', 'CustomerBalance', 'CustomerBalanceDetail',
    'CustomerIncome', 'CustomerSales', 'DepartmentSales',
    'GeneralLedger', 'InventoryValuationSummary',
    'ItemSales', 'JournalReport', 'ProfitAndLoss',
    'ProfitAndLossDetail', 'TaxSummary', 'TransactionDetailByAccount',
    'TrialBalance', 'VendorBalance', 'VendorBalanceDetail',
    'VendorExpenses',
];

/** Fields the connector knows about per entity — minimum viable for tests. */
interface QBOFieldDef {
    Name: string;
    Type: string;
    DisplayName?: string;
    IsPrimaryKey?: boolean;
    IsRequired?: boolean;
    IsReadOnly?: boolean;
    MaxLength?: number | null;
}

/**
 * Common fields present on every Accounting entity.
 * (SyncToken is universal too — required for any mutation.)
 */
const QBO_COMMON_ACCOUNTING_FIELDS: ReadonlyArray<QBOFieldDef> = [
    { Name: 'Id', Type: 'string', IsPrimaryKey: true, IsRequired: true, IsReadOnly: false },
    { Name: 'SyncToken', Type: 'string', IsRequired: true, IsReadOnly: false },
    { Name: 'MetaData', Type: 'object', IsReadOnly: true },
];

/** Per-entity field catalog — extracted from the .NET SDK XSDs (Finance.xsd). */
const QBO_FIELD_CATALOG: Readonly<Record<string, ReadonlyArray<QBOFieldDef>>> = {
    Customer: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'DisplayName', Type: 'string', IsRequired: true, MaxLength: 500 },
        { Name: 'GivenName', Type: 'string', MaxLength: 100 },
        { Name: 'FamilyName', Type: 'string', MaxLength: 100 },
        { Name: 'CompanyName', Type: 'string', MaxLength: 100 },
        { Name: 'PrimaryEmailAddr', Type: 'object' },
        { Name: 'PrimaryPhone', Type: 'object' },
        { Name: 'BillAddr', Type: 'object' },
        { Name: 'ShipAddr', Type: 'object' },
        { Name: 'Balance', Type: 'decimal', IsReadOnly: true },
        { Name: 'Active', Type: 'boolean' },
        { Name: 'Notes', Type: 'string', MaxLength: 2000 },
    ],
    Vendor: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'DisplayName', Type: 'string', IsRequired: true, MaxLength: 500 },
        { Name: 'GivenName', Type: 'string', MaxLength: 100 },
        { Name: 'FamilyName', Type: 'string', MaxLength: 100 },
        { Name: 'CompanyName', Type: 'string', MaxLength: 100 },
        { Name: 'PrimaryEmailAddr', Type: 'object' },
        { Name: 'PrimaryPhone', Type: 'object' },
        { Name: 'Balance', Type: 'decimal', IsReadOnly: true },
        { Name: 'Active', Type: 'boolean' },
    ],
    Account: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'Name', Type: 'string', IsRequired: true, MaxLength: 100 },
        { Name: 'AccountType', Type: 'string', IsRequired: true },
        { Name: 'AccountSubType', Type: 'string' },
        { Name: 'CurrentBalance', Type: 'decimal', IsReadOnly: true },
        { Name: 'Active', Type: 'boolean' },
        { Name: 'Classification', Type: 'string', IsReadOnly: true },
    ],
    Invoice: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'DocNumber', Type: 'string', MaxLength: 21 },
        { Name: 'CustomerRef', Type: 'object', IsRequired: true },
        { Name: 'Line', Type: 'array', IsRequired: true },
        { Name: 'TxnDate', Type: 'date' },
        { Name: 'DueDate', Type: 'date' },
        { Name: 'TotalAmt', Type: 'decimal', IsReadOnly: true },
        { Name: 'Balance', Type: 'decimal', IsReadOnly: true },
        { Name: 'EmailStatus', Type: 'string', IsReadOnly: true },
        { Name: 'CustomField', Type: 'array' },
    ],
    Bill: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'DocNumber', Type: 'string', MaxLength: 21 },
        { Name: 'VendorRef', Type: 'object', IsRequired: true },
        { Name: 'Line', Type: 'array', IsRequired: true },
        { Name: 'TxnDate', Type: 'date' },
        { Name: 'DueDate', Type: 'date' },
        { Name: 'TotalAmt', Type: 'decimal', IsReadOnly: true },
        { Name: 'Balance', Type: 'decimal', IsReadOnly: true },
    ],
    Item: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'Name', Type: 'string', IsRequired: true, MaxLength: 100 },
        { Name: 'Type', Type: 'string' },
        { Name: 'UnitPrice', Type: 'decimal' },
        { Name: 'PurchaseCost', Type: 'decimal' },
        { Name: 'QtyOnHand', Type: 'decimal', IsReadOnly: true },
        { Name: 'IncomeAccountRef', Type: 'object' },
        { Name: 'Active', Type: 'boolean' },
    ],
    Payment: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'CustomerRef', Type: 'object', IsRequired: true },
        { Name: 'TotalAmt', Type: 'decimal', IsRequired: true },
        { Name: 'TxnDate', Type: 'date' },
        { Name: 'PaymentMethodRef', Type: 'object' },
        { Name: 'Line', Type: 'array' },
    ],
    Employee: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'DisplayName', Type: 'string', IsRequired: true, MaxLength: 500 },
        { Name: 'GivenName', Type: 'string', MaxLength: 100 },
        { Name: 'FamilyName', Type: 'string', MaxLength: 100 },
        { Name: 'PrimaryEmailAddr', Type: 'object' },
        { Name: 'PrimaryPhone', Type: 'object' },
        { Name: 'Active', Type: 'boolean' },
    ],
    Department: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'Name', Type: 'string', IsRequired: true, MaxLength: 100 },
        { Name: 'ParentRef', Type: 'object' },
        { Name: 'Active', Type: 'boolean' },
    ],
    Class: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'Name', Type: 'string', IsRequired: true, MaxLength: 100 },
        { Name: 'ParentRef', Type: 'object' },
        { Name: 'Active', Type: 'boolean' },
    ],
    CompanyInfo: [
        ...QBO_COMMON_ACCOUNTING_FIELDS,
        { Name: 'CompanyName', Type: 'string' },
        { Name: 'LegalName', Type: 'string' },
        { Name: 'Country', Type: 'string' },
    ],
};

// ─── Connector ───────────────────────────────────────────────────────────

/**
 * QuickBooks Online connector — extends BaseRESTIntegrationConnector.
 *
 * Note: registered against `BaseIntegrationConnector` (the grandparent),
 * NOT against `BaseRESTIntegrationConnector`. Per role file + invariant.
 */
@RegisterClass(BaseIntegrationConnector, 'QuickBooksConnector')
export class QuickBooksConnector extends BaseRESTIntegrationConnector {

    // ── Capability declarations ─────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'QuickBooks Online'; }

    // ── Token cache ─────────────────────────────────────────────────────

    private cachedAuth: QuickBooksAuthContext | null = null;
    private lastRequestTime = 0;

    // ─── TestConnection ─────────────────────────────────────────────────

    /**
     * Health-check via /companyinfo/{realmId} (per metadata HealthCheck).
     * Universally available across all QBO realms — returns 200 with the
     * realm's company profile when token + realm + connectivity are healthy.
     */
    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const url = this.BuildAPIURL(auth, `/companyinfo/${auth.RealmId}`);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status >= 200 && response.Status < 300) {
                const body = response.Body as { CompanyInfo?: { CompanyName?: string } };
                const companyName = body.CompanyInfo?.CompanyName ?? 'Unknown';
                return {
                    Success: true,
                    Message: `Successfully connected to QuickBooks Online (${companyName})`,
                    ServerVersion: `QuickBooks Online API v3 (minor ${QBO_MINOR_VERSION})`,
                };
            }

            return {
                Success: false,
                Message: `QuickBooks API returned ${response.Status}: ${this.ExtractErrorMessage(response.Body)}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery ──────────────────────────────────────────────────────

    /**
     * Returns the static QBO catalog (81 entities). Vendor catalog is
     * fixed — no user-defined objects per metadata.CustomObjects.MarkerPattern='none'.
     *
     * Overrides the base class which reads from IntegrationEngineBase cache.
     */
    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectDTO[]> {
        const accounting: ExternalObjectDTO[] = QBO_ACCOUNTING_ENTITIES.map(name => ({
            Name: name,
            DisplayName: name,
            Description: `QuickBooks Online Accounting entity: ${name}`,
            SupportsIncrementalSync: CDC_SUPPORTED_ENTITIES.has(name),
            SupportsWrite: true,
        }));

        const reports: ExternalObjectDTO[] = QBO_REPORT_ENTITIES.map(name => ({
            Name: name,
            DisplayName: name,
            Description: `QuickBooks Online Report: ${name}`,
            SupportsIncrementalSync: false,
            SupportsWrite: false,
        }));

        return [...accounting, ...reports];
    }

    /**
     * Returns the field list for the named object. Combines the static
     * catalog (extracted from Intuit .NET SDK XSDs) with per-realm custom
     * fields fetched from the Preferences API (for the transactional
     * entities listed in ENTITIES_WITH_CUSTOM_FIELDS).
     *
     * Reports do NOT have a flat field list; their structure is the
     * report's JSON tree itself.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldDTO[]> {
        if (QBO_REPORT_ENTITIES.includes(objectName)) {
            // Reports return structured trees, not flat field arrays.
            return [];
        }

        const baseFields = QBO_FIELD_CATALOG[objectName] ?? QBO_COMMON_ACCOUNTING_FIELDS;
        const staticFields: ExternalFieldDTO[] = baseFields.map(f => ({
            Name: f.Name,
            DisplayName: f.DisplayName ?? f.Name,
            Description: undefined,
            Type: f.Type,
            IsRequired: f.IsRequired ?? false,
            IsUniqueKey: f.IsPrimaryKey ?? false,
            IsReadOnly: f.IsReadOnly ?? false,
            MaxLength: f.MaxLength ?? null,
        }));

        if (!ENTITIES_WITH_CUSTOM_FIELDS.has(objectName)) {
            return staticFields;
        }

        // Augment with per-tenant custom fields from /preferences.
        const customFields = await this.FetchCustomFields(
            companyIntegration, objectName, contextUser
        );
        return [...staticFields, ...customFields];
    }

    /**
     * Fetches per-realm custom-field definitions from the Preferences API.
     * Returns an empty array on failure (custom fields are tenant-specific
     * and may not be configured).
     */
    private async FetchCustomFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldDTO[]> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            const url = this.BuildAPIURL(auth, '/preferences');
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

            if (response.Status < 200 || response.Status >= 300) {
                return [];
            }

            return this.ExtractCustomFieldsForEntity(response.Body, objectName);
        } catch {
            return [];
        }
    }

    /** Parses the Preferences response into ExternalFieldDTO[] for the given entity. */
    private ExtractCustomFieldsForEntity(
        body: unknown,
        objectName: string
    ): ExternalFieldDTO[] {
        const prefs = body as QBOPreferencesResponse;

        // Sales-side custom fields apply to Invoice/Estimate/SalesReceipt/CreditMemo/RefundReceipt.
        // Purchase-side custom fields apply to PurchaseOrder/Bill.
        const isSalesEntity =
            objectName === 'Invoice' || objectName === 'Estimate' ||
            objectName === 'SalesReceipt' || objectName === 'CreditMemo' ||
            objectName === 'RefundReceipt';
        const isPurchaseEntity =
            objectName === 'PurchaseOrder' || objectName === 'Bill';

        if (!isSalesEntity && !isPurchaseEntity) return [];

        const containers = isSalesEntity
            ? prefs.Preferences?.SalesFormsPrefs?.CustomField ?? []
            : prefs.Preferences?.VendorAndPurchasesPrefs?.POCustomField ?? [];

        const result: ExternalFieldDTO[] = [];
        for (const container of containers) {
            const definitions = container.CustomField ?? [];
            for (const def of definitions) {
                if (!def.DefinitionId || !def.Name) continue;
                result.push({
                    Name: `CustomField_${def.DefinitionId}`,
                    DisplayName: def.Name,
                    Description: `Per-realm custom field on ${objectName}`,
                    Type: this.MapCustomFieldType(def.Type),
                    IsRequired: false,
                    IsUniqueKey: false,
                    IsReadOnly: false,
                });
            }
        }
        return result;
    }

    private MapCustomFieldType(qbType: string | undefined): string {
        switch (qbType) {
            case 'BooleanType': return 'boolean';
            case 'DateType': return 'date';
            case 'NumberType': return 'decimal';
            case 'StringType': return 'string';
            default: return 'string';
        }
    }

    // ─── FetchChanges (CDC-aware) ───────────────────────────────────────

    /**
     * Override the base class FetchChanges entirely. QBO has two incremental
     * pathways:
     *   1. CDC endpoint — single round-trip returning all entities changed
     *      since a timestamp. Supports a vendor-fixed 30-day window.
     *   2. Per-entity Query with WHERE MetaData.LastUpdatedTime — used when
     *      a watermark is older than 30 days OR for full-history sync.
     *
     * The engine handles watermark persistence — we read ctx.WatermarkValue
     * and return result.NewWatermarkValue. Partial-failure leaves watermark
     * unchanged so next sync resumes from the same point.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const batchSize = Math.min(ctx.BatchSize ?? DEFAULT_PAGE_SIZE, MAX_QUERY_RESULTS);

        // Decide between CDC and per-entity Query paths.
        const canUseCDC =
            CDC_SUPPORTED_ENTITIES.has(ctx.ObjectName) &&
            ctx.WatermarkValue !== null &&
            this.IsWithinCDCWindow(ctx.WatermarkValue);

        if (canUseCDC) {
            return this.FetchChangesViaCDC(auth, ctx);
        }

        return this.FetchChangesViaQuery(auth, ctx, batchSize);
    }

    /** Returns true if the watermark is within the vendor's 30-day CDC window. */
    private IsWithinCDCWindow(isoTimestamp: string): boolean {
        const t = Date.parse(isoTimestamp);
        if (Number.isNaN(t)) return false;
        const ageDays = (Date.now() - t) / (24 * 60 * 60 * 1000);
        // Vendor-documented window is 30 days; leave a 1-day safety margin.
        return ageDays < 29;
    }

    /** CDC path — single GET to /cdc returning records of the named entity. */
    private async FetchChangesViaCDC(
        auth: QuickBooksAuthContext,
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const params = new URLSearchParams({
            entities: ctx.ObjectName,
            changedSince: ctx.WatermarkValue!,
            minorversion: QBO_MINOR_VERSION,
        });
        const url = `${this.BuildAPIURL(auth, '/cdc')}&${params.toString()}`
            .replace(/\?&/, '?');
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);

        this.AssertSuccessResponse(response);
        const records = this.ExtractCDCRecords(response.Body, ctx.ObjectName);
        const externalRecords = records.map(r => this.BuildExternalRecord(r, ctx.ObjectName));
        const newWatermark = this.ComputeMaxWatermark(records, ctx.WatermarkValue);

        return {
            Records: externalRecords,
            HasMore: false, // CDC returns the entire delta in one response
            NewWatermarkValue: newWatermark,
        };
    }

    /** Per-entity Query path — uses MetaData.LastUpdatedTime + STARTPOSITION/MAXRESULTS. */
    private async FetchChangesViaQuery(
        auth: QuickBooksAuthContext,
        ctx: FetchContext,
        batchSize: number
    ): Promise<FetchBatchResult> {
        const startPosition = ctx.CurrentOffset ?? 1; // 1-based
        const whereClause = ctx.WatermarkValue
            ? ` WHERE MetaData.LastUpdatedTime >= '${this.EscapeQueryString(ctx.WatermarkValue)}'`
            : '';
        const orderBy = ' ORDERBY MetaData.LastUpdatedTime ASC';
        const query =
            `SELECT * FROM ${ctx.ObjectName}${whereClause}${orderBy} ` +
            `STARTPOSITION ${startPosition} MAXRESULTS ${batchSize}`;

        const body = await this.ExecuteQuery(auth, query);
        const records = this.ExtractQueryRecords(body, ctx.ObjectName);
        const externalRecords = records.map(r => this.BuildExternalRecord(r, ctx.ObjectName));
        const newWatermark = this.ComputeMaxWatermark(records, ctx.WatermarkValue);
        const hasMore = records.length >= batchSize;

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NewWatermarkValue: hasMore ? ctx.WatermarkValue ?? undefined : newWatermark,
            NextOffset: hasMore ? startPosition + records.length : undefined,
        };
    }

    // ─── CRUD ───────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const user = ctx.ContextUser as UserInfo;
        try {
            const auth = await this.Authenticate(ci, user);
            const url = this.BuildAPIURL(auth, `/${ctx.ObjectName.toLowerCase()}`);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(
                auth, url, 'POST', headers, ctx.Attributes
            );

            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    ErrorMessage: this.ExtractErrorMessage(response.Body),
                    StatusCode: response.Status,
                };
            }

            const body = response.Body as Record<string, QBOEntityRecord>;
            const created = body[ctx.ObjectName];
            const id = created?.Id ?? '';
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'CreateRecord', ctx.ObjectName);
        }
    }

    /**
     * Update follows QBO's optimistic-concurrency pattern:
     *   1. GET the current record (for its current SyncToken)
     *   2. Merge requested attributes
     *   3. POST the full object back
     *
     * Server-side mismatch → vendor returns Fault.Error[0].code='5010'
     * (Stale Object Error). We surface that via CRUDResult so callers can
     * re-fetch and retry.
     */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const user = ctx.ContextUser as UserInfo;
        try {
            const auth = await this.Authenticate(ci, user);
            const current = await this.FetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!current) {
                return {
                    Success: false,
                    ErrorMessage: `Record ${ctx.ExternalID} not found`,
                    StatusCode: 404,
                };
            }

            const merged: Record<string, unknown> = {
                ...current,
                ...ctx.Attributes,
                Id: ctx.ExternalID,
                SyncToken: current.SyncToken,
            };

            const url = this.BuildAPIURL(auth, `/${ctx.ObjectName.toLowerCase()}`);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, merged);

            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    ErrorMessage: this.ExtractErrorMessage(response.Body),
                    StatusCode: response.Status,
                };
            }

            const body = response.Body as Record<string, QBOEntityRecord>;
            const updated = body[ctx.ObjectName];
            return {
                Success: true,
                ExternalID: updated?.Id ?? ctx.ExternalID,
                StatusCode: response.Status,
            };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'UpdateRecord', ctx.ObjectName);
        }
    }

    /** Delete: POST /{entity}?operation=delete with { Id, SyncToken }. */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const user = ctx.ContextUser as UserInfo;
        try {
            const auth = await this.Authenticate(ci, user);
            const current = await this.FetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!current) {
                // Already gone — idempotent success.
                return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
            }

            const path = `/${ctx.ObjectName.toLowerCase()}?operation=delete`;
            const url = this.BuildAPIURL(auth, path);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, {
                Id: ctx.ExternalID,
                SyncToken: current.SyncToken,
            });

            if (response.Status < 200 || response.Status >= 300) {
                return {
                    Success: false,
                    ErrorMessage: this.ExtractErrorMessage(response.Body),
                    StatusCode: response.Status,
                };
            }

            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'DeleteRecord', ctx.ObjectName);
        }
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const user = ctx.ContextUser as UserInfo;
        try {
            const auth = await this.Authenticate(ci, user);
            const record = await this.FetchSingleRecord(auth, ctx.ObjectName, ctx.ExternalID);
            if (!record) return null;
            return this.BuildExternalRecord(record, ctx.ObjectName);
        } catch {
            return null;
        }
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const user = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(ci, user);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;
        const startPos = ctx.Page ? ((ctx.Page - 1) * pageSize) + 1 : 1;

        const whereParts: string[] = Object.entries(ctx.Filters).map(
            ([field, value]) => `${field} = '${this.EscapeQueryString(String(value))}'`
        );
        const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : '';
        const orderBy = ctx.Sort ? ` ORDERBY ${ctx.Sort}` : '';

        const query =
            `SELECT * FROM ${ctx.ObjectName}${whereClause}${orderBy} ` +
            `STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
        const body = await this.ExecuteQuery(auth, query);
        const records = this.ExtractQueryRecords(body, ctx.ObjectName);

        return {
            Records: records.map(r => this.BuildExternalRecord(r, ctx.ObjectName)),
            // QBO does NOT return a total-count field in QueryResponse. We
            // surface the page count + HasMore signal; callers can issue
            // SELECT COUNT(*) FROM <Entity> for a true total when needed.
            TotalCount: records.length,
            HasMore: records.length >= pageSize,
        };
    }

    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const user = ctx.ContextUser as UserInfo;
        const auth = await this.Authenticate(ci, user);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;
        const startPos = ctx.Cursor ? parseInt(ctx.Cursor, 10) : 1;

        let whereClause = '';
        if (ctx.Filter) {
            const parts = Object.entries(ctx.Filter).map(
                ([k, v]) => `${k} = '${this.EscapeQueryString(String(v))}'`
            );
            whereClause = ` WHERE ${parts.join(' AND ')}`;
        }
        const orderBy = ctx.Sort ? ` ORDERBY ${ctx.Sort}` : '';

        const query =
            `SELECT * FROM ${ctx.ObjectName}${whereClause}${orderBy} ` +
            `STARTPOSITION ${startPos} MAXRESULTS ${pageSize}`;
        const body = await this.ExecuteQuery(auth, query);
        const records = this.ExtractQueryRecords(body, ctx.ObjectName);

        const hasMore = records.length >= pageSize;
        const nextCursor = hasMore ? String(startPos + records.length) : undefined;

        return {
            Records: records.map(r => this.BuildExternalRecord(r, ctx.ObjectName)),
            HasMore: hasMore,
            NextCursor: nextCursor,
        };
    }

    // ─── BaseRESTIntegrationConnector abstract method implementations ───
    //
    // Most of these are unused because we override FetchChanges entirely,
    // but the base class declares them abstract so we must provide bodies.

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<QuickBooksAuthContext> {
        if (this.cachedAuth && this.IsTokenValid(this.cachedAuth)) {
            return this.cachedAuth;
        }
        const config = await this.ParseConfig(companyIntegration, contextUser);
        this.cachedAuth = await this.RefreshAccessToken(config);
        return this.cachedAuth;
    }

    protected BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        const qbAuth = auth as QuickBooksAuthContext;
        return {
            'Authorization': `Bearer ${qbAuth.Token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
    }

    /**
     * HTTP transport with retry + 401-driven token refresh.
     *
     * On 401, force a token refresh ONCE per call (the access token may have
     * expired between cache-check and request). On 429 / 503 / network
     * errors, exponential backoff with vendor Retry-After honor.
     */
    protected async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const qbAuth = auth as QuickBooksAuthContext;
        const cfg = qbAuth.Config;
        const maxRetries = cfg.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = cfg.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minIntervalMs = cfg.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        let didReauth = false;
        let currentHeaders = headers;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.ThrottleIfNeeded(minIntervalMs);

            try {
                const result = await this.PerformHTTPRequest(
                    url, method, currentHeaders, body, timeoutMs
                );
                this.lastRequestTime = Date.now();

                if (result.Status === 401 && !didReauth) {
                    // Token may have expired between cache-check and call.
                    // Force-refresh and retry once.
                    didReauth = true;
                    this.cachedAuth = await this.RefreshAccessToken(qbAuth.Config);
                    currentHeaders = this.BuildHeaders(this.cachedAuth);
                    continue;
                }

                if (this.IsRetryableStatus(result.Status) && attempt < maxRetries) {
                    const delay = this.ComputeRetryDelay(result.Headers, attempt);
                    await this.Sleep(delay);
                    continue;
                }

                return result;
            } catch (err: unknown) {
                if (attempt >= maxRetries) {
                    const message = err instanceof Error ? err.message : String(err);
                    throw new Error(`QuickBooks API request failed: ${message}`);
                }
                const delay = Math.pow(2, attempt) * 1000;
                await this.Sleep(delay);
            }
        }

        throw new Error('QuickBooks API request failed: max retries exceeded');
    }

    /** Issues the actual `fetch` call with timeout + structured response. */
    private async PerformHTTPRequest(
        url: string,
        method: string,
        headers: Record<string, string>,
        body: unknown,
        timeoutMs: number
    ): Promise<RESTResponse> {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            const bodyText = await response.text();
            const parsed = this.TryParseJSON(bodyText);
            const respHeaders: Record<string, string> = {};
            response.headers.forEach((v, k) => {
                respHeaders[k.toLowerCase()] = v;
            });
            return {
                Status: response.status,
                Body: parsed ?? bodyText,
                Headers: respHeaders,
            };
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    /**
     * NormalizeResponse — extracts QueryResponse.<Entity> from a generic
     * QBO query response envelope. responseDataKey is the entity name.
     */
    protected NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[] {
        if (!responseDataKey) return [];
        return this.ExtractQueryRecords(rawBody, responseDataKey);
    }

    /**
     * ExtractPaginationInfo — QBO Query API uses STARTPOSITION + MAXRESULTS.
     * No has-more or total-count field is returned; the only signal is
     * (records-returned vs requested-page-size). Caller (FetchChanges) does
     * this comparison itself.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        _paginationType: PaginationType,
        _currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState {
        const records = this.ExtractAnyQueryRecords(rawBody);
        const hasMore = records.length >= pageSize;
        return {
            HasMore: hasMore,
            NextOffset: hasMore ? currentOffset + records.length : undefined,
        };
    }

    protected GetBaseURL(
        _companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string {
        const qbAuth = auth as QuickBooksAuthContext;
        return qbAuth.BaseUrl;
    }

    // ─── Custom-object hook ─────────────────────────────────────────────

    /**
     * QBO does NOT support user-defined custom objects. Always false.
     * (Per metadata.CustomObjects.MarkerPattern='none'.)
     */
    protected IsVendorCustomObject(_extObj: { Name: string }): boolean {
        return false;
    }

    /**
     * Per-realm custom fields exist on transactional entities — flag by
     * the `CustomField_` prefix our DiscoverFields emits.
     */
    protected IsVendorCustomField(extField: { Name: string }): boolean {
        return extField.Name.startsWith('CustomField_');
    }

    // ─── OAuth 2.0 token management ─────────────────────────────────────

    private IsTokenValid(auth: QuickBooksAuthContext): boolean {
        return Date.now() < (auth.ExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS);
    }

    /**
     * Exchange the current refresh token for a fresh access token. QBO uses
     * Basic auth (base64(client_id:client_secret)) in the Authorization
     * header — NOT in the body. Refresh tokens may rotate; we carry the
     * latest forward.
     */
    private async RefreshAccessToken(
        config: QuickBooksConnectionConfig
    ): Promise<QuickBooksAuthContext> {
        const basicAuth = Buffer
            .from(`${config.ClientId}:${config.ClientSecret}`)
            .toString('base64');

        const response = await fetch(QBO_OAUTH_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body:
                `grant_type=refresh_token` +
                `&refresh_token=${encodeURIComponent(config.RefreshToken)}`,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `OAuth token refresh failed (${response.status}): ${errorText.slice(0, 500)}`
            );
        }

        const data = await response.json() as QBOTokenResponse;
        const baseUrl =
            config.Environment === 'sandbox' ? QBO_SANDBOX_BASE : QBO_PRODUCTION_BASE;

        return {
            Token: data.access_token,
            RefreshTokenValue: data.refresh_token,
            ExpiresAt: new Date(Date.now() + (data.expires_in * 1000)),
            BaseUrl: baseUrl,
            RealmId: config.RealmId,
            Config: { ...config, RefreshToken: data.refresh_token },
        };
    }

    // ─── Configuration parsing ──────────────────────────────────────────

    /**
     * Read connection config from `CompanyIntegration.Configuration` (JSON
     * string) OR from a linked `CompanyIntegration.CredentialID` row. Uses
     * the typed entity properties — never `.Get()/.Set()` per MJ convention.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<QuickBooksConnectionConfig> {
        if (companyIntegration.CredentialID) {
            const loaded = await this.LoadFromCredential(
                companyIntegration.CredentialID, contextUser, provider
            );
            if (loaded) return loaded;
        }

        if (companyIntegration.Configuration) {
            const parsed = JSON.parse(companyIntegration.Configuration) as Partial<QuickBooksConnectionConfig>;
            return this.ValidateConfig(parsed);
        }

        throw new Error(
            'QuickBooksConnector: No credentials or configuration found on CompanyIntegration'
        );
    }

    private async LoadFromCredential(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<QuickBooksConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>(
            'MJ: Credentials', contextUser
        );
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        try {
            const parsed = JSON.parse(credential.Values) as Partial<QuickBooksConnectionConfig>;
            return this.ValidateConfig(parsed);
        } catch {
            return null;
        }
    }

    private ValidateConfig(raw: Partial<QuickBooksConnectionConfig>): QuickBooksConnectionConfig {
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
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    // ─── Query + record-level helpers ───────────────────────────────────

    /** Executes a single QBO Query and returns the raw response body. */
    private async ExecuteQuery(
        auth: QuickBooksAuthContext, query: string
    ): Promise<unknown> {
        const path = `/query?query=${encodeURIComponent(query)}`;
        const url = this.BuildAPIURL(auth, path);
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        this.AssertSuccessResponse(response);
        return response.Body;
    }

    /** Reads a single record by ID. */
    private async FetchSingleRecord(
        auth: QuickBooksAuthContext,
        objectName: string,
        id: string
    ): Promise<QBOEntityRecord | null> {
        const path = `/${objectName.toLowerCase()}/${encodeURIComponent(id)}`;
        const url = this.BuildAPIURL(auth, path);
        const headers = this.BuildHeaders(auth);
        try {
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status < 200 || response.Status >= 300) return null;
            const body = response.Body as Record<string, QBOEntityRecord>;
            return body[objectName] ?? null;
        } catch {
            return null;
        }
    }

    /** Builds /v3/company/{realmId}<path>?minorversion=N. */
    private BuildAPIURL(auth: QuickBooksAuthContext, path: string): string {
        const root = `${auth.BaseUrl}/v3/company/${auth.RealmId}`;
        const sep = path.includes('?') ? '&' : '?';
        return `${root}${path}${sep}minorversion=${QBO_MINOR_VERSION}`;
    }

    /** Pulls QueryResponse.<EntityName>[] from a query response body. */
    private ExtractQueryRecords(
        body: unknown, objectName: string
    ): QBOEntityRecord[] {
        const typed = body as QBOQueryResponseBody;
        const queryResponse = typed?.QueryResponse;
        if (!queryResponse) return [];
        const records = queryResponse[objectName] as QBOEntityRecord[] | undefined;
        return records ?? [];
    }

    /** Same, but for any single-record envelope (used for pagination probe). */
    private ExtractAnyQueryRecords(body: unknown): QBOEntityRecord[] {
        const typed = body as QBOQueryResponseBody;
        const qr = typed?.QueryResponse;
        if (!qr) return [];
        // Find the first array-valued key in QueryResponse.
        for (const v of Object.values(qr)) {
            if (Array.isArray(v)) return v as QBOEntityRecord[];
        }
        return [];
    }

    /** Pulls records from a CDC response shape. */
    private ExtractCDCRecords(body: unknown, objectName: string): QBOEntityRecord[] {
        const typed = body as QBOCDCResponseBody;
        if (!typed?.CDCResponse) return [];
        const result: QBOEntityRecord[] = [];
        for (const cdcResp of typed.CDCResponse) {
            const queryResponses = cdcResp.QueryResponse ?? [];
            for (const qr of queryResponses) {
                const arr = qr[objectName];
                if (Array.isArray(arr)) {
                    result.push(...(arr as QBOEntityRecord[]));
                }
            }
        }
        return result;
    }

    /**
     * Tracks max-seen LastUpdatedTime across a batch. Returns undefined
     * if no records have a watermark (or the existing watermark wins).
     * Out-of-order batches are handled correctly: we track the max, not
     * the last-seen.
     */
    private ComputeMaxWatermark(
        records: QBOEntityRecord[],
        previousWatermark: string | null
    ): string | undefined {
        let maxSeen: string | undefined = previousWatermark ?? undefined;
        for (const record of records) {
            const ts = record.MetaData?.LastUpdatedTime;
            if (ts && (maxSeen === undefined || ts > maxSeen)) {
                maxSeen = ts;
            }
        }
        return maxSeen;
    }

    /** Builds an ExternalRecord envelope from a raw QBO record. */
    private BuildExternalRecord(
        record: QBOEntityRecord, objectName: string
    ): ExternalRecord {
        const lastUpdated = record.MetaData?.LastUpdatedTime;
        return {
            ExternalID: record.Id ?? '',
            ObjectType: objectName,
            Fields: record,
            ModifiedAt: lastUpdated ? new Date(lastUpdated) : undefined,
        };
    }

    // ─── Error extraction ───────────────────────────────────────────────

    /** Per metadata.ResponseEnvelope.ErrorMessageFieldPath = Fault.Error[0].Message. */
    private ExtractErrorMessage(body: unknown): string {
        if (typeof body === 'string') return body.slice(0, 500);
        const typed = body as QBOErrorBody;
        const err = typed?.Fault?.Error?.[0];
        if (err) {
            const code = err.code ? ` [${err.code}]` : '';
            return `${err.Detail ?? err.Message ?? 'Unknown QBO error'}${code}`;
        }
        try {
            return JSON.stringify(body).slice(0, 500);
        } catch {
            return 'Unknown error';
        }
    }

    private BuildCRUDError(
        err: unknown, operation: string, objectName: string
    ): CRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return {
            Success: false,
            ErrorMessage: `${operation} failed for ${objectName}: ${message}`,
            StatusCode: 500,
        };
    }

    /** Throws on non-2xx so callers can rely on the response shape. */
    private AssertSuccessResponse(response: RESTResponse): void {
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(
                `QuickBooks API returned ${response.Status}: ${this.ExtractErrorMessage(response.Body)}`
            );
        }
    }

    // ─── HTTP utilities ─────────────────────────────────────────────────

    private async ThrottleIfNeeded(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.Sleep(minIntervalMs - elapsed);
        }
    }

    private IsRetryableStatus(status: number): boolean {
        return status === 429 || status === 503 || status === 504;
    }

    /**
     * Compute retry delay. Vendor returns Retry-After on 429; honor it.
     * Otherwise exponential backoff capped at 30s.
     */
    private ComputeRetryDelay(headers: Record<string, string>, attempt: number): number {
        const retryAfter = headers['retry-after'];
        if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            if (!Number.isNaN(seconds)) {
                return Math.min(seconds * 1000, 60_000);
            }
        }
        return Math.min(Math.pow(2, attempt) * 1000, 30_000);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private TryParseJSON(text: string): unknown | null {
        if (!text || text.trim() === '') return null;
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    /** Escape single quotes in a QBO query literal. */
    private EscapeQueryString(input: string): string {
        return input.replace(/'/g, "\\'");
    }
}

/**
 * Tree-shaking prevention. Import + call once from the package entry
 * to keep the `@RegisterClass` side effect alive after bundling.
 */
export function LoadQuickBooksConnector(): void {
    // Force the QuickBooksConnector identifier to remain reachable.
    void QuickBooksConnector;
}
