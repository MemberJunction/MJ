import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
} from './BaseIntegrationConnector.js';
import type { ExternalRecord, SourceSchemaInfo, SourceObjectInfo, SourceRelationshipInfo } from './types.js';

// ─── REST-specific types ─────────────────────────────────────────────

/** Authentication context returned by Authenticate(). Concrete connectors extend this. */
export interface RESTAuthContext {
    /** Bearer or session token */
    Token?: string;
    /** Session ID for session-based APIs */
    SessionID?: string;
    /** When the auth token expires */
    ExpiresAt?: Date;
    /** Allow connector-specific auth properties */
    [key: string]: unknown;
}

/** Normalized HTTP response from MakeHTTPRequest() */
export interface RESTResponse {
    /** HTTP status code */
    Status: number;
    /** Parsed response body */
    Body: unknown;
    /** Response headers (lowercase keys) */
    Headers: Record<string, string>;
}

/** Pagination state extracted from a vendor response */
export interface PaginationState {
    /** Whether more pages remain */
    HasMore: boolean;
    /** Opaque cursor for cursor-based pagination */
    NextCursor?: string;
    /** Numeric offset for offset-based pagination */
    NextOffset?: number;
    /** Page number for page-based pagination */
    NextPage?: number;
    /** Total records reported by the API, if available */
    TotalRecords?: number;
}

/** Pagination type values matching MJIntegrationObjectEntity.PaginationType */
export type PaginationType = 'Cursor' | 'None' | 'Offset' | 'PageNumber';

/** Internal result from a paginated fetch loop */
interface PaginatedFetchResult {
    Records: Record<string, unknown>[];
    HasMore: boolean;
}

// ─── BaseRESTIntegrationConnector ────────────────────────────────────

/**
 * Abstract base class for REST API integration connectors.
 *
 * Implements the generic REST sync pattern: reads IntegrationObject/Field
 * metadata from the MJ database, handles pagination, template variable
 * resolution (per-parent iteration), and converts raw API responses to
 * ExternalRecord format.
 *
 * Concrete connectors (YourMembership, Salesforce, HubSpot, etc.) extend
 * this class and implement only auth, HTTP transport, and response normalization.
 */
export abstract class BaseRESTIntegrationConnector extends BaseIntegrationConnector {

    // ── Abstract methods concrete connectors must implement ──────────

    /**
     * Authenticate with the external system and return an auth context.
     * Called once per FetchChanges invocation; the returned context is
     * passed to BuildHeaders and MakeHTTPRequest for every request.
     */
    protected abstract Authenticate(
        companyIntegration: MJCompanyIntegrationEntity
    ): Promise<RESTAuthContext>;

    /**
     * Build HTTP headers for an API request, including auth headers.
     * Called before every HTTP request.
     */
    protected abstract BuildHeaders(
        auth: RESTAuthContext
    ): Record<string, string>;

    /**
     * Execute an HTTP request. The concrete connector owns the transport
     * layer (fetch, axios, got, etc.).
     */
    protected abstract MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse>;

    /**
     * Extract the data array from the vendor-specific response envelope.
     * @param rawBody - The parsed response body
     * @param responseDataKey - The key to extract data from, or null for root-level arrays
     * @returns Array of raw record objects
     */
    protected abstract NormalizeResponse(
        rawBody: unknown,
        responseDataKey: string | null
    ): Record<string, unknown>[];

