/**
 * MJToMJConnector — Integration connector for syncing data between MemberJunction instances.
 *
 * Connects a local MJ instance to a remote MJ instance using the MJ GraphQL API.
 * This is the ONLY connector that uses GraphQL (not REST) and extends BaseIntegrationConnector
 * directly rather than BaseRESTIntegrationConnector.
 *
 * Auth: Two options (configured in credential Values):
 *   1. API Key: x-mj-api-key header with a valid MJ API key
 *   2. JWT (MSAL): Bearer token obtained via MSAL client_credentials flow
 *
 * Protocol: GraphQL via POST to {remoteURL}/graphql
 * Base URL: https://{remote-mj-instance} — fully configurable per CompanyIntegration
 * Pagination: MaxRows/StartRow pattern (MJ standard)
 * Incremental: RunViewsWithCacheCheck returns maxUpdatedAt watermark
 * Discovery: Fully dynamic via EntitiesBySchemas query — discovers ALL entities on remote instance
 * CRUD: Full via Create{Entity}, Update{Entity}, Delete{Entity} mutations
 *
 * Use Cases:
 *   - Multi-instance data sync (regional offices, subsidiaries, etc.)
 *   - Bidirectional sync between MJ environments (staging ↔ production for reference data)
 *   - Federated member data aggregation across chapters
 *
 * Configuration (credential Values JSON):
 *   - RemoteURL: "https://your-remote-mj.example.com"
 *   - AuthType: "apikey" | "msal"
 *   - ApiKey: (if AuthType = apikey)
 *   - TenantID, ClientID, ClientSecret, Scope: (if AuthType = msal)
 *   - EntitySchemas: comma-separated schema names to sync (optional; all schemas if omitted)
 */
import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
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

export interface MJToMJConnectionConfig {
    RemoteURL: string;
    AuthType: 'apikey' | 'msal';
    ApiKey?: string;
    TenantID?: string;
    ClientID?: string;
    ClientSecret?: string;
    Scope?: string;
    EntitySchemas?: string; // Comma-separated; empty = all schemas
}

interface CachedToken {
    AccessToken: string;
    ExpiresAt: number;
}

interface GraphQLResponse<T = unknown> {
    data?: T;
    errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
}

interface MJEntityInfo {
    Name: string;
    SchemaName: string;
    BaseTable: string;
    Fields: Array<{
        Name: string;
        Type: string;
        IsRequired: boolean;
        IsPrimaryKey: boolean;
        IsReadOnly: boolean;
        Description: string | null;
    }>;
}

// ─── Constants ────────────────────────────────────────────────────────────

const MJ_DEFAULT_PAGE_SIZE = 200;
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 50;

// ─── Connector ────────────────────────────────────────────────────────────

@RegisterClass(BaseIntegrationConnector, 'MJToMJConnector')
export class MJToMJConnector extends BaseIntegrationConnector {
    private tokenCache: CachedToken | null = null;
    private lastRequestTime = 0;
    private entitySchemaCache: MJEntityInfo[] | null = null;

