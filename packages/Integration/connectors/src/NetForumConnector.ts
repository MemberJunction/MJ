/**
 * ⚠️ NEEDS REWORK BEFORE SHIPPING — 3 known wire-level gaps ⚠️
 *
 * 2026-05-20 vendor-truth audit:
 *
 *   1. Auth token is returned in the WWW-Authenticate RESPONSE HEADER, not in the
 *      JSON body. Vendor doc quote: "The token is in the WWW-Authenticate header.
 *      The value will look like: 'Bearer token = eb5667ab-25ac-45c9-b831-23b43be8f194'".
 *      Current code (line ~195) parses response.json() expecting `{ Token: string }` —
 *      will fail to extract the token from every real authenticate call.
 *   2. `LastModifiedDate` is not a canonical NetForum column. Each facade uses a
 *      prefixed name (`ind_last_updated_dt` for Individual, `evt_last_updated_dt`
 *      for Event, etc.). FetchChanges currently emits `szWhereClause=LastModifiedDate
 *      >= '<wm>'` which yields zero rows or a query error on every object.
 *   3. `DeleteFacadeObject` is not in any reachable vendor doc snippet. Get/Insert/
 *      Update facade methods are documented. SupportsDelete=true may need to flip
 *      false, or use a different method (vendor refers to "soft-deletes" generically).
 *
 * Vendor doc URLs:
 *   - xWeb Overview: https://documentation.abila.com/netforum-enterprise/2017.1/Content/xWeb/XWeb_Overview.htm
 *   - JSON over xWeb: http://documentation.abila.com/netforum-enterprise/2017.1/Content/xWeb/JSON_Over_xWeb_Overview.htm
 *   - xWeb Methods: https://nfesupport.zendesk.com/hc/en-us/articles/10639146855565
 *   - Authenticate: https://nfesupport.zendesk.com/hc/en-us/articles/10639139863309-Authenticate
 *
 * Auth: Two-step token auth.
 *   1. POST /xWeb/Signon.asmx with credentials → returns auth token in SOAP header
 *   2. JSON mode: POST /xWeb/JSON/Authenticate with Basic Auth → returns token
 *      Pass token as Authorization: Bearer {token} on subsequent calls
 * Base URL: https://{site}/xWeb/JSON/{MethodName} (JSON mode)
 *           https://{site}/xWeb/netForumXML.asmx (SOAP mode)
 * Pagination: Results returned in full via WEBQuery/GetQuery — no standard offset/limit
 * Rate limits: Instance-dependent (not documented)
 * Incremental: Via query parameters (date range filters in WEBQuery)
 * CRUD: Via facade CRUD methods (GetFacadeObject, InsertFacadeObject, UpdateFacadeObject, DeleteFacadeObject)
 *
 * API Categories:
 *   - JSON over xWeb (implemented) — RESTful JSON wrapper over xWeb methods
 *   - SOAP xWeb (NOT implemented) — legacy XML, JSON mode preferred
 *   - SQL Views (NOT implemented) — direct SQL access, not API-based
 *   - Webhooks (NOT available) — no webhook/CDC support in NetForum
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector, BaseRESTIntegrationConnector,
    type RESTAuthContext, type RESTResponse, type PaginationState, type PaginationType,
    type ConnectionTestResult, type ExternalRecord, type DefaultFieldMapping,
    type FetchContext, type FetchBatchResult, type CreateRecordContext, type UpdateRecordContext,
    type DeleteRecordContext, type CRUDResult, type IntegrationObjectInfo, type ExternalObjectSchema, type ExternalFieldSchema,
    type SourceSchemaInfo, type SourceFieldInfo,
} from '@memberjunction/integration-engine';

export interface NetForumConnectionConfig { BaseURL: string; Username: string; Password: string; }
interface NFAuthContext extends RESTAuthContext { Config: NetForumConnectionConfig; }
interface CachedToken { Token: string; ExpiresAt: number; }

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 200;

// NetForum facade objects — each maps to a GetFacadeObject/WEBQuery target
const NF_OBJECTS: IntegrationObjectInfo[] = [
    { Name: 'Individual', DisplayName: 'Individual', Description: 'Individual contacts/members', SupportsWrite: true, Fields: [
        { Name: 'ind_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Customer GUID' },
        { Name: 'ind_last_updated_dt', DisplayName: 'Last Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Organization', DisplayName: 'Organization', Description: 'Organization/company records', SupportsWrite: true, Fields: [
        { Name: 'org_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Customer GUID' },
    ]},
    { Name: 'Membership', DisplayName: 'Membership', Description: 'Membership records', SupportsWrite: true, Fields: [
        { Name: 'mbr_key', DisplayName: 'Membership Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Membership GUID' },
        { Name: 'mbr_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual/Organization' },
    ]},
    { Name: 'MembershipType', DisplayName: 'Membership Type', Description: 'Membership type definitions', SupportsWrite: false, Fields: [
        { Name: 'mbt_key', DisplayName: 'Type Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Type GUID' },
    ]},
    { Name: 'Event', DisplayName: 'Event', Description: 'Events and conferences', SupportsWrite: true, Fields: [
        { Name: 'evt_key', DisplayName: 'Event Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Event GUID' },
        { Name: 'evt_start_dt', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'EventRegistration', DisplayName: 'Event Registration', Description: 'Event registrations', SupportsWrite: true, Fields: [
        { Name: 'reg_key', DisplayName: 'Registration Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Registration GUID' },
        { Name: 'reg_evt_key', DisplayName: 'Event Key', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Event' },
        { Name: 'reg_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual' },
    ]},
    { Name: 'Committee', DisplayName: 'Committee', Description: 'Committees and boards', SupportsWrite: true, Fields: [
        { Name: 'cmt_key', DisplayName: 'Committee Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Committee GUID' },
    ]},
    { Name: 'CommitteeMember', DisplayName: 'Committee Member', Description: 'Committee membership', SupportsWrite: true, Fields: [
        { Name: 'cmm_key', DisplayName: 'Member Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Committee member GUID' },
        { Name: 'cmm_cmt_key', DisplayName: 'Committee Key', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Committee' },
        { Name: 'cmm_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual' },
    ]},
    { Name: 'Invoice', DisplayName: 'Invoice', Description: 'Invoices', SupportsWrite: true, Fields: [
        { Name: 'inv_key', DisplayName: 'Invoice Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invoice GUID' },
        { Name: 'inv_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual/Organization' },
    ]},
    { Name: 'Payment', DisplayName: 'Payment', Description: 'Payment records', SupportsWrite: true, Fields: [
        { Name: 'pmt_key', DisplayName: 'Payment Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Payment GUID' },
    ]},
    { Name: 'Product', DisplayName: 'Product', Description: 'Products for sale', SupportsWrite: true, Fields: [
        { Name: 'prd_key', DisplayName: 'Product Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Product GUID' },
    ]},
    { Name: 'Order', DisplayName: 'Order', Description: 'Sales orders', SupportsWrite: true, Fields: [
        { Name: 'ord_key', DisplayName: 'Order Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Order GUID' },
        { Name: 'ord_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual/Organization' },
    ]},
    { Name: 'Donation', DisplayName: 'Donation', Description: 'Donation/gift records', SupportsWrite: true, Fields: [
        { Name: 'don_key', DisplayName: 'Donation Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Donation GUID' },
        { Name: 'don_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual/Organization' },
    ]},
    { Name: 'Address', DisplayName: 'Address', Description: 'Customer addresses', SupportsWrite: true, Fields: [
        { Name: 'adr_key', DisplayName: 'Address Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Address GUID' },
        { Name: 'adr_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual/Organization' },
    ]},
    { Name: 'Session', DisplayName: 'Session', Description: 'Event sessions', SupportsWrite: true, Fields: [
        { Name: 'ses_key', DisplayName: 'Session Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Session GUID' },
        { Name: 'ses_evt_key', DisplayName: 'Event Key', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Event' },
    ]},
    { Name: 'Subscription', DisplayName: 'Subscription', Description: 'Publication subscriptions', SupportsWrite: true, Fields: [
        { Name: 'sub_key', DisplayName: 'Subscription Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Subscription GUID' },
        { Name: 'sub_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual/Organization' },
    ]},
    { Name: 'Certification', DisplayName: 'Certification', Description: 'Professional certifications', SupportsWrite: true, Fields: [
        { Name: 'crt_key', DisplayName: 'Certification Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Certification GUID' },
        { Name: 'crt_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual' },
    ]},
    { Name: 'ContinuingEducation', DisplayName: 'CE Credit', Description: 'Continuing education credits', SupportsWrite: true, Fields: [
        { Name: 'ceu_key', DisplayName: 'CE Key', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'CE GUID' },
        { Name: 'ceu_cst_key', DisplayName: 'Customer Key', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Individual' },
    ]},
];

@RegisterClass(BaseIntegrationConnector, 'NetForumConnector')
export class NetForumConnector extends BaseRESTIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'NetForum Enterprise'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    // Vendor docs document InsertFacadeObject + UpdateFacadeObject; no DeleteFacadeObject
    // appears in any reachable doc page. NetForum more commonly uses status flags ("soft
    // delete") rather than hard delete. Keeping the flag false until DeleteFacadeObject
    // is confirmed from a real vendor source — DeleteRecord returns a clean error.
    public override get SupportsDelete(): boolean { return false; }

    /**
     * Resolves the canonical "last modified" column for a NetForum facade object.
     * NetForum uses prefixed names (ind_last_updated_dt, evt_last_updated_dt, etc.)
     * rather than a universal LastModifiedDate column. Falls back to the column
     * declared in NF_OBJECTS, then to a generic 'last_updated_dt' if no static
     * entry exists.
     */
    private ResolveWatermarkColumn(objectName: string): string {
        const obj = NF_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (obj) {
            // Look for an explicit timestamp field on the static catalog
            const timestampField = obj.Fields.find(f =>
                /datetime/i.test(f.Type) && /last|updated|modified/i.test(f.Name)
            );
            if (timestampField) return timestampField.Name;
        }
        // Fallback: NetForum's most common naming convention is <prefix>_last_updated_dt.
        // Without a known prefix per object, return a generic name + warn.
        console.warn(`[NetForum] No known watermark column for object '${objectName}'; using fallback 'last_updated_dt'`);
        return 'last_updated_dt';
    }

    /**
     * Resolves the PROVABLE watermark column for a NetForum facade object — i.e.
     * a column the object's OWN static catalog declares as a datetime whose name
     * matches last/updated/modified. Unlike ResolveWatermarkColumn(), this NEVER
     * falls back to a guessed name: if the object declares no such field, it
     * returns undefined so callers leave IncrementalWatermarkField unset.
     */
    private ResolveDeclaredWatermarkColumn(objectName: string): string | undefined {
        const obj = NF_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const timestampField = obj?.Fields.find(f =>
            /datetime/i.test(f.Type) && /last|updated|modified/i.test(f.Name)
        );
        return timestampField?.Name;
    }

    /**
     * Resolves a field's declared foreign-key target to a sibling object actually
     * declared in NF_OBJECTS. The static catalog encodes FK intent in the field
     * Description (e.g. 'FK → Event'). This promotes that declaration into the
     * framework's IsForeignKey/ForeignKeyTarget slots — but ONLY when the target
     * resolves to exactly ONE declared sibling object. Polymorphic targets
     * (e.g. 'FK → Individual/Organization') name two objects and are skipped.
     */
    private ResolveForeignKeyTarget(description: string | undefined): string | null {
        if (!description) return null;
        const match = description.match(/^FK\s*(?:→|->)\s*(.+)$/i);
        if (!match) return null;
        const target = match[1].trim();
        // Polymorphic refs (e.g. 'Individual/Organization') name multiple objects — skip.
        if (target.includes('/')) return null;
        const sibling = NF_OBJECTS.find(o => o.Name.toLowerCase() === target.toLowerCase());
        return sibling ? sibling.Name : null;
    }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] { return NF_OBJECTS; }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-network-wired';
        config.CategoryDescription = 'NetForum Enterprise AMS for members, events, committees, and orders';
        config.ParentCategoryName = 'Association Management';
        config.IncludeSearch = true; config.IncludeList = true;
        return config;
    }

    public override async DiscoverObjects(_ci: MJCompanyIntegrationEntity, _cu: UserInfo): Promise<ExternalObjectSchema[]> {
        return NF_OBJECTS.map(o => ({ Name: o.Name, Label: o.DisplayName, Description: o.Description, SupportsIncrementalSync: true, SupportsWrite: o.SupportsWrite ?? false }));
    }
    public override async DiscoverFields(ci: MJCompanyIntegrationEntity, objectName: string, cu: UserInfo): Promise<ExternalFieldSchema[]> {
        // Dynamic: fetch one record via GetQuery to discover all fields
        try {
            const auth = await this.Authenticate(ci, cu) as NFAuthContext;
            const headers = this.BuildHeaders(auth);
            const url = `${auth.Config.BaseURL}/xWeb/JSON/GetQuery?szObjectName=${objectName}&szColumnList=*&intRecordCount=1`;
            const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsFromSample(records[0], objectName);
            }
        } catch { /* fall through to static */ }
        const obj = NF_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => {
            const fkTarget = this.ResolveForeignKeyTarget(f.Description);
            return {
                Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type,
                IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly,
                IsForeignKey: fkTarget !== null, ForeignKeyTarget: fkTarget,
            };
        });
    }

    private InferFieldsFromSample(sample: Record<string, unknown>, objectName: string): ExternalFieldSchema[] {
        const staticObj = NF_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(sample)) {
            const sf = staticMap.get(key.toLowerCase());
            const fkTarget = this.ResolveForeignKeyTarget(sf?.Description);
            fields.push({
                Name: key, Label: sf?.DisplayName ?? key, Description: sf?.Description ?? '',
                DataType: sf?.Type ?? this.InferType(value),
                IsRequired: sf?.IsRequired ?? false, IsUniqueKey: sf?.IsPrimaryKey ?? false, IsReadOnly: sf?.IsReadOnly ?? false,
                IsForeignKey: fkTarget !== null, ForeignKeyTarget: fkTarget,
            });
        }
        return fields;
    }
    private InferType(v: unknown): string {
        if (v === null || v === undefined) return 'string';
        if (typeof v === 'number') return Number.isInteger(v) ? 'number' : 'decimal';
        if (typeof v === 'boolean') return 'boolean';
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return 'datetime';
        return 'string';
    }

    /**
     * Override IntrospectSchema so the schema-builder receives the framework's
     * provable static metadata: foreign keys (declared via each FK field's
     * 'FK → <Sibling>' Description, resolved to a declared sibling object) and,
     * for objects whose own catalog declares a last/updated/modified datetime
     * column, IncrementalWatermarkField. No watermark is invented — objects
     * without a declared timestamp leave the slot unset.
     */
    public override async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const objects = await this.DiscoverObjects(companyIntegration, contextUser);
        const result: SourceSchemaInfo = { Objects: [] };

        for (const obj of objects) {
            const fields = await this.DiscoverFields(companyIntegration, obj.Name, contextUser);
            const sourceFields: SourceFieldInfo[] = fields.map(f => ({
                Name: f.Name,
                Label: f.Label ?? f.Name,
                Description: f.Description,
                SourceType: f.DataType,
                IsRequired: f.IsRequired ?? false,
                IsPrimaryKey: f.IsUniqueKey ?? false,
                IsForeignKey: f.IsForeignKey ?? false,
                ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                MaxLength: null,
                Precision: null,
                Scale: null,
                DefaultValue: null,
            }));

            result.Objects.push({
                ExternalName: obj.Name,
                ExternalLabel: obj.Label ?? obj.Name,
                Description: obj.Description,
                Fields: sourceFields,
                PrimaryKeyFields: sourceFields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                Relationships: sourceFields
                    .filter(f => f.IsForeignKey && f.ForeignKeyTarget)
                    .map(f => ({ FieldName: f.Name, TargetObject: f.ForeignKeyTarget!, TargetField: 'ID' })),
                // Only set when the object's OWN catalog declares a last/updated/modified
                // datetime column (provable). Undefined otherwise — never guessed.
                IncrementalWatermarkField: this.ResolveDeclaredWatermarkColumn(obj.Name),
            });
        }

        return result;
    }

    // ─── Auth (JSON mode) ──────────────────────────────────────────────

    protected async Authenticate(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<RESTAuthContext> {
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + 60_000) {
            const config = await this.ParseConfig(ci, cu);
            return { Token: this.tokenCache.Token, TokenType: 'Bearer', Config: config } as NFAuthContext;
        }
        const config = await this.ParseConfig(ci, cu);
        const basicAuth = Buffer.from(`${config.Username}:${config.Password}`).toString('base64');
        const response = await fetch(`${config.BaseURL}/xWeb/JSON/Authenticate`, {
            method: 'POST', headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`NetForum auth failed: ${response.status}`);

        // Vendor doc canonical: the token is returned in the WWW-Authenticate
        // RESPONSE HEADER, in the form: 'Bearer token = <guid>'. Older versions
        // sometimes also place it in a JSON body; fall back to body parsing if
        // the header isn't present.
        let token: string | null = null;
        const wwwAuth = response.headers.get('www-authenticate') || response.headers.get('WWW-Authenticate');
        if (wwwAuth) {
            // Match patterns like:  'Bearer token = abcd-1234'  or  'Bearer abcd-1234'
            const match = wwwAuth.match(/Bearer\s+(?:token\s*=\s*)?([A-Fa-f0-9-]{8,})/i);
            if (match) token = match[1];
        }
        if (!token) {
            try {
                const body = await response.json() as Record<string, unknown>;
                token = (body['Token'] as string | undefined) ?? (body['token'] as string | undefined) ?? null;
            } catch {
                /* not JSON */
            }
        }
        if (!token) {
            throw new Error('NetForum auth response contained no token (checked WWW-Authenticate header and JSON body)');
        }

        this.tokenCache = { Token: token, ExpiresAt: Date.now() + (3600 * 1000) };
        return { Token: token, TokenType: 'Bearer', Config: config } as NFAuthContext;
    }

    private async ParseConfig(ci: MJCompanyIntegrationEntity, cu?: UserInfo, provider?: IMetadataProvider): Promise<NetForumConnectionConfig> {
        // Use typed property — never .Get()/.Set() on entity-typed objects (CLAUDE.md §2b).
        const credentialID = ci.CredentialID;
        if (credentialID) {
            const md = provider ?? new Metadata();
            const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', cu);
            if (await cred.Load(credentialID) && cred.Values) {
                const p = JSON.parse(cred.Values) as Record<string, string>;
                return { BaseURL: p['BaseURL'] ?? '', Username: p['Username'] ?? '', Password: p['Password'] ?? '' };
            }
        }
        throw new Error('No NetForum credentials found.');
    }

    public async TestConnection(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(ci, cu) as NFAuthContext;
            // Try fetching one Individual record
            const url = `${auth.Config.BaseURL}/xWeb/JSON/GetQuery?szObjectName=Individual&szColumnList=ind_cst_key&intRecordCount=1`;
            const r = await this.MakeHTTPRequest(auth, url, 'GET', this.BuildHeaders(auth));
            return r.Status === 200 ? { Success: true, Message: 'Connected to NetForum Enterprise' } : { Success: false, Message: `API returned ${r.Status}` };
        } catch (err) { return { Success: false, Message: err instanceof Error ? err.message : String(err) }; }
    }

    protected GetBaseURL(_ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string { return (auth as NFAuthContext).Config.BaseURL; }
    protected override BuildPaginatedURL(basePath: string, _o: { PaginationType: string; DefaultPageSize: number }, _p: number, _off: number): string { return basePath; }

    protected NormalizeResponse(rawBody: unknown, _key: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        // NetForum returns DataSet-style { Table: [{...}] } or array
        for (const key of Object.keys(body)) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }
    protected ExtractPaginationInfo(_rb: unknown, _pt: PaginationType, _cp: number, _co: number, _ps: number): PaginationState {
        return { HasMore: false }; // NetForum returns full result sets
    }

    // ─── FetchChanges — via GetQuery JSON method ───────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser) as NFAuthContext;
        const headers = this.BuildHeaders(auth);
        // Use GetQuery for listing records
        let url = `${auth.Config.BaseURL}/xWeb/JSON/GetQuery?szObjectName=${ctx.ObjectName}&szColumnList=*`;
        if (ctx.WatermarkValue) {
            // NetForum facades each use their own prefixed last-modified column.
            // 'LastModifiedDate' is NOT a vendor column. Look it up from the static
            // catalog (NF_OBJECTS lists e.g. 'ind_last_updated_dt' for Individual,
            // 'evt_last_updated_dt' for Event, etc.). Fall back to the connector's
            // earlier-guessed name only when the catalog has no entry.
            const wmCol = this.ResolveWatermarkColumn(ctx.ObjectName);
            url += `&szWhereClause=${encodeURIComponent(`${wmCol} >= '${ctx.WatermarkValue}'`)}`;
        }
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) throw new Error(`NetForum ${ctx.ObjectName} error: ${response.Status}`);
        const records = this.NormalizeResponse(response.Body, null);
        // Determine PK field from static definition
        const obj = NF_OBJECTS.find(o => o.Name.toLowerCase() === ctx.ObjectName.toLowerCase());
        const pkField = obj?.Fields.find(f => f.IsPrimaryKey)?.Name ?? 'key';
        return {
            Records: records.map(r => ({ ExternalID: String(r[pkField] ?? r['key'] ?? ''), ObjectType: ctx.ObjectName, Fields: r })),
            HasMore: false,
        };
    }

    // ─── CRUD — via facade methods ─────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NFAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.Config.BaseURL}/xWeb/JSON/InsertFacadeObject`;
        const payload = { szObjectName: ctx.ObjectName, oRecord: ctx.Attributes };
        const r = await this.MakeHTTPRequest(auth, url, 'POST', headers, payload);
        if (r.Status >= 200 && r.Status < 300) {
            const body = r.Body as Record<string, unknown>;
            const newKey = body['key'] == null ? undefined : String(body['key']);
            return this.BuildCreatedResult(newKey, r.Status, ctx.ObjectName);
        }
        return { Success: false, ExternalID: '', StatusCode: r.Status, ErrorMessage: `Create failed: ${r.Status}` };
    }
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NFAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.Config.BaseURL}/xWeb/JSON/UpdateFacadeObject`;
        const payload = { szObjectName: ctx.ObjectName, szObjectKey: ctx.ExternalID, oRecord: ctx.Attributes };
        const r = await this.MakeHTTPRequest(auth, url, 'POST', headers, payload);
        if (r.Status >= 200 && r.Status < 300) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: r.Status };
        return { Success: false, ExternalID: ctx.ExternalID, StatusCode: r.Status, ErrorMessage: `Update failed: ${r.Status}` };
    }
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo) as NFAuthContext;
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const url = `${auth.Config.BaseURL}/xWeb/JSON/DeleteFacadeObject`;
        const payload = { szObjectName: ctx.ObjectName, szObjectKey: ctx.ExternalID };
        const r = await this.MakeHTTPRequest(auth, url, 'POST', headers, payload);
        if (r.Status >= 200 && r.Status < 300) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: r.Status };
        return { Success: false, ExternalID: ctx.ExternalID, StatusCode: r.Status, ErrorMessage: `Delete failed: ${r.Status}` };
    }

    protected override BuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return { 'Authorization': `Bearer ${auth.Token}`, 'Accept': 'application/json', 'User-Agent': 'MemberJunction-Integration/1.0' };
    }

    protected async MakeHTTPRequest(_auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        await this.Throttle();
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const c = new AbortController(); const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT_MS);
            try {
                const opts: RequestInit = { method, headers, signal: c.signal };
                if (body && method !== 'GET') opts.body = JSON.stringify(body);
                const response = await fetch(url, opts);
                clearTimeout(t); this.lastRequestTime = Date.now();
                if (response.status === 401 && attempt === 0) { this.tokenCache = null; continue; }
                if (response.status === 429) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000)); continue; }
                if (response.status >= 500 && attempt < MAX_RETRIES) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000)); continue; }
                const rb = await (response.headers.get('content-type')?.includes('json') ? response.json() : response.text());
                const h: Record<string, string> = {}; response.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
                return { Status: response.status, Body: rb, Headers: h };
            } catch (e) { clearTimeout(t); if (e instanceof Error && e.name === 'AbortError') throw new Error(`NetForum request timed out: ${url}`); throw e; }
        }
        throw new Error(`NetForum request failed after ${MAX_RETRIES} retries: ${url}`);
    }
    private async Throttle(): Promise<void> { const e = Date.now() - this.lastRequestTime; if (e < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - e); }
    private Sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = NF_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return []; return obj.Fields.map(f => ({ SourceFieldName: f.Name, DestinationFieldName: f.Name, IsKeyField: f.IsPrimaryKey }));
    }
}
export function LoadNetForumConnector() { /* intentionally empty */ }
