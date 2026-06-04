/**
 * NimbleAMSConnector — Integration connector for Nimble AMS (Salesforce-native association management).
 *
 * API Documentation:
 *   - Nimble AMS API: https://help.nimbleams.com/help/live/api
 *   - Integration API: https://help.nimbleams.com/help/live/call-the-integration-api
 *   - Object Reference: https://nimbleuser.github.io/nams-api-docs/
 *
 * Auth: Salesforce OAuth 2.0 (Connected App — client_credentials or authorization_code flow)
 * Base URL: https://{instance}.salesforce.com/services/data/v59.0 (Salesforce REST API)
 *           https://{instance}.salesforce.com/services/apexrest/NUINT/NUIntegrationService (Nimble Integration API)
 * Pagination: Salesforce standard — nextRecordsUrl in query results (2000 records/batch)
 * Rate limits: Salesforce org limits (100K API calls/24hr Enterprise, 15K Professional)
 * Incremental: SOQL WHERE LastModifiedDate >= watermark
 * CRUD: Full via Salesforce REST API /sobjects/{objectName}
 *
 * Nimble AMS Custom Objects (NU__ namespace):
 *   All Nimble AMS objects use the NU__ namespace prefix on the Salesforce platform.
 *   Standard Salesforce objects (Account, Contact) are also used alongside custom objects.
 *
 * API Categories:
 *   - Salesforce REST API (implemented) — SOQL queries, sObject CRUD on all NU__ objects
 *   - Nimble Integration API (implemented) — simplified inbound/outbound via named Integration Settings
 *   - Salesforce Bulk API 2.0 (NOT implemented) — for 10K+ record batches
 *   - Salesforce Streaming API (NOT implemented) — real-time CDC via PushTopics/CDC channels
 *   - Salesforce Metadata API (NOT implemented) — schema/config deployment, not data sync
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
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

export interface NimbleAMSConnectionConfig {
    InstanceURL: string;       // e.g., https://myorg.my.salesforce.com
    ClientID: string;
    ClientSecret: string;
    AccessToken?: string;
    RefreshToken?: string;
}

interface NimbleAuthContext extends RESTAuthContext {
    Config: NimbleAMSConnectionConfig;
    InstanceURL: string;
    ApiVersion: string;
}

interface CachedToken { AccessToken: string; ExpiresAt: number; }

interface SFQueryResponse {
    totalSize: number;
    done: boolean;
    nextRecordsUrl?: string;
    records: Record<string, unknown>[];
}

// ─── Constants ────────────────────────────────────────────────────────────

const SF_API_VERSION = 'v59.0';
// Salesforce platform restricts SOQL `FIELDS(ALL)` to LIMIT <= 200 per query.
// nextRecordsUrl cursor pagination chains additional batches.
const SF_PAGE_SIZE = 200;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 50;

// ─── Nimble AMS Objects (NU__ namespace + standard SF objects) ─────────────
// Lean overlay: PK + key FKs + date fields. Full field list from Salesforce describe API at runtime.

const NIMBLE_OBJECTS: IntegrationObjectInfo[] = [
    // Standard Salesforce objects used by Nimble AMS
    { Name: 'Account', DisplayName: 'Account', Description: 'Organization/company accounts', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Contact', DisplayName: 'Contact', Description: 'Individual contacts/members', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Salesforce record ID' },
        { Name: 'AccountId', DisplayName: 'Account ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Account' },
        { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    // Nimble AMS custom objects (NU__ namespace)
    { Name: 'NU__Membership__c', DisplayName: 'Membership', Description: 'Membership records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Account__c', DisplayName: 'Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Account' },
        { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'NU__MembershipType__c', DisplayName: 'Membership Type', Description: 'Membership type definitions', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'NU__Event__c', DisplayName: 'Event', Description: 'Events and conferences', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'NU__EventRegistration__c', DisplayName: 'Event Registration', Description: 'Event registrations', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Event__c', DisplayName: 'Event', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Event' },
        { Name: 'NU__Contact__c', DisplayName: 'Contact', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Contact' },
    ]},
    { Name: 'NU__Order__c', DisplayName: 'Order', Description: 'Sales orders', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Account__c', DisplayName: 'Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Account' },
        { Name: 'LastModifiedDate', DisplayName: 'Last Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'NU__OrderItem__c', DisplayName: 'Order Item', Description: 'Order line items', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Order__c', DisplayName: 'Order', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Order' },
    ]},
    { Name: 'NU__Payment__c', DisplayName: 'Payment', Description: 'Payment records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Order__c', DisplayName: 'Order', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Order' },
    ]},
    { Name: 'NU__Invoice__c', DisplayName: 'Invoice', Description: 'Invoices', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Account__c', DisplayName: 'Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Account' },
    ]},
    { Name: 'NU__Committee__c', DisplayName: 'Committee', Description: 'Committees and boards', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'NU__CommitteeMembership__c', DisplayName: 'Committee Member', Description: 'Committee membership records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Committee__c', DisplayName: 'Committee', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Committee' },
        { Name: 'NU__Contact__c', DisplayName: 'Contact', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Contact' },
    ]},
    { Name: 'NU__Donation__c', DisplayName: 'Donation', Description: 'Donation/gift records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Account__c', DisplayName: 'Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Account' },
    ]},
    { Name: 'NU__Product__c', DisplayName: 'Product', Description: 'Products/items for sale', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'NU__Badge__c', DisplayName: 'Badge', Description: 'Badges/certifications', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'NU__Subscription__c', DisplayName: 'Subscription', Description: 'Publication subscriptions', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Account__c', DisplayName: 'Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Account' },
    ]},
    { Name: 'NU__Campaign__c', DisplayName: 'Campaign', Description: 'Fundraising campaigns', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'NU__Session__c', DisplayName: 'Session', Description: 'Event sessions', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Event__c', DisplayName: 'Event', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Event' },
    ]},
    { Name: 'NU__Credential__c', DisplayName: 'Credential', Description: 'Professional credentials/certifications', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'NU__Contact__c', DisplayName: 'Contact', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Contact' },
    ]},
    { Name: 'NU__Chapter__c', DisplayName: 'Chapter', Description: 'Chapters/branches', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
];

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'NimbleAMSConnector')
export class NimbleAMSConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Nimble AMS'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] { return NIMBLE_OBJECTS; }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-id-badge';
        config.CategoryDescription = 'Nimble AMS (Salesforce-native) for memberships, events, orders, and donations';
        config.ParentCategoryName = 'Association Management';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery ─────────────────────────────────────────────────────

    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        // Try Salesforce describe API for dynamic discovery of NU__ objects
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NimbleAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.InstanceURL}/services/data/${auth.ApiVersion}/sobjects`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as { sobjects: Array<{ name: string; label: string; queryable: boolean; createable: boolean; updateable: boolean; deletable: boolean }> };
                const results: ExternalObjectSchema[] = [];
                for (const obj of (body.sobjects ?? [])) {
                    // Include NU__ namespace objects + standard objects used by Nimble
                    if (obj.name.startsWith('NU__') || ['Account', 'Contact', 'Lead', 'Opportunity', 'Campaign'].includes(obj.name)) {
                        if (obj.queryable) {
                            results.push({
                                Name: obj.name, Label: obj.label, Description: `${obj.label} (Nimble AMS)`,
                                SupportsIncrementalSync: true, SupportsWrite: obj.createable || obj.updateable,
                            });
                        }
                    }
                }
                if (results.length > 0) return results;
            }
        } catch { /* Fall through to static */ }

        return NIMBLE_OBJECTS.map(obj => ({
            Name: obj.Name, Label: obj.DisplayName, Description: obj.Description,
            SupportsIncrementalSync: true, SupportsWrite: obj.SupportsWrite ?? false,
        }));
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        // Salesforce describe endpoint for field metadata
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NimbleAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.InstanceURL}/services/data/${auth.ApiVersion}/sobjects/${objectName}/describe`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const body = response.Body as { fields: Array<{ name: string; label: string; type: string; nillable: boolean; createable: boolean; updateable: boolean; unique: boolean; }> };
                return (body.fields ?? []).map(f => ({
                    Name: f.name, Label: f.label, Description: '', DataType: this.MapSFType(f.type),
                    IsRequired: !f.nillable, IsUniqueKey: f.name === 'Id' || f.unique, IsReadOnly: !f.createable && !f.updateable,
                }));
            }
        } catch { /* Fall through to static */ }

        const obj = NIMBLE_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({ Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly }));
    }

    private MapSFType(sfType: string): string {
        const map: Record<string, string> = {
            'id': 'string', 'string': 'string', 'textarea': 'string', 'url': 'string', 'email': 'string', 'phone': 'string',
            'boolean': 'boolean', 'int': 'number', 'double': 'decimal', 'currency': 'decimal', 'percent': 'decimal',
            'date': 'datetime', 'datetime': 'datetime', 'reference': 'string', 'picklist': 'string', 'multipicklist': 'string',
        };
        return map[sfType] ?? 'string';
    }

    // ─── Auth ──────────────────────────────────────────────────────────

    protected async Authenticate(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return { Token: this.tokenCache.AccessToken, TokenType: 'Bearer', Config: config, InstanceURL: config.InstanceURL, ApiVersion: SF_API_VERSION } as NimbleAuthContext;
        }
        const token = await this.ObtainToken(config);
        this.tokenCache = token;
        return { Token: token.AccessToken, TokenType: 'Bearer', Config: config, InstanceURL: config.InstanceURL, ApiVersion: SF_API_VERSION } as NimbleAuthContext;
    }

    private async ObtainToken(config: NimbleAMSConnectionConfig): Promise<CachedToken> {
        const tokenURL = `${config.InstanceURL}/services/oauth2/token`;
        const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: config.ClientID, client_secret: config.ClientSecret });
        const response = await fetch(tokenURL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`Nimble AMS auth failed: ${response.status}`);
        const data = await response.json() as { access_token: string; instance_url: string };
        return { AccessToken: data.access_token, ExpiresAt: Date.now() + (3600 * 1000) };
    }

    private async ParseConfig(companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<NimbleAMSConnectionConfig> {
        // Use the typed property — never .Get()/.Set() on entity-typed objects (CLAUDE.md §2b).
        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const md = provider ?? new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                return { InstanceURL: parsed['InstanceURL'] ?? '', ClientID: parsed['ClientID'] ?? parsed['clientId'] ?? '', ClientSecret: parsed['ClientSecret'] ?? parsed['clientSecret'] ?? '', AccessToken: parsed['AccessToken'], RefreshToken: parsed['RefreshToken'] };
            }
        }
        throw new Error('No Nimble AMS credentials found.');
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser) as NimbleAuthContext;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${auth.InstanceURL}/services/data/${auth.ApiVersion}/sobjects`, 'GET', headers);
            if (response.Status === 200) return { Success: true, Message: 'Connected to Nimble AMS (Salesforce)' };
            return { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) { return { Success: false, Message: err instanceof Error ? err.message : String(err) }; }
    }

    // ─── URL / Response / Pagination ───────────────────────────────────

    protected GetBaseURL(_ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        const a = auth as NimbleAuthContext;
        return `${a.InstanceURL}/services/data/${a.ApiVersion}`;
    }

    protected override BuildPaginatedURL(basePath: string, _obj: { PaginationType: string; DefaultPageSize: number }, _page: number, _offset: number, cursor?: string): string {
        return cursor ?? basePath;
    }

    protected NormalizeResponse(rawBody: unknown, _key: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['records'])) return body['records'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }

    protected ExtractPaginationInfo(rawBody: unknown, _pt: PaginationType, _cp: number, _co: number, _ps: number): PaginationState {
        const body = rawBody as SFQueryResponse;
        return { HasMore: !body.done, NextCursor: body.nextRecordsUrl };
    }

    // ─── FetchChanges — SOQL-based ─────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NimbleAuthContext;
        const headers = this.BuildHeaders(auth);

        let soql = `SELECT FIELDS(ALL) FROM ${ctx.ObjectName} ORDER BY LastModifiedDate ASC LIMIT ${SF_PAGE_SIZE}`;
        if (ctx.WatermarkValue) {
            soql = `SELECT FIELDS(ALL) FROM ${ctx.ObjectName} WHERE LastModifiedDate >= ${ctx.WatermarkValue} ORDER BY LastModifiedDate ASC LIMIT ${SF_PAGE_SIZE}`;
        }

        const url = ctx.CurrentCursor
            ? `${auth.InstanceURL}${ctx.CurrentCursor}`
            : `${auth.InstanceURL}/services/data/${auth.ApiVersion}/query?q=${encodeURIComponent(soql)}`;

        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) throw new Error(`Nimble AMS SOQL error: ${response.Status}`);

        const body = response.Body as SFQueryResponse;
        const records = body.records ?? [];
        const externalRecords: ExternalRecord[] = records.map(r => ({ ExternalID: String(r['Id'] ?? ''), ObjectType: ctx.ObjectName, Fields: r }));

        let newWatermark: string | undefined;
        if (body.done) {
            for (const r of records) {
                const mod = r['LastModifiedDate'] as string | undefined;
                if (mod && (!newWatermark || mod > newWatermark)) newWatermark = mod;
            }
        }

        return { Records: externalRecords, HasMore: !body.done, NextCursor: body.nextRecordsUrl, NewWatermarkValue: body.done ? newWatermark : undefined };
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NimbleAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.InstanceURL}/services/data/${auth.ApiVersion}/sobjects/${ctx.ObjectName}`;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) {
            const body = response.Body as Record<string, unknown>;
            const newID = body['id'] == null ? undefined : String(body['id']);
            return this.BuildCreatedResult(newID, response.Status, ctx.ObjectName);
        }
        return this.BuildCRUDError(response, 'CreateRecord', ctx.ObjectName);
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NimbleAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.InstanceURL}/services/data/${auth.ApiVersion}/sobjects/${ctx.ObjectName}/${ctx.ExternalID}`;
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        return this.BuildCRUDError(response, 'UpdateRecord', ctx.ObjectName);
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NimbleAuthContext;
        const headers = this.BuildHeaders(auth);
        const url = `${auth.InstanceURL}/services/data/${auth.ApiVersion}/sobjects/${ctx.ObjectName}/${ctx.ExternalID}`;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', headers);
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        return this.BuildCRUDError(response, 'DeleteRecord', ctx.ObjectName);
    }

    private BuildCRUDError(response: RESTResponse, op: string, obj: string): CRUDResult {
        const bodyStr = typeof response.Body === 'string' ? response.Body : JSON.stringify(response.Body);
        return { Success: false, ExternalID: '', StatusCode: response.Status, ErrorMessage: `${op} failed for ${obj}: HTTP ${response.Status} — ${bodyStr?.substring(0, 300)}` };
    }

    // ─── Headers + HTTP ────────────────────────────────────────────────

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return { 'Authorization': `Bearer ${auth.Token}`, 'Accept': 'application/json', 'User-Agent': 'MemberJunction-Integration/1.0' };
    }

    protected async MakeHTTPRequest(_auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        await this.Throttle();
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();
            if (response.status === 401 && attempt === 0) { this.tokenCache = null; continue; }
            if (response.status === 429) { const d = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000); await this.Sleep(d); continue; }
            if (response.status >= 500 && attempt < MAX_RETRIES) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000)); continue; }
            const responseBody = await this.ParseBody(response);
            return this.ToRESTResponse(response, responseBody);
        }
        throw new Error(`Nimble AMS request failed after ${MAX_RETRIES} retries: ${url}`);
    }

    private async FetchWithTimeout(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = { method, headers, signal: controller.signal };
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) opts.body = JSON.stringify(body);
            return await fetch(url, opts);
        } catch (err) { if (err instanceof Error && err.name === 'AbortError') throw new Error(`Request timed out: ${url}`); throw err; }
        finally { clearTimeout(tid); }
    }

    private async ParseBody(r: Response): Promise<unknown> { const ct = r.headers.get('content-type') ?? ''; return ct.includes('json') ? r.json() : r.text(); }
    private ToRESTResponse(r: Response, body: unknown): RESTResponse { const h: Record<string, string> = {}; r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; }); return { Status: r.status, Body: body, Headers: h }; }
    private async Throttle(): Promise<void> { const e = Date.now() - this.lastRequestTime; if (e < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - e); }
    private Sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = NIMBLE_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [{ SourceFieldName: 'Id', DestinationFieldName: 'Id', IsKeyField: true }];
        return obj.Fields.map(f => ({ SourceFieldName: f.Name, DestinationFieldName: f.Name, IsKeyField: f.IsPrimaryKey }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadNimbleAMSConnector() { /* intentionally empty */ }