    public override get IntegrationName(): string { return 'MJ-to-MJ'; }
    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        // Returns cached entity schemas as IntegrationObjectInfo array.
        // Populated after DiscoverObjects() is called.
        if (!this.entitySchemaCache) return [];
        return this.entitySchemaCache.map(e => this.EntityInfoToObjectInfo(e));
    }

    public override GetActionGeneratorConfig() {
        const config = super.GetActionGeneratorConfig();
        if (!config) return null;
        config.IconClass = 'fa-solid fa-link';
        config.CategoryDescription = 'MemberJunction instance-to-instance data synchronization';
        config.ParentCategoryName = 'Data Integration';
        config.IncludeSearch = true;
        config.IncludeList = true;
        return config;
    }

    // ─── Discovery (fully dynamic) ─────────────────────────────────────

    public override async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const config = await this.ParseConfig(companyIntegration, contextUser);
        const headers = await this.BuildRequestHeaders(config);

        const schemasFilter = config.EntitySchemas
            ? config.EntitySchemas.split(',').map(s => s.trim()).filter(Boolean)
            : null;

        const query = `
            query DiscoverEntities {
                EntitiesBySchemas(schemas: ${schemasFilter ? JSON.stringify(schemasFilter) : 'null'}) {
                    Name
                    SchemaName
                    BaseTable
                    Fields {
                        Name
                        Type
                        IsRequired
                        IsPrimaryKey
                        IsReadOnly
                        Description
                    }
                }
            }
        `;

        const result = await this.ExecuteGraphQL<{ EntitiesBySchemas: MJEntityInfo[] }>(
            config.RemoteURL, headers, query, {}
        );

        const entities = result.EntitiesBySchemas ?? [];
        this.entitySchemaCache = entities;

        return entities.map(e => ({
            Name: e.Name,
            Label: e.Name,
            Description: `${e.SchemaName}.${e.BaseTable} on remote MJ instance`,
            SupportsIncrementalSync: true,
            SupportsWrite: true,
        }));
    }

    public override async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity, objectName: string, contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        if (!this.entitySchemaCache) {
            await this.DiscoverObjects(companyIntegration, contextUser);
        }
        const entity = this.entitySchemaCache?.find(e => e.Name.toLowerCase() === objectName.toLowerCase());
        if (!entity) return [];
        return entity.Fields.map(f => ({
            Name: f.Name,
            Label: f.Name,
            Description: f.Description ?? '',
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsPrimaryKey,
            IsReadOnly: f.IsReadOnly,
        }));
    }

    // ─── Auth ──────────────────────────────────────────────────────────

    private async BuildRequestHeaders(config: MJToMJConnectionConfig): Promise<Record<string, string>> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'MemberJunction-Integration/1.0',
        };

        if (config.AuthType === 'apikey' && config.ApiKey) {
            headers['x-mj-api-key'] = config.ApiKey;
        } else if (config.AuthType === 'msal') {
            const token = await this.ObtainMSALToken(config);
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    private async ObtainMSALToken(config: MJToMJConnectionConfig): Promise<string> {
        if (this.tokenCache && this.tokenCache.ExpiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
            return this.tokenCache.AccessToken;
        }

        const tokenURL = `https://login.microsoftonline.com/${config.TenantID}/oauth2/v2.0/token`;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.ClientID ?? '',
            client_secret: config.ClientSecret ?? '',
            scope: config.Scope ?? `api://${config.ClientID}/.default`,
        });

        const response = await fetch(tokenURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`MJ-to-MJ MSAL token failed: ${response.status}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        this.tokenCache = {
            AccessToken: data.access_token,
            ExpiresAt: Date.now() + ((data.expires_in ?? 3600) * 1000),
        };
        return this.tokenCache.AccessToken;
    }

    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity, contextUser?: UserInfo
    ): Promise<MJToMJConnectionConfig> {
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const md = new Metadata();
            const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
            const loaded = await credential.Load(credentialID);
            if (loaded && credential.Values) {
                const parsed = JSON.parse(credential.Values) as Record<string, string>;
                if (parsed['RemoteURL']) {
                    return {
                        RemoteURL: parsed['RemoteURL'],
                        AuthType: (parsed['AuthType'] as 'apikey' | 'msal') ?? 'apikey',
                        ApiKey: parsed['ApiKey'],
                        TenantID: parsed['TenantID'],
                        ClientID: parsed['ClientID'],
                        ClientSecret: parsed['ClientSecret'],
                        Scope: parsed['Scope'],
                        EntitySchemas: parsed['EntitySchemas'],
                    };
                }
            }
        }
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Record<string, string>;
            return {
                RemoteURL: parsed['RemoteURL'] ?? '',
                AuthType: (parsed['AuthType'] as 'apikey' | 'msal') ?? 'apikey',
                ApiKey: parsed['ApiKey'],
                TenantID: parsed['TenantID'],
                ClientID: parsed['ClientID'],
                ClientSecret: parsed['ClientSecret'],
                Scope: parsed['Scope'],
                EntitySchemas: parsed['EntitySchemas'],
            };
        }
        throw new Error(
            'No MJ-to-MJ credentials found. Set RemoteURL, AuthType, and ApiKey (or MSAL creds) in credential Values or Configuration JSON.'
        );
    }

    // ─── TestConnection ────────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const config = await this.ParseConfig(companyIntegration, contextUser);
            const headers = await this.BuildRequestHeaders(config);

            // Use a lightweight introspection query to verify connectivity and auth
            const query = `
                query TestMJConnection {
                    CurrentUser {
                        ID
                        Name
                        Email
                    }
                }
            `;

            const result = await this.ExecuteGraphQL<{ CurrentUser: { ID: string; Name: string; Email: string } }>(
                config.RemoteURL, headers, query, {}
            );

            const user = result.CurrentUser;
            const userInfo = user ? `${user.Name ?? user.Email ?? user.ID}` : 'Unknown';
            return { Success: true, Message: `Connected to remote MJ instance as ${userInfo}` };
        } catch (err) {
            return { Success: false, Message: err instanceof Error ? err.message : String(err) };
        }
    }

    // ─── FetchChanges ──────────────────────────────────────────────────

    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const config = await this.ParseConfig(ctx.CompanyIntegration, ctx.ContextUser);
        const headers = await this.BuildRequestHeaders(config);
        const offset = ctx.CurrentOffset ?? 0;
        const entityName = ctx.ObjectName;

        // Use RunViewsWithCacheCheck for incremental; RunView for full sync
        const query = ctx.WatermarkValue
            ? this.BuildIncrementalQuery(entityName, ctx.WatermarkValue, offset, ctx.BatchSize)
            : this.BuildFullSyncQuery(entityName, offset, ctx.BatchSize);

        const resultKey = this.GraphQLResultKey(entityName);
        const result = await this.ExecuteGraphQL<Record<string, unknown>>(
            config.RemoteURL, headers, query, {}
        );

        const viewResult = result[resultKey] as {
            Results: Record<string, unknown>[];
            TotalRowCount: number;
            Success: boolean;
            ErrorMessage?: string;
            maxUpdatedAt?: string;
        } | undefined;

        if (!viewResult?.Success) {
            throw new Error(`MJ-to-MJ RunView failed for ${entityName}: ${viewResult?.ErrorMessage ?? 'Unknown error'}`);
        }

        const records = viewResult.Results ?? [];
        const pkField = this.FindPrimaryKeyField(entityName);

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: entityName,
            Fields: r,
        }));

        const hasMore = (offset + records.length) < (viewResult.TotalRowCount ?? 0);
        const newWatermark = !hasMore ? viewResult.maxUpdatedAt : undefined;

        return {
            Records: externalRecords,
            HasMore: hasMore,
            NextOffset: offset + records.length,
            NewWatermarkValue: newWatermark,
        };
    }

    private BuildFullSyncQuery(entityName: string, offset: number, batchSize: number): string {
        const resultKey = this.GraphQLResultKey(entityName);
        return `
            query FetchMJEntity {
                ${resultKey}: RunView(
                    input: {
                        EntityName: "${entityName}"
                        StartRow: ${offset}
                        MaxRows: ${batchSize || MJ_DEFAULT_PAGE_SIZE}
                        ResultType: simple
                    }
                ) {
                    Success
                    ErrorMessage
                    TotalRowCount
                    Results
                }
            }
        `;
    }

    private BuildIncrementalQuery(entityName: string, watermark: string, offset: number, batchSize: number): string {
        const resultKey = this.GraphQLResultKey(entityName);
        // Filter on UpdatedAt or __mj_UpdatedAt — standard MJ timestamp columns
        const filter = `__mj_UpdatedAt > '${watermark}' OR UpdatedAt > '${watermark}'`;
        return `
            query FetchMJEntityIncremental {
                ${resultKey}: RunView(
                    input: {
                        EntityName: "${entityName}"
                        ExtraFilter: "${filter.replace(/"/g, '\\"')}"
                        OrderBy: "__mj_UpdatedAt ASC"
                        StartRow: ${offset}
                        MaxRows: ${batchSize || MJ_DEFAULT_PAGE_SIZE}
                        ResultType: simple
                    }
                ) {
                    Success
                    ErrorMessage
                    TotalRowCount
                    Results
                    maxUpdatedAt: MaxUpdatedAt
                }
            }
        `;
    }

    private GraphQLResultKey(entityName: string): string {
        // Convert entity name to a valid GraphQL field alias (no spaces)
        return entityName.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
    }

    private FindPrimaryKeyField(entityName: string): string {
        const entity = this.entitySchemaCache?.find(e => e.Name === entityName);
        const pkField = entity?.Fields.find(f => f.IsPrimaryKey);
        return pkField?.Name ?? 'ID';
    }

    // ─── CRUD ──────────────────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const config = await this.ParseConfig(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = await this.BuildRequestHeaders(config);
        const entityName = ctx.ObjectName;
        const mutationName = `Create${this.EntityMutationName(entityName)}`;

        const mutation = `
            mutation CreateMJRecord($input: ${mutationName}Input!) {
                ${mutationName}(input: $input) {
                    ID
                }
            }
        `;

        try {
            const result = await this.ExecuteGraphQL<Record<string, { ID: string }>>(
                config.RemoteURL, headers, mutation, { input: ctx.Attributes }
            );
            const newRecord = result[mutationName];
            return {
                Success: true,
                ExternalID: String(newRecord?.ID ?? ''),
                StatusCode: 200,
            };
        } catch (err) {
            return {
                Success: false,
                ExternalID: '',
                StatusCode: 500,
                ErrorMessage: `CreateRecord failed for ${entityName}: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const config = await this.ParseConfig(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = await this.BuildRequestHeaders(config);
        const entityName = ctx.ObjectName;
        const mutationName = `Update${this.EntityMutationName(entityName)}`;

        const mutation = `
            mutation UpdateMJRecord($input: ${mutationName}Input!) {
                ${mutationName}(input: $input) {
                    ID
                }
            }
        `;

        const pkField = this.FindPrimaryKeyField(entityName);
        const input = { ...ctx.Attributes, [pkField]: ctx.ExternalID };

        try {
            const result = await this.ExecuteGraphQL<Record<string, { ID: string }>>(
                config.RemoteURL, headers, mutation, { input }
            );
            const updatedRecord = result[mutationName];
            return {
                Success: true,
                ExternalID: String(updatedRecord?.ID ?? ctx.ExternalID),
                StatusCode: 200,
            };
        } catch (err) {
            return {
                Success: false,
                ExternalID: ctx.ExternalID,
                StatusCode: 500,
                ErrorMessage: `UpdateRecord failed for ${entityName}: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const config = await this.ParseConfig(ctx.CompanyIntegration as MJCompanyIntegrationEntity, ctx.ContextUser as UserInfo);
        const headers = await this.BuildRequestHeaders(config);
        const entityName = ctx.ObjectName;
        const mutationName = `Delete${this.EntityMutationName(entityName)}`;
        const pkField = this.FindPrimaryKeyField(entityName);

        const mutation = `
            mutation DeleteMJRecord($${pkField}: String!) {
                ${mutationName}(${pkField}: $${pkField})
            }
        `;

        try {
            await this.ExecuteGraphQL(config.RemoteURL, headers, mutation, { [pkField]: ctx.ExternalID });
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err) {
            return {
                Success: false,
                ExternalID: ctx.ExternalID,
                StatusCode: 500,
                ErrorMessage: `DeleteRecord failed for ${entityName}: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    private EntityMutationName(entityName: string): string {
        // MJ mutations use entity name without spaces: "AI Models" → "AIModels"
        return entityName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    }

    // ─── GraphQL Transport ─────────────────────────────────────────────

    private async ExecuteGraphQL<T>(
        remoteURL: string, headers: Record<string, string>,
        query: string, variables: Record<string, unknown>
    ): Promise<T> {
        const graphqlEndpoint = remoteURL.endsWith('/graphql') ? remoteURL : `${remoteURL}/graphql`;
        const maxRetries = 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle();

            const response = await this.FetchWithTimeout(graphqlEndpoint, 'POST', headers, { query, variables });
            this.lastRequestTime = Date.now();

            // 401 → clear token cache and retry once
            if (response.status === 401 && attempt === 0) {
                this.tokenCache = null;
                console.warn('[MJ-to-MJ] 401 — clearing token cache for retry');
                continue;
            }

            // 429 → exponential backoff
            if (response.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 60_000);
                console.warn(`[MJ-to-MJ] Rate limited (429), backing off ${Math.round(delay)}ms`);
                await this.Sleep(delay);
                continue;
            }

            // 5xx → retry with backoff
            if (response.status >= 500 && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 30_000);
                console.warn(`[MJ-to-MJ] Server error ${response.status}, retrying in ${delay}ms`);
                await this.Sleep(delay);
                continue;
            }

            const ct = response.headers.get('content-type') ?? '';
            const body = ct.includes('json')
                ? (await response.json() as GraphQLResponse<T>)
                : { errors: [{ message: await response.text() }] };

            if (body.errors && body.errors.length > 0) {
                const messages = body.errors.map(e => e.message).join('; ');
                throw new Error(`GraphQL error: ${messages}`);
            }

            if (!body.data) {
                throw new Error('GraphQL response contained no data');
            }

            return body.data;
        }

        throw new Error(`MJ-to-MJ GraphQL request failed after ${maxRetries} retries`);
    }

    private async FetchWithTimeout(
        url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const opts: RequestInit = {
                method,
                headers,
                signal: controller.signal,
                body: body ? JSON.stringify(body) : undefined,
            };
            return await fetch(url, opts);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`MJ-to-MJ request timed out: ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async Throttle(): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) await this.Sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private EntityInfoToObjectInfo(entity: MJEntityInfo): IntegrationObjectInfo {
        return {
            Name: entity.Name,
            DisplayName: entity.Name,
            Description: `${entity.SchemaName}.${entity.BaseTable} on remote MJ instance`,
            SupportsWrite: true,
            Fields: entity.Fields.map(f => ({
                Name: f.Name,
                DisplayName: f.Name,
                Type: this.MapMJTypeToIntegrationFieldType(f.Type),
                IsRequired: f.IsRequired,
                IsReadOnly: f.IsReadOnly,
                IsPrimaryKey: f.IsPrimaryKey,
                Description: f.Description ?? '',
            })),
        };
    }

    private MapMJTypeToIntegrationFieldType(mjType: string): string {
        const lower = mjType.toLowerCase();
        if (lower.includes('int') || lower.includes('numeric') || lower.includes('decimal') || lower.includes('float') || lower.includes('money')) {
            return lower.includes('decimal') || lower.includes('money') || lower.includes('float') ? 'decimal' : 'number';
        }
        if (lower.includes('date') || lower.includes('time')) return 'datetime';
        if (lower.includes('bit') || lower.includes('bool')) return 'boolean';
        return 'string';
    }

    // ─── Default Field Mappings ────────────────────────────────────────

    public override GetDefaultFieldMappings(objectName: string): DefaultFieldMapping[] {
        const entity = this.entitySchemaCache?.find(e => e.Name.toLowerCase() === objectName.toLowerCase());
        if (!entity) return [];
        return entity.Fields.map(f => ({
            SourceFieldName: f.Name,
            DestinationFieldName: f.Name,
            IsKeyField: f.IsPrimaryKey,
        }));
    }
}

// Tree-shaking prevention — REQUIRED
export function LoadMJToMJConnector() { /* intentionally empty */ }
