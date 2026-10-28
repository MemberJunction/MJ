import {
    BaseEngine,
    BaseEnginePropertyConfig,
    BaseEntity,
    BaseEntityEvent,
    DatabasePlatform,
    EngineDataChangeEvent,
    IMetadataProvider,
    LocalCacheManager,
    LogError,
    LogStatusEx,
    QueryDefinitionSignature,
    RegisterForStartup,
    UserInfo
} from "@memberjunction/core";
import { GroupByUUID, IndexByUUID, UUIDMap, UUIDsEqual } from "@memberjunction/global";
import {
    MJQueryCategoryEntity,
    MJQueryFieldEntity,
    MJQueryParameterEntity,
    MJQueryEntityEntity,
    MJQueryPermissionEntity,
    MJQueryDependencyEntity,
    MJQuerySQLEntity,
    MJSQLDialectEntity
} from "../generated/entity_subclasses";
import { MJQueryEntityExtended } from "../custom/MJQueryEntityExtended";

/**
 * Caching of metadata for queries and related data, with auto-refresh on entity changes.
 * Returns `MJQueryEntityExtended` instances which include child-relationship getters
 * (QueryFields, QueryParameters, etc.) and business logic (UserCanRun, CategoryPath, etc.).
 */
/**
 * Per entity, the columns whose change can change a query's results. `'all'` means any change.
 * Name and CategoryID are in the cache key rather than in the definition hash: editing them leaves
 * the old slots unreachable, so they are reclaimed too. A parameter's DefaultValue is not here:
 * it is informational, never applied when the query runs (`QueryParameterProcessor`).
 */
const RESULT_AFFECTING_COLUMNS: Readonly<Record<string, readonly string[] | 'all'>> = {
    'mj: queries': ['SQL', 'SQLDialectID', 'UsesTemplate', 'ExternalDataSourceID', 'IsMaterialized', 'CacheValidationSQL', 'Name', 'CategoryID'],
    'mj: query sqls': 'all',
    'mj: query parameters': ['QueryID', 'Name', 'Type', 'IsRequired', 'ValidationFilters'],
    'mj: query dependencies': 'all',
};

/** Engine properties a query definition is computed from. A change to any of them clears the memo. */
const DEFINITION_PROPERTIES = new Set(['_queries', '_parameters', '_dependencies', '_querySQLs', '_sqlDialects']);

/** Rows of the definition entities, grouped by query, built once per memo generation. */
interface DefinitionIndexes {
    QueriesByID: UUIDMap<MJQueryEntityExtended>;
    ParametersByQuery: UUIDMap<MJQueryParameterEntity[]>;
    DependenciesByQuery: UUIDMap<MJQueryDependencyEntity[]>;
    DependentsByQuery: UUIDMap<MJQueryDependencyEntity[]>;
    QuerySQLsByQuery: UUIDMap<MJQuerySQLEntity[]>;
}

