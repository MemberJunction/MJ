/**
 * NetSuiteConnector — Integration connector for Oracle NetSuite ERP platform.
 *
 * API Documentation: https://system.netsuite.com/help/helpcenter/en_US/APIs/REST_API_Browser/record/v1/2023.1/index.html
 *
 * Auth: OAuth 1.0 Token-Based Authentication (TBA) — non-expiring tokens.
 *       Credentials: ConsumerKey, ConsumerSecret, TokenID, TokenSecret, AccountID
 *       Authorization header with HMAC-SHA256 signature per OAuth 1.0 spec.
 * Base URL: https://{accountId}.suitetalk.api.netsuite.com/services/rest/record/v1
 * SuiteQL: https://{accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql
 * Pagination: limit/offset (max 1000 per page)
 * Rate limits: 15 concurrent requests/account
 * Incremental: SuiteQL queries with lastmodifieddate >= watermark
 * CRUD: Full CRUD via REST Record API on ALL record types
 *
 * Discovery: DYNAMIC via GET /record/v1/metadata-catalog/
 *   - Enumerates ALL available record types for the account (100+ standard types)
 *   - Field metadata fetched per record type via GET /record/v1/metadata-catalog/nstype/{recordType}
 *   - New record types (including custom records) are picked up automatically
 *
 * API Categories:
 *   - REST Record API (implemented, dynamic) — direct CRUD on ALL record types via metadata catalog
 *   - SuiteQL API (implemented) — SQL-like queries for read + incremental sync
 *   - RESTlet API (NOT implemented) — custom SuiteScript server-side endpoints, not standard
 *   - SOAP/SuiteTalk SOAP (NOT implemented) — legacy XML, superseded by REST
 *   - CSV Import API (NOT implemented) — file-based batch upload, not API-driven
 *   - No webhooks/CDC — use SuiteQL lastmodifieddate polling instead
 */
import { createHmac, randomBytes } from 'crypto';
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
    type FetchContext,
    type FetchBatchResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type CRUDResult,
    type IntegrationObjectInfo,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────────

export interface NetSuiteConnectionConfig {
    AccountID: string;
    ConsumerKey: string;
    ConsumerSecret: string;
    TokenID: string;
    TokenSecret: string;
}

interface NSAuthContext extends RESTAuthContext {
    Config: NetSuiteConnectionConfig;
    RecordBaseURL: string;
    QueryBaseURL: string;
}

interface NSPagedResponse {
    items: Record<string, unknown>[];
    count: number;
    totalResults?: number;
    hasMore: boolean;
    offset: number;
    links?: Array<{ rel: string; href: string }>;
}

interface NSMetadataCatalogItem {
    name: string;
    href: string;
}

interface NSFieldMetadata {
    name: string;
    type: string;
    isRequired?: boolean;
    isReadOnly?: boolean;
    label?: string;
    description?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const NS_PAGE_SIZE = 1000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 60_000;
const MIN_REQUEST_INTERVAL_MS = 100;

// Transaction record types in SuiteQL use the `transaction` table with a type filter.
// Non-transaction records query their own table (same name as REST endpoint).
const NS_TRANSACTION_TYPES: Record<string, string> = {
    'salesorder': 'SalesOrd', 'invoice': 'CustInvc', 'purchaseorder': 'PurchOrd',
    'journalentry': 'Journal', 'creditmemo': 'CustCred', 'vendorbill': 'VendBill',
    'vendorcredit': 'VendCred', 'vendorpayment': 'VendPymt', 'customerpayment': 'CustPymt',
    'customerrefund': 'CustRfnd', 'customerdeposit': 'CustDep', 'cashsale': 'CashSale',
    'cashrefund': 'CashRfnd', 'check': 'Check', 'deposit': 'Deposit',
    'expensereport': 'ExpRept', 'estimate': 'Estimate', 'returnauthorization': 'RtnAuth',
    'itemfulfillment': 'ItemShip', 'itemreceipt': 'ItemRcpt', 'transferorder': 'TrnfrOrd',
    'workorder': 'WorkOrd', 'assemblybuild': 'Build', 'inventoryadjustment': 'InvAdjst',
    'inventorytransfer': 'InvTrnfr', 'depositapplication': 'DepAppl',
};

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'NetSuiteConnector')
export class NetSuiteConnector extends BaseRESTIntegrationConnector {
    private lastRequestTime = 0;
    /** Cache of discovered record types: lowercase name → { name, href } */
    private recordTypeCache: Map<string, NSMetadataCatalogItem> = new Map();

