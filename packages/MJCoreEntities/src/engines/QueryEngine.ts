import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, RegisterForStartup, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import {
    MJQueryEntity,
    MJQueryCategoryEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
    MJQueryEntityEntity,
    MJQueryPermissionEntity
} from "../generated/entity_subclasses";

/**
 * Caching of metadata for queries and related data, with auto-refresh on entity changes.
 * Replaces the static query metadata previously loaded by ProviderBase._localMetadata.
 */
@RegisterForStartup()
export class QueryEngine extends BaseEngine<QueryEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application.
     * Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): QueryEngine {
        return super.getInstance<QueryEngine>();
    }

    private _queries: MJQueryEntity[] = [];
    private _categories: MJQueryCategoryEntity[] = [];
    private _fields: MJQueryFieldEntity[] = [];
    private _parameters: MJQueryParameterEntity[] = [];
    private _queryEntities: MJQueryEntityEntity[] = [];
    private _permissions: MJQueryPermissionEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: 'MJ: Queries', PropertyName: '_queries', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Categories', PropertyName: '_categories', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Fields', PropertyName: '_fields', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Parameters', PropertyName: '_parameters', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Entities', PropertyName: '_queryEntities', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Permissions', PropertyName: '_permissions', CacheLocal: true },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // --- Public getters ---

    /** All queries in the system */
    public get Queries(): MJQueryEntity[] {
        return this._queries;
    }

    /** All query categories */
    public get Categories(): MJQueryCategoryEntity[] {
        return this._categories;
    }

    /** All query field definitions */
    public get Fields(): MJQueryFieldEntity[] {
        return this._fields;
    }

    /** All query parameter definitions */
    public get Parameters(): MJQueryParameterEntity[] {
        return this._parameters;
    }

    /** All query-to-entity relationship mappings */
    public get QueryEntities(): MJQueryEntityEntity[] {
        return this._queryEntities;
    }

    /** All query permission records */
    public get Permissions(): MJQueryPermissionEntity[] {
        return this._permissions;
    }

    // --- Convenience helpers ---

    /** Returns only queries with Status === 'Approved' */
    public get ApprovedQueries(): MJQueryEntity[] {
        return this._queries.filter(q => q.Status === 'Approved');
    }

    /** Find a query by its ID */
    public FindQueryByID(id: string): MJQueryEntity | undefined {
        if (!id) return undefined;
        const lower = id.trim().toLowerCase();
        return this._queries.find(q => q.ID.trim().toLowerCase() === lower);
    }

    /** Find a query by name, optionally scoped to a category */
    public FindQueryByName(name: string, categoryId?: string): MJQueryEntity | undefined {
        if (!name) return undefined;
        const lowerName = name.trim().toLowerCase();
        return this._queries.find(q => {
            const nameMatch = q.Name.trim().toLowerCase() === lowerName;
            if (!nameMatch) return false;
            if (categoryId) return q.CategoryID?.trim().toLowerCase() === categoryId.trim().toLowerCase();
            return true;
        });
    }

    /** Get all field definitions for a specific query */
    public GetQueryFields(queryId: string): MJQueryFieldEntity[] {
        return this._fields.filter(f => UUIDsEqual(f.QueryID, queryId));
    }

    /** Get all parameter definitions for a specific query */
    public GetQueryParameters(queryId: string): MJQueryParameterEntity[] {
        return this._parameters.filter(p => UUIDsEqual(p.QueryID, queryId));
    }

    /** Get all permission records for a specific query */
    public GetQueryPermissions(queryId: string): MJQueryPermissionEntity[] {
        return this._permissions.filter(p => UUIDsEqual(p.QueryID, queryId));
    }

    /** Get all queries belonging to a specific category */
    public GetQueriesByCategory(categoryId: string): MJQueryEntity[] {
        return this._queries.filter(q => UUIDsEqual(q.CategoryID, categoryId));
    }

    /** Find a category by name (case-insensitive) */
    public FindCategory(name: string): MJQueryCategoryEntity | undefined {
        if (!name) return undefined;
        const lower = name.trim().toLowerCase();
        return this._categories.find(c => c.Name.trim().toLowerCase() === lower);
    }
}
