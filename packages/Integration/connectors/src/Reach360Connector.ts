/**
 * Reach360Connector — Integration connector for Articulate Reach 360 LMS platform.
 *
 * NOTE: Rise 360 is the authoring tool (no API). Reach 360 is the LMS delivery platform (has API).
 *
 * API Documentation:
 *   - Intro: https://articulate.com/support/article/Reach-360-Introduction-to-Reach-360-API
 *   - Endpoints: https://articulate.com/support/article/Reach-360-API-Endpoints-Reference-Guide
 *
 * Auth: Bearer token (API key from Reach 360 admin settings)
 * Base URL: https://api.reach360.com
 * Pagination: Cursor-based via `nextUrl` in response (limit param 1-100, default 50)
 * Rate limits: Not publicly documented
 * Incremental: updatedAfter param on some endpoints
 * CRUD: Limited — mostly read, some POST for invitations/completions
 *
 * API Categories:
 *   - Courses API (implemented) — course listings, details
 *   - Users API (implemented) — user management, invitations
 *   - Groups API (implemented) — user groups
 *   - Learning Paths API (implemented) — learning path definitions
 *   - Reports API (implemented) — completion reports, learner progress
 *   - Invitations API (implemented) — send course invitations
 *   - Completions API (implemented) — post external completions
 *   - Webhooks API (implemented) — webhook subscriptions
 *   - Content Authoring (NOT available) — Rise 360 authoring has no API
 *   - SCORM/xAPI Export (NOT available) — no API for content package export
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

export interface Reach360ConnectionConfig { ApiKey: string; }

const R360_BASE = 'https://api.reach360.com';
const R360_PAGE_SIZE = 100;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 100;

const R360_OBJECTS: IntegrationObjectInfo[] = [
    { Name: 'Courses', DisplayName: 'Course', Description: 'Published courses', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Course ID' },
        { Name: 'updatedAt', DisplayName: 'Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Users', DisplayName: 'User', Description: 'Learner/admin users', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'User ID' },
        { Name: 'updatedAt', DisplayName: 'Updated', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'Groups', DisplayName: 'Group', Description: 'User groups', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Group ID' },
    ]},
    { Name: 'LearningPaths', DisplayName: 'Learning Path', Description: 'Learning path definitions', SupportsWrite: false, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Learning path ID' },
    ]},
    { Name: 'Invitations', DisplayName: 'Invitation', Description: 'Course invitations sent to users', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Invitation ID' },
        { Name: 'courseId', DisplayName: 'Course ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Courses' },
        { Name: 'userId', DisplayName: 'User ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'FK → Users' },
    ]},
    { Name: 'Completions', DisplayName: 'Completion', Description: 'Course completion records', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Completion ID' },
        { Name: 'courseId', DisplayName: 'Course ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Courses' },
        { Name: 'userId', DisplayName: 'User ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Users' },
        { Name: 'completedAt', DisplayName: 'Completed', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Incremental date' },
    ]},
    { Name: 'ReportCourseLearners', DisplayName: 'Course Learner Report', Description: 'Per-course learner progress report', SupportsWrite: false, Fields: [
        { Name: 'userId', DisplayName: 'User ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Learner ID' },
        { Name: 'courseId', DisplayName: 'Course ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Courses' },
    ]},
    { Name: 'ReportLearnerCourses', DisplayName: 'Learner Course Report', Description: 'Per-learner course progress report', SupportsWrite: false, Fields: [
        { Name: 'courseId', DisplayName: 'Course ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Course ID' },
        { Name: 'userId', DisplayName: 'User ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: false, Description: 'FK → Users' },
    ]},
    { Name: 'Webhooks', DisplayName: 'Webhook', Description: 'Webhook subscriptions', SupportsWrite: true, Fields: [
        { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Webhook ID' },
    ]},
];

@RegisterClass(BaseIntegrationConnector, 'Reach360Connector')
export class Reach360Connector extends BaseRESTIntegrationConnector {
    private lastRequestTime = 0;

    public override get IntegrationName(): string { return 'Reach 360'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override GetIntegrationObjects(): IntegrationObjectInfo[] { return R360_OBJECTS; }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-graduation-cap';
        config.CategoryDescription = 'Reach 360 LMS for courses, users, completions, and learning paths';
        config.ParentCategoryName = 'Learning/eLearning';
        config.IncludeSearch = true; config.IncludeList = true;
        return config;
    }

    public override async DiscoverObjects(_ci: MJCompanyIntegrationEntity, _cu: UserInfo): Promise<ExternalObjectSchema[]> {
        return R360_OBJECTS.map(o => ({ Name: o.Name, Label: o.DisplayName, Description: o.Description, SupportsIncrementalSync: true, SupportsWrite: o.SupportsWrite ?? false }));
    }
    public override async DiscoverFields(ci: MJCompanyIntegrationEntity, objectName: string, cu: UserInfo): Promise<ExternalFieldSchema[]> {
        // Dynamic: fetch one sample record to discover all fields
        try {
            const auth = await this.Authenticate(ci, cu);
            const headers = this.BuildHeaders(auth);
            const apiPath = objectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
            const response = await this.MakeHTTPRequest(auth, `${R360_BASE}/${apiPath}?limit=1`, 'GET', headers);
            if (response.Status === 200) {
                const records = this.NormalizeResponse(response.Body, null);
                if (records.length > 0) return this.InferFieldsFromSample(records[0], objectName);
            }
        } catch { /* fall through to static */ }
        const obj = R360_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return [];
        return obj.Fields.map(f => ({ Name: f.Name, Label: f.DisplayName, Description: f.Description, DataType: f.Type, IsRequired: f.IsRequired, IsUniqueKey: f.IsPrimaryKey, IsReadOnly: f.IsReadOnly }));
    }

    private InferFieldsFromSample(sample: Record<string, unknown>, objectName: string): ExternalFieldSchema[] {
        const staticObj = R360_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const staticMap = new Map((staticObj?.Fields ?? []).map(f => [f.Name.toLowerCase(), f]));
        const fields: ExternalFieldSchema[] = [];
        for (const [key, value] of Object.entries(sample)) {
            const sf = staticMap.get(key.toLowerCase());
            fields.push({
                Name: key, Label: sf?.DisplayName ?? key, Description: sf?.Description ?? '',
                DataType: sf?.Type ?? this.InferType(value),
                IsRequired: sf?.IsRequired ?? false, IsUniqueKey: sf?.IsPrimaryKey ?? false, IsReadOnly: sf?.IsReadOnly ?? false,
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

    protected async Authenticate(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<RESTAuthContext> {
        const config = await this.ParseConfig(ci, cu);
        return { Token: config.ApiKey, TokenType: 'Bearer', Config: config };
    }
    private async ParseConfig(ci: MJCompanyIntegrationEntity, cu?: UserInfo): Promise<Reach360ConnectionConfig> {
        const credentialID = ci.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const cred = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', cu);
            if (await cred.Load(credentialID) && cred.Values) {
                const p = JSON.parse(cred.Values) as Record<string, string>;
                return { ApiKey: p['ApiKey'] ?? p['apiKey'] ?? '' };
            }
        }
        throw new Error('No Reach 360 credentials found.');
    }

    public async TestConnection(ci: MJCompanyIntegrationEntity, cu: UserInfo): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(ci, cu);
            const r = await this.MakeHTTPRequest(auth, `${R360_BASE}/courses?limit=1`, 'GET', this.BuildHeaders(auth));
            return r.Status === 200 ? { Success: true, Message: 'Connected to Reach 360' } : { Success: false, Message: `API returned ${r.Status}` };
        } catch (err) { return { Success: false, Message: err instanceof Error ? err.message : String(err) }; }
    }

    protected GetBaseURL(): string { return R360_BASE; }
    protected override BuildPaginatedURL(basePath: string, _obj: { PaginationType: string; DefaultPageSize: number }, _page: number, _offset: number, cursor?: string): string {
        if (cursor) return cursor;
        const sep = basePath.includes('?') ? '&' : '?';
        return `${basePath}${sep}limit=${R360_PAGE_SIZE}`;
    }
    protected NormalizeResponse(rawBody: unknown, _key: string | null): Record<string, unknown>[] {
        if (Array.isArray(rawBody)) return rawBody as Record<string, unknown>[];
        const body = rawBody as Record<string, unknown>;
        for (const key of ['courses', 'users', 'groups', 'learningPaths', 'invitations', 'completions', 'webhooks', 'items', 'data']) {
            if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
        }
        if (body && Object.keys(body).length > 0) return [body];
        return [];
    }
    protected ExtractPaginationInfo(rawBody: unknown, _pt: PaginationType, _cp: number, _co: number, _ps: number): PaginationState {
        const body = rawBody as Record<string, unknown>;
        const nextUrl = body['nextUrl'] as string | undefined;
        return { HasMore: !!nextUrl, NextCursor: nextUrl };
    }

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = this.BuildHeaders(auth);
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        let url = ctx.CurrentCursor ?? `${R360_BASE}/${apiPath}?limit=${R360_PAGE_SIZE}`;
        if (ctx.WatermarkValue && !ctx.CurrentCursor) url += `&updatedAfter=${encodeURIComponent(ctx.WatermarkValue)}`;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status < 200 || response.Status >= 300) throw new Error(`Reach 360 ${ctx.ObjectName} error: ${response.Status}`);
        const records = this.NormalizeResponse(response.Body, null);
        const body = response.Body as Record<string, unknown>;
        const nextUrl = body['nextUrl'] as string | undefined;
        return {
            Records: records.map(r => ({ ExternalID: String(r['id'] ?? ''), ObjectType: ctx.ObjectName, Fields: r })),
            HasMore: !!nextUrl, NextCursor: nextUrl,
        };
    }

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const r = await this.MakeHTTPRequest(auth, `${R360_BASE}/${apiPath}`, 'POST', headers, ctx.Attributes);
        if (r.Status >= 200 && r.Status < 300) { const b = r.Body as Record<string, unknown>; return { Success: true, ExternalID: String(b['id'] ?? ''), StatusCode: r.Status }; }
        return { Success: false, ExternalID: '', StatusCode: r.Status, ErrorMessage: `Create failed: ${r.Status}` };
    }
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = { ...this.BuildHeaders(auth), 'Content-Type': 'application/json' };
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const r = await this.MakeHTTPRequest(auth, `${R360_BASE}/${apiPath}/${ctx.ExternalID}`, 'PATCH', headers, ctx.Attributes);
        if (r.Status >= 200 && r.Status < 300) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: r.Status };
        return { Success: false, ExternalID: ctx.ExternalID, StatusCode: r.Status, ErrorMessage: `Update failed: ${r.Status}` };
    }
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const auth = await this.Authenticate(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const apiPath = ctx.ObjectName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        const r = await this.MakeHTTPRequest(auth, `${R360_BASE}/${apiPath}/${ctx.ExternalID}`, 'DELETE', this.BuildHeaders(auth));
        if (r.Status === 204 || (r.Status >= 200 && r.Status < 300)) return { Success: true, ExternalID: ctx.ExternalID, StatusCode: r.Status };
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
                if (body && method !== 'GET' && method !== 'DELETE') opts.body = JSON.stringify(body);
                const response = await fetch(url, opts);
                clearTimeout(t); this.lastRequestTime = Date.now();
                if (response.status === 401 && attempt === 0) continue;
                if (response.status === 429) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000)); continue; }
                if (response.status >= 500 && attempt < MAX_RETRIES) { await this.Sleep(Math.min(1000 * Math.pow(2, attempt), 30_000)); continue; }
                const rb = await (response.headers.get('content-type')?.includes('json') ? response.json() : response.text());
                const h: Record<string, string> = {}; response.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
                return { Status: response.status, Body: rb, Headers: h };
            } catch (e) { clearTimeout(t); if (e instanceof Error && e.name === 'AbortError') throw new Error(`Reach 360 request timed out: ${url}`); throw e; }
        }
        throw new Error(`Reach 360 request failed after ${MAX_RETRIES} retries: ${url}`);
    }
    private async Throttle(): Promise<void> { const e = Date.now() - this.lastRequestTime; if (e < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - e); }
    private Sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const obj = R360_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        if (!obj) return []; return obj.Fields.map(f => ({ SourceFieldName: f.Name, DestinationFieldName: f.Name, IsKeyField: f.IsPrimaryKey }));
    }
}
export function LoadReach360Connector() { /* intentionally empty */ }