    public override get IntegrationName(): string { return 'NetSuite'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        // Returns discovered objects with minimal fields — DiscoverFields() fills the rest
        const objects: IntegrationObjectInfo[] = [];
        for (const [, item] of this.recordTypeCache) {
            objects.push({
                Name: item.name,
                DisplayName: this.FormatDisplayName(item.name),
                Description: `NetSuite ${this.FormatDisplayName(item.name)} record`,
                SupportsWrite: true,
                Fields: [
                    { Name: 'id', DisplayName: 'Internal ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'NetSuite internal record ID' },
                    { Name: 'lastmodifieddate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification date' },
                ],
            });
        }
        return objects;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-file-invoice-dollar';
        config.CategoryDescription = 'NetSuite ERP — all record types discovered dynamically via metadata catalog';
        config.ParentCategoryName = 'ERP/Finance';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery (DYNAMIC via metadata-catalog) ──────────────────────

    /**
     * Discovers ALL available record types by calling the NetSuite REST metadata-catalog API.
     * This covers 100+ standard record types plus any custom records (customrecord_{id}).
     */
    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as NSAuthContext;
        const catalogURL = `${auth.RecordBaseURL}/metadata-catalog/`;
        const headers = this.BuildRequestHeaders(auth, catalogURL, 'GET');

        // Add header to request JSON-schema format with type listing
        headers['Accept'] = 'application/schema+json';

        const response = await this.MakeHTTPRequest(auth, catalogURL, 'GET', headers);
        if (response.Status !== 200) {
            console.warn(`[NetSuite] Metadata catalog returned ${response.Status}, falling back to SuiteQL discovery`);
            return this.DiscoverObjectsViaSuiteQL(auth);
        }

        const body = response.Body as Record<string, unknown>;
        // The metadata-catalog returns { items: [{ name, href }, ...] } or { links: [...] }
        const items = (body['items'] as NSMetadataCatalogItem[] | undefined)
            ?? (body['links'] as NSMetadataCatalogItem[] | undefined)
            ?? [];

        this.recordTypeCache.clear();
        const results: ExternalObjectSchema[] = [];

        for (const item of items) {
            if (!item.name) continue;
            this.recordTypeCache.set(item.name.toLowerCase(), item);
            results.push({
                Name: item.name,
                Label: this.FormatDisplayName(item.name),
                Description: `NetSuite ${this.FormatDisplayName(item.name)} record`,
                SupportsIncrementalSync: true, // All NS records support lastmodifieddate via SuiteQL
                SupportsWrite: true,            // All REST record types support full CRUD
            });
        }

        // If catalog returned nothing, fall back to SuiteQL
        if (results.length === 0) {
            return this.DiscoverObjectsViaSuiteQL(auth);
        }

        return results;
    }

    /**
     * Fallback: discover record types via SuiteQL query against the recordType table.
     */
    private async DiscoverObjectsViaSuiteQL(auth: NSAuthContext): Promise<ExternalObjectSchema[]> {
        const query = `SELECT scriptid, name FROM customrecordtype UNION ALL SELECT 'customer' as scriptid, 'Customer' as name FROM dual`;
        const url = `${auth.QueryBaseURL}/suiteql?limit=1000&offset=0`;
        const headers = this.BuildRequestHeaders(auth, url, 'POST', true);

        try {
            const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, { q: query });
            if (response.Status === 200) {
                const body = response.Body as NSPagedResponse;
                const results: ExternalObjectSchema[] = [];
                for (const item of (body.items ?? [])) {
                    const name = String(item['scriptid'] ?? item['name'] ?? '');
                    if (name) {
                        this.recordTypeCache.set(name.toLowerCase(), { name, href: '' });
                        results.push({
                            Name: name, Label: this.FormatDisplayName(name),
                            Description: `NetSuite ${this.FormatDisplayName(name)}`,
                            SupportsIncrementalSync: true, SupportsWrite: true,
                        });
                    }
                }
                if (results.length > 0) return results;
            }
        } catch {
            // Fall through to hardcoded fallback
        }

        // Last resort: return a well-known set so the connector is usable even if discovery fails
        return this.GetFallbackObjects();
    }

