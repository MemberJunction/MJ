import { RunView, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { computeContentHash } from './ContentHash.js';
import {
    BaseIntegrationConnector,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
} from './BaseIntegrationConnector.js';
import type {
    ExternalRecord,
    SourceSchemaInfo,
    SourceObjectInfo,
    SourceRelationshipInfo,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    GetRecordContext,
    CRUDResult,
} from './types.js';

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
    NextPage?: number;
    NextOffset?: number;
    NextCursor?: string;
}

/** One template variable resolved to its parent IntegrationObject + FK field. */
interface ResolvedTemplateVar {
    /** The `{var}` placeholder name as it appears in APIPath. */
    templateVar: string;
    /** The field name to tag fetched child records with (the resolved parent ID). */
    fkFieldName: string;
    /** The parent IntegrationObject this var resolves to. */
    parentObjectID: string;
}

/** Maximum number of pages to fetch before stopping (safety limit to prevent infinite loops) */

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
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
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
        companyIntegration: MJCompanyIntegrationEntity,
        auth: RESTAuthContext
    ): string;

    /**
     * Optional per-record CUSTOMIZATION hook called between NormalizeResponse
     * (vendor envelope-stripping) and ToExternalRecord (composite-PK assembly).
     *
     * Distinct from NormalizeResponse — that strips the vendor's response envelope
     * to expose individual records. This hook is for vendor-specific record-level
     * customization the standard pipeline shouldn't carry: nested-field flattening,
     * empty-string→null coercion for date columns, computed fields, removing vendor
     * metadata blobs (e.g. Salesforce 'attributes'), etc.
     *
     * Default is identity (no transform). Override only when a concrete connector
     * needs vendor-specific shape changes.
     */
    protected TransformRecord(
        raw: Record<string, unknown>,
        _obj: MJIntegrationObjectEntity,
        _fields: MJIntegrationObjectFieldEntity[]
    ): Record<string, unknown> {
        return raw;
    }

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
            ID: obj.ID,
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
        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const baseURL = this.GetBaseURL(ctx.CompanyIntegration, auth);

        const templateVars = this.DetectTemplateVars(obj.APIPath);

        if (templateVars.length > 0) {
            return this.FetchWithTemplateVars(auth, baseURL, obj, fields, templateVars, ctx);
        }

        return this.FetchFlat(auth, baseURL, obj, fields, ctx);
    }

    // ── Generic metadata-driven CRUD ─────────────────────────────────
    //
    // These implementations read per-operation columns from IntegrationObject
    // (CreateAPIPath/Method/BodyShape/BodyKey/IDLocation, Update*, Delete*) and
    // execute generically. Concrete connectors should only override when the API
    // is genuinely idiosyncratic (multi-step writes, custom body envelopes that
    // don't fit flat/wrapped, etc.) — the metadata-driven path handles the
    // common case for ~all REST connectors and removes the duplicate write logic
    // that previously lived in every concrete class.
    //
    // Null-capability honesty: if a metadata column is null, the corresponding
    // verb is NOT supported via the generic path. SupportsCreate/Update/Delete
    // capability getters on BaseIntegrationConnector should be overridden to
    // reflect the actual column population.

    /** Generic create: reads CreateAPIPath/Method/BodyShape/BodyKey/IDLocation from the IO row. */
    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.CreateAPIPath || !obj.CreateMethod) {
            throw new Error(
                `CreateRecord not supported for "${ctx.ObjectName}": ` +
                `CreateAPIPath / CreateMethod not configured on IntegrationObject. ` +
                `Either populate metadata or override CreateRecord in the concrete connector.`
            );
        }
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const url = this.BuildFullURL(baseURL, obj.CreateAPIPath);
        const body = this.BuildOperationBody(ctx.Attributes, obj.CreateBodyShape, obj.CreateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.CreateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            const externalID = this.ExtractIDFromResponse(response, obj.CreateIDLocation);
            return { Success: true, StatusCode: response.Status, ExternalID: externalID };
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on create`,
        };
    }

    /** Generic update: reads UpdateAPIPath/Method/BodyShape/BodyKey/IDLocation from the IO row. */
    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.UpdateAPIPath || !obj.UpdateMethod) {
            throw new Error(
                `UpdateRecord not supported for "${ctx.ObjectName}": ` +
                `UpdateAPIPath / UpdateMethod not configured on IntegrationObject.`
            );
        }
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const url = this.BuildFullURL(
            baseURL,
            this.SubstituteIDInPath(obj.UpdateAPIPath, ctx.ExternalID, obj.UpdateIDLocation)
        );
        const body = this.BuildOperationBody(ctx.Attributes, obj.UpdateBodyShape, obj.UpdateBodyKey);
        const response = await this.MakeHTTPRequest(auth, url, obj.UpdateMethod, headers, body);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on update`,
        };
    }

    /** Generic delete: reads DeleteAPIPath/DeleteMethod/DeleteIDLocation from the IO row. */
    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        if (!obj.DeleteAPIPath || !obj.DeleteMethod) {
            throw new Error(
                `DeleteRecord not supported for "${ctx.ObjectName}": ` +
                `DeleteAPIPath / DeleteMethod not configured on IntegrationObject.`
            );
        }
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        const url = this.BuildFullURL(
            baseURL,
            this.SubstituteIDInPath(obj.DeleteAPIPath, ctx.ExternalID, obj.DeleteIDLocation)
        );
        const response = await this.MakeHTTPRequest(auth, url, obj.DeleteMethod, headers);
        if (response.Status >= 200 && response.Status < 300) {
            return { Success: true, StatusCode: response.Status, ExternalID: ctx.ExternalID };
        }
        return {
            Success: false,
            StatusCode: response.Status,
            ErrorMessage: this.ExtractErrorMessage(response) ?? `HTTP ${response.Status} on delete`,
        };
    }

    /** Generic get-one: hits APIPath/{ID} via GET. Override if API uses non-standard get shape. */
    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const ci = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const obj = this.GetCachedObject(ci.IntegrationID, ctx.ObjectName);
        const fields = this.GetCachedFields(obj.ID);
        const auth = await this.Authenticate(ci, contextUser);
        const baseURL = this.GetBaseURL(ci, auth);
        const headers = this.BuildHeaders(auth);
        // Reuse UpdateAPIPath when present (typically same as get-one path); fall back to APIPath + /{id}
        const getPath = obj.UpdateAPIPath
            ? this.SubstituteIDInPath(obj.UpdateAPIPath, ctx.ExternalID, obj.UpdateIDLocation)
            : `${obj.APIPath.replace(/\/+$/, '')}/${encodeURIComponent(ctx.ExternalID)}`;
        const url = this.BuildFullURL(baseURL, getPath);
        const response = await this.MakeHTTPRequest(auth, url, 'GET', headers);
        if (response.Status === 404) return null;
        if (response.Status < 200 || response.Status >= 300) {
            throw new Error(
                `GetRecord failed for "${ctx.ObjectName}" id "${ctx.ExternalID}": HTTP ${response.Status}`
            );
        }
        const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        if (records.length === 0) return null;
        const transformed = this.TransformRecord(records[0], obj, fields);
        return this.ToExternalRecord(transformed, ctx.ObjectName, this.FindPrimaryKeyFieldNames(fields));
    }

    // ── CRUD helpers ─────────────────────────────────────────────────

    /**
     * Build the operation request body per BodyShape:
     *  - 'flat'    → body = attributes verbatim
     *  - 'wrapped' → body = { [BodyKey]: attributes }
     *  - 'literal' → connector should have overridden the operation; fall back to flat as safety net
     *  - null      → default to flat (most common shape)
     */
    protected BuildOperationBody(
        attributes: Record<string, unknown>,
        bodyShape: string | null,
        bodyKey: string | null
    ): unknown {
        if (bodyShape === 'wrapped' && bodyKey) {
            return { [bodyKey]: attributes };
        }
        return attributes;
    }

    /**
     * Substitute the ExternalID into a URL path template at runtime. Path templates
     * may use {ID}, {id}, or {ExternalID} as the placeholder; for symmetry with
     * FetchChanges template-var handling, any unsubstituted {var} in the template
     * is left in place (caller's responsibility to ensure consistency).
     *
     * For IDLocation='body' or 'header' the ID is not substituted into the path
     * (caller must handle separately); we just return the raw path.
     */
    protected SubstituteIDInPath(
        path: string,
        externalID: string,
        idLocation: string | null
    ): string {
        if (idLocation && idLocation !== 'path') return path;
        const encoded = encodeURIComponent(externalID);
        return path
            .replace(/\{ID\}/g, encoded)
            .replace(/\{id\}/g, encoded)
            .replace(/\{ExternalID\}/g, encoded);
    }

    /** Best-effort error message extraction from a vendor response. Override for vendor-specific shapes. */
    protected ExtractErrorMessage(response: RESTResponse): string | undefined {
        if (!response.Body || typeof response.Body !== 'object') return undefined;
        const b = response.Body as Record<string, unknown>;
        if (typeof b.message === 'string') return b.message;
        if (typeof b.error === 'string') return b.error;
        if (b.errors && Array.isArray(b.errors) && b.errors.length > 0) {
            return JSON.stringify(b.errors);
        }
        return undefined;
    }

    /** Extract the new record's external ID from a create response per IDLocation. */
    protected ExtractIDFromResponse(response: RESTResponse, idLocation: string | null): string | undefined {
        // Default: parse from response body — most APIs return the new object with its ID at root
        if (!idLocation || idLocation === 'body') {
            if (response.Body && typeof response.Body === 'object') {
                const b = response.Body as Record<string, unknown>;
                // Try common ID field names; concrete connectors can override for vendor-specific shapes
                for (const k of ['id', 'ID', 'Id', 'externalID', 'ExternalID']) {
                    if (typeof b[k] === 'string' || typeof b[k] === 'number') return String(b[k]);
                }
            }
            return undefined;
        }
        if (idLocation === 'header') {
            // Location header is the most common; concrete connectors override for non-standard headers
            const loc = response.Headers?.['location'] ?? response.Headers?.['Location'];
            if (typeof loc === 'string') {
                const m = loc.match(/[/=]([^/?&#]+)$/);
                return m ? m[1] : loc;
            }
            return undefined;
        }
        return undefined;
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
        const result = await this.FetchWithPagination(auth, fullPath, obj, ctx);
        const pkFieldNames = this.FindPrimaryKeyFieldNames(fields);

        return {
            Records: result.Records.map(r => this.ToExternalRecord(
                this.TransformRecord(r, obj, fields),
                ctx.ObjectName,
                pkFieldNames
            )),
            HasMore: result.HasMore,
            NextPage: result.NextPage,
            NextOffset: result.NextOffset,
            NextCursor: result.NextCursor,
        };
    }

    // ── Per-parent fetch (template variables) ────────────────────────

    /**
     * Fetches records from a template-variable endpoint, generalized to MULTI-LEVEL
     * (nested / chained) paths such as `/orgs/{OrgID}/depts/{DeptID}/employees`.
     *
     * Each `{var}` is resolved to a parent IntegrationObject; the engine then walks the
     * FK dependency graph in path order (outermost first), loading each level's parent
     * IDs — filtered by the OUTER parent via FK when one links them (true nested
     * semantics, avoids a cartesian 404 storm), or unfiltered when the vars are
     * independent — substituting them into the path until it is flat, then fetching.
     * This is the connector-side realization of the topological traversal the engine
     * already uses for sync ORDER. A single-var path behaves exactly as before.
     */
    private async FetchWithTemplateVars(
        auth: RESTAuthContext,
        baseURL: string,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        templateVars: string[],
        ctx: FetchContext
    ): Promise<FetchBatchResult> {
        const resolutions: ResolvedTemplateVar[] = [];
        const seenParents = new Set<string>();
        for (const tVar of templateVars) {
            const info = this.ResolveParentForVar(fields, tVar, ctx.CompanyIntegration.IntegrationID);
            if (!info) {
                console.warn(
                    `[BaseRESTIntegrationConnector] Skipping "${obj.Name}": template variable ` +
                    `{${tVar}} could not be resolved to a parent object.`
                );
                return { Records: [], HasMore: false };
            }
            // Cycle guard: a parent chain that revisits an object is a metadata error —
            // name the offending edge instead of looping forever.
            if (seenParents.has(info.parentObjectID)) {
                console.warn(
                    `[BaseRESTIntegrationConnector] Skipping "${obj.Name}": template-var dependency ` +
                    `cycle at {${tVar}} → a parent object already present in the chain.`
                );
                return { Records: [], HasMore: false };
            }
            seenParents.add(info.parentObjectID);
            resolutions.push(info);
        }

        const pkFieldNames = this.FindPrimaryKeyFieldNames(fields);
        const out: ExternalRecord[] = [];
        await this.DescendTemplateVars(auth, baseURL, obj, fields, resolutions, 0, obj.APIPath, {}, [], ctx, pkFieldNames, out);
        return { Records: out, HasMore: false };
    }

    /**
     * Recursive descent over the ordered template-var resolutions, one layer per level.
     *
     * Each layer's records are constrained to the valid SUBSET of the combinations of
     * ALL prior layers: this level's parent is filtered by an FK to EVERY prior-layer
     * parent it links to (AND-combined). A prior layer this parent has no FK to leaves
     * that axis unconstrained (cartesian). So `outerStack` carries every prior layer's
     * (objectID, idValue) — not just the immediate parent — which is what makes a
     * layer-2 endpoint depending on both layer-0 and layer-1 prune correctly. At the leaf
     * (all vars substituted) it fetches with pagination and tags each record with the
     * resolved parent FK values.
     */
    private async DescendTemplateVars(
        auth: RESTAuthContext,
        baseURL: string,
        obj: MJIntegrationObjectEntity,
        fields: MJIntegrationObjectFieldEntity[],
        resolutions: ResolvedTemplateVar[],
        level: number,
        path: string,
        fkTags: Record<string, string>,
        outerStack: Array<{ objectID: string; idValue: string }>,
        ctx: FetchContext,
        pkFieldNames: string[],
        out: ExternalRecord[]
    ): Promise<void> {
        if (level >= resolutions.length) {
            const fullURL = this.BuildFullURL(baseURL, path);
            const result = await this.FetchWithPagination(auth, fullURL, obj, ctx);
            for (const r of result.Records) {
                for (const [k, v] of Object.entries(fkTags)) r[k] = v;
                const transformed = this.TransformRecord(r, obj, fields);
                out.push(this.ToExternalRecord(transformed, ctx.ObjectName, pkFieldNames));
            }
            return;
        }

        const res = resolutions[level];
        // Prune to the valid subset: one AND-filter per prior layer this parent has an FK to.
        const filters: Array<{ column: string; value: string }> = [];
        for (const prior of outerStack) {
            const fkCol = this.FindFKColumnToParent(res.parentObjectID, prior.objectID);
            if (fkCol) filters.push({ column: fkCol, value: prior.idValue });
        }
        const parentIDs = await this.LoadParentIDs(res.parentObjectID, ctx.ContextUser, filters);

        for (const parentID of parentIDs) {
            const nextPath = this.SubstituteTemplateVars(path, res.templateVar, parentID);
            const nextTags = { ...fkTags, [res.fkFieldName]: parentID };
            await this.DescendTemplateVars(
                auth, baseURL, obj, fields, resolutions, level + 1, nextPath, nextTags,
                [...outerStack, { objectID: res.parentObjectID, idValue: parentID }],
                ctx, pkFieldNames, out
            );
        }
    }

    /**
     * Resolves a SINGLE template variable to its parent object + FK field.
     *
     * Strategy (in order):
     * 1. Explicit: an FK field (RelatedIntegrationObjectID) whose name matches the var.
     * 2. PK fallback: a sibling integration object whose primary-key field name matches
     *    the var (e.g. {ProfileID} → the Members object whose PK field is "ProfileID"),
     *    allowing resolution without explicit FK metadata.
     *
     * Returns null when neither strategy matches.
     */
    private ResolveParentForVar(
        fields: MJIntegrationObjectFieldEntity[],
        templateVar: string,
        integrationID: string
    ): ResolvedTemplateVar | null {
        const tVarLower = templateVar.toLowerCase();

        // Strategy 1: explicit FK field whose name matches this var.
        for (const field of fields) {
            if (!field.RelatedIntegrationObjectID) continue;
            if (field.Name.toLowerCase().includes(tVarLower)) {
                return { templateVar, fkFieldName: field.Name, parentObjectID: field.RelatedIntegrationObjectID };
            }
        }

        // Strategy 2: sibling object whose PK field name equals this var.
        const siblingObjects = IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID);
        for (const sibling of siblingObjects) {
            const siblingFields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(sibling.ID);
            const pkField = siblingFields.find(f => f.IsPrimaryKey);
            if (pkField && pkField.Name.toLowerCase() === tVarLower) {
                return { templateVar, fkFieldName: templateVar, parentObjectID: sibling.ID };
            }
        }

        return null;
    }

    /**
     * Finds the FK column on `innerObjectID` that points at `outerObjectID` — used to
     * filter a child level by its parent in a nested path. Returns null when no FK links
     * them, in which case that level loads unfiltered (independent vars / cartesian).
     */
    private FindFKColumnToParent(innerObjectID: string, outerObjectID: string): string | null {
        const innerFields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(innerObjectID);
        const fk = innerFields.find(f => f.RelatedIntegrationObjectID && UUIDsEqual(f.RelatedIntegrationObjectID, outerObjectID));
        return fk ? fk.Name : null;
    }

    /**
     * Loads parent record IDs from the local MJ database.
     * Uses IntegrationEngineBase cache for object/field metadata lookups,
     * then queries the MJ entity via RunView for actual synced record IDs.
     */
    private async LoadParentIDs(
        parentObjectID: string,
        contextUser: UserInfo,
        filters?: Array<{ column: string; value: string }>
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
        // Constrain to the rows satisfying every prior-layer FK (AND). Bare identifiers →
        // the PG provider auto-quotes them; values are single-quote-escaped.
        const extraFilter = filters && filters.length > 0
            ? filters.map(f => `${f.column}='${String(f.value).replace(/'/g, "''")}'`).join(' AND ')
            : undefined;
        const idResult = await rv.RunView<Record<string, unknown>>({
            EntityName: entityName,
            Fields: [pkFieldName],
            ExtraFilter: extraFilter,
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
        ctx: FetchContext
    ): Promise<PaginatedFetchResult> {
        if (!obj.SupportsPagination || obj.PaginationType === 'None') {
            return this.FetchSinglePage(auth, basePath, obj);
        }

        return this.FetchPaginatedLoop(auth, basePath, obj, ctx);
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

        if (response.Status === 403) {
            console.warn(
                `[${this.IntegrationName}] HTTP 403 Forbidden for "${obj.Name}" — ` +
                `this object requires additional API permissions/scopes. ` +
                `Skipping this object for this sync run. URL: ${requestURL}`
            );
            return { Records: [], HasMore: false };
        }

        this.ValidateHTTPResponse(response, requestURL);
        const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);
        return { Records: records, HasMore: false };
    }

    /**
     * Iterates through paginated responses, accumulating records up to BatchSize per call.
     * Stops mid-pagination when BatchSize is reached and returns HasMore=true + NextPage/NextOffset
     * so the IntegrationEngine outer loop can resume on the next FetchChanges call.
     * Cursor state is maintained internally within the batch, avoiding the need to
     * externalize it through FetchBatchResult (which would break cursor-based connectors).
     */
    private async FetchPaginatedLoop(
        auth: RESTAuthContext,
        basePath: string,
        obj: MJIntegrationObjectEntity,
        ctx: FetchContext
    ): Promise<PaginatedFetchResult> {
        const allRecords: Record<string, unknown>[] = [];
        const batchLimit = ctx.BatchSize ?? Number.MAX_SAFE_INTEGER;
        let page = ctx.CurrentPage ?? 1;
        let offset = ctx.CurrentOffset ?? 0;
        let cursor: string | undefined = ctx.CurrentCursor;
        let hasMore = true;
        let previousFirstRecordKey: string | undefined;

        while (hasMore && allRecords.length < batchLimit) {
            // Cap the requested page size so the API never returns more than we can fit.
            // This prevents overshoot when a single page would push allRecords over batchLimit.
            const remainingCapacity = batchLimit - allRecords.length;
            const url = this.BuildPaginatedURL(basePath, obj, page, offset, cursor, remainingCapacity);
            const requestURL = this.AppendDefaultQueryParams(url, obj);
            const headers = this.BuildHeaders(auth);
            const response = await this.MakeHTTPRequest(auth, requestURL, 'GET', headers);

            if (response.Status === 403) {
                console.warn(
                    `[${this.IntegrationName}] HTTP 403 Forbidden for "${obj.Name}" — ` +
                    `this object requires additional API permissions/scopes. ` +
                    `Skipping this object for this sync run. URL: ${requestURL}`
                );
                return { Records: allRecords, HasMore: false };
            }

            this.ValidateHTTPResponse(response, requestURL);
            const records = this.NormalizeResponse(response.Body, obj.ResponseDataKey);

            if (records.length === 0) {
                hasMore = false;
                break;
            }

            // Detect duplicate pages (broken API pagination)
            const currentFirstRecordKey = JSON.stringify(records[0]);
            if (previousFirstRecordKey !== undefined && currentFirstRecordKey === previousFirstRecordKey) {
                console.warn(
                    `[BaseRESTIntegrationConnector] Duplicate page detected for "${obj.Name}" ` +
                    `at offset ${offset}. API pagination appears broken. Stopping.`
                );
                hasMore = false;
                break;
            }
            previousFirstRecordKey = currentFirstRecordKey;

            allRecords.push(...records);

            const paginationState = this.ExtractPaginationInfo(
                response.Body, obj.PaginationType, page, offset, obj.DefaultPageSize ?? records.length
            );
            hasMore = paginationState.HasMore;
            page = paginationState.NextPage ?? page + 1;
            offset = paginationState.NextOffset ?? offset + records.length;
            cursor = paginationState.NextCursor;
        }

        return {
            Records: allRecords,
            HasMore: hasMore,
            NextPage: page,
            NextOffset: offset,
            NextCursor: cursor,
        };
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
     * Override in subclasses to use vendor-specific parameter names.
     *
     * @param effectivePageSize - When provided by FetchPaginatedLoop, caps the requested page
     *   size to the remaining batch capacity. Subclasses should honor this to prevent overshoot.
     */
    protected BuildPaginatedURL(
        basePath: string,
        obj: MJIntegrationObjectEntity,
        page: number,
        offset: number,
        cursor?: string,
        effectivePageSize?: number
    ): string {
        const pageSize = effectivePageSize ?? obj.DefaultPageSize ?? 50;
        const separator = basePath.includes('?') ? '&' : '?';

        switch (obj.PaginationType) {
            case 'PageNumber':
                return `${basePath}${separator}page=${page}&pageSize=${pageSize}`;
            case 'Offset':
                return `${basePath}${separator}offset=${offset}&limit=${pageSize}`;
            case 'Cursor':
                return cursor
                    ? `${basePath}${separator}cursor=${encodeURIComponent(cursor)}&limit=${pageSize}`
                    : `${basePath}${separator}limit=${pageSize}`;
            default:
                return basePath;
        }
    }

    /**
     * Appends default query parameters from the IntegrationObject metadata.
     * DefaultQueryParams is stored as a JSON object like {"key": "value"}.
     * Automatically skips params whose key (case-insensitive) already appears
     * in the URL to avoid duplicates with pagination params.
     */
    protected AppendDefaultQueryParams(url: string, obj: MJIntegrationObjectEntity): string {
        if (!obj.DefaultQueryParams) return url;

        try {
            const params = JSON.parse(obj.DefaultQueryParams) as Record<string, string>;
            const entries = Object.entries(params);
            if (entries.length === 0) return url;

            // Extract existing param keys from the URL (case-insensitive) to avoid duplicates
            const existingKeys = this.ExtractURLParamKeys(url);

            // Filter out any default params whose key already exists in the URL
            const filtered = entries.filter(([k]) => !existingKeys.has(k.toLowerCase()));
            if (filtered.length === 0) return url;

            const separator = url.includes('?') ? '&' : '?';
            const queryString = filtered
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            return `${url}${separator}${queryString}`;
        } catch {
            console.warn(`[BaseRESTIntegrationConnector] Invalid DefaultQueryParams JSON for object "${obj.Name}"`);
            return url;
        }
    }

    /**
     * Extracts query parameter keys from a URL, returned as a Set of lowercase strings.
     * Used to detect duplicates between pagination params and DefaultQueryParams.
     */
    private ExtractURLParamKeys(url: string): Set<string> {
        const keys = new Set<string>();
        const qIndex = url.indexOf('?');
        if (qIndex < 0) return keys;

        const queryString = url.substring(qIndex + 1);
        for (const pair of queryString.split('&')) {
            const eqIndex = pair.indexOf('=');
            const key = eqIndex >= 0 ? pair.substring(0, eqIndex) : pair;
            keys.add(decodeURIComponent(key).toLowerCase());
        }
        return keys;
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
    protected GetCachedObject(integrationID: string, objectName: string): MJIntegrationObjectEntity {
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
    protected GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return IntegrationEngineBase.Instance.GetIntegrationObjectFields(objectID)
            .filter(f => f.Status === 'Active')
            .sort((a, b) => a.Sequence - b.Sequence);
    }

    // ── Conversion helpers ───────────────────────────────────────────

    /**
     * Converts a raw API record object to the ExternalRecord format.
     * For composite primary keys, joins all PK values with '|' to form a unique ExternalID.
     */
    private ToExternalRecord(
        raw: Record<string, unknown>,
        objectType: string,
        pkFieldNames: string[]
    ): ExternalRecord {
        // §4 synthetic-PK fallback: only treat the PK as usable when EVERY component is present
        // (a composite key with a missing part — e.g. "abc|" — is not a stable identity). When any
        // part is missing, fall back to a deterministic content-derived identity (identity hash) so
        // PK-less / partial-key tables are still syncable + dedupable. Stable while content is unchanged.
        const allPkPresent = pkFieldNames.length > 0
            && pkFieldNames.every(name => raw[name] != null && String(raw[name]).length > 0);
        const externalID = pkFieldNames.map(name => String(raw[name] ?? '')).join('|');
        const resolvedID = allPkPresent ? externalID : computeContentHash(raw);
        return {
            ExternalID: resolvedID,
            ObjectType: objectType,
            Fields: raw,
        };
    }

    /**
     * Returns the primary key field names for a set of IntegrationObjectField records,
     * sorted by Sequence. For composite PKs, returns all PK fields.
     * Falls back to ["ID"] if no PK fields are explicitly marked.
     */
    private FindPrimaryKeyFieldNames(fields: MJIntegrationObjectFieldEntity[]): string[] {
        const pkFields = fields
            .filter(f => f.IsPrimaryKey)
            .sort((a, b) => a.Sequence - b.Sequence);
        return pkFields.length > 0 ? pkFields.map(f => f.Name) : ['ID'];
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
            IsUniqueKey: f.IsUniqueKey || f.IsPrimaryKey,
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

            const targetObj = allObjects.find(o => UUIDsEqual(o.ID, field.RelatedIntegrationObjectID));
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