    /**
     * Extract pagination state from the vendor-specific response.
     * @param rawBody - The parsed response body
     * @param paginationType - The pagination strategy for this object
     * @param currentPage - Current page number (1-based)
     * @param currentOffset - Current record offset
     * @param pageSize - Page size used in the request
     * @returns Pagination state indicating whether more data is available
     */
    protected abstract ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        pageSize: number
    ): PaginationState;

    /**
     * Get the base URL for API requests (e.g., "https://api.example.com/v1").
     * Combined with the object's APIPath to form the full request URL.
     */
    protected abstract GetBaseURL(
        companyIntegration: MJCompanyIntegrationEntity
    ): string;

    // ── BaseIntegrationConnector implementations ─────────────────────

    /**
     * Discovers available objects from the IntegrationEngineBase cache.
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        const objects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(
            companyIntegration.IntegrationID
        );

        return objects.map(obj => ({
            Name: obj.Name,
            Label: obj.DisplayName ?? obj.Name,
            Description: obj.Description ?? undefined,
            SupportsIncrementalSync: obj.SupportsIncrementalSync,
            SupportsWrite: obj.SupportsWrite,
        }));
    }

    /**
     * Discovers fields for a specific object from the IntegrationEngineBase cache.
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        _contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const obj = this.GetCachedObject(companyIntegration.IntegrationID, objectName);
        const fields = this.GetCachedFields(obj.ID);

        return fields.map(f => this.FieldEntityToSchema(f));
    }

    /**
     * Builds SourceSchemaInfo from IntegrationEngineBase cached metadata.
     * Provides richer metadata than the base class implementation, including
     * FK relationships derived from RelatedIntegrationObjectID.
     */
    public async IntrospectSchema(
        companyIntegration: MJCompanyIntegrationEntity,
        _contextUser: UserInfo
    ): Promise<SourceSchemaInfo> {
        const integrationID = companyIntegration.IntegrationID;
        const objects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID);
        const result: SourceSchemaInfo = { Objects: [] };

        for (const obj of objects) {
            const fields = this.GetCachedFields(obj.ID);
            const sourceObject = this.BuildSourceObjectInfo(obj, fields, objects);
            result.Objects.push(sourceObject);
        }

        return result;
    }

    /**
     * Fetches records from the external REST API using metadata-driven configuration.
     * Handles both flat endpoints and template-variable (per-parent) endpoints.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ctx.CompanyIntegration);
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration);

        const templateVars = this.DetectTemplateVars(obj.APIPath);

        if (templateVars.length > 0) {
            return this.FetchWithTemplateVars(auth, baseURL, obj, fields, templateVars, ctx);
        }

        return this.FetchFlat(auth, baseURL, obj, fields, ctx);
    }

    // ── Flat fetch (no template variables) ───────────────────────────

    /**
     * Fetches records from a flat endpoint (no template variable substitution).
     */
    private async FetchFlat(
        auth: RESTAuthContext,
        baseURL: string,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const fullPath = this.BuildFullURL(baseURL, obj.APIPath);
        const result = await this.FetchWithPagination(auth, fullPath, obj, ctx.BatchSize);
        const pkFieldName = this.FindPrimaryKeyFieldName(fields);

        return {
            Records: result.Records.map(r => this.ToExternalRecord(r, ctx.ObjectName, pkFieldName)),
            HasMore: result.HasMore,
        };
    }

    // ── Per-parent fetch (template variables) ────────────────────────

    /**
     * Fetches records from a template-variable endpoint by iterating over parent records.
     * Identifies the parent object from FK field metadata, loads parent IDs from the
     * local database, then fetches child records per parent.
     */
    private async FetchWithTemplateVars(
        auth: RESTAuthContext,
        baseURL: string,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        templateVars: string[],
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const parentInfo = this.ResolveParentInfo(fields, templateVars);
        if (!parentInfo) {
            throw new Error(
                `Template variables [${templateVars.join(', ')}] found in APIPath for "${obj.Name}" ` +
                `but no matching FK field with RelatedIntegrationObjectID was found.`
            );
        }

        const parentIDs = await this.LoadParentIDs(parentInfo.parentObjectID, ctx.ContextUser);
        const pkFieldName = this.FindPrimaryKeyFieldName(fields);
        const allRecords: ExternalRecord[] = [];

        for (const parentID of parentIDs) {
            const resolvedPath = this.SubstituteTemplateVars(obj.APIPath, parentInfo.templateVar, parentID);
            const fullURL = this.BuildFullURL(baseURL, resolvedPath);
            const result = await this.FetchWithPagination(auth, fullURL, obj, ctx.BatchSize - allRecords.length);

            const tagged = result.Records.map(r => {
                r[parentInfo.fkFieldName] = parentID;
                return this.ToExternalRecord(r, ctx.ObjectName, pkFieldName);
            });

            allRecords.push(...tagged);
            if (allRecords.length >= ctx.BatchSize) break;
        }

        return { Records: allRecords, HasMore: false };
    }

    /**
     * Resolves which template variable maps to which FK field + parent object.
     * Returns null if no FK field matches any of the template variables.
     */
    private ResolveParentInfo(
        fields: MJIntegrationObjectFieldEntity[],
        templateVars: string[]
    ): { templateVar: string; fkFieldName: string; parentObjectID: string } | null {
        for (const field of fields) {
            if (!field.RelatedIntegrationObjectID) continue;

            for (const tVar of templateVars) {
                // Match if the template var appears in the field name (case-insensitive)
                if (field.Name.toLowerCase().includes(tVar.toLowerCase())) {
                    return {
                        templateVar: tVar,
                        fkFieldName: field.Name,
                        parentObjectID: field.RelatedIntegrationObjectID,
                    };
                }
            }
        }
        return null;
    }

    /**
     * Loads parent record IDs from the local MJ database.
     * Uses IntegrationEngineBase cache for object/field metadata lookups,
     * then queries the MJ entity via RunView for actual synced record IDs.
     */
    private async LoadParentIDs(
        parentObjectID: string,
        contextUser: UserInfo
    ): Promise<string[]> {
        // Use engine cache for metadata lookups
        const parentObj = IntegrationEngineBase.Instance.GetIntegrationObjectByID(parentObjectID);
        if (!parentObj) {
            throw new Error(`Parent IntegrationObject not found: ${parentObjectID}`);
        }

        const parentFields = this.GetCachedFields(parentObj.ID);
        const pkField = parentFields.find(f => f.IsPrimaryKey);
        const pkFieldName = pkField ? pkField.Name : 'ID';

        // Query the parent object's corresponding MJ entity for synced records
        const rv = new RunView();
        const entityMapResult = await rv.RunView<{ EntityID: string; Entity: string }>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: `ExternalObjectName='${parentObj.Name}' AND SyncEnabled=1`,
            Fields: ['EntityID', 'Entity'],
            MaxRows: 1,
            ResultType: 'simple',
        }, contextUser);

        if (!entityMapResult.Success || entityMapResult.Results.length === 0) {
            return [];
        }

        const entityName = entityMapResult.Results[0].Entity;
        const idResult = await rv.RunView<Record<string, unknown>>({
            EntityName: entityName,
            Fields: [pkFieldName],
            ResultType: 'simple',
        }, contextUser);

        if (!idResult.Success) return [];
        return idResult.Results.map(r => String(r[pkFieldName]));
    }

    // ── Pagination loop ──────────────────────────────────────────────

    /**
     * Fetches records from a single URL with pagination support.
     * Loops through pages until no more data or maxRecords is reached.
     */
    private async FetchWithPagination(
        auth: RESTAuthContext,
        basePath: string,
        obj: MJIntegrationObjectEntity,
        maxRecords: number
    ): Promise<PaginatedFetchResult> {
        if (!obj.SupportsPagination || obj.PaginationType === 'None') {
            return this.FetchSinglePage(auth, basePath, obj);
        }

        return this.FetchPaginatedLoop(auth, basePath, obj, maxRecords);
    }

    /**
     * Fetches a single non-paginated page.
     */
    private async FetchSinglePage(
        auth: RESTAuthContext,
        url: string,
        obj: MJIntegrationObjectEntity
    ): Promise<PaginatedFetchResult> {
        const requestURL = this.AppendDefaultQueryParams(url, obj);
        const headers = this.BuildHeaders(auth);
        const response = await this.MakeHTTPRequest(auth, requestURL, 'GET', headers);

        this.ValidateHTTPResponse(response, requestURL);
        const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        return { Records: records, HasMore: false };
    }

    /**
     * Iterates through paginated responses until exhausted or maxRecords is reached.
     */
    private async FetchPaginatedLoop(
        auth: RESTAuthContext,
        basePath: string,
        obj: MJIntegrationObjectEntity,
        maxRecords: number
    ): Promise<PaginatedFetchResult> {
        const allRecords: Record<string, unknown>[] = [];
        let page = 1;
        let offset = 0;
        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore && allRecords.length < maxRecords) {
            const url = this.BuildPaginatedURL(basePath, obj, page, offset, cursor);
            const requestURL = this.AppendDefaultQueryParams(url, obj);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, requestURL, 'GET', headers);

            this.ValidateHTTPResponse(response, requestURL);
            const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
            if (records.length === 0) break;

            allRecords.push(...records);

            const paginationState = this.ExtractPaginationInfo(
                response.Body, obj.PaginationType, page, offset, obj.DefaultPageSize
            );
            hasMore = paginationState.HasMore;
            page = paginationState.NextPage ?? page + 1;
            offset = paginationState.NextOffset ?? offset + records.length;
            cursor = paginationState.NextCursor;
        }

        return { Records: allRecords, HasMore: hasMore };
    }

    // ── URL building helpers ─────────────────────────────────────────

    /**
     * Combines baseURL and apiPath into a full URL.
     */
    private BuildFullURL(baseURL: string, apiPath: string): string {
        const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
        return `${base}${path}`;
    }

    /**
     * Appends pagination parameters to a URL based on the object's PaginationType.
     */
    private BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string
    ): string {
        const separator = basePath.includes('?') ? '&' : '?';

        switch (obj.PaginationType) {
            case 'PageNumber':
                return `${basePath}${separator}page=${page}&pageSize=${obj.DefaultPageSize}`;
            case 'Offset':
                return `${basePath}${separator}offset=${offset}&limit=${obj.DefaultPageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&limit=${obj.DefaultPageSize}`
                    : `${basePath}${separator}limit=${obj.DefaultPageSize}`;
            default:
                return basePath;
        }
    }

    /**
     * Appends default query parameters from the IntegrationObject metadata.
     * DefaultQueryParams is stored as a JSON object like {"key": "value"}.
     */
    private AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        if (!obj.DefaultQueryParams) return url;

        try {
            const params = JSON.parse(obj.DefaultQueryParams) as Record<string, string>;
            const entries = Object.entries(params);
            if (entries.length === 0) return url;

            const separator = url.includes('?') ? '&' : '?';
            const queryString = entries
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            return `${url}${separator}${queryString}`;
        } catch {
            console.warn(`[BaseRESTIntegrationConnector] Invalid DefaultQueryParams JSON for object "${obj.Name}"`);
            return url;
        }
    }

    // ── Template variable helpers ────────────────────────────────────

    /**
     * Detects template variables in an API path. Template variables use
     * the format {VariableName} (e.g., "/profiles/{ProfileID}/events").
     */
    private DetectTemplateVars(apiPath: string): string[] {
        const matches = apiPath.match(/\{(\w+)\}/g);
        return matches ? matches.map(m => m.slice(1, -1)) : [];
    }

    /**
     * Substitutes a single template variable in a path.
     */
    private SubstituteTemplateVars(apiPath: string, varName: string, value: string): string {
        return apiPath.replace(`{${varName}}`, encodeURIComponent(value));
    }

    // ── Cached metadata accessors ───────────────────────────────────

    /**
     * Gets an IntegrationObject from the engine's cache by integration ID and object name.
     * Throws if not found.
     */
    private GetCachedObject(integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
        if (!obj) {
            throw new Error(`IntegrationObject not found: "${objectName}" for integration ${integrationID}`);
        }
        return obj;
    }

    /**
     * Gets IntegrationObjectField records from the engine's cache for a given object ID.
     * Returns only active fields sorted by Sequence.
     */
    private GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return IntegrationEngineBase.Instance.GetIntegrationObjectFields(objectID)
            .filter(f => f.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
    }

    // ── Conversion helpers ───────────────────────────────────────────

    /**
     * Converts a raw API record object to the ExternalRecord format.
     */
    private ToExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldName: string
    ): ExternalRecord {
        const externalID = raw[pkFieldName] != null ? String(raw[pkFieldName]) : '';
        return {
            ExternalID: externalID,
            ObjectType: objectType,
            Fields: raw,
        };
    }

    /**
     * Finds the primary key field name from a set of IntegrationObjectField records.
     * Falls back to "ID" if no PK field is explicitly marked.
     */
    private FindPrimaryKeyFieldName(fields: MJIntegrationObjectFieldEntity[]): string {
        const pkField = fields.find(f => f.IsPrimaryKey);
        return pkField ? pkField.Name : 'ID';
    }

    /**
     * Converts an IntegrationObjectFieldEntity to the ExternalFieldSchema format.
     */
    private FieldEntityToSchema(f: MJIntegrationObjectFieldEntity): ExternalFieldSchema {
        return {
            Name: f.Name,
            Label: f.DisplayName ?? f.Name,
            Description: f.Description ?? undefined,
            DataType: f.Type,
            IsRequired: f.IsRequired,
            IsUniqueKey: f.IsUniqueKey,
            IsReadOnly: f.IsReadOnly,
            IsForeignKey: f.RelatedIntegrationObjectID != null,
            ForeignKeyTarget: f.RelatedIntegrationObject ?? null,
        };
    }

    /**
     * Builds a SourceObjectInfo from an IntegrationObject and its fields.
     * Resolves FK relationships using the RelatedIntegrationObjectID.
     */
    private BuildSourceObjectInfo(
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        allObjects: MJIntegrationObjectEntity[]
    ): SourceObjectInfo {
        const relationships = this.BuildRelationships(fields, allObjects);

        return {
            ExternalName: obj.Name,
            ExternalLabel: obj.DisplayName ?? obj.Name,
            Description: obj.Description ?? undefined,
            Fields: fields.map(f => ({
                Name: f.Name,
                Label: f.DisplayName ?? f.Name,
                Description: f.Description ?? undefined,
                SourceType: f.Type,
                IsRequired: f.IsRequired,
                MaxLength: f.Length,
                Precision: f.Precision,
                Scale: f.Scale,
                DefaultValue: f.DefaultValue,
                IsPrimaryKey: f.IsPrimaryKey,
                IsForeignKey: f.RelatedIntegrationObjectID != null,
                ForeignKeyTarget: f.RelatedIntegrationObject ?? null,
            })),
            PrimaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
            Relationships: relationships,
        };
    }

    /**
     * Builds SourceRelationshipInfo entries from FK fields.
     */
    private BuildRelationships(
        fields: MJIntegrationObjectFieldEntity[],
        allObjects: MJIntegrationObjectEntity[]
    ): SourceRelationshipInfo[] {
        const relationships: SourceRelationshipInfo[] = [];

        for (const field of fields) {
            if (!field.RelatedIntegrationObjectID) continue;

            const targetObj = allObjects.find(o => o.ID === field.RelatedIntegrationObjectID);
            if (!targetObj) continue;

            relationships.push({
                FieldName: field.Name,
                TargetObject: targetObj.Name,
                TargetField: field.RelatedIntegrationObjectFieldName ?? 'ID',
            });
        }

        return relationships;
    }

    // ── Validation ───────────────────────────────────────────────────

    /**
     * Validates an HTTP response and throws a descriptive error on non-2xx status.
     */
    private ValidateHTTPResponse(response: RESTResponse, url: string): void {
        if (response.Status < 200 || response.Status >= 300) {
            const bodyPreview = typeof response.Body === 'string'
                ? response.Body.slice(0, 500)
                : JSON.stringify(response.Body).slice(0, 500);
            throw new Error(
                `HTTP ${response.Status} from ${url}: ${bodyPreview}`
            );
        }
    }

}