    private GetFallbackObjects(): ExternalObjectSchema[] {
        const knownTypes = [
            'customer', 'vendor', 'employee', 'contact', 'partner', 'lead', 'prospect',
            'salesorder', 'invoice', 'purchaseorder', 'journalentry', 'creditmemo',
            'vendorbill', 'vendorcredit', 'vendorpayment', 'customerpayment', 'customerrefund',
            'cashsale', 'cashrefund', 'check', 'deposit', 'estimate', 'opportunity',
            'expensereport', 'returnauthorization', 'itemfulfillment', 'itemreceipt',
            'transferorder', 'workorder', 'assemblybuild', 'inventoryadjustment',
            'account', 'department', 'classification', 'location', 'subsidiary', 'currency',
            'inventoryitem', 'noninventoryitem', 'serviceitem', 'otherchargeitem',
            'discountitem', 'assemblyitem', 'kititem', 'giftcertificateitem',
            'task', 'phonecall', 'calendarevent', 'note', 'message',
            'supportcase', 'issue', 'solution',
            'job', 'charge', 'timeentry',
            'term', 'paymentmethod', 'salestaxitem',
            'file', 'folder',
        ];
        for (const name of knownTypes) {
            this.recordTypeCache.set(name, { name, href: '' });
        }
        return knownTypes.map(name => ({
            Name: name,
            Label: this.FormatDisplayName(name),
            Description: `NetSuite ${this.FormatDisplayName(name)} record`,
            SupportsIncrementalSync: true,
            SupportsWrite: true,
        }));
    }

    /**
     * Discovers fields for a record type by fetching its metadata via the REST API.
     * Falls back to fetching one sample record and inferring field names/types.
     */
    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const auth = await this.Authenticate(companyIntegration, contextUser) as NSAuthContext;
        const recordType = objectName.toLowerCase();

        // Try metadata endpoint first: GET /record/v1/metadata-catalog/nstype/{recordType}
        try {
            const metaURL = `${auth.RecordBaseURL}/metadata-catalog/nstype/${recordType}`;
            const headers = this.BuildRequestHeaders(auth, metaURL, 'GET');
            headers['Accept'] = 'application/schema+json';
            const response = await this.MakeHTTPRequest(auth, metaURL, 'GET', headers);

            if (response.Status === 200) {
                return this.ParseFieldMetadata(response.Body);
            }
        } catch {
            // Fall through to sample-record approach
        }

