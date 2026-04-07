/**
 * WildApricotConnector — Integration connector for the Wild Apricot membership management platform.
 *
 * API Documentation: https://gethelp.wildapricot.com/en/articles/182-using-wildapricot-s-api
 *
 * Auth: OAuth 2.0 client credentials → Bearer token
 * Base URL: https://api.wildapricot.org/v2.2/accounts/{accountId}/
 * Pagination: Offset/limit ($skip/$top)
 * Rate Limits: 40 req/min (contact list), 120 req/min (contact-by-ID), 400 req/min (other)
 * Incremental: $filter with gt/lt on UpdatedDate
 * CRUD: Full on Contacts, Events, EventRegistrations, Invoices, Payments, Refunds
 *
 * API Categories:
 *   - Admin API v2.2 (implemented) — full membership management
 *   - Member API (NOT implemented) — member-facing endpoints, not admin
 *   - Webhooks (available, not implemented as receiver) — Contact, Membership, Event, Invoice, Payment
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

// ─── Types ──────────────────────────────────────────────────────────

export interface WildApricotConnectionConfig {
    ClientID: string;
    ClientSecret: string;
    AccountID: string;
}

interface WAAuthContext extends RESTAuthContext {
    Config: WildApricotConnectionConfig;
    AccountID: string;
}

interface CachedToken {
    AccessToken: string;
    ExpiresAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const WA_AUTH_URL = 'https://oauth.wildapricot.org/auth/token';
const WA_API_BASE = 'https://api.wildapricot.org/v2.2';
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 200;

// ─── Static Object Definitions ──────────────────────────────────────

const WA_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'Contacts', DisplayName: 'Contact',
        Description: 'Members, contacts, and prospects in Wild Apricot', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contact ID' },
            { Name: 'FirstName', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name' },
            { Name: 'LastName', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last name' },
            { Name: 'Email', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email' },
            { Name: 'Organization', DisplayName: 'Organization', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Organization name' },
            { Name: 'MembershipLevelId', DisplayName: 'Membership Level ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Membership level' },
            { Name: 'Status', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership status' },
            { Name: 'MemberSince', DisplayName: 'Member Since', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Membership start date' },
            { Name: 'RenewalDue', DisplayName: 'Renewal Due', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Next renewal date' },
        ],
    },
    {
        Name: 'Events', DisplayName: 'Event',
        Description: 'Events including conferences, meetings, and webinars', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event name' },
            { Name: 'StartDate', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event start' },
            { Name: 'EndDate', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event end' },
            { Name: 'Location', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Event location' },
            { Name: 'RegistrationEnabled', DisplayName: 'Registration Enabled', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Accepts registrations' },
            { Name: 'EventType', DisplayName: 'Event Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type of event' },
        ],
    },
    {
        Name: 'EventRegistrations', DisplayName: 'Event Registration',
        Description: 'Event registration records with attendee details', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration ID' },
            { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent event' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Registrant' },
            { Name: 'RegistrationDate', DisplayName: 'Registration Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When registered' },
            { Name: 'IsCheckedIn', DisplayName: 'Is Checked In', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Check-in status' },
        ],
    },
    {
        Name: 'Invoices', DisplayName: 'Invoice',
        Description: 'Invoices for dues, event fees, and other charges', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice ID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Billed contact' },
            { Name: 'DocumentNumber', DisplayName: 'Number', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice number' },
            { Name: 'DocumentDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice date' },
            { Name: 'Value', DisplayName: 'Value', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice total' },
            { Name: 'IsPaid', DisplayName: 'Is Paid', Type: 'boolean', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Payment status' },
        ],
    },
    {
        Name: 'Payments', DisplayName: 'Payment',
        Description: 'Payment records against invoices', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment ID' },
            { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Paying contact' },
            { Name: 'Value', DisplayName: 'Value', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'Tender', DisplayName: 'Tender', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment method' },
            { Name: 'CreatedDate', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
        ],
    },
    {
        Name: 'Refunds', DisplayName: 'Refund',
        Description: 'Refund records against payments', SupportsWrite: true,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Refund ID' },
            { Name: 'PaymentId', DisplayName: 'Payment ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Related payment' },
            { Name: 'Value', DisplayName: 'Value', Type: 'decimal', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Refund amount' },
            { Name: 'CreatedDate', DisplayName: 'Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When created' },
        ],
    },
    {
        Name: 'MembershipLevels', DisplayName: 'Membership Level',
        Description: 'Membership level/tier definitions (read-only)', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Level ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Level name' },
            { Name: 'MembershipFee', DisplayName: 'Fee', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Annual fee' },
            { Name: 'Description', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Level description' },
        ],
    },
    {
        Name: 'Account', DisplayName: 'Account',
        Description: 'Wild Apricot account info (singleton, read-only)', SupportsWrite: false,
        Fields: [
            { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Account ID' },
            { Name: 'Name', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Organization name' },
            { Name: 'PrimaryDomainName', DisplayName: 'Domain', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Primary domain' },
        ],
    },
    // ─── Additional WA API v2.2 endpoints — lean overlay (PK + key FKs + date fields only) ──
    // Full field inventory is discovered at runtime via sample record fetch in DiscoverFields()
    { Name: 'ContactFields', DisplayName: 'Contact Field', Description: 'Custom/system field definitions (schema)', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Field definition ID' },
    ]},
    { Name: 'MemberGroups', DisplayName: 'Member Group', Description: 'Groups for organizing contacts', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group ID' },
    ]},
    { Name: 'EventSessions', DisplayName: 'Event Session', Description: 'Sessions within events (child of Events)', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session ID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Events' },
    ]},
    { Name: 'Donations', DisplayName: 'Donation', Description: 'Donation records', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation ID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'DonationDate', DisplayName: 'Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date field' },
    ]},
    { Name: 'DonationCampaigns', DisplayName: 'Donation Campaign', Description: 'Fundraising campaigns', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Campaign ID' },
    ]},
    { Name: 'Tenders', DisplayName: 'Tender', Description: 'Payment tender/method lookup', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Tender ID' },
    ]},
    { Name: 'AuditLogItems', DisplayName: 'Audit Log', Description: 'Account activity audit trail', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Log entry ID' },
        { Name: 'Timestamp', DisplayName: 'Timestamp', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date field' },
    ]},
    { Name: 'RecurringPaymentContracts', DisplayName: 'Recurring Payment', Description: 'Auto-renewal contracts', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Contract ID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
    ]},
    { Name: 'SavedSearches', DisplayName: 'Saved Search', Description: 'Saved contact filters', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Search ID' },
    ]},
    { Name: 'EmailMessages', DisplayName: 'Email Message', Description: 'Sent email messages/campaigns', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Message ID' },
        { Name: 'SentDate', DisplayName: 'Sent Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date field' },
    ]},
    { Name: 'Orders', DisplayName: 'Online Store Order', Description: 'Store purchase orders', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Order ID' },
        { Name: 'ContactId', DisplayName: 'Contact ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Contacts' },
        { Name: 'OrderDate', DisplayName: 'Order Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date field' },
    ]},
    { Name: 'OnlineStoreCatalogItems', DisplayName: 'Store Product', Description: 'Product catalog items', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product ID' },
    ]},
    { Name: 'EventSessionRegistrations', DisplayName: 'Session Registration', Description: 'Registrations for event sessions (child of EventSessions)', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration ID' },
        { Name: 'EventSessionId', DisplayName: 'Session ID', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → EventSessions' },
    ]},
    { Name: 'SentEmailLog', DisplayName: 'Sent Email Log', Description: 'Detailed sent email delivery log', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Log entry ID' },
        { Name: 'SentDate', DisplayName: 'Sent Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
];

// ─── Connector ──────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'WildApricotConnector')
export class WildApricotConnector extends BaseRESTIntegrationConnector {
    private tokenCache = new Map<string, CachedToken>();
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Wild Apricot'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return WA_OBJECTS;
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-users';
        config.CategoryDescription = 'Wild Apricot membership management for contacts, events, invoices, and payments';
        config.ParentCategoryName = 'Membership';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ──────────────────────────────────────────────────

    public override async DiscoverObjects(
        _companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        return WA_OBJECTS.map(obj => ({
            Name: obj.Name, Label: obj.DisplayName, Description: obj.Description,
            SupportsIncrementalSync: true, SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        // Dynamic: fetch one sample record to discover ALL fields from the API
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as WAAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${WA_API_BASE}/accounts/${auth.AccountID}/${objectName}?$top=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsWithOverlay(records[0], objectName, WA_OBJECTS);
            }
        } catch { /* fall through to static */ }
        const staticObj = WA_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!staticObj) return [];
        return staticObj.Fields.map(f => ({
            Name: f.Name, Label: f.DisplayName, Description: f.Description,
            DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly,
        }));
    }

    private InferFieldsWithOverlay(sample: Record<string, unknown>, objectName: string, allObjects: IntegrationObjectInfo[]): ExternalFieldSchema[] {
        const staticObj = allObjects.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(sample)) {
            if (key === 'links' || key === '_links') continue;
            const sf = staticMap.get(key.toLowerCase());
            fields.push({
                Name: key, Label: sf?.DisplayName ?? key, Description: sf?.Description ?? '',
                DataType: sf?.Type ?? this.InferTypeFromValue(value),
                IsRequired: sf?.IsRequired ?? false, IsUniqueKey: sf?.IsPrimaryKey ?? false, IsReadOnly: sf?.IsReadOnly ?? false,
            });
        }
        return fields;
    }

    private InferTypeFromValue(v: unknown): string {
        if (v === null || v === undefined) return 'string';
        if (typeof v === 'number') return Number.isInteger(v) ? 'number' : 'decimal';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return 'datetime';
        return 'string';
    }

    // ─── Auth ───────────────────────────────────────────────────────

    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const cached = this.tokenCache.get(config.ClientID);
        if (cached && cached.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return { Token: cached.AccessToken, TokenType: 'Bearer', Config: config, AccountID: config.AccountID } as WAAuthContext;
        }
        const token = await this.ObtainToken(config);
        return { Token: token.AccessToken, TokenType: 'Bearer', Config: config, AccountID: config.AccountID } as WAAuthContext;
    }

    private async ObtainToken(config: WildApricotConnectionConfig): Promise<CachedToken> {
        const basicAuth = Buffer.from(`${config.ClientID}:${config.ClientSecret}`).toString('base64');
        const response = await fetch(WA_AUTH_URL, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials&scope=auto',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`Wild Apricot auth failed: ${response.status} ${response.statusText}`);
        const data = await response.json() as { access_token: string; expires_in: number };
        const token: CachedToken = { AccessToken: data.access_token, ExpiresAt: Date.now() + (data.expires_in * 1000) };
        this.tokenCache.set(config.ClientID, token);
        return token;
    }

    private async ParseConfig(companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo): Promise<WildApricotConnectionConfig> {
        // Try credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['ClientID'] && parsed['ClientSecret'] && parsed['AccountID']) {
                    return { ClientID: parsed['ClientID'], ClientSecret: parsed['ClientSecret'], AccountID: parsed['AccountID'] };
                }
            }
        }
        // Fallback: Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return { ClientID: parsed['ClientID'] ?? '', ClientSecret: parsed['ClientSecret'] ?? '', AccountID: parsed['AccountID'] ?? '' };
        }
        throw new Error('No Wild Apricot credentials found. Set ClientID, ClientSecret, AccountID in credential Values or Configuration JSON.');
    }

    // ─── TestConnection ─────────────────────────────────────────────

    public async TestConnection(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as WAAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${WA_API_BASE}/accounts/${auth.AccountID}`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as Record<string, unknown>;
                return { Success: true, Message: `Connected to Wild Apricot: ${body['Name'] ?? 'Unknown'}` };
            }
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── URL Building ───────────────────────────────────────────────

    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return `${WA_API_BASE}/accounts/${(auth as WAAuthContext).AccountID}`;
    }

    protected override BuildPaginatedURL(
        basePath: string, _obj: { PaginationType: string; DefaultPageSize: number },
        _page: number, offset: number, _cursor?: string
    ): string {
        const sep = basePath.includes('?') ? '&' : '?';
        const pageSize = _obj.DefaultPageSize ?? 100;
        return `${basePath}${sep}$skip=${offset}&$top=${pageSize}`;
    }

    // ─── Response Parsing ───────────────────────────────────────────

    protected NormalizeResponse(rawBody: unknown, _responseDataKey: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        // Wild Apricot wraps resources in named arrays — check all known keys
        for (const key of [
            'Contacts', 'Events', 'EventRegistrations', 'Invoices', 'Payments', 'Refunds',
            'MembershipLevels', 'ContactFields', 'MemberGroups', 'EventSessions', 'Donations',
            'DonationCampaigns', 'Tenders', 'AuditLogItems', 'RecurringPaymentContracts',
            'SavedSearches', 'EmailMessages', 'Orders', 'OnlineStoreCatalogItems',
        ]) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }
        // Single object
        if (body && body['Id'] != null) return [body];
        return [];
    }

    protected ExtractPaginationInfo(
        rawBody: unknown, _paginationType: PaginationType, _currentPage: number, currentOffset: number, pageSize: number
    ): PaginationState {
        const records = this.NormalizeResponse(rawBody, null);
        return { HasMore: records.length >= pageSize, NextOffset: currentOffset + records.length };
    }

    // ─── FetchChanges — incremental via $filter ─────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        // Contacts support $filter on UpdatedDate for incremental sync
        if (ctx.WatermarkValue && ctx.ObjectName.toLowerCase() === 'contacts') {
            return this.FetchContactsIncremental(ctx);
        }
        // Generic fetch for ALL objects — uses object name as API path
        return this.FetchGenericObject(ctx);
    }

    private async FetchGenericObject(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as WAAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const url = `${WA_API_BASE}/accounts/${auth.AccountID}/${ctx.ObjectName}?$skip=${offset}&$top=${ctx.BatchSize}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Wild Apricot ${ctx.ObjectName} API error: ${response.Status}`);
        }
        const records = this.NormalizeResponse(response.Body, null);
        return {
            Records: records.map(r => ({ ExternalID: String(r['Id'] ?? ''), ObjectType: ctx.ObjectName, Fields: r })),
            HasMore: records.length >= ctx.BatchSize,
            NextOffset: offset + records.length,
        };
    }

    private async FetchContactsIncremental(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as WAAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        const filter = encodeURIComponent(`UpdatedDate gt ${ctx.WatermarkValue}`);
        const url = `${WA_API_BASE}/accounts/${auth.AccountID}/Contacts?$filter=${filter}&$skip=${offset}&$top=${ctx.BatchSize}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(`Wild Apricot API error: ${response.Status}`);
        }

        const records = this.NormalizeResponse(response.Body, null);
        const pkField = 'Id';
        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''), ObjectType: ctx.ObjectName, Fields: r,
        }));

        let newWatermark: string | undefined;
        for (const r of records) {
            const updated = r['UpdatedDate'] as string | undefined;
            if (updated && (!newWatermark || updated > newWatermark)) newWatermark = updated;
        }

        return {
            Records: externalRecords, HasMore: records.length >= ctx.BatchSize,
            NextOffset: offset + records.length,
            NewWatermarkValue: records.length < ctx.BatchSize ? newWatermark : undefined,
        };
    }

    // ─── CRUD ───────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as WAAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${WA_API_BASE}/accounts/${auth.AccountID}/${ctx.ObjectName}`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            return { Success: true, ExternalID: String(body['Id'] ?? ''), StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as WAAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${WA_API_BASE}/accounts/${auth.AccountID}/${ctx.ObjectName}/${ctx.ExternalID}`;
        const body = { Id: Number(ctx.ExternalID), ...ctx.Attributes };
        const response = await this.MakeHTTPRequest(auth, url, 'PUT', headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as WAAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = `${WA_API_BASE}/accounts/${auth.AccountID}/${ctx.ObjectName}/${ctx.ExternalID}`;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) {
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        }
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private BuildCRUDError(response: RESTResponse, operation: string, objectName: string): CRUDResult {
        const bodyStr = typeof response.Body === 'string' ? response.Body : JSON.stringify(response.Body);
        return { Success: false, ExternalID: '', StatusCode: response.Status,
            ErrorMessage: `${operation} failed for ${objectName}: HTTP ${response.Status} — ${bodyStr?.substring(0, 300)}` };
    }

    // ─── Headers ────────────────────────────────────────────────────

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return { 'Authorization': `Bearer ${auth.Token}`, 'Accept': 'application/json', 'User-Agent': 'MemberJunction-Integration/1.0' };
    }

    // ─── HTTP Transport (implements abstract) ───────────────────────

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        await this.Throttle();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();

            if (response.status === 401 && attempt === 0) {
                this.tokenCache.clear();
                console.warn('[WildApricot] 401 — clearing token cache for retry');
                continue;
            }
            if (response.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60000);
                console.warn(`[WildApricot] Rate limited (429), backing off ${Math.round(delay)}ms`);
                await this.Sleep(delay);
                continue;
            }
            if (response.status >= 500 && attempt < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
                console.warn(`[WildApricot] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }
        throw new Error(`Wild Apricot request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                opts.body = JSON.stringify(body);
            }
            return await fetch(url, opts);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Wild Apricot request timed out: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
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

    // ─── Default Field Mappings ─────────────────────────────────────

    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = WA_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({ SourceFieldName: f.Name, DestinationFieldName: f.Name, IsKeyField: f.IsPrimaryKey }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadWildApricotConnector() { /* intentionally empty */ }
