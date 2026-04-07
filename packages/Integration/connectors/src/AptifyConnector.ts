/**
 * AptifyConnector — Integration connector for Aptify (Community Brands) association management.
 *
 * API Documentation: Behind customer portal (aptifykb.atlassian.net, aptifysupport.zendesk.com)
 *
 * Auth: Token-based. POST to auth endpoint with username/password → returns GUID TokenId.
 *       Authorization header: `Web {TokenId}`
 * Base URL: https://{server}/AptifyServicesAPI/services
 * Pagination: top/skip OData-style query parameters
 * Rate limits: Instance-dependent (not publicly documented)
 * Incremental: Filter parameters on modified date fields
 * CRUD: Full via generic entity endpoints /services/{EntityName}/{id}
 *
 * API Categories:
 *   - Entity Services API (implemented) — generic CRUD on all entity types
 *   - Service Data Objects (implemented) — business logic wrappers
 *   - Aptify 7 Azure API (NOT implemented) — newer Azure-native version, separate endpoint
 *   - Bulk Import (NOT implemented) — file-based import, not API-driven
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector, BaseRESTIntegrationConnector,
    type RESTAuthContext, type RESTResponse, type PaginationState, type PaginationType,
    type ConnectionTestResult, type ExternalRecord, type DefaultFieldMapping,
    type FetchContext, type FetchBatchResult, type CreateRecordContext, type UpdateRecordContext,
    type DeleteRecordContext, type CRUDResult, type IntegrationObjectInfo, type ExternalObjectSchema, type ExternalFieldSchema,
} from '@memberjunction/integration-engine';

export interface AptifyConnectionConfig { BaseURL: string; Username: string; Password: string; AuthProvider?: string; }
interface AptifyAuthContext extends RESTAuthContext { Config: AptifyConnectionConfig; }
interface CachedToken { TokenId: string; ExpiresAt: number; }

const APT_PAGE_SIZE = 200;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 200;

const APT_OBJECTS: IntegrationObjectInfo[] = [
    { Name: 'Persons', DisplayName: 'Person', Description: 'Individual contacts/members', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'LastModifiedDate', DisplayName: 'Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Companies', DisplayName: 'Company', Description: 'Organization records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'Memberships', DisplayName: 'Membership', Description: 'Membership records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'MembershipTypes', DisplayName: 'Membership Type', Description: 'Membership type definitions', SupportsWrite: false, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'Events', DisplayName: 'Event', Description: 'Events and meetings', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'EventRegistrations', DisplayName: 'Event Registration', Description: 'Event registrations', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'EventId', DisplayName: 'Event ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Events' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'Orders', DisplayName: 'Order', Description: 'Sales orders', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'OrderDetails', DisplayName: 'Order Detail', Description: 'Order line items', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'OrderId', DisplayName: 'Order ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Orders' },
    ]},
    { Name: 'Products', DisplayName: 'Product', Description: 'Products/items', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'Committees', DisplayName: 'Committee', Description: 'Committees and boards', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'CommitteeMembers', DisplayName: 'Committee Member', Description: 'Committee membership', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'CommitteeId', DisplayName: 'Committee ID', Type: 'number', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Committees' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'Addresses', DisplayName: 'Address', Description: 'Contact addresses', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'Donations', DisplayName: 'Donation', Description: 'Donation/gift records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'Certifications', DisplayName: 'Certification', Description: 'Professional certifications', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'Education', DisplayName: 'Education', Description: 'Education/degree records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
    { Name: 'Payments', DisplayName: 'Payment', Description: 'Payment records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'Invoices', DisplayName: 'Invoice', Description: 'Invoice records', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'Chapters', DisplayName: 'Chapter', Description: 'Chapters/branches', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
    ]},
    { Name: 'Subscriptions', DisplayName: 'Subscription', Description: 'Publication subscriptions', SupportsWrite: true, Fields: [
        { Name: 'Id', DisplayName: 'ID', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record ID' },
        { Name: 'PersonId', DisplayName: 'Person ID', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Persons' },
    ]},
];

@RegisterClass(BaseIntegrationConnector, 'AptifyConnector')
export class AptifyConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Aptify'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override GetIntegrationObjects(): IntegrationObjectInfo[] { return APT_OBJECTS; }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-building-columns';
        config.CategoryDescription = 'Aptify association management for persons, memberships, events, and orders';
        config.ParentCategoryName = 'Association Management';
        config.IncludeSearch = true; config.IncludeList = true;
        return config;
    }

    public override async DiscoverObjects(_ci: MJCompanyIntegrationEntity, _cu: UserInfo): Promise<ExternalObjectSchema[]> {
        return APT_OBJECTS.map(o => ({ Name: o.Name, Label: o.DisplayName, Description: o.Description, SupportsIncrementalSync: true, SupportsWrite: o.SupportsWrite ?? false }));
    }
    public override async DiscoverFields(_ci: MJCompanyIntegrationEntity, objectName: string, _cu: UserInfo): Promise<ExternalFieldSchema[]> {
        const obj = APT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({ Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly }));
    }

    protected async Authenticate(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<RESTAuthContext> {
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + 60_000) {
            const config = await this.ParseConfig(ci, cu);
            return { Token: this.tokenCache.TokenId, TokenType: 'Web', Config: config } as AptifyAuthContext;
        }
        const config = await this.ParseConfig(ci, cu);
        const authURL = `${config.BaseURL}/authentication`;
        const response = await fetch(authURL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Username: config.Username, Password: config.Password, AuthProvider: config.AuthProvider ?? 'AptifyUser' }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`Aptify auth failed: ${response.status}`);
        const data = await response.json() as { TokenId: string };
        this.tokenCache = { TokenId: data.TokenId, ExpiresAt: Date.now() + (3600 * 1000) };
        return { Token: data.TokenId, TokenType: 'Web', Config: config } as AptifyAuthContext;
    }

    private async ParseConfig(ci: MJCompanyIntegrationEntity, cu?: UserInfo): Promise<AptifyConnectionConfig> {
        const credentialID = ci.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', cu);
            if (await cred.Load(credentialID) && cred.Values) {
                const p = JSON.parse(cred.Values) as Record<string, string>;
                return { BaseURL: p['BaseURL'] ?? '', Username: p['Username'] ?? '', Password: p['Password'] ?? '', AuthProvider: p['AuthProvider'] };
            }
        }
        throw new Error('No Aptify credentials found.');
    }

    public async TestConnection(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(ci, cu) as AptifyAuthContext;
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, `${auth.Config.BaseURL}/services/Persons?$top=1`, 'GET', headers);
            return response.Status === 200 ? { Success: true, Message: 'Connected to Aptify' } : { Success: false, Message: `API returned ${response.Status}` };
        } catch (err) { return { Success: false, Message: err instanceof Error ? err.message : String(err) }; }
    }

    protected GetBaseURL(_ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string { return (auth as AptifyAuthContext).Config.BaseURL; }
    protected override BuildPaginatedURL(basePath: string, _obj: { PaginationType: string; DefaultPageSize: number }, _page: number, offset: number): string {
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}$top=${APT_PAGE_SIZE}&$skip=${offset}`;
    }
    protected NormalizeResponse(rawBody: unknown, _key: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        if (Array.isArray(body['value'])) return body['value'] as Record<string, unknown>[];
        if (Array.isArray(body['Items'])) return body['Items'] as Record<string, unknown>[];
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }
    protected ExtractPaginationInfo(rawBody: unknown, _pt: PaginationType, _cp: number, currentOffset: number, _ps: number): PaginationState {
        const records = this.NormalizeResponse(rawBody, null);
        return { HasMore: records.length >= APT_PAGE_SIZE, NextOffset: currentOffset + records.length };
    }

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as AptifyAuthContext;
        const headers = this.BuildHeaders(auth);
        const offset = ctx.CurrentOffset ?? 0;
        let url = `${auth.Config.BaseURL}/services/${ctx.ObjectName}?$top=${APT_PAGE_SIZE}&$skip=${offset}`;
        if (ctx.WatermarkValue) url += `&$filter=LastModifiedDate ge datetime'${ctx.WatermarkValue}'`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) throw new Error(`Aptify ${ctx.ObjectName} error: ${response.Status}`);
        const records = this.NormalizeResponse(response.Body, null);
        return {
            Records: records.map(r => ({ ExternalID: String(r['Id'] ?? ''), ObjectType: ctx.ObjectName, Fields: r })),
            HasMore: records.length >= APT_PAGE_SIZE, NextOffset: offset + records.length,
        };
    }

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as AptifyAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const response = await this.MakeHTTPRequest(auth, `${auth.Config.BaseURL}/services/${ctx.ObjectName}`, 'POST', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) { const b = response.Body as Record<string, unknown>; return { Success: true, ExternalID: String(b['Id'] ?? ''), StatusCode: response.Status }; }
        return { Success: false, ExternalID: '', StatusCode: response.Status, ErrorMessage: `Create failed: ${response.Status}` };
    }
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as AptifyAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const response = await this.MakeHTTPRequest(auth, `${auth.Config.BaseURL}/services/${ctx.ObjectName}/${ctx.ExternalID}`, 'PUT', headers, ctx.Attributes);
        if (response.Status >= 200 && response.Status < 300) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        return { Success: false, ExternalID: ctx.ExternalID, StatusCode: response.Status, ErrorMessage: `Update failed: ${response.Status}` };
    }
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as AptifyAuthContext;
        const response = await this.MakeHTTPRequest(auth, `${auth.Config.BaseURL}/services/${ctx.ObjectName}/${ctx.ExternalID}`, 'DELETE', this.BuildHeaders(auth));
        if (response.Status === 204 || (response.Status >= 200 && response.Status < 300)) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: response.Status };
        return { Success: false, ExternalID: ctx.ExternalID, StatusCode: response.Status, ErrorMessage: `Delete failed: ${response.Status}` };
    }

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return { 'Authorization': `Web ${auth.Token}`, 'Accept': 'application/json', 'User-Agent': 'MemberJunction-Integration/1.0' };
    }

    protected async MakeHTTPRequest(_auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        await this.Throttle();
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const response = await this.FetchWithTimeout(url, method, headers, body);
            this.lastRequestTime = Date.now();
            if (response.status === 401 && attempt === 0) { this.tokenCache = null; continue; }
            if (response.status === 429) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000)); continue; }
            if (response.status >= 500 && attempt < MAX_RETRIES) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000)); continue; }
            const rb = await (response.headers.get('content-type')?.includes('json') ? response.json() : response.text());
            const h: Record<string, string> = {}; response.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
            return { Status: response.status, Body: rb, Headers: h };
        }
        throw new Error(`Aptify request failed after ${MAX_RETRIES} retries: ${url}`);
    }
    private async FetchWithTimeout(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
        try { const o: RequestInit = { method, headers, signal: c.signal }; if (body && method !== 'GET' && method !== 'DELETE') o.body = JSON.stringify(body); return await fetch(url, o); }
        catch (e) { if (e instanceof Error && e.name === 'AbortError') throw new Error(`Aptify request timed out: ${url}`); throw e; }
        finally { clearTimeout(t); }
    }
    private async Throttle(): Promise<void> { const e = Date.now() - this.lastRequestTime; if (e < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - e); }
    private Sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = APT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return []; return obj.Fields.map(f => ({ SourceFieldName: f.Name, DestinationFieldName: f.Name, IsKeyField: f.IsPrimaryKey }));
    }
}
export function LoadAptifyConnector() { /* intentionally empty */ }