        // Fallback: fetch one record and infer fields from the response
        return this.InferFieldsFromSample(auth, recordType);
    }

    private ParseFieldMetadata(body: unknown): ExternalFieldSchema[] {
        const schema = body as Record<string, unknown>;
        const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
        if (!properties) return this.DefaultFields();

        const fields: ExternalFieldSchema[] = [];
        const requiredFields = (schema['required'] as string[]) ?? [];

        for (const [name, prop] of Object.entries(properties)) {
            const nsType = String(prop['type'] ?? prop['format'] ?? 'string');
            fields.push({
                Name: name,
                Label: String(prop['title'] ?? name),
                Description: String(prop['description'] ?? ''),
                DataType: this.MapNSFieldType(nsType),
                IsRequired: requiredFields.includes(name),
                IsUniqueKey: name === 'id',
                IsReadOnly: prop['readOnly'] === true,
            });
        }

        // Ensure PK exists
        if (!fields.some(f => f.Name === 'id')) {
            fields.unshift({
                Name: 'id', Label: 'Internal ID', Description: 'NetSuite internal record ID',
                DataType: 'string', IsRequired: false, IsUniqueKey: true, IsReadOnly: true,
            });
        }

        return fields;
    }

    private async InferFieldsFromSample(auth: NSAuthContext, recordType: string): Promise<ExternalFieldSchema[]> {
        try {
            const url = `${auth.RecordBaseURL}/${recordType}?limit=1`;
            const headers = this.BuildRequestHeaders(auth, url, 'GET');
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as NSPagedResponse;
                const sample = (body.items ?? [])[0];
                if (sample) {
                    const fields: ExternalFieldSchema[] = [];
                    for (const [key, value] of Object.entries(sample)) {
                        if (key === 'links') continue; // Skip HATEOAS links
                        fields.push({
                            Name: key,
                            Label: this.FormatDisplayName(key),
                            Description: '',
                            DataType: this.InferTypeFromValue(value),
                            IsRequired: false,
                            IsUniqueKey: key === 'id',
                            IsReadOnly: key === 'id' || key === 'lastmodifieddate' || key === 'datecreated',
                        });
                    }
                    return fields;
                }
            }
        } catch {
            // Fall through
        }
        return this.DefaultFields();
    }

    private DefaultFields(): ExternalFieldSchema[] {
        return [
            { Name: 'id', Label: 'Internal ID', Description: 'NetSuite internal record ID', DataType: 'string', IsRequired: false, IsUniqueKey: true, IsReadOnly: true },
            { Name: 'lastmodifieddate', Label: 'Last Modified', Description: 'Last modification date', DataType: 'datetime', IsRequired: false, IsUniqueKey: false, IsReadOnly: true },
        ];
    }

    private MapNSFieldType(nsType: string): string {
        const lower = nsType.toLowerCase();
        if (lower.includes('integer') || lower === 'int') return 'number';
        if (lower.includes('float') || lower.includes('double') || lower.includes('currency') || lower.includes('decimal')) return 'decimal';
        if (lower.includes('boolean')) return 'boolean';
        if (lower.includes('date') || lower.includes('time')) return 'datetime';
        return 'string';
    }

    private InferTypeFromValue(value: unknown): string {
        if (value === null || value === undefined) return 'string';
        if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'decimal';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
            return 'string';
        }
        return 'string';
    }

    private FormatDisplayName(name: string): string {
        // Convert camelCase/lowercase to Title Case: "salesorder" → "Sales Order"
        return name
            .replace(/([a-z])([A-Z])/g, '$1 $2')    // camelCase → camel Case
            .replace(/([A-Z]+)/g, ' $1')              // ABCDef → ABC Def
            .replace(/[_-]/g, ' ')                     // snake_case → snake case
            .trim()
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    // ─── Auth ──────────────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const accountLower = config.AccountID.toLowerCase().replace('_', '-');
        const recordBaseURL = `https://${accountLower}.suitetalk.api.netsuite.com/services/rest/record/v1`;
        const queryBaseURL = `https://${accountLower}.suitetalk.api.netsuite.com/services/rest/query/v1`;
        return {
            Token: '', TokenType: 'OAuth1', Config: config,
            RecordBaseURL: recordBaseURL, QueryBaseURL: queryBaseURL,
        } as NSAuthContext;
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<NetSuiteConnectionConfig> {
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['AccountID'] && parsed['ConsumerKey']) {
                    return {
                        AccountID: parsed['AccountID'], ConsumerKey: parsed['ConsumerKey'],
                        ConsumerSecret: parsed['ConsumerSecret'] ?? '',
                        TokenID: parsed['TokenID'] ?? '', TokenSecret: parsed['TokenSecret'] ?? '',
                    };
                }
            }
        }
        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                AccountID: parsed['AccountID'] ?? '', ConsumerKey: parsed['ConsumerKey'] ?? '',
                ConsumerSecret: parsed['ConsumerSecret'] ?? '',
                TokenID: parsed['TokenID'] ?? '', TokenSecret: parsed['TokenSecret'] ?? '',
            };
        }
        throw new Error('No NetSuite credentials found. Set AccountID, ConsumerKey, ConsumerSecret, TokenID, TokenSecret.');
    }

    // ─── OAuth 1.0 TBA Signature ────────────────────────────────────────

    private BuildOAuth1Header(config: NetSuiteConnectionConfig, method: string, url: string): string {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = randomBytes(16).toString('hex');

        const oauthParams: Record<string, string> = {
            oauth_consumer_key: config.ConsumerKey, oauth_nonce: nonce,
            oauth_signature_method: 'HMAC-SHA256', oauth_timestamp: timestamp,
            oauth_token: config.TokenID, oauth_version: '1.0',
        };

        let baseURL = url;
        const queryPart: Record<string, string> = {};
        const qIdx = url.indexOf('?');
        if (qIdx !== -1) {
            baseURL = url.substring(0, qIdx);
            new URLSearchParams(url.substring(qIdx + 1)).forEach((v, k) => { queryPart[k] = v; });
        }

        const allParams = { ...oauthParams, ...queryPart };
        const normalizedParams = Object.keys(allParams).sort()
            .map(k => `${this.PercentEncode(k)}=${this.PercentEncode(allParams[k])}`).join('&');

        const sigBaseString = `${method.toUpperCase()}&${this.PercentEncode(baseURL)}&${this.PercentEncode(normalizedParams)}`;
        const signingKey = `${this.PercentEncode(config.ConsumerSecret)}&${this.PercentEncode(config.TokenSecret)}`;
        const signature = createHmac('sha256', signingKey).update(sigBaseString).digest('base64');

        const accountRealm = config.AccountID.replace('-', '_').toUpperCase();
        const headerParams = { ...oauthParams, oauth_signature: signature };
        const parts = Object.entries(headerParams).map(([k, v]) => `${k}="${v}"`).join(', ');
        return `OAuth realm="${accountRealm}", ${parts}`;
    }

    private PercentEncode(str: string): string {
        return encodeURIComponent(str).replace(/!/g, '%21').replace(/'/g, '%27')
            .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NSAuthContext;
            const url = `${auth.RecordBaseURL}/customer?limit=1`;
            const headers = this.BuildRequestHeaders(auth, url, 'GET');
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as NSPagedResponse;
                return { Success: true, Message: `Connected to NetSuite — ${body.totalResults ?? 0} customers` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ──────────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return (auth as NSAuthContext).RecordBaseURL;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, offset: number, _cursor?: string
    ): string {
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}limit=${NS_PAGE_SIZE}&offset=${offset}`;
    }

    // ─── Response Parsing ──────────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['items'])) return body['items'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, currentOffset: number, _pageSize: number
    ): PaginationState {
        const body = rawBody as NSPagedResponse;
        const records = this.NormalizeResponse(rawBody, null);
        return { HasMore: body.hasMore ?? false, NextOffset: currentOffset + records.length };
    }

    // ─── Headers ───────────────────────────────────────────────────────

    protected override BuildHeaders(_auth: RESTAuthContext): Record<string, string> {
        return { 'Accept': 'application/json', 'User-Agent': 'MemberJunction-Integration/1.0' };
    }

    private BuildRequestHeaders(
        auth: NSAuthContext, url: string, method: string, hasBody: boolean = false
    ): Record<string, string> {
        const headers: Record<string, string> = {
            'Authorization': this.BuildOAuth1Header(auth.Config, method, url),
            'Accept': 'application/json', 'User-Agent': 'MemberJunction-Integration/1.0',
        };
        if (hasBody) headers['Content-Type'] = 'application/json';
        return headers;
    }

    // ─── FetchChanges — generic for ANY record type ────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NSAuthContext;
        const recordType = ctx.ObjectName.toLowerCase();
        const offset = ctx.CurrentOffset ?? 0;

        // Determine SuiteQL table: transactions use `transaction` table with type filter
        const transType = NS_TRANSACTION_TYPES[recordType];
        const suiteqlTable = transType ? 'transaction' : recordType;

        const conditions: string[] = [];
        if (transType) conditions.push(`type = '${transType}'`);
        if (ctx.WatermarkValue) conditions.push(`lastmodifieddate >= '${ctx.WatermarkValue}'`);

        const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
        const query = `SELECT * FROM ${suiteqlTable}${whereClause} ORDER BY lastmodifieddate`;

        const url = `${auth.QueryBaseURL}/suiteql?limit=${NS_PAGE_SIZE}&offset=${offset}`;
        const headers = this.BuildRequestHeaders(auth, url, 'POST', true);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, { q: query });

        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`NetSuite SuiteQL error for ${recordType}: ${response.Status}`);
        }

        const body = response.Body as NSPagedResponse;
        const records = body.items ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r['id'] ?? ''), ObjectType: ctx.ObjectName, Fields: r,
        }));

        let newWatermark: string | undefined;
        if (!body.hasMore) {
            for (const r of records) {
                const modified = r['lastmodifieddate'] as string | undefined;
                if (modified && (!newWatermark || modified > newWatermark)) newWatermark = modified;
            }
        }

        return {
            Records: externalRecords, HasMore: body.hasMore ?? false,
            NextOffset: offset + records.length,
            NewWatermarkValue: !body.hasMore ? newWatermark : undefined,
        };
    }

    // ─── CRUD — generic for ANY record type ────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NSAuthContext;
        const endpoint = ctx.ObjectName.toLowerCase();
        const url = `${auth.RecordBaseURL}/${endpoint}`;
        const headers = this.BuildRequestHeaders(auth, url, 'POST', true);
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const location = (response.Headers?.['location'] as string | undefined) ?? '';
            const idMatch = location.match(/\/(\d+)$/);
            const id = idMatch ? idMatch[1] : String((response.Body as Record<string, unknown>)?.['id'] ?? '');
            return { Success: true, ExternalID: id, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NSAuthContext;
        const endpoint = ctx.ObjectName.toLowerCase();
        const url = `${auth.RecordBaseURL}/${endpoint}/${ctx.ExternalID}`;
        const headers = this.BuildRequestHeaders(auth, url, 'PATCH', true);
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NSAuthContext;
        const endpoint = ctx.ObjectName.toLowerCase();
        const url = `${auth.RecordBaseURL}/${endpoint}/${ctx.ExternalID}`;
        const headers = this.BuildRequestHeaders(auth, url, 'DELETE');
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const bodyStr = typeof response.Body === 'string' ? response.Body : JSON.stringify(response.Body);
        return {
            Success: false, ExternalID: '', StatusCode: response.Status,
            ErrorMessage: `${operation} failed for ${objectName}: HTTP ${response.Status} — ${bodyStr?.substring(0, 300)}`,
        };
    }

    // ─── HTTP Transport ────────────────────────────────────────────────

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string,
        headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        await this.Throttle();
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
                console.warn(`[NetSuite] Rate limited (429), backing off ${Math.round(delay)}ms`);
                await this.Sleep(delay); continue;
            }
            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(2000 * Math.pow(2, attempt), 60_000);
                console.warn(`[NetSuite] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay); continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }
        throw new Error(`NetSuite request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) opts.body = JSON.stringify(body);
            return await fetch(url, opts);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') throw new Error(`NetSuite request timed out: ${url}`);
            throw err;
        } finally { clearTimeout(timeoutId); }
    }

    private async ParseBody(response: Response): Promise<unknown> {
        const ct = response.headers.get('content-type') ?? '';
        if (ct.includes('json')) return response.json() as Promise<unknown>;
        return response.text();
    }

    private ToRESTResponse(response: Response, body: unknown): RESTResponse {
        const hdrs: Record<string, string> = {};
        response.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
        return { Status: response.status, Body: body, Headers: hdrs };
    }

    private async Throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Default Field Mappings ────────────────────────────────────────

    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        // Dynamic — uses discovered fields from cache or returns PK-only default
        return [{ SourceFieldName: 'id', DestinationFieldName: 'id', IsKeyField: true }];
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadNetSuiteConnector() { /* intentionally empty */ }