@RegisterForStartup()
export class QueryEngine extends BaseEngine<QueryEngine> {
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application.
     * Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): QueryEngine {
        return super.getInstance<QueryEngine>();
    }

    private _queries: MJQueryEntityExtended[] = [];
    private _categories: MJQueryCategoryEntity[] = [];
    private _fields: MJQueryFieldEntity[] = [];
    private _parameters: MJQueryParameterEntity[] = [];
    private _queryEntities: MJQueryEntityEntity[] = [];
    private _permissions: MJQueryPermissionEntity[] = [];
    private _dependencies: MJQueryDependencyEntity[] = [];
    private _querySQLs: MJQuerySQLEntity[] = [];
    private _sqlDialects: MJSQLDialectEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            // IncludeBinaryFields: the binary vector column is loaded server-side (QueryEngineServer reads it), skipped over the wire.
            { Type: 'entity', EntityName: 'MJ: Queries', PropertyName: '_queries', CacheLocal: true, IncludeBinaryFields: 'DatabaseProviderOnly' },
            { Type: 'entity', EntityName: 'MJ: Query Categories', PropertyName: '_categories', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Fields', PropertyName: '_fields', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Parameters', PropertyName: '_parameters', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Entities', PropertyName: '_queryEntities', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Permissions', PropertyName: '_permissions', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query Dependencies', PropertyName: '_dependencies', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Query SQLs', PropertyName: '_querySQLs', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: SQL Dialects', PropertyName: '_sqlDialects', CacheLocal: true },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // --- Public getters ---

    /** All queries in the system */
    public get Queries(): MJQueryEntityExtended[] {
        return this.GetConfigData<MJQueryEntityExtended>('_queries');
    }

    /** All query categories */
    public get Categories(): MJQueryCategoryEntity[] {
        return this.GetConfigData<MJQueryCategoryEntity>('_categories');
    }

    /** Alias for `Categories` — matches IMetadataProvider naming convention */
    public get QueryCategories(): MJQueryCategoryEntity[] {
        return this.GetConfigData<MJQueryCategoryEntity>('_categories');
    }

    /** All query field definitions */
    public get Fields(): MJQueryFieldEntity[] {
        return this.GetConfigData<MJQueryFieldEntity>('_fields');
    }

    /** Alias for `Fields` — matches IMetadataProvider naming convention */
    public get QueryFields(): MJQueryFieldEntity[] {
        return this.GetConfigData<MJQueryFieldEntity>('_fields');
    }

    /** All query parameter definitions */
    public get Parameters(): MJQueryParameterEntity[] {
        return this.GetConfigData<MJQueryParameterEntity>('_parameters');
    }

    /** Alias for `Parameters` — matches IMetadataProvider naming convention */
    public get QueryParameters(): MJQueryParameterEntity[] {
        return this.GetConfigData<MJQueryParameterEntity>('_parameters');
    }

    /** All query-to-entity relationship mappings */
    public get QueryEntities(): MJQueryEntityEntity[] {
        return this.GetConfigData<MJQueryEntityEntity>('_queryEntities');
    }

    /** All query permission records */
    public get Permissions(): MJQueryPermissionEntity[] {
        return this.GetConfigData<MJQueryPermissionEntity>('_permissions');
    }

    /** Alias for `Permissions` — matches IMetadataProvider naming convention */
    public get QueryPermissions(): MJQueryPermissionEntity[] {
        return this.GetConfigData<MJQueryPermissionEntity>('_permissions');
    }

    /** All query dependency records (composition references) */
    public get Dependencies(): MJQueryDependencyEntity[] {
        return this.GetConfigData<MJQueryDependencyEntity>('_dependencies');
    }

    /** Alias for `Dependencies` — matches IMetadataProvider naming convention */
    public get QueryDependencies(): MJQueryDependencyEntity[] {
        return this.GetConfigData<MJQueryDependencyEntity>('_dependencies');
    }

    /** All query SQL dialect-specific entries */
    public get QuerySQLs(): MJQuerySQLEntity[] {
        return this.GetConfigData<MJQuerySQLEntity>('_querySQLs');
    }

    /** All SQL dialect definitions */
    public get SQLDialects(): MJSQLDialectEntity[] {
        return this.GetConfigData<MJSQLDialectEntity>('_sqlDialects');
    }

    // --- Convenience helpers ---

    /** Returns only queries with Status === 'Approved' */
    public get ApprovedQueries(): MJQueryEntityExtended[] {
        return this._queries.filter(q => q.Status === 'Approved');
    }

    /** Find a query by its ID */
    public FindQueryByID(id: string): MJQueryEntityExtended | undefined {
        if (!id) return undefined;
        const lower = id.trim().toLowerCase();
        return this._queries.find(q => q.ID.trim().toLowerCase() === lower);
    }

    /** Find a query by name, optionally scoped to a category */
    public FindQueryByName(name: string, categoryId?: string): MJQueryEntityExtended | undefined {
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
    public GetQueriesByCategory(categoryId: string): MJQueryEntityExtended[] {
        return this._queries.filter(q => UUIDsEqual(q.CategoryID, categoryId));
    }

    /** Find a category by name (case-insensitive) */
    public FindCategory(name: string): MJQueryCategoryEntity | undefined {
        if (!name) return undefined;
        const lower = name.trim().toLowerCase();
        return this._categories.find(c => c.Name.trim().toLowerCase() === lower);
    }

    // --- Query definition signatures ---

    /** Definition signatures by `queryID|platform`, cleared whenever a definition property changes. */
    private _definitionMemo = new Map<string, QueryDefinitionSignature>();
    /** Lookup indexes for computing signatures, built on first use after the memo was cleared. */
    private _definitionIndexes: DefinitionIndexes | null = null;
    /** Saves seen starting with a result-affecting column dirty; see {@link trackDefinitionEdit}. */
    private _resultAffectingSaves = new WeakSet<BaseEntity>();
    /** Pending slot invalidations by lowercased query ID; see {@link scheduleSlotInvalidation}. */
    private _pendingSlotInvalidations = new Map<string, ReturnType<typeof setTimeout>>();

    /**
     * The default settle window, in milliseconds, before an edited query's cached results are
     * deleted. Settable so a harness can collapse it: a test that edits a query and then wants to
     * observe the deletion otherwise has to sleep past this window on every such check, and a test
     * that warms a slot after creating a fixture has to sleep past it to avoid the deletion landing
     * mid-check. Mirrors {@link ProviderBase.MetadataDatasetRefreshDebounceMs}, which exists for
     * the same reason.
     *
     * Lower it only in a harness. In a real process the window is what makes the deletion happen
     * once per edit instead of once per save in the burst — see the instance getter.
     */
    public static DefaultDefinitionEditSettleMs: number = 3000;

    /**
     * How long, in milliseconds, a query must go without a result-affecting save on this process
     * before its cached results are deleted. One edit saves the query, then its parameters, fields,
     * entities and dependencies, then the query again, over several seconds; waiting for the burst
     * to settle deletes the slots once instead of once per save.
     */
    protected get DefinitionEditSettleMs(): number {
        return QueryEngine.DefaultDefinitionEditSettleMs;
    }

    /**
     * The signature of what a query's results are computed from on `platform`: a hash of the SQL
     * that runs there (`GetPlatformSQL`), the columns that change how it runs (`UsesTemplate`,
     * `ExternalDataSourceID`, `IsMaterialized`, `SQLDialectID`), its `CacheValidationSQL`, its
     * parameters' names, types, required flags and validation filters, and, recursively, the signatures of the queries it composes (a cycle
     * is hashed as a marker rather than followed). Descriptive columns, parameter default values
     * (informational only), field rows, permissions and cache settings are not part of it.
     *
     * The stamp is the newest `__mj_UpdatedAt` across the same rows. Computed once per query and
     * platform, and again only after this engine's query data changes.
     *
     * @returns The signature, or undefined when the engine does not hold the query
     */
    public GetDefinitionSignature(queryID: string, platform: DatabasePlatform): QueryDefinitionSignature | undefined {
        if (!queryID) return undefined;
        return this.definitionSignature(queryID, platform, new Set<string>())?.Signature;
    }

    /**
     * The memoized signature, computing it (and any composed query's) on a miss. A signature whose
     * computation met a cycle is not memoized: its value depends on where the walk entered the
     * cycle, and two processes must agree on every query's hash.
     */
    private definitionSignature(queryID: string, platform: DatabasePlatform, visiting: Set<string>): { Signature: QueryDefinitionSignature; Cyclic: boolean } | undefined {
        const key = `${queryID.trim().toLowerCase()}|${platform}`;
        const memo = this._definitionMemo.get(key);
        if (memo) return { Signature: memo, Cyclic: false };

        const indexes = this.definitionIndexes();
        const query = indexes.QueriesByID.Get(queryID);
        if (!query) return undefined;

        visiting.add(key);
        const parts = this.definitionParts(query, platform, indexes);
        let newest = QueryEngine.timestampMs(query.__mj_UpdatedAt);
        for (const row of [...(indexes.ParametersByQuery.Get(query.ID) ?? []), ...(indexes.QuerySQLsByQuery.Get(query.ID) ?? [])]) {
            newest = Math.max(newest, QueryEngine.timestampMs(row.__mj_UpdatedAt));
        }
        let cyclic = false;
        for (const dependency of QueryEngine.sortedDependencies(indexes.DependenciesByQuery.Get(query.ID))) {
            newest = Math.max(newest, QueryEngine.timestampMs(dependency.__mj_UpdatedAt));
            const dependencyID = dependency.DependsOnQueryID.toLowerCase();
            if (visiting.has(`${dependencyID}|${platform}`)) {
                cyclic = true;
                parts.push(`dep:${dependencyID}:cycle`);
                continue;
            }
            const composed = this.definitionSignature(dependency.DependsOnQueryID, platform, visiting);
            cyclic = cyclic || composed?.Cyclic === true;
            parts.push(`dep:${dependencyID}:${composed?.Signature.Hash ?? 'missing'}`);
            newest = Math.max(newest, QueryEngine.timestampMs(composed?.Signature.Stamp));
        }
        visiting.delete(key);

        const signature: QueryDefinitionSignature = {
            QueryID: query.ID,
            Hash: QueryEngine.hashText(parts.join('\u0001')),
            Stamp: newest > 0 ? new Date(newest).toISOString() : undefined,
        };
        if (!cyclic) {
            this._definitionMemo.set(key, signature);
        }
        return { Signature: signature, Cyclic: cyclic };
    }

    /** The hashed text of one query's own definition, without its composed queries. */
    private definitionParts(query: MJQueryEntityExtended, platform: DatabasePlatform, indexes: DefinitionIndexes): string[] {
        const parts = [
            `sql:${query.GetPlatformSQL(platform) ?? ''}`,
            `dialect:${(query.SQLDialectID ?? '').toLowerCase()}`,
            `template:${query.UsesTemplate ? 1 : 0}`,
            `external:${(query.ExternalDataSourceID ?? '').toLowerCase()}`,
            `materialized:${query.IsMaterialized ? 1 : 0}`,
            `validation:${query.CacheValidationSQL ?? ''}`,
        ];
        const parameters = [...(indexes.ParametersByQuery.Get(query.ID) ?? [])]
            .sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
        for (const p of parameters) {
            parts.push(`param:${p.Name.toLowerCase()}\u0002${p.Type}\u0002${p.IsRequired ? 1 : 0}\u0002${p.ValidationFilters ?? ''}`);
        }
        return parts;
    }

    /** Dependency rows in a stable order, so the hash does not depend on load order. */
    private static sortedDependencies(rows: MJQueryDependencyEntity[] | undefined): MJQueryDependencyEntity[] {
        return [...(rows ?? [])].sort((a, b) => a.DependsOnQueryID.toLowerCase().localeCompare(b.DependsOnQueryID.toLowerCase()));
    }

    /** Builds (once per memo generation) the lookups signature computation reads. */
    private definitionIndexes(): DefinitionIndexes {
        if (!this._definitionIndexes) {
            this._definitionIndexes = {
                QueriesByID: IndexByUUID(this.Queries),
                ParametersByQuery: GroupByUUID(this.Parameters, p => p.QueryID),
                DependenciesByQuery: GroupByUUID(this.Dependencies, d => d.QueryID),
                DependentsByQuery: GroupByUUID(this.Dependencies, d => d.DependsOnQueryID),
                QuerySQLsByQuery: GroupByUUID(this.QuerySQLs, q => q.QueryID),
            };
        }
        return this._definitionIndexes;
    }

    /** Forgets every computed signature, so the next request recomputes from current data. */
    private clearDefinitionMemo(propertyName: string): void {
        if (DEFINITION_PROPERTIES.has(propertyName)) {
            this._definitionMemo.clear();
            this._definitionIndexes = null;
        }
    }

    protected override NotifyDataChange(
        config: BaseEnginePropertyConfig,
        data: unknown[],
        changeType: EngineDataChangeEvent['changeType'] = 'refresh',
        affectedEntity?: BaseEntity
    ): void {
        this.clearDefinitionMemo(config.PropertyName);
        super.NotifyDataChange(config, data, changeType, affectedEntity);
    }

    protected override emitPropertyChange(propertyName: string): void {
        this.clearDefinitionMemo(propertyName);
        super.emitPropertyChange(propertyName);
    }

    /** Milliseconds since the epoch for a row timestamp, or 0 when absent or unreadable. */
    private static timestampMs(value: Date | string | null | undefined): number {
        if (value == null) return 0;
        const ms = value instanceof Date ? value.getTime() : Date.parse(value);
        return Number.isNaN(ms) ? 0 : ms;
    }

    /**
     * A 53-bit hash of `text` as hex (cyrb53). Plain JavaScript, so a browser and a server hash the
     * same text to the same value.
     */
    private static hashText(text: string): string {
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0; i < text.length; i++) {
            const ch = text.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
    }

    // --- Deleting cached results after an edit ---

    /**
     * Notes result-affecting edits made in this process before the base class applies the event.
     * Only local saves and deletes count: every server's engine also hears about the edit, through
     * the shared cache, but only the server that made it deletes the slots, so a fleet does not
     * delete the same slots once per server while the others refill them.
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        try {
            this.trackDefinitionEdit(event);
        } catch (e) {
            LogError(`QueryEngine: tracking a query edit failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        return super.HandleIndividualBaseEntityEvent(event);
    }

    /**
     * Follows one save or delete of a query definition row. A save is judged when it starts, while
     * the record still knows which columns are dirty, and acted on when it succeeds. A delete
     * always counts. The slots of the affected query and of every query that composes it are then
     * deleted once the edit settles (see {@link DefinitionEditSettleMs}). Deleting them is
     * housekeeping: a read under the new definition already misses them (see
     * {@link GetDefinitionSignature}).
     */
    private trackDefinitionEdit(event: BaseEntityEvent): void {
        const entity = event.baseEntity;
        const columns = entity ? RESULT_AFFECTING_COLUMNS[entity.EntityInfo.Name.trim().toLowerCase()] : undefined;
        if (!entity || !columns) return;

        if (event.type === 'save_started') {
            if (QueryEngine.isResultAffectingSave(entity, columns)) {
                this._resultAffectingSaves.add(entity);
            }
            return;
        }
        if (event.type === 'save' && this._resultAffectingSaves.has(entity)) {
            this._resultAffectingSaves.delete(entity);
            this.invalidateAfterEdit(QueryEngine.editedQueryID(entity, undefined));
        } else if (event.type === 'delete') {
            const payload = event.payload as { OldValues?: Record<string, unknown> } | undefined;
            this.invalidateAfterEdit(QueryEngine.editedQueryID(entity, payload?.OldValues));
        }
    }

    /** True for a create, or an update with any of `columns` dirty. */
    private static isResultAffectingSave(entity: BaseEntity, columns: readonly string[] | 'all'): boolean {
        if (!entity.IsSaved || columns === 'all') return true;
        return columns.some(name => entity.GetFieldByName(name)?.Dirty === true);
    }

    /** The query a definition row belongs to: the row itself for a query, else its QueryID. */
    private static editedQueryID(entity: BaseEntity, deletedValues: Record<string, unknown> | undefined): string | undefined {
        const isQuery = entity.EntityInfo.Name.trim().toLowerCase() === 'mj: queries';
        const field = isQuery ? 'ID' : 'QueryID';
        const value = deletedValues?.[field] ?? entity.GetFieldByName(field)?.Value;
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    }

    /** Schedules slot deletion for `queryID` and every query that composes it, directly or not. */
    private invalidateAfterEdit(queryID: string | undefined): void {
        if (!queryID) return;
        for (const id of this.queryAndDependents(queryID)) {
            this.scheduleSlotInvalidation(id);
        }
    }

    /** `queryID` plus every query that reaches it through composition. Cycles end the walk. */
    private queryAndDependents(queryID: string): string[] {
        const dependents = this.definitionIndexes().DependentsByQuery;
        const seen = new Set<string>();
        const result: string[] = [];
        const pending = [queryID];
        while (pending.length > 0) {
            const id = pending.pop()!;
            const key = id.trim().toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(id);
            for (const row of dependents.Get(id) ?? []) {
                pending.push(row.QueryID);
            }
        }
        return result;
    }

    /** (Re)starts the settle timer for one query's slot deletion. */
    private scheduleSlotInvalidation(queryID: string): void {
        const key = queryID.trim().toLowerCase();
        const existing = this._pendingSlotInvalidations.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
            this._pendingSlotInvalidations.delete(key);
            void this.invalidateQuerySlots(queryID);
        }, this.DefinitionEditSettleMs);
        // A pending deletion must not keep a short-lived process (a CLI run) alive.
        (timer as { unref?: () => void }).unref?.();
        this._pendingSlotInvalidations.set(key, timer);
    }

    /** Deletes one query's cached results. Never throws. */
    private async invalidateQuerySlots(queryID: string): Promise<void> {
        try {
            const cache = LocalCacheManager.Instance;
            if (!cache.IsInitialized) return;
            const removed = await cache.InvalidateRunQueryResultsForQuery(queryID);
            LogStatusEx({ message: `QueryEngine: deleted ${removed} cached result slot(s) of query ${queryID} after its definition changed`, verboseOnly: true });
        } catch (e) {
            LogError(`QueryEngine: deleting cached results of query ${queryID} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
